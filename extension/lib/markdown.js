// 一条收藏写成一个 Markdown 文件；再写一份总索引。人能看，AI 也能直接搜、直接读。
// 插件每次重写文件都会整份重写，所以文件里「## AI 整理」那一段是给 AI 自己补的：
// 备注或原文变了，插件重写文件，AI 整理就没了，下次整理时 AI 会按新备注重做。

export const AI_SECTION = "## AI 整理";
export const ROOT = "X收藏";

const pad = (n) => String(n).padStart(2, "0");
export function localTime(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const q = (v) => JSON.stringify(String(v ?? "")); // YAML 双引号字符串和 JSON 写法一样
const oneLine = (s, max = 60) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};
const quote = (s) => String(s || "").split("\n").map((line) => `> ${line}`).join("\n");

// 文件名第一次写的时候定下来，以后不变（收藏时间、作者改名都不改文件名）
export function fileNameFor(item, at = item.bookmarkedAt || item.firstSeenAt || new Date().toISOString()) {
  const d = new Date(at);
  const valid = !Number.isNaN(d.getTime());
  const month = valid ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}` : "未知月份";
  const day = valid ? `${month}-${pad(d.getDate())}` : "未知日期";
  const handle = String(item.handle || "unknown").replace(/[^A-Za-z0-9_]/g, "") || "unknown";
  return `收藏/${month}/${day}_${handle}_${item.id}.md`;
}

function metricsLine(m = {}) {
  const parts = [["浏览", m.views], ["赞", m.likes], ["转发", m.reposts], ["回复", m.replies], ["收藏", m.bookmarks]]
    .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${v}`);
  return parts.length ? parts.join(" · ") : "";
}

function bodyOf(t, level = "###") {
  const out = [];
  if (t.text) out.push(t.text);
  if (t.article) {
    out.push(`${level} X 长文：${t.article.title || "（没有标题）"}`);
    if (t.article.text) out.push(t.article.text);
    else if (t.article.preview) out.push(`${t.article.preview}\n\n（这里只有开头，全文在原帖里）`);
  }
  if (t.card) out.push(`${level} 链接卡片：${t.card.title || ""}\n${[t.card.description, t.card.url].filter(Boolean).join("\n")}`.trim());
  if (t.media?.length) {
    out.push(t.media.map((m) => m.type === "图片" ? `![图片](${m.url})` : `- ${m.type}：${m.page || t.url}（封面 ${m.url}${m.video ? `，视频文件 ${m.video}` : ""}）`).join("\n"));
  }
  return out.join("\n\n");
}

// 正文只有一个链接（X 长文就是这样）时，用长文标题当「讲什么」
function lead(item) {
  const text = String(item.text || "").trim();
  if ((!text || /^https?:\/\/\S+$/.test(text)) && item.article?.title) return item.article.title;
  return text || item.article?.title || item.quoted?.text || "";
}

const DO_LABEL = { "1d": "1 天内做", "3d": "3 天内做", "1w": "1 周内做", "1m": "1 个月内做", any: "随时能做" };
// 插件自动分类的结果写在文件末尾「AI 整理」一段，格式和 Skill 里手动整理的一样
function intentSection(intent) {
  if (!intent) return [];
  const lines = ["", "## AI 整理", ""];
  lines.push(`- 分类：${(intent.tags || []).map((t) => `${t.major} / ${t.minor}`).join("；") || "没分出来"}`);
  if (intent.about) lines.push(`- 讲什么：${intent.about}`);
  lines.push(`- 可做成视频：${intent.video?.length ? intent.video.join("、") : "不适合"}`);
  lines.push(`- 多久内做：${intent.doWithin ? DO_LABEL[intent.doWithin] || intent.doWithin : "不适用"}`);
  if (intent.readout) lines.push(`- 还读出：${intent.readout}`);
  if (intent.keywords?.length) lines.push(`- 关键词：${intent.keywords.join("、")}`);
  if (intent.at) lines.push(`- 整理于：${localTime(intent.at)}（插件自动分类${intent.tool ? `，用 ${intent.tool === "claude" ? "Claude Code" : "Codex"}` : ""}）`);
  return lines;
}

export function renderBookmark(item, note, intent = null) {
  const noteText = String(note?.text || "").trim();
  const title = oneLine(lead(item) || "（没抓到正文）", 40);
  const front = [
    "---",
    `id: ${q(item.id)}`,
    `链接: ${q(item.url)}`,
    `作者: ${q(item.handle ? `${item.author} (@${item.handle})` : item.author || "未知")}`,
    `发布: ${q(localTime(item.postedAt))}`,
    `收藏: ${q(localTime(item.bookmarkedAt || item.firstSeenAt))}`,
    `备注: ${noteText ? "有" : "没写"}`,
    `状态: ${item.removedAt ? "已取消收藏" : "收藏中"}`,
    "---",
  ].join("\n");
  const parts = [front, "", `# ${item.author || "推文"}：${title}`, "", "## 我为什么收藏", ""];
  parts.push(noteText ? quote(noteText) : "（还没写。收藏的时候没留下为什么存。）");
  if (noteText && note.at) parts.push("", `写于 ${localTime(note.at)}`);
  parts.push("", "## 原文", "");
  if (item.unavailable) parts.push("（这条推文现在看不到了：可能被删了，或者作者设了权限。）");
  else parts.push(bodyOf(item) || "（没有文字）");
  if (item.quoted) {
    const qt = item.quoted;
    parts.push("", `### 引用的推文：${qt.author || ""}${qt.handle ? ` (@${qt.handle})` : ""}`, "", quote(bodyOf(qt, "####") || "（没有文字）"), "", `原帖：${qt.url}`);
  }
  const metrics = metricsLine(item.metrics);
  if (metrics) parts.push("", `数据（第一次抓到时）：${metrics}`);
  parts.push(...intentSection(intent));
  parts.push("");
  return parts.join("\n");
}

const cell = (s) => String(s || "").replace(/\|/g, "／").replace(/\s+/g, " ").trim();

export function renderIndex(items, notes, now = new Date().toISOString()) {
  const live = items.filter((i) => !i.removedAt);
  const noted = live.filter((i) => String(notes[i.id]?.text || "").trim()).length;
  const lines = [
    "# X 收藏索引",
    "",
    `更新于 ${localTime(now)}。一共 ${live.length} 条收藏，${noted} 条写了「为什么收藏」。`,
    "",
    "这个文件夹由 Chrome 插件「X 收藏备注」自动生成，每条收藏一个 Markdown 文件，在 `收藏/年-月/` 里。",
    "每个文件里：「我为什么收藏」是本人收藏时写的原话；「原文」是推文全文（短链已换回原链接）；文件末尾的「AI 整理」是插件调你电脑上的 Codex 或 Claude Code 分的类。",
    "",
    "| 收藏时间 | 作者 | 我为什么收藏 | 讲什么 | 文件 |",
    "|---|---|---|---|---|",
  ];
  const sorted = [...live].sort((a, b) => String(b.bookmarkedAt || b.firstSeenAt).localeCompare(String(a.bookmarkedAt || a.firstSeenAt)));
  for (const item of sorted) {
    const note = cell(oneLine(notes[item.id]?.text, 80)) || "（没写）";
    lines.push(`| ${localTime(item.bookmarkedAt || item.firstSeenAt)} | ${cell(item.handle ? `@${item.handle}` : item.author)} | ${note} | ${cell(oneLine(lead(item), 50))} | [打开](${encodeURI(item.file || fileNameFor(item))}) |`);
  }
  const removed = items.length - live.length;
  if (removed) lines.push("", `另有 ${removed} 条已经在 X 上取消收藏，文件还在，状态写着「已取消收藏」。`);
  lines.push("");
  return lines.join("\n");
}

// 简单的指纹：内容没变就不重写文件
export function fingerprint(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
