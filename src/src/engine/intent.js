'use strict';
// 2.3：查询意图理解 —— 规则实体识别（离线可用）+ AI 增强（快模型），输出分类/改写/维度
const BOOK_HINT = /(书|小说|电子书|ebook|epub|mobi|azw3|pdf|著|作者|全集|读后感|豆瓣|isbn|novel|book)/i;
const SOFT_HINT = /(下载|安装|破解|绿色版|便携|portable|download|install|setup|exe|apk|dmg|msi|软件|工具|app|客户端|插件|extension|release|版本)/i;
const PAPER_HINT = /(论文|文献|综述|paper|arxiv|doi|survey|journal|期刊|学术|引用|citation)/i;
const VIDEO_HINT = /(视频|电影|纪录片|电视剧|番剧|动漫|教程视频|mv|video|movie|film|documentary|trailer|b站|bilibili|youtube)/i;
const MUSIC_HINT = /(歌曲|音乐|专辑|歌词|music|song|album|lyrics|mp3|flac)/i;
const IMAGE_HINT = /(图片|壁纸|素材|图标|插画|photo|image|wallpaper|icon|png|svg)/i;
const DEV_HINT = /(npm|pypi|crate|maven|github|api|sdk|报错|error|exception|bug|代码|源码|函数|library|框架|framework|教程|how to|怎么|如何)/i;
const NEWS_HINT = /(新闻|最新|今日|发布会|动态|news|latest|today|announce)/i;
const DATA_HINT = /(数据|统计|报告|白皮书|市场规模|政策|report|statistics|dataset|white ?paper)/i;
const FMT = /\b(pdf|epub|mobi|azw3|djvu|txt|exe|msi|apk|dmg|deb|rpm|zip|7z|rar|mp4|mkv|mp3|flac)\b/gi;

function entities(q) {
  const out = []; const push = (type, value) => { value = String(value).trim(); if (value && !out.some((e) => e.type === type && e.value === value)) out.push({ type, value }); };
  for (const m of q.matchAll(/《([^》]{1,60})》/g)) push('book', m[1]);
  for (const m of q.matchAll(/(?:ISBN[-:\s]*)?\b(97[89][-\s]?(?:\d[-\s]?){9}\d|\d{9}[\dXx])\b/g)) push('isbn', m[1].replace(/[-\s]/g, ''));
  for (const m of q.matchAll(/\b(10\.\d{4,9}\/[^\s]+)\b/g)) push('doi', m[1]);
  for (const m of q.matchAll(/\b(?:arxiv:)?(\d{4}\.\d{4,5})(v\d+)?\b/gi)) push('arxiv', m[1]);
  for (const m of q.matchAll(/([\u4e00-\u9fa5]{2,4})(?:著|的(?:书|小说|作品))/g)) push('author', m[1]);
  for (const m of q.matchAll(/(?:by|author[:：]?)\s+([A-Z][a-z]+(?:\s[A-Z][a-z.]+){0,3})/g)) push('author', m[1]);
  // 软件名 + 版本
  for (const m of q.matchAll(/([A-Za-z][\w.+#-]{1,30}(?:\s[A-Za-z][\w+#-]{1,20})?)\s*(?:v|版本\s*|version\s*)?(\d+(?:\.\d+){1,3}(?:[-.]?(?:beta|rc|alpha|lts)\d*)?)\b/gi)) { if (/^\d{4}\.\d{4,5}$/.test(m[2]) || /^(arxiv|isbn|doi)$/i.test(m[1])) continue; push('software', m[1]); push('version', m[2]); }
  for (const m of q.matchAll(FMT)) push('format', m[1].toLowerCase());
  for (const m of q.matchAll(/\b((?:19|20)\d{2})\s*年?/g)) push('year', m[1]);
  if (!out.some((e) => e.type === 'software') && SOFT_HINT.test(q)) { const n = q.replace(SOFT_HINT, ' ').replace(/[^\w\u4e00-\u9fa5.+# -]/g, ' ').trim().split(/\s+/).filter((x) => x.length > 1)[0]; if (n) push('software', n); }
  return out;
}
const isZh = (s) => /[\u4e00-\u9fa5]/.test(s);
/** 规则意图：不依赖 AI */
function ruleIntent(q, categories = {}) {
  q = String(q || '').trim(); const ents = entities(q); const cats = new Set(); let type = 'lookup';
  const has = (k) => k in categories || !Object.keys(categories).length;
  const add = (...ks) => ks.forEach((k) => has(k) && cats.add(k));
  if (ents.some((e) => ['book', 'isbn', 'author'].includes(e.type)) || BOOK_HINT.test(q)) add('books', 'ebooks');
  if (ents.some((e) => ['doi', 'arxiv'].includes(e.type)) || PAPER_HINT.test(q)) { add('papers'); type = 'research'; }
  if (SOFT_HINT.test(q) || ents.some((e) => ['exe', 'msi', 'apk', 'dmg', 'deb', 'rpm'].includes(e.value))) { add('software', 'apps'); type = 'download'; }
  if (ents.some((e) => ['epub', 'mobi', 'azw3', 'pdf', 'djvu'].includes(e.value))) { add('ebooks'); type = 'download'; }
  if (VIDEO_HINT.test(q)) add('video'); if (MUSIC_HINT.test(q)) add('music'); if (IMAGE_HINT.test(q)) add('images');
  if (DEV_HINT.test(q)) { add('dev', 'code', 'qa'); if (/怎么|如何|how to|教程/i.test(q)) type = 'howto'; }
  if (NEWS_HINT.test(q)) { add('news'); type = 'news'; }
  if (DATA_HINT.test(q)) { add('reports', 'data'); type = type === 'lookup' ? 'research' : type; }
  if (/对比|比较|区别|\bvs\.?\s|versus|哪个好|优缺点/i.test(q)) type = 'compare';
  return { intent: q, type, lang: isZh(q) ? (/[a-z]{3,}/i.test(q) ? 'mixed' : 'zh') : 'en', entities: ents, categories: [...cats].slice(0, 4), rewrites: { zh: [], en: [] }, dimensions: [], by: 'rules' };
}
/** AI 增强意图；失败时返回规则结果 */
async function analyze(q, { llm, categories = {}, signal } = {}) {
  const base = ruleIntent(q, categories);
  if (!llm?.enabled) return base;
  try {
    const j = await llm.json('intent', [{ role: 'system', content: llm.prompt('intent', { categories: JSON.stringify(categories) }) }, { role: 'user', content: q }], { signal, temperature: 0.1 });
    const valid = (j.categories || []).filter((c) => c in categories || !Object.keys(categories).length);
    const ents = [...base.entities]; for (const e of j.entities || []) if (e?.value && !ents.some((x) => x.value === e.value)) ents.push({ type: e.type || 'other', value: String(e.value) });
    return { intent: j.intent || q, type: j.type || base.type, lang: j.lang || base.lang, entities: ents, categories: valid.length ? valid.slice(0, 4) : base.categories,
      rewrites: { zh: (j.rewrites?.zh || []).filter((x) => typeof x === 'string').slice(0, 2), en: (j.rewrites?.en || []).filter((x) => typeof x === 'string').slice(0, 2) },
      dimensions: (j.dimensions || []).filter((d) => d?.query).slice(0, 5), by: 'ai' };
  } catch (e) { return { ...base, aiError: e.message }; }
}
/** 由意图生成多语言查询集合 */
function queriesFor(q, it, { multiLang = true, max = 4 } = {}) {
  const out = [q]; const add = (x) => { if (x && !out.includes(x)) out.push(x); };
  for (const x of it.rewrites?.zh || []) add(x);
  if (multiLang) for (const x of it.rewrites?.en || []) add(x);
  return out.slice(0, max);
}
module.exports = { entities, ruleIntent, analyze, queriesFor };
