'use strict';
function normUrl(u) {
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|ref|spm|from|fbclid|gclid|mc_|amp)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + (x.search || '')).toLowerCase();
  } catch { return String(u).toLowerCase(); }
}
function tokens(s) {
  return String(s || '').toLowerCase().split(/[\s,，。.;:：、|/\\\-_()（）\[\]"'!?！？]+/).filter(Boolean)
    .flatMap((t) => (/[\u4e00-\u9fa5]/.test(t) && t.length > 2 ? [t, ...t.match(/[\u4e00-\u9fa5]{2}/g) || []] : [t]));
}
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', '的', '了', '与', '和', '或', '在', '是', '一个']);
function meaningful(toks) { return toks.filter((t) => t.length > 1 && !STOP.has(t)); }

/** 打分：精确标题 > token 命中 > 权威字段加成 > 多源 > 位置衰减；惩罚站内回退与过短标题 */
function score(r, qTokens, q) {
  const ql = String(q).toLowerCase();
  const t = String(r.title || '').toLowerCase(), s = String(r.snippet || '').toLowerCase();
  const qt = meaningful(qTokens);
  let sc = 0;
  if (t === ql) sc += 14;
  else if (t.includes(ql) && ql.length >= 2) sc += 8;
  else if (t.startsWith(ql)) sc += 6;
  let hit = 0;
  for (const k of qt) {
    if (t.includes(k)) { sc += 2.4; hit++; }
    else if (s.includes(k)) { sc += 0.8; hit += 0.4; }
  }
  if (qt.length) sc += Math.min(hit / qt.length, 1) * 3; // 覆盖率
  // 类型字段加成（有结构化元数据的结果更可信）
  if (r.author) sc += 0.6;
  if (r.year || r.date) sc += 0.5;
  if (r.cover || r.thumb || r.icon) sc += 0.4;
  if (r.pdf || r.doi) sc += 0.8;
  if (r.version || r.stars || r.downloads) sc += 0.5;
  if (r.venue || r.publisher) sc += 0.4;
  sc += (r.weight ?? 1) * 1.6;
  sc += 3.2 / (1 + (r.rank ?? 0) * 0.45);
  sc += Math.min((r.sources?.length || 1) - 1, 8) * 1.8;
  // 惩罚
  if (r.fallback || r._fallback) sc -= 1.5;
  if ((r.title || '').length < 4) sc -= 2;
  if (/^(untitled|无标题|null|undefined)$/i.test(r.title || '')) sc -= 5;
  // 轻微新鲜度（仅有明确日期时）
  const ts = Date.parse(r.date || '') || (r.year ? Date.parse(String(r.year) + '-07-01') : NaN);
  if (!isNaN(ts)) {
    const ageY = (Date.now() - ts) / (365.25 * 864e5);
    if (ageY >= 0 && ageY < 3) sc += 1.2 - ageY * 0.3;
  }
  return Math.round(sc * 100) / 100;
}
function mergeFields(ex, r) {
  for (const k of ['snippet', 'author', 'year', 'date', 'cover', 'thumb', 'icon', 'publisher', 'format', 'duration', 'channel', 'views', 'version', 'platform', 'downloads', 'stars', 'license', 'lang', 'keywords', 'venue', 'pdf', 'doi', 'price', 'rating', 'pages', 'extra']) {
    if (!ex[k] && r[k]) ex[k] = r[k];
  }
  if ((r.title || '').length > (ex.title || '').length) ex.title = r.title;
  if (r.kind && r.kind !== 'web' && (ex.kind === 'web' || !ex.kind)) ex.kind = r.kind;
}
class Aggregator {
  constructor(query) { this.q = query; this.qt = tokens(query); this.map = new Map(); }
  add(items) {
    const changed = [];
    for (const r of items) {
      const key = normUrl(r.url);
      if (!key || key === '/') continue;
      const ex = this.map.get(key);
      if (ex) {
        if (!ex.sources.includes(r.source)) ex.sources.push(r.source);
        mergeFields(ex, r);
        if ((r.weight ?? 1) > (ex.weight ?? 1)) ex.weight = r.weight;
        ex.score = score(ex, this.qt, this.q); changed.push(ex);
      } else {
        const n = { ...r, key, sources: [r.source] };
        n.score = score(n, this.qt, this.q); this.map.set(key, n); changed.push(n);
      }
    }
    return changed;
  }
  sorted() { return [...this.map.values()].sort((a, b) => b.score - a.score || (a.title || '').localeCompare(b.title || '')); }
}
module.exports = { Aggregator, normUrl, tokens, score, mergeFields };
