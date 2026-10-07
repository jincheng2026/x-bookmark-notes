// 设置页：装好插件后自动打开。一步做完才亮下一步：登录 X → 选导入最近几天 → 打开收藏页（AI 分类在收藏页里带着装）。
const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false }));
let loggedIn = false, autoOpened = false, countdownTimer = 0;

function setStep(id, state) { // state：locked 还不能做；active 正在这一步；done 做完了
  const el = $(id);
  el.classList.toggle("locked", state === "locked");
  el.classList.toggle("active", state === "active");
  el.classList.toggle("done", state === "done");
  el.querySelector(".num").textContent = state === "done" ? "✓" : id.slice(1);
}
function openPage() { location.href = chrome.runtime.getURL("shoucang.html"); }

async function render() {
  const [login, status] = await Promise.all([send({ type: "xbn-x-login" }), send({ type: "xbn-status" })]);
  loggedIn = Boolean(login?.loggedIn);
  const meta = status?.meta || {}, st = status?.syncState || {};
  // 第一步：登录 X
  setStep("s1", loggedIn ? "done" : "active");
  $("s1Todo").hidden = loggedIn;
  $("s1Done").hidden = !loggedIn;
  // 第二步：导入
  const importing = meta.setupDone && !meta.importDoneAt && !meta.importError && st.state === "running" && st.mode === "import";
  const imported = Boolean(meta.importDoneAt);
  const writeError = imported && meta.writeError;
  setStep("s2", !loggedIn && !meta.setupDone ? "locked" : imported && !writeError ? "done" : "active");
  $("s2Choose").hidden = Boolean(meta.setupDone) && !meta.importError;
  document.querySelectorAll(".start").forEach((b) => { b.disabled = !loggedIn; });
  $("s2Run").hidden = !(meta.setupDone && !imported && !meta.importError);
  $("runText").textContent = importing && st.pages ? `正在导入最近 ${meta.importDays} 天的收藏：已经翻了 ${st.pages} 页、${st.seen} 条` : `正在导入最近 ${meta.importDays || ""} 天的收藏…`;
  const err = meta.importError || (writeError ? meta.writeError : "");
  $("s2Err").hidden = !err;
  $("s2Err").textContent = err ? (meta.importError ? `没导入成：${meta.importError}` : err) : "";
  $("s2ErrBtns").hidden = !err;
  $("retryImport").hidden = !meta.importError;
  $("retryWrite").hidden = !writeError;
  $("s2Done").hidden = !imported || writeError;
  if (imported) $("doneText").textContent = meta.importAdded ? `导入好了：最近 ${meta.importDays} 天的 ${meta.importAdded} 条收藏` : `导入好了。最近 ${meta.importDays} 天没有收藏，以后新收藏的会自动进来`;
  // 第三步：打开收藏页。导入好了自动倒数 5 秒打开
  const ready = imported && !writeError;
  setStep("s3", ready ? "active" : "locked");
  $("openPage").disabled = !ready;
  if (ready && !autoOpened) {
    autoOpened = true;
    let left = 5;
    const tick = () => { $("countdown").textContent = `${left} 秒后自动打开`; if (left-- <= 0) openPage(); else countdownTimer = setTimeout(tick, 1000); };
    tick();
  }
}

$("login").addEventListener("click", async () => { await send({ type: "xbn-open-login" }); $("loginWait").hidden = false; });
document.querySelectorAll(".start").forEach((b) => b.addEventListener("click", async () => {
  if (!loggedIn) return;
  await send({ type: "xbn-start", days: Number(b.dataset.days) });
  render();
}));
$("retryImport").addEventListener("click", async () => { await send({ type: "xbn-retry-import" }); render(); });
$("retryWrite").addEventListener("click", async () => { await send({ type: "xbn-retry-write" }); render(); });
$("openPage").addEventListener("click", () => { clearTimeout(countdownTimer); openPage(); });
$("openFolder").addEventListener("click", () => send({ type: "xbn-open-folder" }));
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { alert("读不出来：这不是插件存的「_备注备份.json」"); return; }
  const r = await send({ type: "xbn-import-notes", backup });
  alert(r?.ok ? `导回了 ${r.count} 条备注` : r?.error || "导入失败");
  e.target.value = "";
});

// 进度和登录状态会变：插件存储一变就重画；登录要去 X 上完成，每 3 秒看一次
let redraw = 0;
chrome.storage.onChanged.addListener(() => { clearTimeout(redraw); redraw = setTimeout(render, 300); });
setInterval(() => { if (!loggedIn) render(); }, 3000); // 读者去 X 标签页登录时这一页在后面，也要照样发现登录好了
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") render(); });
render();
