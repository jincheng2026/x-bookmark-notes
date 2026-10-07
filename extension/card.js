// 备注框：插件自己的页面，以 iframe 嵌进 X 页面右下角。
// 放在插件自己的页面里，是为了让 X 页面上的脚本碰不到：改不了框里的字、替你按不了回车、也收不到你的按键（打字不会触发 X 的快捷键）。
// 只有回车或点「保存」才算保存；点页面别处、按 Esc、点 × 都只是收起，写了的字留作草稿，不会自动存。
(() => {
  "use strict";
  const params = new URLSearchParams(location.hash.slice(1));
  const tweetId = /^\d{8,25}$/.test(params.get("t") || "") ? params.get("t") : null;
  const wantFocus = params.get("f") === "1";
  const author = (params.get("a") || "").slice(0, 120);
  const excerpt = (params.get("e") || "").slice(0, 280);
  const AUTO_HIDE_MS = 8000;

  const $ = (id) => document.getElementById(id);
  const text = $("text"), msg = $("msg"), saveButton = $("save");
  let original = "";        // 打开时这条已有的备注
  let touched = false;      // 你在框里真的打过字、选过字
  let saving = false, closed = false, autoHideTimer = 0, draftTimer = 0;

  const send = (message) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response || { ok: false });
      });
    } catch {
      resolve({ ok: false, error: "插件刚更新，请刷新这个 X 页面" });
    }
  });
  const tellHost = (type, extra = {}) => window.parent.postMessage({ xbnCard: type, tweetId, ...extra }, "*");
  function showMsg(value, ok = false) { msg.textContent = value || ""; msg.classList.toggle("ok", ok); }

  // ---------- 草稿：记下是在哪个版本的备注上改的，只有备注没在别处变过才自动填回 ----------
  async function writeDraft() {
    clearTimeout(draftTimer);
    if (!tweetId || saving) return;
    const value = text.value;
    const { drafts = {} } = await chrome.storage.local.get("drafts");
    if (value.trim() && value !== original) drafts[tweetId] = { text: value, base: original, at: new Date().toISOString() };
    else delete drafts[tweetId];
    await chrome.storage.local.set({ drafts });
  }
  function scheduleDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(writeDraft, 400); }
  function stopAutoHide() { clearTimeout(autoHideTimer); autoHideTimer = 0; }
  function startAutoHide() {
    stopAutoHide();
    autoHideTimer = setTimeout(() => { if (!touched && !text.value.trim()) close("auto"); }, AUTO_HIDE_MS);
  }

  async function close(reason) {
    if (closed) return;
    closed = true;
    stopAutoHide();
    if (touched && text.value !== original) await writeDraft().catch(() => undefined);
    tellHost("close", { reason, hasDraft: touched && Boolean(text.value.trim()) && text.value !== original });
  }

  async function store(value) {
    return send({ type: "xbn-save-note", tweetId, note: value });
  }
  async function save() {
    if (saving || !tweetId) return;
    const value = text.value.replace(/\s+$/, "");
    if (value === original) { close("unchanged"); return; }
    if (!value.trim() && !original.trim()) { close("empty"); return; }
    saving = true;
    clearTimeout(draftTimer);
    saveButton.disabled = true;
    text.readOnly = true;
    const result = await store(value);
    if (!result?.ok) {
      saving = false;
      saveButton.disabled = false;
      text.readOnly = false;
      showMsg(`没存上：${result?.error || "插件后台没响应"}。字还在框里，稍后再按回车`);
      return;
    }
    closed = true;
    stopAutoHide();
    tellHost("saved", { cleared: !value.trim() });
  }

  // ---------- 马上做：没存的备注先存上，再带着备注和原文开一个 AI 新对话（或复制下来） ----------
  const toolButtons = [...document.querySelectorAll(".tool")];
  function openLink(href) { // 用插件自己页面里的一次点击打开，Chrome 会问一句要不要打开 Claude 或 Codex
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function startWork(tool) {
    if (saving || !tweetId) return;
    const value = text.value.replace(/\s+$/, "");
    stopAutoHide();
    touched = true;
    saving = true;
    clearTimeout(draftTimer);
    for (const b of [saveButton, ...toolButtons]) b.disabled = true;
    const done = () => { saving = false; for (const b of [saveButton, ...toolButtons]) b.disabled = false; };
    let saved = false;
    if (value !== original && (value.trim() || original.trim())) {
      const result = await store(value);
      if (!result?.ok) { done(); showMsg(`备注没存上：${result?.error || "插件后台没响应"}。字还在框里`); return; }
      original = value;
      saved = true;
    }
    const got = await send({ type: "xbn-work-prompt", tweetId });
    done();
    if (!got?.ok) { showMsg("没拿到这条收藏的内容，稍后再试"); return; }
    if (tool === "copy") {
      try {
        await navigator.clipboard.writeText(got.prompt);
        showMsg("复制好了：备注和原文，贴给任何 AI 都行", true);
      } catch {
        showMsg("复制没成功。点一下框里的文字再试一次");
        return;
      }
    } else if (tool === "claude") {
      openLink(`claude://code/new?q=${encodeURIComponent(got.prompt)}`);
      showMsg("正在打开 Claude：开场白填好了，看过按回车发出。没反应就点「复制」", true);
    } else {
      openLink(`codex://threads/new?prompt=${encodeURIComponent(got.prompt)}`);
      showMsg("正在打开 Codex：开场白填好了，看过按回车发出。没反应就点「复制」", true);
    }
    setTimeout(() => { if (saved) { closed = true; tellHost("saved", { cleared: !value.trim() }); } else close("started"); }, 2600);
  }
  for (const b of toolButtons) b.addEventListener("click", () => startWork(b.dataset.tool));

  // ---------- 键盘：都在插件自己的页面里，X 收不到 ----------
  text.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return; // 输入法正在选字：回车、Esc 交给输入法
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); save(); }
    else if (event.key === "Escape") { event.preventDefault(); close("escape"); }
  });
  document.addEventListener("keydown", (event) => {
    if (event.target !== text && event.key === "Escape") close("escape");
  });
  text.addEventListener("input", () => { touched = true; stopAutoHide(); scheduleDraft(); });
  text.addEventListener("compositionstart", () => { touched = true; stopAutoHide(); });
  saveButton.addEventListener("click", save);
  document.querySelector(".close").addEventListener("click", () => close("close"));

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !event.data || typeof event.data.xbnHost !== "string") return;
    if (event.data.xbnHost === "dismiss") close("outside");
    else if (event.data.xbnHost === "scroll" && !touched && !text.value.trim()) close("scroll");
    else if (event.data.xbnHost === "unbookmarked") {
      if (!touched || !text.value.trim() || text.value === original) { close("unbookmarked"); return; }
      showMsg("你取消了这条收藏。框里的字已留作草稿，重新收藏时会自动恢复");
      writeDraft().finally(() => setTimeout(() => close("unbookmarked"), 2500));
    } else if (event.data.xbnHost === "bookmark-failed") {
      showMsg("X 这次收藏好像没成功，备注照样可以先写着");
    }
  });

  async function init() {
    if (!tweetId) { showMsg("找不到是哪条推文"); return; }
    const box = $("tweet");
    if (author || excerpt) {
      const b = document.createElement("b");
      b.textContent = author || "这条推文";
      box.append(b, document.createTextNode(excerpt ? `：${excerpt}` : ""));
    } else {
      box.textContent = `推文 ${tweetId}`;
    }
    if (wantFocus) text.focus();
    else showMsg("点这里写备注；不写就不用管，8 秒后自动收起", true);
    const [existing, local] = await Promise.all([
      send({ type: "xbn-get-note", tweetId }),
      chrome.storage.local.get("drafts").catch(() => ({})),
    ]);
    if (closed) return;
    if (existing?.ok && existing.note) {
      original = existing.note;
      if (!touched) text.value = existing.note;
      showMsg("这条已经写过备注，改完回车保存");
    }
    const draft = local?.drafts?.[tweetId];
    if (!touched && draft?.text && draft.text !== original) {
      if ((draft.base || "") === original) {
        text.value = draft.text;
        showMsg("恢复了上次没存的草稿，回车保存");
      } else {
        showMsg("有一份旧草稿，但这条备注之后改过，没有填回来");
      }
    }
    if (!text.value.trim()) startAutoHide();
    if (wantFocus) { text.focus(); text.setSelectionRange(text.value.length, text.value.length); }
  }

  window.__xbnCardDebug = () => ({ tweetId, text: text.value, msg: msg.textContent, focused: document.hasFocus() && document.activeElement === text, touched, original });
  init();
})();
