// X 收藏备注：插件后台。
//
// 1. 认出收藏：看 X 网页自己发出的「收藏」「取消收藏」请求（CreateBookmark / DeleteBookmark），不靠按钮长相。
// 2. 存备注：备注框交来的备注存进插件本地存储，按回车那一刻就不会丢。
// 3. 抓收藏：借你已经登录的 X 网页，调 X 网页自己用的书签接口，把收藏的全文、作者、链接抓下来。
//    不用你复制任何登录信息，插件也碰不到你的密码。
// 4. 写文件：每条收藏写成一个 Markdown 文件，放在「下载」文件夹里的「X收藏」，再写一份总索引。你的 AI 直接读这个文件夹。
//
// 除了 X 自己，插件只在遇到 X 长文时问一次 api.fxtwitter.com 要长文全文（可以在弹窗里关掉）。

import { parseBookmarksPage, PUBLIC_BEARER, FALLBACK_QUERY_ID, DEFAULT_FEATURES } from "./lib/parse.js";
import { renderBookmark, renderIndex, fileNameFor, fingerprint, ROOT, localTime } from "./lib/markdown.js";
import { HOT_RULES, hotStatus, snapOf, addSnap } from "./lib/hot.js";
import { ABOUT_ME, TAXONOMY, DO_WITHIN, VIDEO_KINDS, STATUSES, MINOR_TO_MAJOR, BATCH_SIZE, classifierInstructions, intentOutputSchema, normalizeIntent } from "./lib/classify.js";

const GRAPHQL_URLS = ["https://x.com/i/api/graphql/*", "https://pro.x.com/i/api/graphql/*", "https://twitter.com/i/api/graphql/*", "https://api.x.com/graphql/*"];
const BOOKMARK_OP = /\/graphql\/[^/?]+\/(CreateBookmark|DeleteBookmark|bookmarkTweetToFolder|BookmarkTweetToFolder)(?:[?#]|$)/;
const BOOKMARKS_QUERY = /\/graphql\/([^/?]+)\/Bookmarks\?/;
const X_PAGE = /^https:\/\/(x|pro\.x|twitter)\.com\//;
const X_TABS = ["https://x.com/*", "https://pro.x.com/*", "https://twitter.com/*"];
const ID = /^\d{8,25}$/;
// 翻页节奏照着人在 X 书签页往下滑：一页 20 条，两页之间隔 2 秒
const PAGE_SIZE = 20;
const PAGE_DELAY_MS = 2000;
const MAX_PAGES = { import: 60, quick: 10, auto: 10 };
// 流量爆帖要定期重看最近收藏的数字：每 30 分钟最多一次，翻最近 100 条（5 页）。作者自用版也是这个频率
const REFRESH_EVERY_MS = 30 * 60000, REFRESH_PAGES = 5;
const STALE_MS = 10 * 60000; // 上次同步超过 10 分钟，打开 X 页面或收藏页时就自己同步一次
const IMPORT_DAYS = [7, 30]; // 第一次只导入最近 7 天或 30 天的收藏，不一口气翻完全部
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 存储 ----------
// t:<id> 一条收藏；n:<id> 备注；w:<id> 文件上次写进去的指纹；meta 其他状态
// i:<id> AI 分类；r:<id> 你在收藏页上的批注（准不准、改的标签、状态、多久内做、不做了、延期）
// m:<id> 每次同步记下的浏览、点赞等数字（算流量爆帖用，见 lib/hot.js）
const T = (id) => `t:${id}`, N = (id) => `n:${id}`, W = (id) => `w:${id}`, I = (id) => `i:${id}`, R = (id) => `r:${id}`, M = (id) => `m:${id}`;
let chain = Promise.resolve();
function serial(fn) { // 改存储串行做，两个标签页同时写不会把对方盖掉
  const run = chain.then(fn);
  chain = run.catch(() => undefined);
  return run;
}
async function getMeta() { return (await chrome.storage.local.get("meta")).meta || {}; }
async function setMeta(patch) {
  return serial(async () => {
    const meta = await getMeta();
    await chrome.storage.local.set({ meta: { ...meta, ...patch } });
  });
}
async function allItems() {
  const all = await chrome.storage.local.get(null);
  const items = [], notes = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("t:")) items.push(value);
    else if (key.startsWith("n:")) notes[key.slice(2)] = value;
  }
  return { items, notes, all };
}

// ---------- 认出收藏 ----------
const inflight = new Map();
function tweetIdFromBody(requestBody) {
  try {
    const raw = requestBody?.raw?.[0]?.bytes;
    const text = raw ? new TextDecoder().decode(raw) : "";
    if (text) {
      try {
        const id = JSON.parse(text)?.variables?.tweet_id;
        if (ID.test(String(id || ""))) return String(id);
      } catch { /* 不是 JSON 就用正则 */ }
      const match = text.match(/"tweet_id"\s*:\s*"?(\d{8,25})/);
      if (match) return match[1];
    }
    const form = requestBody?.formData?.variables?.[0];
    if (form) {
      const id = JSON.parse(form)?.tweet_id;
      if (ID.test(String(id || ""))) return String(id);
    }
  } catch { /* 解析不了就当没看到 */ }
  return null;
}
// X 可能让它自己的后台程序代发请求，这时不知道是哪个标签页，就发给你正在看的那个 X 标签页
async function tell(tabId, message) {
  let target = tabId;
  if (typeof target !== "number" || target < 0) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true, url: X_TABS }).catch(() => []);
    if (!tab) return;
    target = tab.id;
  }
  chrome.tabs.sendMessage(target, message).catch(() => undefined);
}
chrome.webRequest.onBeforeRequest.addListener((details) => {
  // X 网页自己去拿书签列表时，顺手记下它现在用的接口编号和参数，X 改版后插件跟着用新的
  if (details.method === "GET") {
    const learned = details.url.match(BOOKMARKS_QUERY);
    if (learned) {
      try {
        const features = new URL(details.url).searchParams.get("features");
        setMeta({ learnedQueryId: learned[1], learnedFeatures: features ? JSON.parse(features) : null, learnedAt: new Date().toISOString() });
      } catch { /* 记不下来就用默认的 */ }
    }
    return;
  }
  if (details.method !== "POST") return;
  const match = details.url.match(BOOKMARK_OP);
  if (!match) return;
  const tweetId = tweetIdFromBody(details.requestBody);
  if (!tweetId) return;
  const op = /delete/i.test(match[1]) ? "unbookmark" : "bookmark";
  inflight.set(details.requestId, { op, tweetId, tabId: details.tabId });
  markSeenRequest();
  if (op === "bookmark") { // 请求一发出就弹框，不等 X 回应；真失败了再告诉备注框
    tell(details.tabId, { type: "xbn-bookmarked", tweetId });
    onBookmark(tweetId, {}, details.tabId).catch(() => undefined);
  }
}, { urls: GRAPHQL_URLS }, ["requestBody"]);
chrome.webRequest.onCompleted.addListener((details) => {
  const hit = inflight.get(details.requestId);
  if (!hit) return;
  inflight.delete(details.requestId);
  const ok = details.statusCode >= 200 && details.statusCode < 300;
  if (hit.op === "bookmark") { if (!ok) tell(hit.tabId, { type: "xbn-bookmark-failed", tweetId: hit.tweetId }); return; }
  if (ok) {
    tell(hit.tabId, { type: "xbn-unbookmarked", tweetId: hit.tweetId });
    onUnbookmark(hit.tweetId).catch(() => undefined);
  }
}, { urls: GRAPHQL_URLS });
chrome.webRequest.onErrorOccurred.addListener((details) => {
  const hit = inflight.get(details.requestId);
  if (!hit) return;
  inflight.delete(details.requestId);
  if (hit.op === "bookmark") tell(hit.tabId, { type: "xbn-bookmark-failed", tweetId: hit.tweetId });
}, { urls: GRAPHQL_URLS });

async function onBookmark(tweetId, { author = "", excerpt = "" }, tabId) {
  await serial(async () => {
    const { [T(tweetId)]: prev } = await chrome.storage.local.get(T(tweetId));
    const now = new Date().toISOString();
    if (prev) {
      const patch = { removedAt: null };
      if (prev.removedAt) patch.bookmarkedAt = now; // 取消过又收藏回来：按这次算
      if (prev.stub && excerpt && !prev.text) Object.assign(patch, { author, text: excerpt });
      await chrome.storage.local.set({ [T(tweetId)]: { ...prev, ...patch } });
    } else {
      // 先记一笔（时间准）；正文等马上那次同步抓全
      await chrome.storage.local.set({ [T(tweetId)]: {
        id: tweetId, url: `https://x.com/i/status/${tweetId}`, author: String(author).slice(0, 120), handle: "", text: String(excerpt).slice(0, 280),
        stub: true, bookmarkedAt: now, firstSeenAt: now, media: [], metrics: {},
      } });
    }
  });
  await markDirty([tweetId]);
  await refreshBadge();
  if (typeof tabId === "number" && tabId >= 0) scheduleQuickSync(tabId);
}
async function onUnbookmark(tweetId, at = new Date().toISOString()) {
  await serial(async () => {
    const { [T(tweetId)]: prev } = await chrome.storage.local.get(T(tweetId));
    if (prev) await chrome.storage.local.set({ [T(tweetId)]: { ...prev, removedAt: at } });
  });
  await markDirty([tweetId]);
  await refreshBadge();
}

// ---------- 备注 ----------
async function saveNote(tweetId, text) {
  const note = { text: String(text).slice(0, 4000), at: new Date().toISOString() };
  await serial(async () => {
    const { drafts = {}, [T(tweetId)]: prev } = await chrome.storage.local.get(["drafts", T(tweetId)]);
    delete drafts[tweetId];
    const patch = { [N(tweetId)]: note, drafts };
    if (!prev) { // 给一条插件没见过的收藏写备注（比如手机上收藏、还没同步）：先记下来，同步时补全文
      const now = new Date().toISOString();
      patch[T(tweetId)] = { id: tweetId, url: `https://x.com/i/status/${tweetId}`, author: "", handle: "", text: "", stub: true, bookmarkedAt: now, firstSeenAt: now, media: [], metrics: {} };
    }
    await chrome.storage.local.set(patch);
  });
  await markDirty([tweetId], { backup: true });
  await refreshBadge();
  scheduleClassify(15000); // 备注变了，AI 按新备注重分
}

// ---------- 写文件（Chrome 下载功能写进「下载/X收藏」，同名覆盖，不留下载记录） ----------
async function markDirty(ids, { backup = false } = {}) {
  await serial(async () => {
    const { dirty = [], meta = {} } = await chrome.storage.local.get(["dirty", "meta"]);
    const set = new Set(dirty);
    ids.forEach((id) => set.add(id));
    await chrome.storage.local.set({ dirty: [...set], meta: backup ? { ...meta, backupDirty: true } : meta });
  });
  scheduleWrite();
}
let writeTimer = 0;
function scheduleWrite(ms = 1500) { clearTimeout(writeTimer); writeTimer = setTimeout(() => flushFiles().catch(() => undefined), ms); }

function waitDownload(id) {
  return new Promise((resolve) => {
    const finish = (state, error) => { chrome.downloads.onChanged.removeListener(onChange); clearTimeout(timer); resolve({ state, error }); };
    const onChange = (delta) => { if (delta.id === id && delta.state && delta.state.current !== "in_progress") finish(delta.state.current, delta.error?.current); };
    const timer = setTimeout(() => finish("timeout"), 30000);
    chrome.downloads.onChanged.addListener(onChange);
    chrome.downloads.search({ id }).then(([item]) => { if (item && item.state !== "in_progress") finish(item.state, item.error); });
  });
}
async function writeFile(path, text, { keep = false } = {}) {
  const type = path.endsWith(".json") ? "application/json" : "text/markdown"; // 类型不对 Chrome 会改扩展名
  const url = `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
  const id = await chrome.downloads.download({ url, filename: `${ROOT}/${path}`, conflictAction: "overwrite", saveAs: false });
  const { state, error } = await waitDownload(id);
  if (state !== "complete") {
    chrome.downloads.erase({ id }).catch(() => undefined);
    const why = error === "USER_CANCELED" || !error
      ? "Chrome 打开了「下载前询问每个文件的保存位置」，插件没法自动存文件。到 Chrome 设置 → 下载内容，把这个开关关掉，再点「再试一次」。"
      : `写文件失败（${error}）。`;
    throw new Error(why);
  }
  if (!keep) await chrome.downloads.erase({ id }).catch(() => undefined);
  return id;
}

let flushing = null;
function flushFiles() {
  if (!flushing) flushing = doFlush().finally(() => { flushing = null; });
  return flushing;
}
async function doFlush() {
  const { dirty = [] } = await chrome.storage.local.get("dirty");
  const meta = await getMeta();
  if (!dirty.length && !meta.indexDirty && !meta.backupDirty) return;
  if (!meta.setupDone) return; // 还没选导入多少天：不往读者电脑上写东西
  const ui = chrome.downloads.setUiOptions ? (enabled) => chrome.downloads.setUiOptions({ enabled }).catch(() => undefined) : async () => {};
  await ui(false); // 写的时候不弹下载气泡
  let wrote = 0;
  try {
    for (const id of dirty) {
      const got = await chrome.storage.local.get([T(id), N(id), W(id), I(id), R(id)]);
      let item = got[T(id)];
      if (item && !item.stub) {
        if (!item.file) {
          item = { ...item, file: fileNameFor(item) };
          await serial(async () => {
            const { [T(id)]: latest } = await chrome.storage.local.get(T(id));
            if (latest) await chrome.storage.local.set({ [T(id)]: { ...latest, file: item.file } });
          });
        }
        const text = renderBookmark(item, got[N(id)], effectiveIntent(got[I(id)], got[R(id)], got[N(id)]));
        const print = fingerprint(text);
        if (print !== got[W(id)]) {
          await writeFile(item.file, text);
          await chrome.storage.local.set({ [W(id)]: print });
          wrote += 1;
        }
      }
      await serial(async () => {
        const { dirty: now = [] } = await chrome.storage.local.get("dirty");
        await chrome.storage.local.set({ dirty: now.filter((x) => x !== id) });
      });
    }
    const latest = await getMeta();
    if (wrote || latest.indexDirty || latest.backupDirty || !latest.indexDownloadId) {
      const { items, notes } = await allItems();
      const written = items.filter((i) => i.file);
      const indexId = await writeFile("_索引.md", renderIndex(written, notes), { keep: true });
      if (latest.indexDownloadId && latest.indexDownloadId !== indexId) chrome.downloads.erase({ id: latest.indexDownloadId }).catch(() => undefined);
      // 备注另存一份备份：插件被移除再装回来时，可以从这里把备注导回去
      const backup = Object.fromEntries(Object.entries(notes).filter(([, n]) => String(n?.text || "").trim()));
      await writeFile("_备注备份.json", JSON.stringify({ version: 1, savedAt: new Date().toISOString(), notes: backup }, null, 1));
      await setMeta({ indexDownloadId: indexId, indexDirty: false, backupDirty: false, writeError: null, lastWriteAt: new Date().toISOString() });
    }
  } catch (error) {
    await setMeta({ writeError: String(error?.message || error), writeErrorAt: new Date().toISOString() });
  } finally {
    await ui(true);
    await refreshBadge();
  }
}

// ---------- 抓收藏：在开着的 X 标签页里调 X 网页自己的书签接口 ----------
async function ping(tabId) {
  try { return (await chrome.tabs.sendMessage(tabId, { type: "xbn-ping" }))?.ok === true; } catch { return false; }
}
async function readyTab(tabId) {
  if (await ping(tabId)) return true;
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).catch(() => undefined);
  return ping(tabId);
}
async function findXTab() {
  const tabs = await chrome.tabs.query({ url: ["https://x.com/*"] }).catch(() => []);
  tabs.sort((a, b) => Number(b.active) - Number(a.active));
  for (const tab of tabs) if (tab.status === "complete" && await readyTab(tab.id)) return tab.id;
  return null;
}
async function openXTab() { // 没开着的 X 页面：在后台开一个，抓完关掉
  const tab = await chrome.tabs.create({ url: "https://x.com/i/bookmarks", active: false });
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    await sleep(500);
    const now = await chrome.tabs.get(tab.id).catch(() => null);
    if (!now) return null;
    if (now.status === "complete" && await readyTab(tab.id)) return tab.id;
  }
  chrome.tabs.remove(tab.id).catch(() => undefined);
  return null;
}
async function fetchPage(tabId, queryId, features, cursor, count) {
  const variables = { count, includePromotedContent: false };
  if (cursor) variables.cursor = cursor;
  const url = `https://x.com/i/api/graphql/${queryId}/Bookmarks?variables=${encodeURIComponent(JSON.stringify(variables))}&features=${encodeURIComponent(JSON.stringify(features))}`;
  const result = await chrome.tabs.sendMessage(tabId, { type: "xbn-fetch", url, bearer: PUBLIC_BEARER });
  if (!result) throw new Error("X 页面没有回应，刷新一下 X 页面再试");
  if (result.loggedOut) throw new Error("这个 Chrome 里的 X 没登录，登录后再同步");
  return result;
}
async function fetchPageSmart(tabId, cursor, count) {
  const meta = await getMeta();
  const tries = [];
  if (meta.learnedQueryId) tries.push([meta.learnedQueryId, meta.learnedFeatures || DEFAULT_FEATURES]);
  if (meta.learnedQueryId !== FALLBACK_QUERY_ID) tries.push([FALLBACK_QUERY_ID, DEFAULT_FEATURES]);
  let last = null;
  for (const [queryId, features] of tries) {
    last = await fetchPage(tabId, queryId, features, cursor, count);
    if (last.status === 200) {
      let payload;
      try { payload = JSON.parse(last.text); } catch { throw new Error("X 返回的不是正常数据，稍后再试"); }
      return parseBookmarksPage(payload);
    }
    if (last.status === 429) throw new Error("X 说访问太频繁了，过一会儿再同步");
    if (last.status === 401 || last.status === 403) throw new Error("X 拒绝了（可能登录过期），刷新 X 页面确认已登录再试");
  }
  throw new Error(`X 的书签接口可能改了（${last?.status}）。打开一次 x.com/i/bookmarks 让插件学一下新地址，再点同步`);
}

async function mergeItems(items) {
  const changed = [];
  let added = 0, known = 0;
  await serial(async () => {
    const keys = items.map((i) => T(i.id));
    const existing = await chrome.storage.local.get([...keys, ...items.map((i) => M(i.id))]);
    const patch = {};
    const now = new Date().toISOString();
    for (const item of items) {
      const snap = snapOf(item.metrics, Date.parse(now));
      const snaps = snap && addSnap(existing[M(item.id)], snap);
      if (snaps) patch[M(item.id)] = snaps;
      const prev = existing[T(item.id)];
      if (!prev) added += 1;
      else if (!prev.stub) known += 1;
      const next = {
        ...item,
        firstSeenAt: prev?.firstSeenAt || now,
        bookmarkedAt: item.bookmarkedAt || prev?.bookmarkedAt || now,
        file: prev?.file,
        metrics: prev && !prev.stub && prev.metrics ? prev.metrics : item.metrics, // 数字只记第一次抓到时的，免得每次都重写文件
        article: item.article || prev?.article || null,
        articleFetchedAt: prev?.articleFetchedAt || null,
        removedAt: null,
        stub: false,
      };
      if (!next.file) delete next.file;
      if (!prev || JSON.stringify(prev) !== JSON.stringify(next)) { patch[T(item.id)] = next; changed.push(item.id); }
    }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  });
  return { changed, added, known };
}

// X 长文：书签接口里只有一个链接，全文问 fxtwitter 要
const ARTICLE_LINK = /https:\/\/x\.com\/i\/article\/(\d+)/;
function articleText(content) {
  const out = [];
  for (const block of content?.blocks || []) {
    const text = String(block.text || "").trim();
    if (block.type === "atomic") continue;
    if (!text) continue;
    const prefix = { "header-one": "## ", "header-two": "### ", "header-three": "#### ", "unordered-list-item": "- ", "ordered-list-item": "1. ", blockquote: "> " }[block.type] || "";
    out.push(prefix + text);
  }
  return out.join("\n\n");
}
async function fillArticles(ids) {
  if ((await getMeta()).articlesOff) return;
  const got = await chrome.storage.local.get(ids.map(T));
  for (const item of Object.values(got)) {
    if (!item || item.articleFetchedAt || item.article?.text) continue;
    if (!ARTICLE_LINK.test(item.text || "") && !ARTICLE_LINK.test(item.card?.url || "")) continue;
    try {
      const response = await fetch(`https://api.fxtwitter.com/i/status/${item.id}`, { cache: "no-store" });
      const json = await response.json();
      const a = json?.tweet?.article;
      await serial(async () => {
        const { [T(item.id)]: latest } = await chrome.storage.local.get(T(item.id));
        if (!latest) return;
        const article = a ? { title: String(a.title || ""), preview: String(a.preview_text || ""), text: articleText(a.content) } : latest.article;
        await chrome.storage.local.set({ [T(item.id)]: { ...latest, article, articleFetchedAt: new Date().toISOString() } });
      });
      if (a) await markDirty([item.id]);
    } catch { /* 下次同步再试 */ }
    await sleep(600);
  }
}

let syncing = null;
function sync(mode, { tabId = null, openTab = false } = {}) {
  if (syncing) return syncing;
  syncing = doSync(mode, { tabId, openTab }).finally(() => { syncing = null; });
  return syncing;
}
async function setSyncState(patch) { await chrome.storage.local.set({ syncState: { ...patch, at: new Date().toISOString() } }); }
async function doSync(mode, { tabId, openTab }) {
  let tab = tabId != null && await readyTab(tabId) ? tabId : await findXTab();
  let opened = false;
  if (!tab && openTab) { tab = await openXTab(); opened = Boolean(tab); }
  if (!tab) {
    if (mode !== "auto") await setSyncState({ state: "failed", mode, error: "没找到开着的 X 页面。打开 x.com 再点同步" });
    if (mode === "import") await setMeta({ importError: "没能打开 X 页面。打开 x.com、确认已经登录，再点「重新导入」" });
    return { ok: false };
  }
  // X 书签列表按收藏时间从新到旧排。每次都从最新的往下翻，翻到下面任一种情况就停：
  // 碰到已经存过的收藏（再往下都存过了）；碰到比「导入起点」更早的收藏（第一次选的 7 天或 30 天以前）；没有下一页。
  // 不是第一次导入的同步，隔 30 分钟以上的那一次多翻几页：碰到存过的也不停，翻满最近 100 条，给每条记一笔新数字，算流量爆帖用。
  const meta = await getMeta();
  const floor = Number(meta.importFloor) || 0;
  const refresh = mode !== "import" && Date.now() - (Date.parse(meta.lastRefreshAt || "") || 0) >= REFRESH_EVERY_MS;
  await setSyncState({ state: "running", mode, pages: 0, seen: 0, added: 0 });
  let cursor = null, pages = 0, seen = 0, added = 0;
  const changedAll = [];
  try {
    while (pages < (refresh ? REFRESH_PAGES : MAX_PAGES[mode] || 10)) {
      const { items, cursor: next } = await fetchPageSmart(tab, cursor, PAGE_SIZE);
      pages += 1;
      const inWindow = items.filter((i) => !floor || !i.bookmarkedAt || Date.parse(i.bookmarkedAt) >= floor);
      seen += inWindow.length;
      const { changed, added: plus, known } = await mergeItems(inWindow);
      added += plus;
      changedAll.push(...changed);
      if (changed.length) await markDirty(changed);
      await setSyncState({ state: "running", mode, pages, seen, added });
      if (!next || !items.length || inWindow.length < items.length || (known > 0 && !refresh)) break;
      cursor = next;
      await sleep(PAGE_DELAY_MS);
    }
    await setMeta({ lastSyncAt: new Date().toISOString(), lastSyncError: null, indexDirty: true, ...(refresh || mode === "import" ? { lastRefreshAt: new Date().toISOString() } : {}),
      ...(mode === "import" ? { importDoneAt: new Date().toISOString(), importAdded: added, importError: null } : {}) });
    await setSyncState({ state: "done", mode, pages, seen, added });
    scheduleWrite(200);
    fillArticles(changedAll).catch(() => undefined);
    scheduleClassify(15000);
    return { ok: true, added };
  } catch (error) {
    const message = String(error?.message || error);
    await setMeta({ lastSyncError: message, ...(mode === "import" ? { importError: message } : {}) });
    await setSyncState({ state: "failed", mode, pages, seen, added, error: message });
    return { ok: false, error: message };
  } finally {
    if (opened) chrome.tabs.remove(tab).catch(() => undefined);
    await refreshBadge();
  }
}
let quickTimer = 0;
function scheduleQuickSync(tabId) { // 收藏后几秒抓一页最新的，把刚收藏那条的全文补上
  clearTimeout(quickTimer);
  quickTimer = setTimeout(async () => {
    if (!(await getMeta()).setupDone) return;
    sync("quick", { tabId }).catch(() => undefined);
  }, 3000);
}

// ---------- 「待补备注」、图标数字 ----------
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
async function missingList() {
  const { items, notes, all } = await allItems();
  const drafts = all.drafts || {};
  const since = Date.now() - 3 * 86400000;
  const list = items
    .filter((i) => !i.removedAt && Date.parse(i.bookmarkedAt || i.firstSeenAt) >= since && !String(notes[i.id]?.text || "").trim())
    .map((i) => ({ tweetId: i.id, url: i.url, author: i.author || (i.handle ? `@${i.handle}` : ""), excerpt: String(i.text || "").replace(/\s+/g, " ").slice(0, 120), at: i.bookmarkedAt || i.firstSeenAt, hasDraft: Boolean(drafts[i.id]?.text) }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const today = startOfToday();
  return { items: list, today: list.filter((i) => Date.parse(i.at) >= today).length };
}
let lastRequestSeenAt = 0;
function markSeenRequest() {
  lastRequestSeenAt = Date.now();
  chrome.storage.local.get("watchdog").then(({ watchdog }) => {
    if (watchdog?.active) chrome.storage.local.set({ watchdog: { active: false } }).then(refreshBadge);
  });
}
async function refreshBadge() {
  const { watchdog } = await chrome.storage.local.get("watchdog");
  const meta = await getMeta();
  if (watchdog?.active || meta.writeError) {
    await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
    await chrome.action.setBadgeText({ text: "!" });
    return;
  }
  const { today } = await missingList().catch(() => ({ today: 0 }));
  await chrome.action.setBadgeBackgroundColor({ color: "#1d9bf0" });
  await chrome.action.setBadgeText({ text: today ? String(today) : "" });
}

// ---------- 马上做：带着备注和全文，开一个 Claude 或 Codex 新对话 ----------
function workPrompt(item, note) {
  const lines = [
    "我在 X 上收藏了一条推文，想拿它来做点东西。下面先是我收藏时写的「为什么收藏」，再是推文原文。",
    "",
    "请先用 x-bookmark-notes 这个 Skill 里「拿一条收藏开工」的做法（没装这个 Skill 就照下面两条做）：",
    "1. 先用两三句话说你理解我想拿它做什么，等我确认再动手。",
    "2. 「为什么收藏」是我本人的判断，原样引用，不要改写；你的看法和它不一致时直接说出来。",
    "",
    "## 我为什么收藏",
    String(note?.text || "").trim() || "（收藏时没写。请先问我为什么收藏，别自己猜。）",
    "",
    `## 原文（${item.author || ""}${item.handle ? ` @${item.handle}` : ""}，${localTime(item.postedAt) || "发布时间未知"}）`,
    item.url,
    "",
    String(item.text || "（没抓到正文，请打开链接看）"),
  ];
  if (item.article?.title) lines.push("", `### X 长文：${item.article.title}`, item.article.text || item.article.preview || "");
  if (item.quoted) lines.push("", `### 引用的推文（@${item.quoted.handle}）`, item.quoted.text || "", item.quoted.url);
  if (item.media?.length) lines.push("", `配了 ${item.media.length} 个图片或视频，看原帖。`);
  const text = lines.join("\n");
  return text.length > 6000 ? `${text.slice(0, 6000)}\n\n（后面太长截掉了，全文看链接）` : text;
}


// ---------- AI 分类：交给本机小程序，小程序调这台电脑上的 Codex 或 Claude Code ----------
const HOST = "com.x_bookmark_notes.host";
const noteHash = (note) => fingerprint(String(note?.text || "").trim());
const TAXONOMY_PRINT = fingerprint(JSON.stringify([ABOUT_ME, TAXONOMY])); // 分类树或「我是谁」改过（比如读者 DIY 改了分类），已经分好的也按新分类重分
// 文件和收藏页上用的分类：AI 分的，你在收藏页上直接改过标签、可做成什么的以你改的为准；AI 分类依据的备注已经改过就不算
function effectiveIntent(intent, review, note) {
  const fresh = intent && intent.noteHash === noteHash(note) ? intent : null;
  if (!fresh && !review?.tags && !review?.video) return null;
  const base = fresh || { tags: [], video: [], status: "先存着", keywords: [] };
  return {
    ...base,
    ...(review?.tags ? { tags: review.tags.map((minor) => ({ major: MINOR_TO_MAJOR.get(minor), minor })).filter((t) => t.major) } : {}),
    ...(review?.video ? { video: review.video } : {}),
    ...(review?.doWithin ? { doWithin: review.doWithin } : {}),
  };
}
const classifyState = { running: false, total: 0, done: 0, failed: 0, error: null, startedAt: null, finishedAt: null, tool: null };
let classifyBlockedUntil = 0, classifyTimer = 0;
function scheduleClassify(ms) { clearTimeout(classifyTimer); classifyTimer = setTimeout(() => classify("auto").catch(() => undefined), ms); }

async function pendingClassifyIds() {
  const { items, notes, all } = await allItems();
  return items
    .filter((i) => !i.stub && !i.removedAt)
    .filter((i) => {
      const intent = all[I(i.id)], review = all[R(i.id)];
      if (!intent || intent.noteHash !== noteHash(notes[i.id]) || intent.taxo !== TAXONOMY_PRINT) return true;
      return Boolean(review?.verdict === "bad" && review.fixAt && review.fixAt > intent.at); // 标了不准：按你那句话重分
    })
    .sort((a, b) => String(b.bookmarkedAt || "").localeCompare(String(a.bookmarkedAt || "")))
    .map((i) => i.id);
}
function briefIntent(intent) { return intent ? { tags: (intent.tags || []).map((t) => t.minor), video: intent.video || [], doWithin: intent.doWithin || "" } : null; }
async function classifyInput(ids) {
  const { all } = await allItems();
  const items = ids.map((id) => {
    const t = all[T(id)], note = all[N(id)], review = all[R(id)], intent = all[I(id)];
    if (!t) return null;
    const corrected = review?.verdict === "bad" && review.fix && intent && review.fixAt > intent.at;
    return {
      id, author: t.author || "", handle: t.handle || "", text: String(t.text || "").slice(0, 4000),
      articleTitle: t.article?.title || "", quoted: t.quoted ? { author: t.quoted.author, handle: t.quoted.handle, text: String(t.quoted.text || "").slice(0, 1500) } : null,
      note: String(note?.text || ""), publishedAt: t.postedAt || "", bookmarkedAt: t.bookmarkedAt || t.firstSeenAt || "",
      ...(corrected ? { correction: review.fix, previous: briefIntent(intent) } : {}),
    };
  }).filter(Boolean);
  // 你最近纠正过的别的收藏，给 AI 当例子，最多 15 条
  const skip = new Set(ids);
  const corrections = Object.entries(all)
    .filter(([k, r]) => k.startsWith("r:") && !skip.has(k.slice(2)) && ((r.verdict === "bad" && r.fix) || r.tags || r.video))
    .sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 15)
    .map(([k, r]) => { const id = k.slice(2), t = all[T(id)] || {}; return { text: String(t.article?.title || t.text || "").slice(0, 200), note: String(all[N(id)]?.text || "").slice(0, 200), previous: briefIntent(all[I(id)]),
      ...(r.verdict === "bad" && r.fix ? { fix: r.fix } : {}), ...(r.tags ? { tags: r.tags } : {}), ...(r.video ? { video: r.video } : {}) }; });
  return { items, corrections };
}

// 一次连上本机小程序，按顺序问；连不上（没装）时 Chrome 会立刻断开
function openHost() {
  let port;
  try { port = chrome.runtime.connectNative(HOST); } catch (error) { return null; }
  const waiting = new Map();
  let closed = null;
  port.onMessage.addListener((msg) => { const done = waiting.get(msg?.id); if (done) { waiting.delete(msg.id); done(msg); } });
  port.onDisconnect.addListener(() => {
    closed = chrome.runtime.lastError?.message || "本机小程序断开了";
    for (const done of waiting.values()) done({ ok: false, error: closed });
    waiting.clear();
  });
  let seq = 0;
  return {
    ask(message) {
      if (closed) return Promise.resolve({ ok: false, error: closed });
      const id = `m${++seq}`;
      return new Promise((resolve) => { waiting.set(id, resolve); port.postMessage({ ...message, id }); });
    },
    close() { try { port.disconnect(); } catch { /* 已经断了 */ } },
  };
}
function hostMissing(error) { return /not found|not exist|forbidden|找不到/i.test(String(error || "")); }
async function hostStatus() {
  const host = openHost();
  if (!host) return { installed: false };
  const pong = await Promise.race([host.ask({ type: "ping" }), sleep(5000).then(() => ({ ok: false, error: "本机小程序没回应" }))]);
  host.close();
  const installed = Boolean(pong?.ok);
  const before = await getMeta();
  await setMeta({ hostInstalled: installed, hostCodex: Boolean(pong?.codex), hostClaude: Boolean(pong?.claude), hostCheckedAt: new Date().toISOString() });
  // 刚装好（之前没装或没找到 Codex、Claude Code）：马上开始分类，不用再点「开始分类」
  if (installed && (pong.codex || pong.claude) && !(before.hostInstalled && (before.hostCodex || before.hostClaude))) { classifyBlockedUntil = 0; classify("button").catch(() => undefined); }
  return { installed, codex: Boolean(pong?.codex), claude: Boolean(pong?.claude), error: pong?.ok ? null : pong?.error };
}

let classifying = null;
function classify(by) {
  if (classifying) return classifying;
  classifying = doClassify(by).finally(() => { classifying = null; });
  return classifying;
}
async function doClassify(by) {
  const meta = await getMeta();
  if (!meta.setupDone) return { state: "nothing" };
  if (by === "auto" && Date.now() < classifyBlockedUntil) return { state: "waiting_retry" };
  const ids = (await pendingClassifyIds()).slice(0, 80);
  if (!ids.length) return { state: "nothing" };
  const host = openHost();
  if (!host) { await setMeta({ hostInstalled: false }); return { state: "no_host" }; }
  Object.assign(classifyState, { running: true, total: ids.length, done: 0, failed: 0, error: null, startedAt: new Date().toISOString(), finishedAt: null });
  const prefer = meta.classifier === "claude" ? "claude" : "codex";
  try {
    for (let k = 0; k < ids.length; k += BATCH_SIZE) {
      const input = await classifyInput(ids.slice(k, k + BATCH_SIZE));
      if (!input.items.length) continue;
      const reply = await host.ask({ type: "classify", instructions: classifierInstructions(), schema: intentOutputSchema(), input, prefer });
      if (!reply?.ok) {
        classifyState.failed += input.items.length;
        classifyState.error = hostMissing(reply?.error) ? "还没装本机小程序：打开插件说明页，点「复制给 AI」发给你的 Claude Code 或 Codex，它会装好" : `有 ${input.items.length} 条没分成：${String(reply?.error || "").slice(0, 200)}`;
        if (hostMissing(reply?.error)) { await setMeta({ hostInstalled: false }); classifyState.failed += ids.length - k - input.items.length; break; }
        continue;
      }
      classifyState.tool = reply.tool;
      const byId = new Map(input.items.map((i) => [i.id, i]));
      const patch = {};
      for (const raw of Array.isArray(reply.output?.items) ? reply.output.items : []) {
        const item = byId.get(String(raw?.id || ""));
        if (!item) continue;
        patch[I(item.id)] = { ...normalizeIntent(raw, Boolean(item.note.trim())), noteHash: fingerprint(item.note.trim()), taxo: TAXONOMY_PRINT, at: new Date().toISOString(), tool: reply.tool };
        byId.delete(item.id);
      }
      await chrome.storage.local.set(patch);
      classifyState.done += Object.keys(patch).length;
      classifyState.failed += byId.size;
      await markDirty(Object.keys(patch).map((k2) => k2.slice(2)));
      await setMeta({ hostInstalled: true });
    }
  } finally {
    host.close();
    classifyState.running = false;
    classifyState.finishedAt = new Date().toISOString();
    if (classifyState.failed) classifyBlockedUntil = Date.now() + 30 * 60000;
    await chrome.storage.local.set({ classifyRun: { ...classifyState } });
  }
  return { state: "done" };
}

// ---------- 你在收藏页上的批注 ----------
const DO_KEYS = DO_WITHIN.map((w) => w.key);
async function saveReview(body) {
  const id = String(body?.id || "");
  if (!ID.test(id)) throw new Error("推文编号不对");
  const now = new Date().toISOString();
  return serial(async () => {
    const { [R(id)]: current = {}, [T(id)]: item } = await chrome.storage.local.get([R(id), T(id)]);
    if (!item) throw new Error("插件里没有这条收藏");
    const next = { verdict: null, fix: "", status: null, doWithin: null, decision: null, decisionNote: "", decidedAt: null, delays: 0, tags: null, video: null, fixAt: null, ...current };
    if ("tags" in body) {
      if (body.tags !== null && (!Array.isArray(body.tags) || body.tags.some((m) => !MINOR_TO_MAJOR.has(m)))) throw new Error("标签只能是分类树里的小类");
      next.tags = body.tags === null ? null : [...new Set(body.tags)];
    }
    if ("video" in body) {
      if (body.video !== null && (!Array.isArray(body.video) || body.video.some((v) => !VIDEO_KINDS.includes(v)))) throw new Error("可做成什么只能是教程、观点、科普");
      next.video = body.video === null ? null : VIDEO_KINDS.filter((v) => body.video.includes(v));
    }
    if ("verdict" in body) {
      if (body.verdict !== null && !["good", "bad"].includes(body.verdict)) throw new Error("准不准只能是准、不准");
      next.verdict = body.verdict;
    }
    if ("fix" in body) next.fix = String(body.fix || "").slice(0, 500).trim();
    if ("status" in body) {
      if (body.status !== null && !STATUSES.includes(body.status)) throw new Error("状态不对");
      next.status = body.status;
    }
    if ("doWithin" in body) {
      if (body.doWithin !== null && !DO_KEYS.includes(body.doWithin)) throw new Error("多久内做不对");
      next.doWithin = body.doWithin;
    }
    if ("decision" in body) {
      if (body.decision !== null && !["drop", "delay"].includes(body.decision)) throw new Error("只能是不做了、延期");
      const why = String(body.decisionNote || "").slice(0, 500).trim();
      if (body.decision && !why) throw new Error(body.decision === "drop" ? "写一句为什么不做了" : "写一句为什么延期");
      if (body.decision === "drop") next.beforeDrop = current.decision === "delay" ? { decision: "delay", decisionNote: current.decisionNote, decidedAt: current.decidedAt } : null;
      if (body.decision === null && current.decision === "drop") {
        Object.assign(next, current.beforeDrop || { decision: null, decisionNote: "", decidedAt: null });
        delete next.beforeDrop;
      } else {
        next.decision = body.decision;
        next.decisionNote = body.decision ? why : "";
        next.decidedAt = body.decision ? now : null;
        if (body.decision === "delay") next.delays = (current.delays || 0) + 1;
      }
    }
    if (next.verdict === "bad" && !next.fix) throw new Error("标「不准」时要写一句错在哪");
    if (next.verdict !== "bad") { next.fix = ""; next.fixAt = null; }
    if ("verdict" in body && body.verdict === "bad") next.fixAt = now;
    next.at = now;
    await chrome.storage.local.set({ [R(id)]: next });
    return next;
  }).then(async (review) => {
    await markDirty([id]);
    if (review.verdict === "bad") scheduleClassify(3000); // 标了不准：3 秒后按你那句话重分
    return review;
  });
}

// ---------- 收藏页要的数据（照作者自用版收藏页的接口给，页面代码几乎不用改） ----------
const ARTICLE_URL = /https:\/\/x\.com\/i\/article\/\d+/;
function pageItem(t, note) {
  const media = (t.media || []).filter((m) => /^https:\/\/pbs\.twimg\.com\//.test(m.url)).slice(0, 4);
  const articleUrl = (String(t.text || "").match(ARTICLE_URL) || String(t.card?.url || "").match(ARTICLE_URL) || [])[0] || null;
  return {
    id: t.id, author: t.author || "未知作者", handle: t.handle || "", text: String(t.text || "").replace(ARTICLE_URL, "").trim() || (t.article?.title ? "" : t.text || ""),
    articleTitle: t.article?.title || "", articleBody: String(t.article?.text || t.article?.preview || "").replace(/^(#{1,4}|-|1\.|>) /gm, "").replace(/\n+/g, " ").slice(0, 220), isArticle: Boolean(t.article?.title), articleUrl,
    datetime: t.postedAt || "", firstSeen: t.firstSeenAt, url: t.url, metrics: t.metrics || {}, media: media.map((m) => m.url),
    quoted: t.quoted ? { author: t.quoted.author || "", handle: t.quoted.handle || "", text: t.quoted.text || "", articleTitle: t.quoted.article?.title || "", url: t.quoted.url } : null,
    note: String(note?.text || ""), noteAt: note?.at || null, noteFrom: note?.text ? "library" : "none",
    sortIndex: null, bookmarkedAt: t.bookmarkedAt || null,
  };
}
async function shoucangData() {
  const { items, notes, all } = await allItems();
  const meta = await getMeta();
  const live = items.filter((t) => !t.stub && !t.removedAt).sort((a, b) => String(b.bookmarkedAt || b.firstSeenAt).localeCompare(String(a.bookmarkedAt || a.firstSeenAt)));
  const intents = {}, reviews = {}, avatars = {}, videos = {}, hot = {}, latest = {};
  for (const t of live) {
    const snaps = all[M(t.id)];
    if (snaps?.length) {
      const h = hotStatus(t, snaps);
      if (h) hot[t.id] = h;
      const s = snaps[snaps.length - 1];
      latest[t.id] = { ...(t.metrics || {}), views: s[1], likes: s[2], replies: s[3], quotes: s[4], bookmarks: s[5] };
    }
    const intent = all[I(t.id)];
    if (intent && intent.noteHash === noteHash(notes[t.id])) intents[t.id] = { ...intent, tags: (intent.tags || []).filter((x) => MINOR_TO_MAJOR.has(x.minor)).map((x) => ({ major: MINOR_TO_MAJOR.get(x.minor), minor: x.minor })) };
    const review = all[R(t.id)];
    if (review) reviews[t.id] = { ...review, tags: review.tags ? review.tags.map((minor) => ({ major: MINOR_TO_MAJOR.get(minor), minor })) : null };
    for (const [h, a] of [[t.handle, t.avatar], [t.quoted?.handle, t.quoted?.avatar]]) if (h && a) avatars[String(h).toLowerCase()] = a;
    const clips = (t.media || []).filter((m) => /^https:\/\/pbs\.twimg\.com\//.test(m.url)).slice(0, 4).map((m, idx) => (m.video ? { idx, kind: m.kind || "video", mp4: m.video, durationMs: m.durationMs || null } : null)).filter(Boolean);
    if (clips.length) videos[t.id] = clips;
  }
  const floor = Number(meta.importFloor) || Date.parse(live[live.length - 1]?.bookmarkedAt || "") || Date.now();
  const d = new Date(floor), pad = (n) => String(n).padStart(2, "0");
  return {
    ok: true, since: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, taxonomy: TAXONOMY, doWithin: DO_WITHIN,
    items: live.map((t) => ({ ...pageItem(t, notes[t.id]), ...(latest[t.id] ? { metrics: latest[t.id] } : {}) })), intents, reviews, avatars, videos, hot, hotRules: HOT_RULES, topicUse: {}, working: {},
    sync: { lastXSuccessAt: meta.lastSyncAt || null }, classify: await classifyStatus(),
  };
}
async function classifyStatus() {
  const meta = await getMeta();
  return { ...classifyState, pending: (await pendingClassifyIds()).length, hostInstalled: meta.hostInstalled !== false };
}
async function pageApi(path, body) {
  if (path === "/api/shoucang") return shoucangData();
  if (path === "/api/shoucang/review") {
    await saveReview(body);
    return { ok: true, review: (await shoucangData()).reviews[body.id] };
  }
  if (path === "/api/shoucang/classify") {
    if (body === undefined) return { ok: true, ...(await classifyStatus()) };
    if (classifyState.running) return { ok: true, state: "running", ...(await classifyStatus()) };
    const pending = (await pendingClassifyIds()).length;
    if (!pending) return { ok: true, state: "nothing", ...(await classifyStatus()) };
    const status = await hostStatus();
    if (!status.installed) return { ok: false, message: "还没装本机小程序。打开插件说明页，点「复制给 AI」发给你的 Claude Code 或 Codex，它会装好" };
    if (!status.codex && !status.claude) return { ok: false, message: "这台电脑上没找到 Codex 或 Claude Code 命令行" };
    classifyBlockedUntil = 0;
    classify("button").catch(() => undefined);
    await sleep(50);
    return { ok: true, state: "started", ...(await classifyStatus()), total: Math.min(pending, 80) };
  }
  if (path === "/api/bookmark-notes") {
    const tweetId = String(body?.tweetId || "");
    if (!ID.test(tweetId) || typeof body?.note !== "string") throw new Error("备注内容不完整");
    await saveNote(tweetId, body.note);
    return { ok: true };
  }
  if (path === "/api/bookmark-notes/sync") {
    if (body === undefined) return { ok: true, running: Boolean(syncing), lastState: (await chrome.storage.local.get("syncState")).syncState?.state || null };
    if (body?.ifStale) { // 收藏页一打开就问一次：好一阵没同步了，就自己同步（没开着 X 页面就在后台开一个，抓完关掉）
      const meta = await getMeta();
      if (!meta.setupDone || Date.now() - (Date.parse(meta.lastSyncAt || "") || 0) < STALE_MS) return { ok: true, state: "fresh" };
      sync("auto", { openTab: true }).catch(() => undefined);
      return { ok: true, state: "started" };
    }
    sync("quick", { openTab: true }).catch(() => undefined);
    await sleep(50);
    return { ok: true, state: "started" };
  }
  if (path === "/api/bookmark-notes/unwork") return { ok: true };
  throw new Error(`不认识的请求 ${path}`);
}

// ---------- 和内容脚本、弹窗、备注框对话 ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromX = sender.tab && X_PAGE.test(sender.url || "");
  const fromExt = (sender.url || "").startsWith(`chrome-extension://${chrome.runtime.id}/`);
  if (!fromX && !fromExt) return false;
  (async () => {
    const tweetId = String(message?.tweetId || "");
    switch (message?.type) {
      case "xbn-save-note": // 只收插件自己的页面（备注框、弹窗）交来的备注；X 页面那一层不经手备注原文
        if (!fromExt) return { ok: false, error: "只能从备注框保存" };
        if (!ID.test(tweetId) || typeof message.note !== "string") return { ok: false, error: "备注内容不完整" };
        await saveNote(tweetId, message.note);
        return { ok: true };
      case "xbn-get-note": {
        const { [N(tweetId)]: note } = await chrome.storage.local.get(N(tweetId));
        return { ok: true, note: note?.text || "" };
      }
      case "xbn-noted-ids": {
        const { notes } = await allItems();
        return { ok: true, ids: Object.keys(notes).filter((id) => String(notes[id]?.text || "").trim()) };
      }
      case "xbn-bookmark-seen":
        if (fromX && ID.test(tweetId)) await onBookmark(tweetId, { author: message.author, excerpt: message.excerpt }, sender.tab.id);
        return { ok: true };
      case "xbn-page-unbookmarked":
        if (fromX && ID.test(tweetId)) await onUnbookmark(tweetId);
        return { ok: true };
      case "xbn-missing":
        return { ok: true, ...(await missingList()) };
      case "xbn-open-for-note": {
        if (!fromExt || !ID.test(tweetId)) return { ok: false };
        const url = /^https:\/\/(x|twitter)\.com\//.test(message.url || "") ? message.url : `https://x.com/i/status/${tweetId}`;
        const tab = await chrome.tabs.create({ url });
        const { pendingOpen = {} } = await chrome.storage.session.get("pendingOpen");
        pendingOpen[tab.id] = { tweetId, at: Date.now() };
        await chrome.storage.session.set({ pendingOpen });
        return { ok: true };
      }
      case "xbn-pending-open": {
        if (!fromX) return { ok: true, tweetId: null };
        const { pendingOpen = {} } = await chrome.storage.session.get("pendingOpen");
        const hit = pendingOpen[sender.tab.id];
        delete pendingOpen[sender.tab.id];
        await chrome.storage.session.set({ pendingOpen });
        return { ok: true, tweetId: hit && Date.now() - hit.at < 5 * 60000 ? hit.tweetId : null };
      }
      case "xbn-work-prompt": {
        if (!fromExt || !ID.test(tweetId)) return { ok: false };
        const got = await chrome.storage.local.get([T(tweetId), N(tweetId)]);
        const item = got[T(tweetId)] || { id: tweetId, url: `https://x.com/i/status/${tweetId}`, text: "" };
        return { ok: true, prompt: workPrompt(item, got[N(tweetId)]) };
      }
      case "xbn-watchdog":
        if (Date.now() - lastRequestSeenAt > 15000) { await chrome.storage.local.set({ watchdog: { active: true, at: new Date().toISOString() } }); await refreshBadge(); }
        return { ok: true };
      case "xbn-clear-watchdog":
        await chrome.storage.local.set({ watchdog: { active: false } });
        await setMeta({ writeError: null });
        await refreshBadge();
        return { ok: true };
      case "xbn-x-login": { // X 登没登录：只看登录凭证这个 cookie 在不在，不读它的内容
        const cookie = await chrome.cookies.get({ url: "https://x.com", name: "auth_token" }).catch(() => null);
        return { ok: true, loggedIn: Boolean(cookie) };
      }
      case "xbn-open-login":
        if (!fromExt) return { ok: false };
        await chrome.tabs.create({ url: "https://x.com/i/flow/login" });
        return { ok: true };
      case "xbn-retry-import":
        if (!fromExt) return { ok: false };
        await setMeta({ importError: null });
        sync("import", { openTab: true }).catch(() => undefined);
        return { ok: true };
      case "xbn-start": { // 第一次用：选了导入最近几天以后，才写文件、才去抓
        if (!fromExt) return { ok: false };
        const days = IMPORT_DAYS.includes(Number(message.days)) ? Number(message.days) : 7;
        const now = Date.now();
        await setMeta({ setupDone: true, setupAt: new Date(now).toISOString(), importDays: days, importFloor: now - days * 86400000, indexDirty: true, importError: null, importDoneAt: null });
        sync("import", { openTab: true }).catch(() => undefined);
        return { ok: true };
      }
      case "xbn-sync":
        if (!fromExt) return { ok: false };
        sync("quick", { openTab: true }).catch(() => undefined);
        return { ok: true };
      case "xbn-retry-write":
        if (!fromExt) return { ok: false };
        await setMeta({ writeError: null, indexDirty: true });
        await flushFiles();
        return { ok: true, error: (await getMeta()).writeError };
      case "xbn-open-folder": {
        const meta = await getMeta();
        if (!meta.indexDownloadId) return { ok: false, error: "还没写出文件" };
        try { chrome.downloads.show(meta.indexDownloadId); return { ok: true }; } catch { return { ok: false, error: "找不到文件夹，点一次同步再试" }; }
      }
      case "xbn-set-articles":
        if (!fromExt) return { ok: false };
        await setMeta({ articlesOff: !message.on });
        return { ok: true };
      case "xbn-import-notes": { // 从「_备注备份.json」把备注导回来；插件里已有的、更新的备注不被盖掉
        if (!fromExt) return { ok: false };
        const notes = message.backup?.notes;
        if (!notes || typeof notes !== "object") return { ok: false, error: "这不是插件存的备注备份文件" };
        let count = 0;
        const ids = [];
        await serial(async () => {
          const keys = Object.keys(notes).filter((id) => ID.test(id));
          const have = await chrome.storage.local.get(keys.map(N));
          const patch = {};
          for (const id of keys) {
            const incoming = notes[id];
            if (!incoming || typeof incoming.text !== "string") continue;
            const mine = have[N(id)];
            if (mine && String(mine.at || "") >= String(incoming.at || "")) continue;
            patch[N(id)] = { text: incoming.text.slice(0, 4000), at: incoming.at || new Date().toISOString() };
            ids.push(id);
            count += 1;
          }
          if (count) await chrome.storage.local.set(patch);
        });
        if (ids.length) await markDirty(ids, { backup: true });
        return { ok: true, count };
      }
      case "xbn-api":
        if (!fromExt) return { ok: false };
        return pageApi(String(message.path || ""), message.body);
      case "xbn-host-status":
        if (!fromExt) return { ok: false };
        return { ok: true, ...(await hostStatus()) };
      case "xbn-set-classifier":
        if (!fromExt) return { ok: false };
        await setMeta({ classifier: message.tool === "claude" ? "claude" : "codex" });
        return { ok: true };
      case "xbn-status": {
        const meta = await getMeta();
        const { items, notes } = await allItems();
        const live = items.filter((i) => !i.removedAt && !i.stub);
        const { syncState, watchdog } = await chrome.storage.local.get(["syncState", "watchdog"]);
        return {
          ok: true, meta, syncState: syncState || null, watchdog: Boolean(watchdog?.active),
          total: live.length, noted: live.filter((i) => String(notes[i.id]?.text || "").trim()).length,
          recent: Object.entries(notes).filter(([, n]) => String(n?.text || "").trim()).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 15)
            .map(([id, n]) => { const item = items.find((i) => i.id === id); return { tweetId: id, note: n.text, at: n.at, url: item?.url || `https://x.com/i/status/${id}`, author: item?.author || "" }; }),
        };
      }
      default:
        return { ok: false, error: "unknown" };
    }
  })().then(sendResponse, (error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

// ---------- 定时：每 30 分钟有开着的 X 页面就抓一页最新的；写没写完的文件 ----------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "xbn-tick") return;
  const meta = await getMeta();
  await refreshBadge();
  if (!meta.setupDone) return;
  scheduleWrite(100);
  if (!meta.lastSyncAt || Date.now() - Date.parse(meta.lastSyncAt) > 30 * 60000) sync("auto").catch(() => undefined);
  if (Date.now() - (Date.parse(meta.snapsCleanedAt || "") || 0) > 86400000) cleanSnaps().catch(() => undefined);
  if (meta.hostInstalled !== false) classify("auto").catch(() => undefined); // 有还没分类的就分（失败过的 30 分钟内不自动重试）
});
// 你一打开或切到 X 页面，上次同步又超过 10 分钟，就马上同步一次：手机上收藏的，电脑上一打开 X 就进来了
async function syncIfStale(tabId) {
  const meta = await getMeta();
  if (!meta.setupDone || syncing) return;
  if (Date.now() - (Date.parse(meta.lastSyncAt || "") || 0) < STALE_MS) return;
  sync("auto", { tabId }).catch(() => undefined);
}
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => { if (tab.status === "complete" && X_PAGE.test(tab.url || "")) syncIfStale(tabId); }).catch(() => undefined);
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab.active && X_PAGE.test(tab.url || "")) syncIfStale(tabId);
});
// 十天没再看到的收藏（取消了，或者排到最近 100 条以后了），数字记录删掉
async function cleanSnaps() {
  await serial(async () => {
    const all = await chrome.storage.local.get(null);
    const old = Object.entries(all).filter(([k, v]) => k.startsWith("m:") && (!Array.isArray(v) || !v.length || Date.now() - v[v.length - 1][0] > 10 * 86400000)).map(([k]) => k);
    if (old.length) await chrome.storage.local.remove(old);
  });
  await setMeta({ snapsCleanedAt: new Date().toISOString() });
}
async function injectIntoOpenTabs() { // 插件装好、更新后，把脚本放进已经开着的 X 页面
  const tabs = await chrome.tabs.query({ url: X_TABS }).catch(() => []);
  for (const tab of tabs) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => undefined);
}
async function boot() {
  if (!(await chrome.alarms.get("xbn-tick"))) chrome.alarms.create("xbn-tick", { periodInMinutes: 5 });
  await refreshBadge();
}
chrome.runtime.onInstalled.addListener((details) => {
  boot();
  injectIntoOpenTabs();
  if (details.reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") }); // 装好就打开设置页，一步一步带着走
});
chrome.runtime.onStartup.addListener(boot);
boot();
