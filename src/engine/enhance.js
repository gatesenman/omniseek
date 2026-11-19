'use strict';
// 2.3：AI 结果增强 —— 一句话摘要、相关性解释、标签、质量/垃圾检测、AI 重排、最佳推荐
const SPAMWORDS = /(破解版|注册机|激活码|序列号|免激活|无限金币|外挂|彩票|博彩|代孕|贷款秒批|网赚|刷单|成人|av在线|色情|casino|crack(ed)?\b|keygen|serial key|free download full version|torrent download free|porn|xxx)/i;
const SEO_DOMAINS = /(downloadly|softonic|filehippo|uptodown|cnet\.com\/download|getintopc|igetintopc|ocean ?of ?games|apkpure\.\w+\/.*mod|xiazai\w*\.com|downxia|pc6\.com|xiazaiba|onlinedown|duote|crsky|greenxf)/i;
const TRUST = /(\.gov(\.cn)?\/|\.edu(\.cn)?\/|wikipedia\.org|github\.com|arxiv\.org|doi\.org|nature\.com|science\.org|acm\.org|ieee\.org|who\.int|stats\.gov|python\.org|mozilla\.org|microsoft\.com|apple\.com|douban\.com\/subject|openlibrary\.org|gutenberg\.org|archive\.org)/i;

/** 启发式质量（无 AI 也可用） */
function heuristicQuality(r) {
  const t = `${r.title || ''} ${r.snippet || ''}`; const flags = [];
  if (SPAMWORDS.test(t)) flags.push('可疑关键词');
  if (SEO_DOMAINS.test(r.url || '')) flags.push('下载聚合站');
  if ((r.title || '').length > 8 && /(.{2,})\1{2,}/.test(r.title)) flags.push('标题重复堆砌');
  if (/[!！]{3,}|【[^】]*(免费|最新|破解)[^】]*】/.test(t)) flags.push('营销标题');
  if (/^http:\/\//.test(r.url || '')) flags.push('非 HTTPS');
  const trusted = TRUST.test(r.url || '');
  const quality = flags.includes('可疑关键词') ? 'spam' : flags.length >= 2 ? 'low' : trusted ? 'good' : flags.length ? 'low' : 'ok';
  return { quality, flags, trusted };
}

/** 选出最佳推荐（无 AI 时的规则版） */
function heuristicBest(list) {
  const best = []; const pick = (kind, pred, why) => { const c = list.filter(pred).filter((r) => heuristicQuality(r).quality !== 'spam').sort((a, b) => (b.score || 0) * (1 + (b.sources?.length || 1) * 0.15) - (a.score || 0) * (1 + (a.sources?.length || 1) * 0.15))[0]; if (c) best.push({ key: c.key, kind, reason: why(c) }); };
  pick('book', (r) => r.kind === 'book', (r) => `${r.rating ? '评分 ' + r.rating + ' · ' : ''}${r.sources?.length > 1 ? r.sources.length + ' 个来源共同命中' : '相关度最高'}`);
  pick('ebook', (r) => r.kind === 'book' && /(epub|mobi|azw3|pdf)/i.test(`${r.format || ''} ${r.title} ${r.extra || ''}`), (r) => `提供 ${r.format || '电子版'}${r.size ? ' · ' + r.size : ''}`);
  pick('software', (r) => ['software', 'package'].includes(r.kind), (r) => `${r.version ? 'v' + r.version + ' · ' : ''}${TRUST.test(r.url) ? '官方/可信托管' : r.stars ? r.stars + ' 星' : '综合排名最高'}`);
  return best;
}

async function enhance(query, results, { llm, intent, signal, n = 30 } = {}) {
  const L = results.slice(0, n); const out = new Map();
  for (const r of L) { const h = heuristicQuality(r); out.set(r.key, { quality: h.quality, flags: h.flags, trusted: h.trusted }); }
  let best = heuristicBest(L); let by = 'rules';
  if (llm?.enabled) {
    const ctx = L.map((r, i) => `[${i + 1}] ${r.title} | ${r.kind} | ${r.sourceName || ''} | ${(r.url || '').slice(0, 90)} | ${String(r.snippet || '').slice(0, 160)}${r.version ? ' | v' + r.version : ''}${r.format ? ' | ' + r.format : ''}`).join('\n');
    const j = await llm.json('enhance', [{ role: 'system', content: llm.prompt('enhance', { query, intent: intent?.intent || query }) }, { role: 'user', content: ctx }], { signal, temperature: 0.1 });
    for (const it of j.items || []) { const r = L[+it.i - 1]; if (!r) continue; const o = out.get(r.key); Object.assign(o, { summary: String(it.summary || '').slice(0, 80), why: String(it.why || '').slice(0, 60), tags: (it.tags || []).filter((x) => typeof x === 'string').slice(0, 4), aiScore: Math.max(0, Math.min(10, +it.score || 0)) }); if (['good', 'ok', 'low', 'spam'].includes(it.quality)) o.quality = o.quality === 'spam' ? 'spam' : it.quality; }
    const ab = (j.best || []).map((b) => ({ key: L[+b.i - 1]?.key, kind: b.kind || 'other', reason: String(b.reason || '').slice(0, 90) })).filter((b) => b.key && out.get(b.key)?.quality !== 'spam');
    if (ab.length) best = ab; by = 'ai';
  }
  // AI 重排顺序：aiScore 优先，其次原分；spam 沉底
  const qv = { good: 1.15, ok: 1, low: 0.7, spam: 0.2 };
  const order = L.map((r) => ({ key: r.key, s: ((out.get(r.key).aiScore ?? 5) / 5) * (r.score || 1) * qv[out.get(r.key).quality] })).sort((a, b) => b.s - a.s).map((x) => x.key);
  return { by, items: Object.fromEntries(out), best, order };
}
module.exports = { enhance, heuristicQuality, heuristicBest };
