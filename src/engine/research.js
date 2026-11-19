'use strict';
// 2.3：深度研究 —— 规划 → 并行检索 → 阅读 → 事实抽取 → 去重 → 反思补缺（循环）→ 结构化报告
const reader = require('./reader');
const { heuristicQuality } = require('./enhance');
const { mapLimit } = require('./deep');

const ACADEMIC = /((^|\.)gov(\.\w\w)?$|(^|\.)edu(\.\w\w)?$|\.ac\.\w+$|arxiv\.org|nature\.com|science\.org|springer|wiley|elsevier|sciencedirect|ieee\.org|acm\.org|nih\.gov|who\.int|cnki|oecd\.org|worldbank\.org|un\.org|stats\.gov)/i;
const MEDIA = /(reuters|bloomberg|apnews|bbc|nytimes|ft\.com|economist|wsj|xinhuanet|people\.com\.cn|cctv|caixin|thepaper|36kr|theverge|wired|arstechnica|techcrunch)/i;
const REF = /(wikipedia\.org|britannica|baike\.baidu|github\.com|docs\.|developer\.|python\.org|mozilla\.org|microsoft\.com)/i;
const UGC = /(zhihu|reddit|v2ex|tieba|weibo|douban\.com\/group|quora|stackexchange|stackoverflow|csdn|jianshu|medium\.com|bilibili|youtube)/i;

function credibility(url, r = {}, support = 1) {
  let h = ''; try { h = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  let s = 50; const why = [];
  if (ACADEMIC.test(h)) { s += 30; why.push('政府/学术'); } else if (MEDIA.test(h)) { s += 18; why.push('主流媒体'); } else if (REF.test(h)) { s += 15; why.push('参考/官方文档'); } else if (UGC.test(h)) { s -= 8; why.push('用户生成内容'); }
  if (/^https:/.test(url)) s += 5; else { s -= 10; why.push('非 HTTPS'); }
  const q = heuristicQuality({ ...r, url }); if (q.quality === 'spam') { s -= 40; why.push('疑似垃圾'); } else if (q.quality === 'low') { s -= 15; why.push(q.flags.join('/')); }
  if (support > 1) { s += Math.min(15, (support - 1) * 5); why.push(`${support} 个来源佐证`); }
  if (r.date && Date.now() - Date.parse(r.date) < 365 * 864e5) { s += 3; why.push('较新'); }
  s = Math.max(0, Math.min(100, s));
  return { score: s, level: s >= 72 ? 'high' : s >= 50 ? 'medium' : 'low', why, host: h };
}

const norm = (t) => String(t).toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const grams = (t) => { const s = norm(t); const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
const jacc = (a, b) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
function dedupeFacts(facts, th = 0.55) {
  const out = [];
  for (const f of facts) {
    const g = grams(f.text); const m = out.find((o) => jacc(o._g, g) >= th);
    if (m) { for (const n of f.ns || [f.n]) if (!m.ns.includes(n)) m.ns.push(n); if (f.confidence === 'high') m.confidence = 'high'; if (f.text.length > m.text.length && f.text.length < 120) m.text = f.text; }
    else out.push({ text: f.text, ns: [...(f.ns || [f.n])], confidence: f.confidence || 'medium', q: f.q, _g: g });
  }
  return out.map(({ _g, ...x }) => x);
}

class Research {
  constructor({ engine, llm, pickSources, onStep, signal, budget = {} }) {
    this.engine = engine; this.llm = llm; this.pick = pickSources; this.step = onStep || (() => {}); this.signal = signal;
    this.b = { depth: 2, pages: 10, queries: 4, perDomain: 2, ...budget };
  }
  ab() { if (this.signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' }); }
  async search(queries, sel) {
    const tasks = []; for (const { q, categories } of queries) { const srcs = this.pick({ ...sel, ...(categories?.length ? { categories } : {}) }); for (const s of srcs) tasks.push({ ...s, _query: q }); }
    if (!tasks.length) return [];
    this.step({ stage: 'search', msg: `并行检索 ${queries.length} 个查询 · ${tasks.length} 个来源任务`, queries: queries.map((x) => x.q) });
    const ev = this.engine.search(queries[0].q, tasks); const kill = () => ev.cancel(); this.signal?.addEventListener('abort', kill, { once: true });
    const d = await new Promise((res) => ev.on('done', res)); this.signal?.removeEventListener('abort', kill); return d.results || [];
  }
  async run(question, sel = {}, onToken) {
    const t0 = Date.now(); const L = this.llm; L.ensure();
    const cats = sel.categoriesMap || {};
    this.step({ stage: 'plan', msg: '规划研究子问题…' });
    const plan = await L.json('planner', [{ role: 'system', content: L.prompt('planner', { categories: JSON.stringify(cats) }) }, { role: 'user', content: question }], { signal: this.signal, temperature: 0.3 });
    const subs = (plan.subquestions || []).filter((s) => s?.q).slice(0, 6);
    this.step({ stage: 'intent', msg: plan.intent || question, subquestions: subs.map((s) => s.q) });
    let queue = [{ q: question }, ...subs.flatMap((s) => (s.queries || [s.q]).slice(0, 2).map((q) => ({ q, categories: (s.categories || []).filter((c) => !Object.keys(cats).length || c in cats), sub: s.q })))].slice(0, this.b.queries + 2);
    const all = new Map(); const read = new Map(); const cites = []; let facts = []; const entities = []; const asked = new Set(); let coverage = 0;
    for (let round = 1; round <= this.b.depth; round++) {
      this.ab(); queue = queue.filter((x) => !asked.has(x.q)); queue.forEach((x) => asked.add(x.q)); if (!queue.length) break;
      const rs = await this.search(queue, sel); for (const r of rs) if (!all.has(r.key)) all.set(r.key, r);
      this.step({ stage: 'round', round, msg: `第 ${round} 轮：累计 ${all.size} 条结果`, count: all.size });
      // 选页：分数高、未读、每域名限额、排除图片音乐与垃圾
      const perDom = {}; for (const c of cites) perDom[c.cred.host] = (perDom[c.cred.host] || 0) + 1;
      const left = this.b.pages - read.size; if (left <= 0) { this.step({ stage: 'warn', msg: '已达到阅读预算' }); break; }
      const cand = [...all.values()].filter((r) => /^https?:/.test(r.url) && !read.has(r.url) && !['image', 'music', 'video'].includes(r.kind) && heuristicQuality(r).quality !== 'spam')
        .map((r) => ({ r, c: credibility(r.url, r, r.sources?.length || 1) })).sort((a, b) => (b.r.score || 0) * (0.5 + b.c.score / 100) - (a.r.score || 0) * (0.5 + a.c.score / 100));
      const pick = []; for (const x of cand) { if (pick.length >= Math.min(left, Math.ceil(this.b.pages / this.b.depth) + 1)) break; if ((perDom[x.c.host] || 0) >= this.b.perDomain) continue; perDom[x.c.host] = (perDom[x.c.host] || 0) + 1; pick.push(x); }
      this.step({ stage: 'read', msg: `阅读 ${pick.length} 个页面（预算剩余 ${left}）` });
      await mapLimit(pick, 4, async ({ r, c }) => {
        this.ab(); read.set(r.url, true);
        let page; try { page = await reader.read(r.url, { timeout: 12000, signal: this.signal }); } catch (e) { this.step({ stage: 'warn', msg: `读取失败：${r.title}（${e.message}）` }); return; }
        if (!page.text || page.text.length < 120) return;
        const n = cites.length + 1; cites.push({ n, title: page.title || r.title, url: r.url, sourceName: r.sourceName, date: r.date || page.date, cred: c, ok: true });
        this.step({ stage: 'page', msg: `[${n}] ${page.title || r.title}`, cred: c.level });
        try {
          const j = await L.json('facts', [{ role: 'system', content: L.prompt('facts', { question }) }, { role: 'user', content: `[${n}] ${page.title}\n${r.url}\n\n${page.text.slice(0, 6000)}` }], { signal: this.signal, temperature: 0.1 });
          for (const f of (j.facts || []).slice(0, 12)) if (f?.text) facts.push({ text: String(f.text).slice(0, 160), n, confidence: f.confidence || 'medium' });
          for (const e of (j.entities || []).slice(0, 6)) if (e?.name) entities.push({ ...e, n });
        } catch (e) { if (e.name === 'AbortError') throw e; this.step({ stage: 'warn', msg: `事实抽取失败 [${n}]：${e.message}` }); }
      });
      facts = dedupeFacts(facts);
      // 佐证提升可信度
      const sup = {}; for (const f of facts) if (f.ns.length > 1) for (const n of f.ns) sup[n] = Math.max(sup[n] || 1, f.ns.length);
      for (const c of cites) if (sup[c.n]) c.cred = credibility(c.url, c, sup[c.n]);
      this.step({ stage: 'facts', msg: `已去重事实 ${facts.length} 条 · 引用 ${cites.length} 个` });
      if (round === this.b.depth) break;
      const ref = await L.json('reflect', [{ role: 'system', content: L.prompt('reflect', { question, maxQueries: this.b.queries }) }, { role: 'user', content: facts.map((f, i) => `${i + 1}. ${f.text} [${f.ns.join(',')}]`).join('\n').slice(0, 9000) || '（暂无事实）' }], { signal: this.signal, temperature: 0.2 });
      coverage = +ref.coverage || coverage;
      this.step({ stage: 'reflect', msg: `覆盖度 ${coverage}%${ref.gaps?.length ? ' · 缺口：' + ref.gaps.slice(0, 3).join('；') : ''}` });
      if (ref.done || coverage >= 85 || !(ref.queries || []).length) break;
      queue = ref.queries.filter((q) => typeof q === 'string').slice(0, this.b.queries).map((q) => ({ q }));
      this.step({ stage: 'followup', msg: '补缺检索：' + queue.map((x) => x.q).join(' / ') });
    }
    this.ab();
    this.step({ stage: 'report', msg: '撰写结构化报告…' });
    const credLine = cites.map((c) => `[${c.n}] ${c.title} — ${c.cred.host} · 可信度 ${c.cred.level}(${c.cred.score})`).join('\n');
    const ents = entities.length ? '\n\n实体与属性（可用于对比表）：\n' + entities.slice(0, 30).map((e) => `${e.name}: ${JSON.stringify(e.attrs || {})} [${e.n}]`).join('\n') : '';
    const report = await L.chat('report', [{ role: 'system', content: L.prompt('report') }, { role: 'user', content: `研究问题：${question}\n意图：${plan.intent || ''}\n${plan.compare ? '对比建议：' + plan.compare + '\n' : ''}\n去重事实（[n] 为引用）：\n${facts.map((f) => `- ${f.text} [${f.ns.join(',')}]（${f.confidence}）`).join('\n').slice(0, 14000)}${ents}\n\n引用与可信度：\n${credLine}` }], { onToken, signal: this.signal });
    return { question, intent: plan.intent, subquestions: subs.map((s) => s.q), report, facts, entities, cites, coverage, rounds: asked.size, read: read.size, results: [...all.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 40), ms: Date.now() - t0, ai: true };
  }
}
module.exports = { Research, credibility, dedupeFacts };
