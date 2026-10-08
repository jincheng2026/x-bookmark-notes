// 流量爆帖：照作者自用版的第一版标准（2026-09-28 定）。
// 依据：X「为你推荐」只推发出 48 小时内的帖子；帖子发出一天就拿到最终浏览的八成；中文、英文作者的浏览差将近 10 倍，所以门槛分开。
// 满足任意一条就算：
// 1. 发出 24 小时内浏览到 8 万（中文）/ 50 万（英文）；或 72 小时内到 20 万 / 100 万；
// 2. 发出 7 天内浏览破 100 万（不分中英文，接住过了几天才收藏的大爆款）；
// 3. 老帖又火了：发出 3 天以上，和大约一天前那次同步比，浏览又涨 10% 以上并且至少多 1 万。
// 只陈述「流量在涨」，不打分、不建议做不做。
//
// 数字从哪来：每次同步，插件给翻到的每条收藏记一笔当时的浏览、点赞、回复、引用、收藏（快照），存在 m:<id>。

export const HOT_RULES = {
  zh: { day: 80000, threeDays: 200000 },
  en: { day: 500000, threeDays: 1000000 },
  week: 1000000,
  revival: { minAgeHours: 72, pct: 0.1, min: 10000, gapMinHours: 20, gapMaxHours: 36 },
  // 提示用的两条线（作者 700 条收藏里排前四分之一的位置）
  hints: { saveRatio: 1.6, discussRatio: 0.15, minLikes: 50 },
};

const HOUR = 3600 * 1000;
export const SNAP_GAP_MS = 20 * 60 * 1000; // 同一条两笔至少隔 20 分钟
const SNAP_KEEP_MS = 10 * 24 * HOUR; // 只留最近 10 天
const SNAP_DENSE_MS = 2 * 24 * HOUR; // 最近两天每笔都留；更早的每 6 小时留一笔（判断「又火了」只要大约一天前那笔）

// 快照存成数组省地方：[时间毫秒, 浏览, 点赞, 回复, 引用, 收藏]
export function snapOf(metrics, at) {
  const v = Number(metrics?.views);
  if (!Number.isFinite(v) || metrics?.views === null || metrics?.views === undefined) return null;
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  return [at, v, n(metrics.likes), n(metrics.replies), n(metrics.quotes), n(metrics.bookmarks)];
}
export function addSnap(list, snap, now = Date.now()) {
  const out = Array.isArray(list) ? list.filter((s) => now - s[0] <= SNAP_KEEP_MS) : [];
  const last = out[out.length - 1];
  if (last && snap[0] - last[0] < SNAP_GAP_MS) return null; // 刚记过，不用再记
  out.push(snap);
  // 两天以前的稀疏一点
  const thin = [];
  for (const s of out) {
    if (now - s[0] <= SNAP_DENSE_MS) { thin.push(s); continue; }
    const prev = thin[thin.length - 1];
    if (!prev || s[0] - prev[0] >= 6 * HOUR) thin.push(s);
  }
  return thin;
}

// 作者算中文还是英文：看正文（加长文标题）里中文字和英文字母的比例；正文太短就看作者名
export function isChineseItem(item) {
  const text = `${item?.text || ""} ${item?.article?.title || item?.articleTitle || ""}`;
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk + latin < 10) return /[一-鿿]/.test(item?.author || "");
  return cjk * 3 >= latin;
}

// 按一条收藏的全部快照判断：第一次过线是哪次同步、按哪条过的；之后要是又火了（第 3 条），以最近那次为准
export function hotStatus(item, rawSnaps, rules = HOT_RULES) {
  const posted = Date.parse(item?.postedAt || item?.datetime || "");
  if (!posted || !rawSnaps?.length) return null;
  const zh = isChineseItem(item), t = zh ? rules.zh : rules.en;
  const list = rawSnaps.map((s) => ({ t: s[0], at: new Date(s[0]).toISOString(), views: s[1], likes: s[2], replies: s[3], quotes: s[4], bookmarks: s[5] }))
    .filter((s) => s.t && Number.isFinite(s.views)).sort((a, b) => a.t - b.t);
  let first = null, revival = null;
  let j = -1; // 「大约一天前那次」：最后一个不晚于 s 之前 gapMinHours 小时的快照
  for (const s of list) {
    const age = (s.t - posted) / HOUR;
    if (age < 0) continue;
    let hit = null;
    if (age <= 24 && s.views >= t.day) hit = { rule: "day", threshold: t.day };
    else if (age <= 72 && s.views >= t.threeDays) hit = { rule: "threeDays", threshold: t.threeDays };
    else if (age <= 168 && s.views >= rules.week) hit = { rule: "week", threshold: rules.week };
    if (age > rules.revival.minAgeHours) {
      while (j + 1 < list.length && list[j + 1].t <= s.t - rules.revival.gapMinHours * HOUR) j += 1;
      const base = j >= 0 && list[j].t >= s.t - rules.revival.gapMaxHours * HOUR ? list[j] : null;
      if (base && base.views > 0) {
        const delta = s.views - base.views;
        if (delta >= rules.revival.min && delta / base.views >= rules.revival.pct) {
          revival = { rule: "revival", at: s.at, ageHours: age, views: s.views, baseViews: base.views, baseAt: base.at, hours: (s.t - base.t) / HOUR };
          if (!hit) hit = { rule: "revival" };
        }
      }
    }
    if (hit && !first) first = { ...hit, at: s.at, ageHours: age, views: s.views, ...(hit.rule === "revival" ? revival : {}) };
  }
  if (!first) return null;
  const event = revival && Date.parse(revival.at) >= Date.parse(first.at) ? revival : first;
  // 现在还涨不涨：最新一次和大约一天前（没有就和最早一次，至少隔 3 小时）比
  const last = list[list.length - 1];
  const base = [...list].reverse().find((b) => b.t <= last.t - 20 * HOUR) || (list[0].t <= last.t - 3 * HOUR ? list[0] : null);
  const growth = base ? { hours: (last.t - base.t) / HOUR, delta: last.views - base.views, pct: base.views ? (last.views - base.views) / base.views : null, perHour: (last.views - base.views) / ((last.t - base.t) / HOUR) } : null;
  // 给做内容的提示：只描述大家在干什么，不建议做不做
  const hints = [];
  const likes = last.likes || 0, hr = rules.hints;
  if (likes >= hr.minLikes) {
    const discuss = ((last.replies || 0) + (last.quotes || 0)) / likes, save = (last.bookmarks || 0) / likes;
    if (discuss >= hr.discussRatio) hints.push({ kind: "discuss", ratio: discuss });
    if (save >= hr.saveRatio) hints.push({ kind: "save", ratio: save });
  }
  return {
    zh, rule: event.rule, flaggedAt: event.at,
    firstRule: first.rule, firstAt: first.at, firstAgeHours: first.ageHours, firstViews: first.views, threshold: first.threshold || null,
    revival: revival && event === revival ? { views: revival.views, baseViews: revival.baseViews, hours: revival.hours, ageHours: revival.ageHours } : null,
    views: last.views, growth, hints,
  };
}
