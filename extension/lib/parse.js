// 把 X 书签接口（GraphQL Bookmarks）返回的数据，整理成一条条收藏。
// 只做整理，不发请求；插件后台和 Node 测试都直接用这个文件。

// X 网页自己用的公开常量，不是你的账号密钥。X 换了它，插件会从 X 网页自己的请求里学到新的。
export const PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
export const FALLBACK_QUERY_ID = "tmd4ifV8RHltzn8ymGg1aw";
export const DEFAULT_FEATURES = {
  rweb_video_screen_enabled: false,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  responsive_web_media_download_video_enabled: false,
  premium_content_api_read_enabled: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_jetfuel_frame: false,
  responsive_web_grok_show_grok_translated_post: false,
  responsive_web_grok_analysis_button_from_backend: true,
  creator_subscriptions_quote_tweet_preview_enabled: false,
  articles_preview_enabled: true,
  communities_web_enable_tweet_community_results_fetch: true,
  rweb_tipjar_consumption_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  graphql_timeline_v2_bookmark_timeline: true,
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function unwrap(result) {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults") return result.tweet || null;
  if (result.tweet && !result.legacy) return result.tweet;
  return result;
}

// X 给每条收藏一个排序号，去掉低 20 位就是收藏那一刻的毫秒时间（手机上收藏的也准）
export function bookmarkedAtFromSortIndex(sortIndex) {
  try {
    const ms = Number(BigInt(String(sortIndex)) >> 20n);
    if (ms > Date.parse("2010-01-01") && ms < Date.now() + 86400000) return new Date(ms).toISOString();
  } catch { /* 不是数字 */ }
  return null;
}

// 正文里的 t.co 短链换回原链接，图片短链去掉（图片单独列）
function expandText(text, urls = [], media = []) {
  let out = String(text || "");
  for (const u of urls) if (u?.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  for (const m of media) if (m?.url) out = out.split(m.url).join("");
  return out.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function userOf(tweet) {
  const user = tweet?.core?.user_results?.result || {};
  const legacy = user.legacy || {};
  const core = user.core || {};
  return {
    name: core.name || legacy.name || "",
    handle: core.screen_name || legacy.screen_name || "",
    followers: num(legacy.followers_count),
    avatar: user.avatar?.image_url || legacy.profile_image_url_https || "",
  };
}

// 视频挑长边不超过 1280 里最清楚的一种：收藏页上自动播放，太大的加载慢
function pickMp4(variants) {
  const mp4s = (variants || []).filter((v) => v?.content_type === "video/mp4" && /^https:\/\/video\.twimg\.com\//.test(v?.url || ""))
    .map((v) => { const [, w, h] = String(v.url).match(/\/(\d+)x(\d+)\//) || []; return { url: v.url, bitrate: num(v.bitrate), long: Math.max(Number(w) || 0, Number(h) || 0) }; });
  if (!mp4s.length) return null;
  const fit = mp4s.filter((v) => !v.long || v.long <= 1280);
  return (fit.length ? fit.sort((a, b) => b.bitrate - a.bitrate) : mp4s.sort((a, b) => a.bitrate - b.bitrate))[0];
}

function mediaOf(legacy) {
  const list = legacy?.extended_entities?.media || legacy?.entities?.media || [];
  return list.map((m) => {
    const item = { type: m.type === "photo" ? "图片" : m.type === "animated_gif" ? "动图" : "视频", url: m.media_url_https || m.media_url || "" };
    if (m.type !== "photo") {
      const best = pickMp4(m.video_info?.variants);
      if (best?.url) item.video = best.url;
      item.page = m.expanded_url || "";
      item.kind = m.type === "animated_gif" ? "gif" : "video";
      item.durationMs = num(m.video_info?.duration_millis);
    }
    return item;
  }).filter((m) => m.url);
}

function articleOf(tweet) {
  const a = tweet?.article?.article_results?.result;
  if (!a) return null;
  return { title: String(a.title || "").trim(), preview: String(a.preview_text || "").trim() };
}

function cardOf(tweet) {
  const values = tweet?.card?.legacy?.binding_values;
  if (!Array.isArray(values)) return null;
  const get = (key) => values.find((b) => b.key === key)?.value?.string_value || "";
  const title = get("title"), description = get("description"), url = get("card_url");
  return title || description ? { title, description, url } : null;
}

// 一条推文（不含引用）整理成平铺的字段
function flatten(tweet) {
  const legacy = tweet.legacy || {};
  const note = tweet.note_tweet?.note_tweet_results?.result;
  const media = mediaOf(legacy);
  const text = note?.text
    ? expandText(note.text, note.entity_set?.urls || [], [])
    : expandText(legacy.full_text, legacy.entities?.urls || [], legacy.extended_entities?.media || legacy.entities?.media || []);
  const user = userOf(tweet);
  const id = String(legacy.id_str || tweet.rest_id || "");
  return {
    id,
    url: user.handle ? `https://x.com/${user.handle}/status/${id}` : `https://x.com/i/status/${id}`,
    author: user.name,
    handle: user.handle,
    followers: user.followers,
    avatar: user.avatar,
    text,
    postedAt: legacy.created_at ? new Date(legacy.created_at).toISOString() : "",
    media,
    article: articleOf(tweet),
    card: cardOf(tweet),
    metrics: {
      views: num(tweet.views?.count),
      likes: num(legacy.favorite_count),
      reposts: num(legacy.retweet_count),
      replies: num(legacy.reply_count),
      quotes: num(legacy.quote_count),
      bookmarks: num(legacy.bookmark_count),
    },
  };
}

export function tweetFromEntry(entry) {
  const result = entry?.content?.itemContent?.tweet_results?.result || entry?.content?.tweet_results?.result;
  const tweet = unwrap(result);
  const fallbackId = String(entry?.entryId || "").match(/^tweet-(\d+)/)?.[1] || "";
  if (!tweet?.legacy) {
    // 原帖被删了、作者锁了推：只留编号，写备注照样可以
    if (!fallbackId) return null;
    return { id: fallbackId, url: `https://x.com/i/status/${fallbackId}`, author: "", handle: "", text: "", unavailable: true,
      postedAt: "", media: [], article: null, card: null, metrics: {}, quoted: null, bookmarkedAt: bookmarkedAtFromSortIndex(entry.sortIndex) };
  }
  const item = flatten(tweet);
  const quotedTweet = unwrap(tweet.quoted_status_result?.result);
  item.quoted = quotedTweet?.legacy ? flatten(quotedTweet) : null;
  if (item.quoted) delete item.quoted.metrics;
  item.bookmarkedAt = bookmarkedAtFromSortIndex(entry.sortIndex);
  return item;
}

export function parseBookmarksPage(payload) {
  const timeline = payload?.data?.bookmark_timeline_v2?.timeline || payload?.data?.bookmark_timeline?.timeline;
  if (!timeline) {
    const message = (payload?.errors || []).map((e) => e?.message).filter(Boolean).join("；");
    throw new Error(message ? `X 返回错误：${message}` : "X 返回的数据里没有书签列表");
  }
  const entries = [];
  for (const instruction of timeline.instructions || []) {
    if (Array.isArray(instruction.entries)) entries.push(...instruction.entries);
    if (instruction.entry) entries.push(instruction.entry);
  }
  const items = [];
  let cursor = null;
  for (const entry of entries) {
    const content = entry?.content || {};
    if (content.cursorType === "Bottom" || String(entry?.entryId || "").startsWith("cursor-bottom")) { cursor = content.value || null; continue; }
    if (String(entry?.entryId || "").startsWith("cursor-")) continue;
    const item = tweetFromEntry(entry);
    if (item?.id) items.push(item);
  }
  return { items, cursor };
}
