'use strict';
// 2.2：AI 深度搜索 —— 规划多轮查询 → 联合搜索 → 意图重排 → 跟进链接阅读正文 → 带引用的报告
const { extractJson } = require('./providers');
const reader = require('./reader');

async function mapLimit(arr, n, fn) { const out = new Array(arr.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => { while (i < arr.length) { const k = i++; try { out[k] = await fn(arr[k], k); } catch (e) { out[k] = { error: e.message }; } } })); return out; }
const short = (r, i) => `[${i}] ${r.title} | ${r.sourceName || ''} | ${r.kind || ''} | ${String(r.snippet || '').slice(0, 140)}`;

class DeepSearch {
  constructor({ engine, ai, pickSources, onStep, signal, opts = {} }) {
    this.engine = engine; this.ai = ai; this.pick = pickSources; this.step = onStep || (() => {}); this.signal = signal;
    this.o = { rounds: 2, read: 6, perRound: 3, ...opts };
  }
  get useAI() { return !!this.ai?.enabled; }
  async ask(sys, user, json = true) { const r = await this.ai.chat([{ role: 'system', content: sys }, { role: 'user', content: user }], { json, temperature: 0.3 }); return json ? extractJson(r) : r; }
  async searchRound(queries, sel) {
    const srcs = this.pick(sel); const tasks = srcs.flatMap((s) => queries.map((q) => ({ ...s, _query: q })));
    this.step({ stage: 'search', msg: `并行检索 ${queries.length} 个查询 × ${srcs.length} 个来源`, queries });
    const ev = this.engine.search(queries[0], tasks);
    const kill = () => ev.cancel(); this.signal?.addEventListener('abort', kill, { once: true });
    const d = await new Promise((res) => ev.on('done', res));
    this.signal?.removeEventListener('abort', kill);
    return d.results || [];
  }
  async run(query, sel = {}, onToken) {
    const t0 = Date.now(); const all = new Map(); const asked = new Set(); let intent = query;
    // 1. 规划
    let queries = [query];
    if (this.useAI) {
      this.step({ stage: 'plan', msg: '分析意图并规划查询…' });
      try { const p = await this.ask('你是深度搜索规划器。分析用户意图，只输出 JSON：{"intent":"一句话说明用户真正想要什么","queries":["3-4 个互补的搜索词，含中英文"]}', query); intent = p.intent || query; queries = [query, ...(p.queries || [])].filter((x, i, a) => typeof x === 'string' && x.trim() && a.indexOf(x) === i).slice(0, this.o.perRound + 1); } catch (e) { this.step({ stage: 'warn', msg: '规划失败，使用原始查询：' + e.message }); }
    } else this.step({ stage: 'plan', msg: '未配置 AI：使用原始查询 + 启发式排序（配置模型后可获得多轮规划与报告）' });
    this.step({ stage: 'intent', msg: intent, queries });
    let ranked = [];
    for (let round = 1; round <= this.o.rounds; round++) {
      if (this.signal?.aborted) break;
      queries.forEach((q) => asked.add(q));
      const rs = await this.searchRound(queries, sel);
      for (const r of rs) if (!all.has(r.key || r.url)) all.set(r.key || r.url, r);
      ranked = [...all.values()].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 60);
      this.step({ stage: 'round', round, msg: `第 ${round} 轮：累计 ${all.size} 条结果`, count: all.size });
      if (!this.useAI) break;
      // 2. 意图重排 + 追问
      try {
        const j = await this.ask(`你是搜索结果排序器。用户意图：${intent}\n给出与意图最相关的结果编号（最多 15 个，按相关度排序），并判断是否需要追加查询来补足信息缺口。只输出 JSON：{"ranking":[编号],"followUp":["追加查询，若已足够则为空数组"],"reason":"简述"}`, ranked.slice(0, 40).map((r, i) => short(r, i + 1)).join('\n'));
        const idx = (j.ranking || []).map((n) => +n - 1).filter((n) => ranked[n]);
        if (idx.length) { const top = idx.map((n) => ranked[n]); ranked = [...top, ...ranked.filter((r) => !top.includes(r))]; top.forEach((r, i) => { r.intentRank = i + 1; }); }
        this.step({ stage: 'rank', msg: j.reason || '已按意图重排' });
        queries = (j.followUp || []).filter((q) => typeof q === 'string' && q.trim() && !asked.has(q)).slice(0, this.o.perRound);
        if (!queries.length) break;
        this.step({ stage: 'followup', msg: '追加查询：' + queries.join(' / '), queries });
      } catch (e) { this.step({ stage: 'warn', msg: '重排失败：' + e.message }); break; }
    }
    // 3. 跟进链接阅读正文
    const toRead = ranked.filter((r) => /^https?:/.test(r.url) && !['image', 'music'].includes(r.kind)).slice(0, this.o.read);
    this.step({ stage: 'read', msg: `阅读前 ${toRead.length} 个页面正文…` });
    const pages = await mapLimit(toRead, 4, async (r, i) => { const p = await reader.read(r.url, { timeout: 12000, signal: this.signal }); this.step({ stage: 'page', msg: `已读 ${i + 1}/${toRead.length}：${p.title || r.title}` }); return p; });
    const cites = toRead.map((r, i) => ({ n: i + 1, title: r.title, url: r.url, sourceName: r.sourceName, excerpt: pages[i]?.text ? pages[i].text.slice(0, 2400) : String(r.snippet || ''), ok: !!pages[i]?.text, resources: pages[i]?.resources?.filter((x) => x.kind !== 'link').slice(0, 5) || [] }));
    // 4. 报告
    let report;
    if (this.useAI && !this.signal?.aborted) {
      this.step({ stage: 'report', msg: '撰写带引用的报告…' });
      const ctx = cites.map((c) => `[${c.n}] ${c.title}\n${c.url}\n${c.excerpt}`).join('\n\n---\n\n');
      const more = ranked.slice(toRead.length, toRead.length + 20).map((r, i) => short(r, toRead.length + i + 1)).join('\n');
      report = await this.ai.chat([{ role: 'system', content: '你是严谨的研究助理。基于给定材料用中文写深度搜索报告（Markdown）：## 结论（2-3 句）、## 详细发现（分主题，每个事实后用 [n] 引用编号）、## 推荐资源（含下载/官方链接时注明）、## 分歧与不确定性、## 下一步建议。只使用材料中的信息，材料不足时明确说明。' }, { role: 'user', content: `问题：${query}\n用户意图：${intent}\n\n已读正文：\n${ctx}\n\n其他相关结果（仅标题摘要）：\n${more}` }], { onToken });
    } else {
      report = `## 深度搜索：${query}\n\n> 未配置 AI 模型，以下为自动抽取的要点（在“设置 → 模型服务”配置后可生成带引用的分析报告）。\n\n` + cites.map((c) => `### [${c.n}] ${c.title}\n${c.sourceName ? '*' + c.sourceName + '* · ' : ''}${c.url}\n\n${c.excerpt.slice(0, 500)}${c.excerpt.length > 500 ? '…' : ''}`).join('\n\n');
    }
    for (let i = cites.length; i < Math.min(ranked.length, cites.length + 20); i++) cites.push({ n: i + 1, title: ranked[i].title, url: ranked[i].url, sourceName: ranked[i].sourceName, ok: false });
    return { query, intent, report, cites, results: ranked, ms: Date.now() - t0, rounds: asked.size, ai: this.useAI };
  }
}
module.exports = { DeepSearch, mapLimit };
