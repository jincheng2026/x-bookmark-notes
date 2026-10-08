// 端到端测试：无头 Chrome 真的装上插件，打开一个模拟的 x.com（本机 HTTPS），
// 走一遍：第一次「开始」→ 全部同步 → 文件写进下载文件夹 → 点收藏写备注 → 取消收藏 → X 换了接口编号 → 导入备注备份。
// 全部用临时目录和临时端口，不碰真实的 X 账号。
// 用法：node test/e2e.mjs     需要 Google Chrome（或用 XBN_CHROME 指定）和 openssl
import { spawn, execFileSync } from "node:child_process";
import { createServer as createHttpsServer } from "node:https";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, chmodSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = resolve(HERE, "..", "extension");
const CHROME = process.env.XBN_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [], fails = [];
function ok(cond, name, detail) {
  lines.push(`${cond ? "  通过" : "  失败"}：${name}${!cond && detail !== undefined ? " ｜ " + JSON.stringify(detail).slice(0, 400) : ""}`);
  if (!cond) fails.push(name);
}
async function waitFor(fn, ms = 8000, step = 150) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v; } catch { /* 继续等 */ }
    await sleep(step);
  }
  return null;
}
const freePort = () => new Promise((r) => { const s = createNetServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

// ---------- 模拟数据 ----------
const NOW = Date.now();
const sortIndex = (msAgo) => String(BigInt(NOW - msAgo) << 20n);
const user = (name, handle) => ({ user_results: { result: { __typename: "User", legacy: { name, screen_name: handle, followers_count: 1000 } } } });
function tweet({ id, name, handle, text, note, quoted, media, views = 5000, postedAgo = 86400000 }) {
  const t = { __typename: "Tweet", rest_id: id, core: user(name, handle), views: { count: String(views) },
    legacy: { id_str: id, full_text: text, created_at: new Date(NOW - postedAgo).toUTCString(), favorite_count: 12, retweet_count: 3, reply_count: 1, quote_count: 0, bookmark_count: 40,
      entities: { urls: [{ url: "https://t.co/abc", expanded_url: "https://github.com/example/repo" }] }, ...(media ? { extended_entities: { media } } : {}) } };
  if (note) t.note_tweet = { note_tweet_results: { result: { text: note, entity_set: { urls: [] } } } };
  if (quoted) t.quoted_status_result = { result: quoted };
  return t;
}
const entry = (t, msAgo) => ({ entryId: `tweet-${t.rest_id}`, sortIndex: sortIndex(msAgo), content: { itemContent: { tweet_results: { result: t } } } });
const A = "2201000000000000001", B = "2201000000000000002", C = "2201000000000000003", D = "2201000000000000004", ART = "2201000000000000005", OLD = "2201000000000000006", OLD2 = "2201000000000000007";
const base = [
  entry(tweet({ id: B, name: "博主乙", handle: "bb", views: 90000, postedAgo: 10 * 3600e3, text: "长推文的短版本", note: "这是长推文的完整正文，链接 https://github.com/example/repo", media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/media/x.jpg", url: "https://t.co/pic" }] }), 3600e3),
  entry(tweet({ id: C, name: "博主丙", handle: "cc", text: "我觉得这个说法不对 https://t.co/abc", quoted: tweet({ id: "2201000000000000099", name: "博主庚", handle: "gg", text: "被引用的原帖" }) }), 2 * 86400e3),
  entry(tweet({ id: ART, name: "博主戊", handle: "ee", text: "https://x.com/i/article/2201999" }), 5 * 86400e3),
  entry(tweet({ id: OLD, name: "博主己", handle: "ff", text: "20 天前收藏的" }), 20 * 86400e3),
  entry(tweet({ id: OLD2, name: "博主辛", handle: "hh", text: "40 天前收藏的" }), 40 * 86400e3),
];
let bookmarked = new Set([B, C, ART, OLD, OLD2]); // 账号里现在收藏着的
let extraTop = []; // 后来收藏的，排在最前面
const qidHits = [];
let xChangedQid = false; // 模拟 X 换了书签接口编号：旧编号 404
function bookmarksPage(cursor) {
  const list = [...extraTop, ...base].filter((e) => bookmarked.has(e.entryId.slice(6)));
  const i = cursor ? Number(cursor.slice(1)) : 0; // 一页 2 条，游标 P1、P2……
  const entries = list.slice(i * 2, i * 2 + 2);
  if (list.length > i * 2 + 2) entries.push({ entryId: `cursor-bottom-${i}`, content: { cursorType: "Bottom", value: `P${i + 1}` } });
  return { data: { bookmark_timeline_v2: { timeline: { instructions: [{ type: "TimelineAddEntries", entries }] } } } };
}

// ---------- 模拟的 x.com ----------
const tmp = mkdtempSync(join(tmpdir(), "xbn-e2e-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(tmp, "k.pem"), "-out", join(tmp, "c.pem"), "-days", "1", "-subj", "/CN=x.com", "-addext", "subjectAltName=DNS:x.com,DNS:api.fxtwitter.com"], { stdio: "ignore" });
const FEED = `<!doctype html><html><head><meta charset="utf-8"><title>X</title></head><body><main id="feed"></main>
<script>
document.cookie = "ct0=testct0; path=/";
const tweets = [{id:"${A}", name:"博主甲", handle:"aa", text:"把 Agent 编排拆成三步的思路", bookmarked:false},
  {id:"${D}", name:"博主丁", handle:"dd", text:"一条收藏了却没写备注的", bookmarked:false}];
function render(){ feed.innerHTML=""; for (const t of tweets){ const a=document.createElement("article"); a.tabIndex=0;
  a.innerHTML='<div data-testid="User-Name"><span>'+t.name+'</span><span>@'+t.handle+'</span></div><a href="/'+t.handle+'/status/'+t.id+'"><time>1h</time></a><div data-testid="tweetText">'+t.text+'</div><div role="group"><div><button data-testid="'+(t.bookmarked?'removeBookmark':'bookmark')+'" data-id="'+t.id+'">'+(t.bookmarked?'已收藏':'收藏')+'</button></div></div>';
  feed.appendChild(a);} }
async function toggle(id){ const t=tweets.find(x=>x.id===id); const op=t.bookmarked?"DeleteBookmark":"CreateBookmark";
  const r=await fetch("/i/api/graphql/QID/"+op,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({variables:{tweet_id:id}})});
  if(r.ok){t.bookmarked=!t.bookmarked; render();} }
document.addEventListener("click",e=>{const b=e.target.closest("button[data-id]"); if(b) toggle(b.dataset.id);});
window.visitBookmarksPage = (qid) => fetch("/i/api/graphql/"+qid+"/Bookmarks?variables=%7B%7D&features="+encodeURIComponent(JSON.stringify({learned_feature:true})));
render();
</script></body></html>`;
const mockPort = await freePort();
createHttpsServer({ key: readFileSync(join(tmp, "k.pem")), cert: readFileSync(join(tmp, "c.pem")) }, (req, res) => {
  const url = new URL(req.url, "https://x.com");
  const json = (code, body) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(body)); };
  if (req.headers.host?.startsWith("api.fxtwitter.com")) {
    return json(200, { tweet: { article: { title: "一篇 X 长文的标题", preview_text: "开头", content: { blocks: [{ type: "header-two", text: "第一节" }, { type: "unstyled", text: "长文正文第一段。" }, { type: "atomic", text: " " }] } } } });
  }
  if (req.method === "POST" && url.pathname.includes("/i/api/graphql/")) {
    let body = ""; req.on("data", (d) => { body += d; }); req.on("end", () => {
      const id = JSON.parse(body).variables.tweet_id;
      if (url.pathname.endsWith("/CreateBookmark")) {
        bookmarked.add(id);
        if (!extraTop.find((e) => e.entryId === `tweet-${id}`)) extraTop.unshift(entry(tweet({ id, name: id === A ? "博主甲" : "博主丁", handle: id === A ? "aa" : "dd", text: id === A ? "把 Agent 编排拆成三步的思路" : "一条收藏了却没写备注的" }), 1000));
      } else bookmarked.delete(id);
      json(200, { data: {} });
    });
    return;
  }
  const m = url.pathname.match(/\/i\/api\/graphql\/([^/]+)\/Bookmarks$/);
  if (m) {
    qidHits.push({ qid: m[1], features: url.searchParams.get("features"), csrf: req.headers["x-csrf-token"], auth: req.headers.authorization || "" });
    if (xChangedQid && m[1] !== "NEWQID") return json(404, {});
    if (req.headers["x-csrf-token"] !== "testct0") return json(403, {});
    return json(200, bookmarksPage(JSON.parse(url.searchParams.get("variables") || "{}").cursor));
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(FEED);
}).listen(mockPort, "127.0.0.1");

// ---------- Chrome ----------
const ud = join(tmp, "chrome"), dl = join(tmp, "downloads");
mkdirSync(join(ud, "Default"), { recursive: true }); mkdirSync(dl);
writeFileSync(join(ud, "Default", "Preferences"), JSON.stringify({ download: { default_directory: dl, prompt_for_download: false } }));

// ---------- 本机小程序：用插件自带的 install.mjs 装进一个临时家目录，再把告诉 Chrome 的那份说明放进测试用的 Chrome 资料夹 ----------
// 不用真的 Codex：换成一个假的 codex，按收到的收藏回固定的分类，并把收到的东西记下来
const hostHome = join(tmp, "home");
mkdirSync(join(hostHome, "Library", "Application Support", "Google", "Chrome"), { recursive: true });
execFileSync(process.execPath, [join(EXT_DIR, "host", "install.mjs")], { env: { ...process.env, HOME: hostHome, SHELL: "/bin/sh" }, stdio: "ignore" });
const fakeCodex = join(tmp, "fake-codex.mjs"), codexLog = join(tmp, "codex-calls.jsonl");
writeFileSync(fakeCodex, `#!${process.execPath}
import { appendFileSync } from "node:fs";
let s = ""; process.stdin.on("data", (d) => { s += d; }).on("end", () => {
  const input = JSON.parse(s); appendFileSync(${JSON.stringify(codexLog)}, JSON.stringify({ args: process.argv.slice(2, 4), input }) + String.fromCharCode(10));
  console.log(JSON.stringify({ items: input.items.map((i) => ({ id: i.id, tags: i.correction ? [{ major: "认知", minor: "AI 行业" }] : [{ major: "AI 实操", minor: "工具" }], video: ["教程"], status: "现在就用", statusNote: "", doWithin: "1 周内做",
    about: "测试分类：" + String(i.text).slice(0, 10), readout: "", keywords: ["测试"], noText: false })) }));
});
`);
chmodSync(fakeCodex, 0o755);
const hostDir = join(hostHome, ".x-bookmark-notes", "host");
writeFileSync(join(hostDir, "config.json"), JSON.stringify({ node: process.execPath, codex: fakeCodex, claude: null }));
// 一开始不告诉 Chrome 小程序在哪（等于读者还没装），测到收藏页的引导时再装上
function installHostManifest() {
  mkdirSync(join(ud, "NativeMessagingHosts"), { recursive: true });
  writeFileSync(join(ud, "NativeMessagingHosts", "com.x_bookmark_notes.host.json"), readFileSync(join(hostHome, "Library", "Application Support", "Google", "Chrome", "NativeMessagingHosts", "com.x_bookmark_notes.host.json")));
}
const codexCalls = () => (existsSync(codexLog) ? readFileSync(codexLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging", `--user-data-dir=${ud}`, "--no-first-run", "--no-default-browser-check",
  `--host-resolver-rules=MAP x.com 127.0.0.1:${mockPort}, MAP api.fxtwitter.com 127.0.0.1:${mockPort}, EXCLUDE 127.0.0.1`, "--no-proxy-server", "--ignore-certificate-errors", "--window-size=1280,900", "about:blank"],
  { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
const pipeOut = chrome.stdio[3], pipeIn = chrome.stdio[4];
let buffer = "", seq = 0; const waiting = new Map(), listeners = [];
pipeIn.on("data", (d) => {
  buffer += d.toString(); let i;
  while ((i = buffer.indexOf("\0")) >= 0) {
    const m = JSON.parse(buffer.slice(0, i)); buffer = buffer.slice(i + 1);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } else listeners.forEach((f) => f(m));
  }
});
const cdp = (method, params = {}, sessionId) => new Promise((r, j) => { const id = ++seq; waiting.set(id, (m) => (m.error ? j(new Error(`${method}: ${m.error.message}`)) : r(m.result))); pipeOut.write(JSON.stringify({ id, method, params, sessionId }) + "\0"); });
const contexts = new Map();
listeners.push((m) => {
  if (m.method === "Runtime.executionContextCreated") { const list = contexts.get(m.sessionId) || []; list.push({ id: m.params.context.id, name: m.params.context.name, type: m.params.context.auxData?.type }); contexts.set(m.sessionId, list); }
  if (m.method === "Runtime.executionContextsCleared") contexts.set(m.sessionId, []);
});
async function evalIn(sessionId, expression, contextId) {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
const ROOT = join(dl, "X收藏");
const allFiles = () => { const out = []; const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(join(d, f.name)) : out.push(join(d, f.name)); }; walk(ROOT); return out; };
const fileOf = (id) => allFiles().find((f) => f.endsWith(`_${id}.md`));
const read = (p) => (p && existsSync(p) ? readFileSync(p, "utf8") : "");
async function shot(session, name) { // 设了 XBN_SHOTS 就把这一刻的页面截图存下来，给人看样子
  if (!process.env.XBN_SHOTS) return;
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false }, session);
  await sleep(500);
  writeFileSync(join(process.env.XBN_SHOTS, name + ".png"), Buffer.from((await cdp("Page.captureScreenshot", { format: "png" }, session)).data, "base64"));
}

let exitCode = 1;
try {
  const { id: EXT } = await cdp("Extensions.loadUnpacked", { path: EXT_DIR });
  ok(Boolean(EXT), "插件装上了");
  const swTarget = await waitFor(async () => (await cdp("Target.getTargets")).targetInfos.find((t) => t.type === "service_worker" && t.url.startsWith(`chrome-extension://${EXT}/`)), 10000);
  const sw = (await cdp("Target.attachToTarget", { targetId: swTarget.targetId, flatten: true })).sessionId;
  await cdp("Runtime.enable", {}, sw);
  const bg = (expr) => evalIn(sw, expr);

  // 打开模拟的 X 首页
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const page = (await cdp("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  await cdp("Runtime.enable", {}, page); await cdp("Page.enable", {}, page);
  const iso = () => [...(contexts.get(page) || [])].reverse().find((c) => c.type === "isolated" && /收藏备注/.test(c.name));
  await cdp("Page.navigate", { url: "https://x.com/home" }, page);
  ok(await waitFor(async () => iso() && (await evalIn(page, "document.querySelectorAll('article').length")) === 2, 10000), "内容脚本在 x.com 上加载了");
  await sleep(500);
  ok(allFiles().length === 0, "还没点「开始」时，一个文件都不写");

  // 第一次用：装好插件自动打开设置页，一步一步来
  const setupT = await waitFor(async () => (await cdp("Target.getTargets")).targetInfos.find((t) => t.url === `chrome-extension://${EXT}/setup.html`), 8000);
  ok(Boolean(setupT), "装好插件自动打开了设置页");
  const scS = (await cdp("Target.attachToTarget", { targetId: setupT.targetId, flatten: true })).sessionId;
  await cdp("Runtime.enable", {}, scS);
  await cdp("Page.enable", {}, scS);
  ok(await waitFor(() => evalIn(scS, "document.getElementById('s1').classList.contains('active') && document.querySelector('.start').disabled && document.getElementById('s2').classList.contains('locked')"), 6000), "X 没登录：第一步「去登录 X」亮着，导入按钮是灰的");
  await shot(scS, "1-设置页-没登录");
  await cdp("Storage.setCookies", { cookies: [{ name: "auth_token", value: "test-login", domain: ".x.com", path: "/", secure: true, httpOnly: true }] });
  ok(await waitFor(() => evalIn(scS, "document.getElementById('s1').classList.contains('done') && !document.querySelector('.start').disabled"), 8000), "登录以后第一步打勾，导入按钮能点了", await evalIn(scS, "JSON.stringify([document.getElementById('s1').className, [...document.querySelectorAll('.start')].map(b => b.disabled), document.getElementById('s2').className])"));
  await evalIn(scS, "document.querySelector('.start[data-days=\"7\"]').click(), true");
  ok(await waitFor(() => evalIn(scS, "!document.getElementById('s2Run').hidden || !document.getElementById('s2Done').hidden"), 5000), "点了以后显示正在导入");
  // 后面用来给插件后台发消息的页面
  const pop = await cdp("Target.createTarget", { url: `chrome-extension://${EXT}/popup.html?full=1` });
  const popS = (await cdp("Target.attachToTarget", { targetId: pop.targetId, flatten: true })).sessionId;
  await cdp("Runtime.enable", {}, popS);
  const synced = await waitFor(() => fileOf(B) && fileOf(C) && fileOf(ART) && existsSync(join(ROOT, "_索引.md")), 20000);
  ok(Boolean(synced), "导入最近 7 天：7 天内的三条收藏各写成一个文件，加一份索引", allFiles());
  await sleep(3000);
  ok(!fileOf(OLD) && !fileOf(OLD2), "7 天以前的收藏没有导入", allFiles());
  ok(qidHits.length === 2, "翻到 7 天以前的那一页就停了，没有接着往下翻", qidHits.length);
  ok(qidHits.every((h) => h.csrf === "testct0" && h.auth.startsWith("Bearer ")), "请求带着 X 页面自己的登录状态");
  const fb = read(fileOf(B));
  ok(fb.includes("这是长推文的完整正文") && fb.includes("https://github.com/example/repo"), "长推文存的是完整正文", fb.slice(0, 500));
  ok(fb.includes("![图片](https://pbs.twimg.com/media/x.jpg)") && fb.includes("（还没写。"), "图片列出来了；没写备注的写明没写");
  ok(/收藏: "\d{4}-\d\d-\d\d \d\d:\d\d"/.test(fb), "收藏时间按 X 的排序号算出来了", fb.slice(0, 300));
  const fc = read(fileOf(C));
  ok(fc.includes("https://github.com/example/repo") && !fc.includes("t.co/abc"), "短链换回了原链接");
  ok(fc.includes("引用的推文：博主庚") && fc.includes("> 被引用的原帖"), "引用的推文也存了");
  ok(await waitFor(() => read(fileOf(ART)).includes("长文正文第一段。"), 8000), "X 长文抓到了全文", read(fileOf(ART)));
  ok(read(fileOf(ART)).includes("# 博主戊：一篇 X 长文的标题"), "长文用标题当文件标题");
  ok(await waitFor(() => existsSync(join(ROOT, "_备注备份.json")), 5000), "备注备份文件写好了", [allFiles(), await bg("chrome.storage.local.get('meta').then(m => m.meta)")]);
  ok(await waitFor(async () => (await bg("chrome.downloads.search({}).then((x) => x.length)")) <= 1, 5000), "下载记录里没留一堆条目（只留索引那一条，用来打开文件夹）");

  // 导入完：设置页第二步打勾，第三步亮起，几秒后自动打开收藏页
  ok(await waitFor(() => evalIn(scS, "document.getElementById('s2').classList.contains('done') && document.getElementById('doneText').textContent.includes('3 条')"), 8000), "导入完第二步打勾，写着导入了 3 条", await evalIn(scS, "document.body.innerText.slice(0, 400)"));
  await shot(scS, "2-设置页-导入完");
  ok(await waitFor(() => evalIn(scS, "location.pathname === '/shoucang.html' && document.querySelectorAll('#feed article.tw').length >= 3"), 12000), "导入完自动打开收藏页，三条收藏都在");
  // 收藏页：AI 分类没装好，最上面有引导卡片；点「开始分类」不报错，直接带去装
  ok(await waitFor(() => evalIn(scS, "!document.getElementById('guide').hidden && document.getElementById('guide').innerText.includes('最后一步')"), 8000), "AI 分类没装好：收藏页最上面出现「最后一步：装好 AI 自动分类」", await evalIn(scS, "document.getElementById('guide').innerText"));
  await shot(scS, "3-收藏页-引导装AI分类");
  await cdp("Browser.grantPermissions", { permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"], origin: `chrome-extension://${EXT}` });
  await cdp("Target.activateTarget", { targetId: setupT.targetId });
  await evalIn(scS, "document.getElementById('judge').click(), true");
  const setupPrompt = await waitFor(async () => { const t = await evalIn(scS, "navigator.clipboard.readText().catch(() => '')"); return t.includes("host/install.mjs") ? t : null; }, 5000);
  ok(Boolean(setupPrompt), "没装好时点「开始分类」：不报错，直接复制了装 AI 分类的那段话");
  ok((await evalIn(scS, "document.getElementById('guide').innerText")).includes("复制好了"), "引导卡片上写着复制好了、去哪里粘贴");
  ok(codexCalls().length === 0, "还没装好时没有去调 AI");
  // 读者把那段话发给 AI，AI 装好了本机小程序：卡片自己变成「装好了」，自动开始分类
  installHostManifest();
  ok(await waitFor(() => evalIn(scS, "document.getElementById('guide').innerText.includes('AI 分类装好了')"), 15000), "装好以后，引导卡片自己变成「AI 分类装好了」", await evalIn(scS, "document.getElementById('guide').innerText"));
  await shot(scS, "4-收藏页-装好了");
  ok(await waitFor(() => codexCalls().length > 0, 15000), "装好以后自动开始分类：插件通过本机小程序调了 Codex", codexCalls().length);
  ok(codexCalls()[0]?.args?.[0] === "exec" && codexCalls()[0].input.items.length === 3, "交给 Codex 的是这次导入的 3 条", codexCalls()[0]);
  ok(await waitFor(() => read(fileOf(C)).includes("- 分类：AI 实操 / 工具") && read(fileOf(C)).includes("插件自动分类，用 Codex"), 15000), "分好的类写进了收藏文件末尾的「AI 整理」", read(fileOf(C)).slice(-400));
  const sc = setupT;
  const navText = await evalIn(scS, "document.querySelector('#nav').innerText");
  ok(["信息差", "AI 实操", "认知", "做内容参考", "可做成视频"].every((x) => navText.includes(x)) && navText.includes("流量爆帖") && !navText.includes("正在做"), "左栏有四个大类、「可做成视频」和「流量爆帖」，没有只给作者用的「正在做」", navText);
  await evalIn(scS, "location.hash = '#hot'; true");
  const hotText = await waitFor(async () => { const t = await evalIn(scS, "document.querySelector('#feed').innerText"); return t.includes("长推文") ? t : null; }, 5000);
  ok(Boolean(hotText) && hotText.includes("怎么算流量爆帖") && (await evalIn(scS, "document.querySelectorAll('#feed article.tw').length")) === 1 && (await evalIn(scS, "!!document.querySelector('#feed .hotbox')")), "「流量爆帖」里只有发出 10 小时就 9 万浏览的那条，卡片上写着为什么算爆帖", hotText?.slice(0, 300));
  await shot(scS, "4b-收藏页-流量爆帖");
  await evalIn(scS, "location.hash = ''; true");
  ok(await waitFor(async () => (await evalIn(scS, "document.querySelector('#feed').innerText")).includes("工具"), 8000), "卡片上显示了 AI 分的类", await evalIn(scS, "document.querySelector('#feed').innerText.slice(0, 400)"));
  await evalIn(scS, "(() => { const q = document.querySelector('#q'); q.value = '测试分类：这是'; q.dispatchEvent(new Event('input')); return true; })()");
  ok(await waitFor(async () => (await evalIn(scS, "document.querySelectorAll('#feed article.tw').length")) === 1, 5000), "用 AI 写的「讲的是」里的字能搜到这条", await evalIn(scS, "document.querySelectorAll('#feed article.tw').length"));
  await evalIn(scS, "(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input')); return true; })()");
  ok((await evalIn(scS, "document.querySelector('.acct .who').innerText")).includes("我的 X 收藏"), "左下角写的是「我的 X 收藏」，不是哪个具体的人");
  if (process.env.XBN_SHOT) { await cdp("Emulation.setDeviceMetricsOverride", { width: 1300, height: 900, deviceScaleFactor: 1, mobile: false }, scS); await sleep(800); writeFileSync(process.env.XBN_SHOT, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" }, scS)).data, "base64")); }
  // DIY：点一下复制一段话，发给 AI 后它先问清楚再改
  await cdp("Target.activateTarget", { targetId: sc.targetId });
  await evalIn(scS, "location.hash = '#make'; true");
  await sleep(300);
  await evalIn(scS, "document.getElementById('diy').click(), true");
  const diy = await waitFor(async () => { const t = await evalIn(scS, "navigator.clipboard.readText().catch(() => '')"); return t.includes("先别动手") ? t : null; }, 5000);
  ok(Boolean(diy) && diy.includes("一次只问一到三个问题") && diy.includes("等我说「可以」再动手") && diy.includes("chrome://extensions"), "点 DIY 复制了一段话：先一轮轮问清楚、复述、等同意再改、改完提醒刷新", diy?.slice(0, 200));
  ok(["我是做什么的", "拿来干什么", "看最近 7 天的收藏", "看最近 30 天的收藏", "如无必要，勿增实体", "ABOUT_ME"].every((x) => diy?.includes(x)), "DIY 那段话先问读者是做什么的、收藏来干什么，让他选看最近 7 天还是 30 天的收藏，再按他的用法给分类建议");
  if (process.env.XBN_DIY) writeFileSync(process.env.XBN_DIY, diy || "");
  ok(diy?.includes("正在看「可做成视频」这一栏"), "DIY 那段话里带着现在看的是哪一栏", diy?.slice(-120));
  await evalIn(scS, "location.hash = ''; true");

  // 在收藏页上标「不准」：几秒后按这句话重分，这句话交给了 AI
  const rv = await evalIn(scS, `chrome.runtime.sendMessage({ type: "xbn-api", path: "/api/shoucang/review", body: { id: "${C}", verdict: "bad", fix: "这是在讲行业，不是工具" } })`);
  ok(rv?.ok && rv.review?.verdict === "bad", "收藏页上标「不准」存上了", rv);
  ok(await waitFor(() => codexCalls().some((c) => c.input.items.some((i) => i.id === C && i.correction === "这是在讲行业，不是工具")), 20000), "标了不准以后，按这句话重分：原话交给了 AI", codexCalls().length);
  ok(await waitFor(() => read(fileOf(C)).includes("- 分类：认知 / AI 行业"), 15000), "重分的结果写回了文件");

  // 点收藏：弹框、写备注、回车
  const center = (sel) => evalIn(page, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const click = async (sel) => { const p = await center(sel); await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 }, page); await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 }, page); };
  await cdp("Target.activateTarget", { targetId }); // 弹窗标签页开在了前面；切回 X 页面（后台标签页不刷新画面）
  await click(`button[data-id="${A}"]`);
  ok(await waitFor(async () => (await evalIn(page, "__xbnDebug()", iso().id)).open, 5000), "点收藏后右下角弹出备注框");
  await sleep(600);
  await cdp("Input.insertText", { text: "可以做一期教程：Agent 三步拆法" }, page);
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, page);
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, page);
  ok(await waitFor(async () => !(await evalIn(page, "__xbnDebug()", iso().id)).open, 5000), "回车保存后框收起");
  const fa = await waitFor(() => { const t = read(fileOf(A)); return t.includes("> 可以做一期教程：Agent 三步拆法") && t.includes("把 Agent 编排拆成三步") ? t : null; }, 15000);
  ok(Boolean(fa), "几秒后刚收藏的那条连全文带备注写成了文件", allFiles());
  ok(qidHits.length === 3, "收藏后那次同步只翻了一页：碰到已经存过的就停", qidHits.length);
  ok(await waitFor(() => read(join(ROOT, "_索引.md")).includes("可以做一期教程"), 8000), "索引里也有这句备注");
  ok(await waitFor(() => read(join(ROOT, "_备注备份.json")).includes("可以做一期教程"), 8000), "备注备份里也有");
  ok(await waitFor(async () => (await evalIn(page, "__xbnDebug()", iso().id)).chips.some((c) => c.id === A && c.label === "已记"), 5000), "收藏按钮旁显示「已记」", await evalIn(page, "__xbnDebug()", iso().id));

  // 马上做：开场白先放备注再放原文
  const prompt = await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-work-prompt", tweetId: "${A}" }).then((r) => r.prompt)`);
  ok(prompt.indexOf("可以做一期教程") > 0 && prompt.indexOf("可以做一期教程") < prompt.indexOf("把 Agent 编排"), "「马上做」的开场白：先是备注，再是原文", prompt.slice(0, 300));

  // 收藏了没写：进「还没写」清单，图标上有数字
  await click(`button[data-id="${D}"]`);
  ok(await waitFor(async () => (await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-missing" })`)).items.some((i) => i.tweetId === D), 6000), "收藏了没写备注：进「还没写为什么收藏」清单");
  ok(await waitFor(async () => (await bg("chrome.action.getBadgeText({})")) !== "", 5000), "插件图标上显示今天没写的条数");

  // 取消收藏
  await sleep(1500);
  await click(`button[data-id="${A}"]`);
  ok(await waitFor(() => read(fileOf(A)).includes("状态: 已取消收藏"), 8000), "取消收藏后文件标成「已取消收藏」，备注还在", read(fileOf(A)).slice(0, 300));
  ok(read(fileOf(A)).includes("可以做一期教程"), "取消收藏不删备注");

  // 在文件里手写的东西：内容没变时插件不重写文件，不会被冲掉
  const fcPath = fileOf(C);
  writeFileSync(fcPath, read(fcPath) + "\n手写的一行\n");
  await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-sync", mode: "quick" })`);
  await sleep(4000);
  ok(read(fcPath).includes("手写的一行"), "同步时内容没变的文件不重写，手写进去的不会被冲掉");

  // X 换了书签接口编号：旧编号 404；X 页面自己请求一次新编号后，插件学会用新的
  xChangedQid = true;
  qidHits.length = 0;
  await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-sync", mode: "quick" })`);
  ok(await waitFor(async () => (await bg("chrome.storage.local.get('syncState').then((s) => s.syncState)")).state === "failed", 8000), "接口编号失效时同步报错，不当成没有收藏");
  await evalIn(page, "visitBookmarksPage('NEWQID'), true");
  ok(await waitFor(async () => (await bg("chrome.storage.local.get('meta').then((s) => s.meta.learnedQueryId)")) === "NEWQID", 5000), "从 X 网页自己的请求里学到了新编号");
  await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-sync", mode: "quick" })`);
  ok(await waitFor(async () => (await bg("chrome.storage.local.get('syncState').then((s) => s.syncState)")).state === "done", 8000), "用新编号同步成功");
  ok(qidHits.some((h) => h.qid === "NEWQID" && h.features?.includes("learned_feature")), "连 X 网页用的参数一起学过来了");

  // 在手机上取消的收藏：插件看不到「取消收藏」的请求，靠同步时核对。连续两次（隔 20 分钟以上）都没翻到才算取消
  bookmarked.delete(ART);
  const meta = () => bg("chrome.storage.local.get('meta').then((s) => s.meta)");
  const resync = async () => {
    await bg("chrome.storage.local.get('meta').then(({ meta }) => chrome.storage.local.set({ meta: { ...meta, lastRefreshAt: null } }))"); // 当成离上次重看已经过了 30 分钟
    await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-sync", mode: "quick" })`);
    await sleep(500);
    return waitFor(async () => (await bg("chrome.storage.local.get('syncState').then((s) => s.syncState)")).state === "done", 15000);
  };
  await resync();
  ok(Boolean((await meta()).missingSince?.[ART]) && !(await bg(`chrome.storage.local.get('t:${ART}').then((s) => s['t:${ART}'].removedAt)`)), "手机上取消的收藏：第一次没翻到，先记下，不马上算取消", (await meta()).missingSince);
  await bg(`chrome.storage.local.get('meta').then(({ meta }) => chrome.storage.local.set({ meta: { ...meta, missingSince: { ...meta.missingSince, "${ART}": new Date(Date.now() - 30 * 60000).toISOString() } } }))`); // 当成第一次没翻到是半小时前
  await resync();
  ok(await waitFor(async () => Boolean(await bg(`chrome.storage.local.get('t:${ART}').then((s) => s['t:${ART}'].removedAt)`)), 5000), "隔 20 分钟以上第二次还没翻到：算取消收藏");
  ok(await waitFor(() => read(fileOf(ART)).includes("状态: 已取消收藏"), 8000), "手机上取消的收藏，文件也标成「已取消收藏」");
  const scLive = await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-api", path: "/api/shoucang" }).then((r) => r.items.map((i) => i.id))`);
  ok(!scLive.includes(ART) && scLive.includes(C), "收藏页里不再有取消了的那条，别的还在", scLive);
  bookmarked.add(ART);
  await resync();
  ok(await waitFor(async () => !(await bg(`chrome.storage.local.get('t:${ART}').then((s) => s['t:${ART}'].removedAt)`)), 5000), "又收藏回来：同步时翻到，标回「收藏中」");

  // 导入备注备份：更新的不被旧的盖掉
  const imported = await evalIn(popS, `chrome.runtime.sendMessage({ type: "xbn-import-notes", backup: { version: 1, notes: { "${B}": { text: "从备份导回来的备注", at: "2026-01-01T00:00:00Z" }, "${A}": { text: "更旧的一版", at: "2000-01-01T00:00:00Z" } } } })`);
  ok(imported.ok && imported.count === 1, "导入备份：导回 1 条，插件里更新的那条没被盖掉", imported);
  ok(await waitFor(() => read(fileOf(B)).includes("> 从备份导回来的备注"), 8000), "导回的备注写进了文件");

  // 说明页：「复制给 AI」那段话里带着 Skill 两个文件的全文
  const help = await cdp("Target.createTarget", { url: `chrome-extension://${EXT}/help.html` });
  const helpS = (await cdp("Target.attachToTarget", { targetId: help.targetId, flatten: true })).sessionId;
  await cdp("Runtime.enable", {}, helpS);
  const preview = await waitFor(async () => { const t = await evalIn(helpS, "document.getElementById('preview').textContent"); return t.length > 1000 ? t : null; }, 5000);
  ok(preview?.includes("name: x-bookmark-notes") && preview?.includes("## 信息差") && preview?.includes("~/.claude/skills/x-bookmark-notes/"), "说明页「复制给 AI」带着 Skill 和分类表全文", preview?.slice(0, 200));
  ok(preview?.includes("host/install.mjs --test"), "「复制给 AI」里有装本机小程序这一步");
  if (process.env.XBN_DUMP) writeFileSync(process.env.XBN_DUMP, JSON.stringify({ prompt: preview, root: ROOT }));

  exitCode = fails.length ? 1 : 0;
} catch (error) {
  lines.push(`  出错：${error.stack || error}`);
  fails.push("异常");
} finally {
  console.log(lines.join("\n"));
  console.log(fails.length ? `\n失败 ${fails.length} 项` : `\n全部通过（${lines.length} 项）`);
  chrome.kill();
  process.exit(exitCode);
}
