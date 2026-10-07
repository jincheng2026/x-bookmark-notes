// 插件弹窗（也可以在新标签页里打开）：第一次用的引导、同步、还没写备注的收藏、最近写的备注。
const $ = (id) => document.getElementById(id);
const full = new URLSearchParams(location.search).has("full");
if (full) { document.body.classList.add("full"); $("openFull").hidden = true; }

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text != null) node.textContent = text;
  return node;
}
function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const send = (message) => chrome.runtime.sendMessage(message).catch(() => ({ ok: false }));

async function renderStatus() {
  const s = await send({ type: "xbn-status" });
  if (!s?.ok) return;
  const meta = s.meta || {};
  const setupFinished = Boolean(meta.setupDone && meta.importDoneAt);
  $("welcome").hidden = setupFinished;
  $("openPageRow").hidden = !setupFinished;
  const aiReady = meta.hostInstalled === true && (meta.hostCodex || meta.hostClaude);
  $("aiLine").textContent = aiReady ? `AI 分类已装好，用 ${meta.hostCodex ? "Codex" : "Claude Code"}` : meta.hostInstalled === undefined ? "" : "AI 分类还没装好";
  $("goAi").hidden = aiReady || meta.hostInstalled === undefined;
  $("syncNow").hidden = !meta.setupDone;
  $("watchdog").hidden = !s.watchdog;
  $("writeError").hidden = !meta.writeError;
  $("writeErrorText").textContent = meta.writeError || "";
  $("articles").checked = !meta.articlesOff;

  const summary = $("summary");
  summary.textContent = "";
  if (meta.setupDone) {
    summary.append(`一共 ${s.total} 条收藏，${s.noted} 条写了为什么收藏`);
    if (meta.importDays) summary.append(` · 从 ${when(new Date(meta.importFloor).toISOString()).split(" ")[0]} 起收藏的`);
    if (meta.lastSyncAt) summary.append(` · ${when(meta.lastSyncAt)} 同步过`);
    if (meta.indexDownloadId) {
      const open = el("button", { class: "link", type: "button", title: "在访达或资源管理器里打开「下载/X收藏」" }, "打开收藏文件夹");
      open.addEventListener("click", async () => { const r = await send({ type: "xbn-open-folder" }); if (!r?.ok) alert(r?.error || "打不开"); });
      summary.append(open);
    }
  } else {
    summary.textContent = "还没设置好";
  }

  const st = s.syncState, info = $("syncInfo"), button = $("syncNow");
  const running = st?.state === "running" && Date.now() - Date.parse(st.at || 0) < 10 * 60 * 1000;
  button.disabled = running;
  button.replaceChildren(...(running ? [el("span", { class: "spin" }), document.createTextNode("同步中…")] : [document.createTextNode("从 X 同步")]));

  info.className = "syncinfo";
  if (running) info.textContent = st.mode === "import" ? `正在导入：已经翻了 ${st.pages} 页、${st.seen} 条。可以关掉这个窗口，后台会接着抓` : "正在抓最新的收藏…";
  else if (st?.state === "failed") { info.textContent = st.error || "同步没成功"; info.className = "syncinfo bad"; }
  else if (st?.state === "done" && Date.now() - Date.parse(st.at) < 10 * 60 * 1000) {
    info.textContent = `同步好了（${when(st.at)}）：看了 ${st.seen} 条，新的 ${st.added} 条`;
    info.className = "syncinfo ok";
  } else info.textContent = "";

  const list = $("list");
  list.textContent = "";
  if (!s.recent.length) list.append(el("li", { class: "empty" }, "还没有。在 X 上点收藏，右下角会弹出备注框。"));
  for (const r of s.recent) {
    const li = el("li");
    li.append(el("div", { class: "note" }, r.note));
    const meta2 = el("div", { class: "meta" });
    meta2.append(`${when(r.at)} · `, el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.author || "打开推文"));
    li.append(meta2);
    list.append(li);
  }
}

async function renderMissing() {
  const r = await send({ type: "xbn-missing" });
  const box = $("missing");
  box.textContent = "";
  const items = r?.items || [];
  $("missingCount").textContent = items.length ? `${items.length} 条` : "";
  if (!items.length) { box.append(el("li", { class: "done" }, "都写好了。")); return; }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let last = "";
  for (const item of items) {
    const group = Date.parse(item.at) >= today.getTime() ? "今天" : "前两天";
    if (group !== last) { box.append(el("div", { class: "group" }, group)); last = group; }
    const li = el("li");
    const who = el("div", { class: "who" });
    const line = el("div");
    line.append(el("b", {}, item.author || "推文"), ` · ${when(item.at)} 收藏`);
    if (item.hasDraft) line.append(" ", el("span", { class: "draft" }, "有草稿"));
    who.append(line, el("div", { class: "ex", title: item.excerpt || "" }, item.excerpt || "（还没抓到正文，点「去写」看原帖）"));
    const go = el("button", { class: "go", type: "button", title: "打开这条推文，备注框自动弹出" }, "去写");
    go.addEventListener("click", async () => {
      await send({ type: "xbn-open-for-note", tweetId: item.tweetId, url: item.url });
      if (!full) window.close();
    });
    li.append(who, go);
    box.append(li);
  }
}

$("goSetup").addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") }); if (!full) window.close(); });
$("goAi").addEventListener("click", () => { chrome.tabs.create({ url: chrome.runtime.getURL("shoucang.html") }); if (!full) window.close(); }); // 收藏页最上面有一步步装 AI 分类的引导
$("syncNow").addEventListener("click", async () => { await send({ type: "xbn-sync", mode: "quick" }); renderStatus(); });
$("retryWrite").addEventListener("click", async () => {
  $("retryWrite").disabled = true;
  await send({ type: "xbn-retry-write" });
  $("retryWrite").disabled = false;
  renderStatus();
});
$("clearWatchdog").addEventListener("click", async () => { await send({ type: "xbn-clear-watchdog" }); renderStatus(); });
$("openPage").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("shoucang.html") }));
send({ type: "xbn-host-status" }).then(() => renderStatus());
$("openFull").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?full=1") }));
$("articles").addEventListener("change", (e) => send({ type: "xbn-set-articles", on: e.target.checked }));
// 选文件的对话框会让弹窗关掉，所以导入放在新标签页里做
$("importBtn").addEventListener("click", () => {
  if (!full) { chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?full=1&import=1") }); return; }
  $("importFile").click();
});
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { alert("读不出来：这不是插件存的「_备注备份.json」"); return; }
  const r = await send({ type: "xbn-import-notes", backup });
  alert(r?.ok ? `导回了 ${r.count} 条备注（插件里已有、而且更新的备注没动）` : r?.error || "导入失败");
  e.target.value = "";
  renderStatus(); renderMissing();
});
if (new URLSearchParams(location.search).has("import")) $("importFile").click();

let redraw = 0; // 同步时存储改得很频繁，攒一下再重画
chrome.storage.onChanged.addListener(() => { clearTimeout(redraw); redraw = setTimeout(() => { renderStatus(); renderMissing(); }, 400); });
renderStatus();
renderMissing();
