// X 收藏备注：X 页面上的这一层。
//
// 只做五件事：认出你收藏了哪条推文；在右下角放一个备注框（插件自己的页面，以 iframe 嵌进来，X 页面碰不到里面的字）；
// 在已收藏推文旁边显示小标记（写过的是实心「已记」，没写的是空心「备注」，点它补写或修改）；
// 从插件弹窗的「待补备注」点「去写」打开推文时，自动弹出备注框；
// 替插件后台调 X 网页自己的书签接口（用的是你这个页面已有的登录状态，插件读不到也不保存你的密码）。
// 打字、保存、草稿都在备注框里完成，这里不经手备注原文。
(() => {
  "use strict";
  // 插件更新或重装后，后台会把新脚本注入已经开着的 X 页面；旧脚本已经和插件断开，先把它清掉
  const previous = window.__xbnNote;
  if (previous && previous.alive()) return;
  if (previous) previous.teardown();
  const abort = new AbortController();
  const on = (target, type, fn, options = {}) => target.addEventListener(type, fn, { ...options, signal: abort.signal });
  const alive = () => { try { return Boolean(chrome.runtime?.id); } catch { return false; } };

  const FLIP_WAIT_MS = 3000; // 点收藏后等按钮变成「已收藏」最多多久
  const WATCHDOG_MS = 6000;  // 点了收藏按钮多久还没认出收藏（两条路都没认出），就提示插件可能要修
  const FRAME_W = 360, FRAME_H = 300;

  let frame = null, frameTweet = null;
  const closing = new Set(); // 正在收起、等它存完草稿的旧框
  let lastKeyBAt = 0, lastBookmarkSeenAt = 0;
  const recentlyOpened = new Map();
  let notedIds = new Set();
  let observer = null;

  const send = (message) => new Promise((resolve) => {
    if (!alive()) { resolve({ ok: false, disconnected: true }); return; }
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response || { ok: false });
      });
    } catch {
      resolve({ ok: false, disconnected: true });
    }
  });

  // ---------- 找推文（只用来知道是哪条、在卡片上显示作者和开头） ----------
  function findArticle(tweetId) {
    for (const link of document.querySelectorAll(`article a[href*="/status/${tweetId}"]`)) {
      if (link.querySelector("time") && new RegExp(`/status/${tweetId}(?:[/?#]|$)`).test(link.getAttribute("href") || "")) return link.closest("article");
    }
    return null;
  }
  function tweetIdOfArticle(article) {
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      if (!link.querySelector("time")) continue;
      const match = (link.getAttribute("href") || "").match(/\/status\/(\d{8,25})/);
      if (match) return match[1];
    }
    return null;
  }
  function tweetPreview(tweetId) {
    const article = findArticle(tweetId);
    if (!article) return { author: "", excerpt: "" };
    const name = article.querySelector('[data-testid="User-Name"]');
    const text = article.querySelector('[data-testid="tweetText"]');
    return {
      author: (name?.innerText || "").split("\n").filter(Boolean).slice(0, 2).join(" ").trim().slice(0, 120),
      excerpt: (text?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
    };
  }
  function buttonState(article, tweetId) {
    const box = article && article.isConnected ? article : findArticle(tweetId);
    if (!box) return null;
    if (box.querySelector('[data-testid="removeBookmark"]')) return "on";
    if (box.querySelector('[data-testid="bookmark"]')) return "off";
    return null;
  }
  function watchFlip(article, tweetId, want, then) {
    const end = Date.now() + FLIP_WAIT_MS;
    const tick = () => {
      if (buttonState(article, tweetId) === want) { then(); return; }
      if (Date.now() < end) setTimeout(tick, 100);
    };
    setTimeout(tick, 50);
  }

  // ---------- 小提示条（只显示固定的几句话，不含备注内容） ----------
  let toastHost = null, toastBox = null, toastTimer = 0;
  function toast(text, ms = 1600) {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement("xbn-toast");
      const shadow = toastHost.attachShadow({ mode: "closed" });
      shadow.innerHTML = `<style>
        div { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; background: #0f1419; color: #fff; border-radius: 999px;
          padding: 8px 16px; font: 600 13.5px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.25); }
        div[hidden] { display: none; }</style><div hidden></div>`;
      toastBox = shadow.querySelector("div");
      (document.body || document.documentElement).appendChild(toastHost);
    }
    toastBox.textContent = text;
    toastBox.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastBox.hidden = true; }, ms);
  }

  // ---------- 备注框（iframe） ----------
  function post(target, data) { try { target?.contentWindow?.postMessage(data, "*"); } catch { /* 框已经没了 */ } }
  function removeFrame(target) {
    closing.delete(target);
    if (target === frame) { frame = null; frameTweet = null; }
    target?.remove();
  }
  function retireCurrent() { // 要开别的框：旧框收起并存草稿，存完自己报「close」再移除；1.5 秒兜底
    if (!frame) return;
    const old = frame;
    frame = null; frameTweet = null;
    old.style.visibility = "hidden";
    closing.add(old);
    post(old, { xbnHost: "dismiss" });
    setTimeout(() => { if (closing.has(old)) removeFrame(old); }, 1500);
  }
  function openCard(tweetId, { focus }) {
    if (!alive()) { toast("插件刚更新，请刷新这个 X 页面", 4000); return; }
    if (frame && frameTweet === tweetId) { if (focus) frame.focus(); return; }
    retireCurrent();
    const preview = tweetPreview(tweetId);
    const hash = new URLSearchParams({ t: tweetId, f: focus ? "1" : "0", a: preview.author, e: preview.excerpt }).toString();
    const iframe = document.createElement("iframe");
    iframe.src = `${chrome.runtime.getURL("card.html")}#${hash}`;
    iframe.title = "收藏备注";
    iframe.setAttribute("allowtransparency", "true");
    iframe.allow = "clipboard-write"; // 「复制给 AI」要用剪贴板
    iframe.style.cssText = `position:fixed;right:16px;bottom:16px;width:${FRAME_W}px;height:${FRAME_H}px;max-width:calc(100vw - 24px);border:0;z-index:2147483647;background:transparent;color-scheme:normal;`;
    if (focus) on(iframe, "load", () => iframe.focus(), { once: true });
    (document.body || document.documentElement).appendChild(iframe);
    frame = iframe;
    frameTweet = tweetId;
  }
  // 备注框发来的：收起了 / 存好了
  on(window, "message", (event) => {
    const data = event.data;
    if (!data || typeof data.xbnCard !== "string") return;
    const source = frame && event.source === frame.contentWindow ? frame : [...closing].find((f) => event.source === f.contentWindow);
    if (!source) return; // 只认自己放进去的框
    if (data.xbnCard === "saved") {
      const tweetId = source === frame ? frameTweet : String(data.tweetId || "");
      removeFrame(source);
      if (data.cleared) notedIds.delete(tweetId); else notedIds.add(tweetId);
      refreshChips();
      toast(data.cleared ? "已清空这条备注" : "已存。以后点收藏旁的「已记」可以再看、再改");
    } else if (data.xbnCard === "close") {
      const wasCurrent = source === frame;
      removeFrame(source);
      if (wasCurrent && data.hasDraft) toast("没存，已留作草稿。点收藏旁的「备注」接着写", 2600);
      else if (wasCurrent && data.reason === "auto") toast("点收藏旁的「备注」随时可以补写", 2000);
    }
  });
  // 点页面别处：框收起（写了的字留作草稿，不自动存）；在页面上滚动：空框收起
  on(window, "mousedown", (event) => {
    if (!frame || !event.isTrusted || event.target === frame) return;
    if (event.target.closest?.('[data-testid="bookmark"], [data-testid="removeBookmark"], xbn-chip')) return;
    post(frame, { xbnHost: "dismiss" });
  }, { capture: true });
  on(window, "wheel", (event) => { if (frame && event.isTrusted) post(frame, { xbnHost: "scroll" }); }, { capture: true, passive: true });

  // ---------- 认出收藏：两条路，谁先到用谁，几秒内同一条只弹一次 ----------
  // 1. 页面上：你真的点了收藏按钮（或按 b 键收藏当前推文），按钮变成「已收藏」就弹框。网页脚本伪造的点击不算。
  // 2. 后台：看到 X 发出的收藏请求（见 background.js）。X 改了按钮样式时靠这一条兜底。
  function onBookmarked(tweetId, { focus }) {
    lastBookmarkSeenAt = Date.now();
    const last = recentlyOpened.get(tweetId) || 0;
    if (Date.now() - last < 4000) return;
    recentlyOpened.set(tweetId, Date.now());
    const preview = tweetPreview(tweetId);
    send({ type: "xbn-bookmark-seen", tweetId, author: preview.author, excerpt: preview.excerpt });
    openCard(tweetId, { focus });
  }
  function onUnbookmarked(tweetId, { fromPage }) {
    recentlyOpened.delete(tweetId);
    if (fromPage) send({ type: "xbn-page-unbookmarked", tweetId, at: new Date().toISOString() });
    if (frame && frameTweet === tweetId) post(frame, { xbnHost: "unbookmarked" });
  }
  on(window, "click", (event) => {
    if (!event.isTrusted) return;
    const add = event.target.closest?.('[data-testid="bookmark"]');
    const remove = event.target.closest?.('[data-testid="removeBookmark"]');
    const button = add || remove;
    if (!button) return;
    if (!alive()) { toast("插件刚更新，请刷新这个 X 页面", 4000); return; }
    const article = button.closest("article");
    const tweetId = article && tweetIdOfArticle(article);
    if (!tweetId) return;
    const clickedAt = Date.now();
    if (add) {
      watchFlip(article, tweetId, "on", () => onBookmarked(tweetId, { focus: true }));
      // 两条路都没认出来：多半是 X 改版了，插件图标上亮红色「!」
      setTimeout(() => { if (lastBookmarkSeenAt < clickedAt) send({ type: "xbn-watchdog" }); }, WATCHDOG_MS);
    } else {
      watchFlip(article, tweetId, "off", () => onUnbookmarked(tweetId, { fromPage: true }));
    }
  }, { capture: true });
  on(window, "keydown", (event) => {
    if (!event.isTrusted || (event.key !== "b" && event.key !== "B") || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    lastKeyBAt = Date.now();
    // X 的 b 键收藏的是当前选中（j、k 移到）的那条推文；键盘收藏时不把光标放进框里，你接着按 j、k 照常翻推文
    const article = document.activeElement?.closest?.("article");
    const tweetId = article && tweetIdOfArticle(article);
    if (!tweetId) return;
    const before = buttonState(article, tweetId);
    if (before === "off") watchFlip(article, tweetId, "on", () => onBookmarked(tweetId, { focus: false }));
    else if (before === "on") watchFlip(article, tweetId, "off", () => onUnbookmarked(tweetId, { fromPage: true }));
  }, { capture: true });

  // ---------- 后台消息 ----------
  // 替插件后台取书签列表：在 X 页面里发请求，带的是这个页面本来就有的登录状态。
  // ct0 是 X 网页自己也会读的防伪参数；登录凭证 auth_token 浏览器自动带上，这里读不到也不经手。
  async function fetchForBackground(message) {
    if (!/^https:\/\/x\.com\/i\/api\/graphql\/[A-Za-z0-9_-]+\/Bookmarks\?/.test(String(message.url || ""))) return { status: 0, error: "bad url" };
    const ct0 = (document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/) || [])[1];
    if (!ct0) return { loggedOut: true };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(message.url, {
        credentials: "include",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${message.bearer}`,
          "x-csrf-token": decodeURIComponent(ct0),
          "x-twitter-auth-type": "OAuth2Session",
          "x-twitter-active-user": "yes",
          "content-type": "application/json",
        },
      });
      return { status: response.status, text: await response.text() };
    } catch (error) {
      return { status: 0, error: String(error?.message || error) };
    } finally {
      clearTimeout(timer);
    }
  }
  const onMessage = (message, sender, sendResponse) => {
    if (message?.type === "xbn-ping") { sendResponse({ ok: alive() }); return false; }
    if (message?.type === "xbn-fetch") { fetchForBackground(message).then(sendResponse); return true; }
    const tweetId = String(message?.tweetId || "");
    if (!/^\d{8,25}$/.test(tweetId)) return;
    if (message.type === "xbn-bookmarked") onBookmarked(tweetId, { focus: Date.now() - lastKeyBAt > 2000 });
    else if (message.type === "xbn-bookmark-failed") { if (frame && frameTweet === tweetId) post(frame, { xbnHost: "bookmark-failed" }); }
    else if (message.type === "xbn-unbookmarked") onUnbookmarked(tweetId, { fromPage: false });
    else if (message.type === "xbn-open-card") openWhenReady(tweetId);
  };
  chrome.runtime.onMessage.addListener(onMessage);

  // 从「待补备注」点「去写」打开的推文：等推文显示出来就弹框
  function openWhenReady(tweetId) {
    const end = Date.now() + 10000;
    const tick = () => {
      if (findArticle(tweetId) || Date.now() > end) { openCard(tweetId, { focus: true }); return; }
      setTimeout(tick, 250);
    };
    tick();
  }

  // ---------- 已收藏推文旁的小标记 ----------
  const CHIP_CSS = `
    :host { all: initial; display: inline-flex; align-items: center; }
    button { all: unset; cursor: pointer; font: 600 11.5px/1 -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; border-radius: 999px;
      padding: 3px 7px; margin-left: 2px; border: 1px solid #1d9bf0; color: #1d9bf0; background: transparent; white-space: nowrap; }
    button.on { background: #1d9bf0; color: #fff; }
    button:hover { filter: brightness(.95); }
  `;
  function makeChip(tweetId) {
    const chip = document.createElement("xbn-chip");
    chip.dataset.tweetId = tweetId;
    const shadow = chip.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>${CHIP_CSS}</style><button type="button"></button>`;
    const button = shadow.querySelector("button");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.isTrusted) openCard(tweetId, { focus: true });
    });
    chip.__button = button;
    paintChip(chip);
    return chip;
  }
  function paintChip(chip) {
    const noted = notedIds.has(chip.dataset.tweetId);
    chip.__button.classList.toggle("on", noted);
    chip.__button.textContent = noted ? "已记" : "备注";
    chip.__button.title = noted ? "点开看、改这条的备注" : "还没写备注，点这里补写";
  }
  function refreshChips() {
    for (const chip of document.querySelectorAll("xbn-chip")) if (chip.__button) paintChip(chip);
  }
  function scanChips() {
    for (const button of document.querySelectorAll('button[data-testid="removeBookmark"]')) {
      const article = button.closest("article");
      const tweetId = article && tweetIdOfArticle(article);
      const slot = button.parentElement;
      if (!tweetId || !slot?.parentElement) continue;
      const existing = slot.parentElement.querySelector("xbn-chip");
      if (existing && existing.dataset.tweetId === tweetId && existing.__button) continue;
      if (existing) existing.remove();
      slot.after(makeChip(tweetId));
    }
    for (const chip of document.querySelectorAll("xbn-chip")) {
      if (!chip.parentElement?.querySelector('button[data-testid="removeBookmark"]')) chip.remove();
    }
  }
  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => { scanQueued = false; try { scanChips(); } catch { /* X 页面结构变了：小标记不显示，不影响收藏和备注框 */ } });
  }
  async function loadNotedIds(force) {
    const result = await send({ type: "xbn-noted-ids", force });
    if (result?.ok && Array.isArray(result.ids)) { notedIds = new Set(result.ids); refreshChips(); }
  }

  function start() {
    // 旧脚本留下的小标记先清掉，由这一份重新画
    for (const old of document.querySelectorAll("xbn-chip")) old.remove();
    observer = new MutationObserver(queueScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    queueScan();
    loadNotedIds(false);
    on(document, "visibilitychange", () => { if (document.visibilityState === "visible") loadNotedIds(false); });
    send({ type: "xbn-pending-open" }).then((result) => { if (result?.tweetId) openWhenReady(result.tweetId); });
  }
  if (document.readyState === "loading") on(document, "DOMContentLoaded", start, { once: true });
  else start();

  window.__xbnNote = {
    alive,
    teardown() {
      abort.abort();
      observer?.disconnect();
      try { chrome.runtime.onMessage.removeListener(onMessage); } catch { /* 已断开 */ }
      frame?.remove();
      for (const f of closing) f.remove();
      toastHost?.remove();
    },
  };
  // 给自动测试和排查用。内容脚本跑在插件自己的隔离环境里，X 的网页脚本读不到这个函数
  window.__xbnDebug = () => ({
    open: Boolean(frame), tweetId: frameTweet,
    chips: [...document.querySelectorAll("xbn-chip")].map((c) => ({ id: c.dataset.tweetId, label: c.__button?.textContent })),
  });
})();
