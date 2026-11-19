'use strict';
// 2.3：万搜 Copilot —— 统一智能体（工具调用：搜索/阅读/运行来源/筛选/比较/意图/来源与维度提案/记忆）
const fs = require('fs'); const path = require('path');
const reader = require('./reader');
const intentMod = require('./intent');
const { validate } = require('./sources');

const P = (props, req = []) => ({ type: 'object', properties: props, required: req });
const TOOLS = [
  { name: 'analyze_intent', description: '分析查询意图：类型、实体（书名/作者/软件/版本等）、推荐分类、中英文改写、研究维度', parameters: P({ query: { type: 'string' } }, ['query']) },
  { name: 'search', description: '联合搜索。可指定分类或来源 id；multi_lang=true 时自动加入英文/中文改写。返回带编号 n 的结果', parameters: P({ query: { type: 'string' }, categories: { type: 'array', items: { type: 'string' } }, source_ids: { type: 'array', items: { type: 'string' } }, multi_lang: { type: 'boolean' }, limit: { type: 'integer' } }, ['query']) },
  { name: 'read_page', description: '以阅读模式抓取网页正文与可下载资源。可传 url 或搜索结果编号 n', parameters: P({ url: { type: 'string' }, n: { type: 'integer' }, max_chars: { type: 'integer' } }) },
  { name: 'run_source', description: '只用某一个来源检索（来源 id 可用 list_sources 查询）', parameters: P({ id: { type: 'string' }, query: { type: 'string' } }, ['id', 'query']) },
  { name: 'filter_results', description: '在本次会话已获得的搜索结果中筛选：类型、关键词、域名、最早年份', parameters: P({ kind: { type: 'string' }, contains: { type: 'string' }, domain: { type: 'string' }, min_year: { type: 'integer' }, limit: { type: 'integer' } }) },
  { name: 'compare', description: '取出若干结果（编号 n）的结构化字段（版本、格式、大小、评分、星标、日期、许可证等）用于对比', parameters: P({ ns: { type: 'array', items: { type: 'integer' } }, aspects: { type: 'array', items: { type: 'string' } } }, ['ns']) },
  { name: 'list_sources', description: '列出来源库中的来源（可按关键词/分类筛选）', parameters: P({ filter: { type: 'string' }, category: { type: 'string' } }) },
  { name: 'create_source', description: '提议新增一个来源配置（会先校验与实测，生成待用户确认的提案）', parameters: P({ source: { type: 'object', description: 'OmniSeek 来源配置 JSON：{id,name,category,kind,type,url,parse:{list,fields}} 或 {id,name,category,kind,site}' }, test_query: { type: 'string' } }, ['source']) },
  { name: 'create_dimension', description: '提议创建一个搜索维度/场景（分类 + 来源集合），生成待用户确认的提案', parameters: P({ name: { type: 'string' }, category: { type: 'string' }, category_label: { type: 'string' }, categories: { type: 'array', items: { type: 'string' } }, source_ids: { type: 'array', items: { type: 'string' } } }, ['name']) },
  { name: 'remember', description: '记住用户的长期偏好（如常用语言、格式偏好、关注领域），以后的对话会用到', parameters: P({ note: { type: 'string' } }, ['note']) },
];

class ConversationStore {
  constructor(file) { this.file = file; try { this.d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.d = { list: [], memory: [] }; } this.d.list ||= []; this.d.memory ||= []; }
  save() { clearTimeout(this.t); this.t = setTimeout(() => { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.d)); } catch {} }, 300); }
  flush() { clearTimeout(this.t); try { fs.writeFileSync(this.file, JSON.stringify(this.d)); } catch {} }
  list() { return this.d.list.map(({ messages, ...c }) => ({ ...c, count: messages.length })).sort((a, b) => b.updated - a.updated); }
  get(id) { return this.d.list.find((c) => c.id === id); }
  create(title = '新对话') { const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title, created: Date.now(), updated: Date.now(), messages: [] }; this.d.list.unshift(c); if (this.d.list.length > 200) this.d.list.length = 200; this.save(); return c; }
  remove(id) { this.d.list = this.d.list.filter((c) => c.id !== id); this.save(); }
  rename(id, title) { const c = this.get(id); if (c) { c.title = String(title).slice(0, 80); this.save(); } return c; }
  push(id, m) { const c = this.get(id); if (!c) return; c.messages.push({ at: Date.now(), ...m }); c.updated = Date.now(); if (c.title === '新对话' && m.role === 'user') c.title = String(m.content).slice(0, 40); this.save(); }
  truncateFrom(id, idx) { const c = this.get(id); if (c) { c.messages = c.messages.slice(0, idx); this.save(); } }
  remember(note) { note = String(note).trim().slice(0, 200); if (note && !this.d.memory.includes(note)) { this.d.memory.push(note); if (this.d.memory.length > 30) this.d.memory.shift(); this.save(); } return this.d.memory; }
  forget(i) { this.d.memory.splice(i, 1); this.save(); return this.d.memory; }
}

class Copilot {
  constructor({ llm, engine, store, health, pickSources, convs, signal, onEvent, maxSteps = 10 }) {
    Object.assign(this, { llm, engine, store, health, pickSources, convs, signal, emit: onEvent || (() => {}), maxSteps });
    this.results = []; this.refs = []; this.proposals = [];
  }
  ref(r) { const i = this.refs.findIndex((x) => x.url === r.url); if (i >= 0) return i + 1; this.refs.push({ title: r.title, url: r.url, sourceName: r.sourceName || r.source || '' }); return this.refs.length; }
  brief(r) { const n = this.ref(r); return { n, title: r.title, url: r.url, source: r.sourceName, kind: r.kind, snippet: String(r.snippet || '').slice(0, 180), ...Object.fromEntries(['author', 'year', 'date', 'version', 'format', 'size', 'stars', 'rating', 'downloads', 'license', 'publisher', 'platform'].filter((k) => r[k]).map((k) => [k, r[k]])) }; }
  async runSearch(tasks, q) {
    const ev = this.engine.search(q, tasks); const kill = () => ev.cancel(); this.signal?.addEventListener('abort', kill, { once: true });
    const d = await new Promise((res) => ev.on('done', res)); this.signal?.removeEventListener('abort', kill);
    return d;
  }
  async tool(name, a = {}) {
    if (name === 'analyze_intent') return intentMod.analyze(String(a.query || ''), { llm: this.llm, categories: this.store.categories, signal: this.signal });
    if (name === 'search') {
      const q = String(a.query || '').trim(); if (!q) return { error: '缺少 query' };
      let qs = [q];
      if (a.multi_lang) { const it = await intentMod.analyze(q, { llm: this.llm, categories: this.store.categories, signal: this.signal }); qs = intentMod.queriesFor(q, it, { max: 3 }); if (!a.categories?.length && it.categories?.length) a.categories = it.categories; }
      const srcs = this.pickSources({ sourceIds: a.source_ids, categories: a.categories?.length ? a.categories : undefined });
      const tasks = qs.length > 1 ? srcs.flatMap((s) => qs.map((x) => ({ ...s, _query: x }))) : srcs;
      this.emit({ type: 'progress', msg: `检索 ${qs.join(' / ')} · ${srcs.length} 个来源` });
      const d = await this.runSearch(tasks, q);
      for (const r of d.results) if (!this.results.some((x) => x.key === r.key)) this.results.push(r);
      const lim = Math.min(20, a.limit || 12);
      return { queries: qs, total: d.results.length, sources_ok: d.ok, sources_failed: d.failed, results: d.results.slice(0, lim).map((r) => this.brief(r)) };
    }
    if (name === 'read_page') {
      const url = a.url || this.refs[(+a.n || 0) - 1]?.url; if (!url) return { error: '需要 url 或有效的 n' };
      const p = await reader.read(url, { signal: this.signal });
      const n = this.ref({ title: p.title, url, sourceName: p.siteName });
      return { n, title: p.title, site: p.siteName, date: p.date, words: p.words, text: String(p.text || '').slice(0, Math.min(12000, a.max_chars || 5000)), resources: (p.resources || []).filter((x) => x.kind !== 'link').slice(0, 8).map((x) => ({ text: x.text, url: x.url, format: x.format, size: x.size, safety: x.level, hints: x.hints })) };
    }
    if (name === 'run_source') {
      const s = this.store.get(a.id); if (!s) return { error: '来源不存在：' + a.id };
      const d = await this.runSearch([s], a.query);
      for (const r of d.results) if (!this.results.some((x) => x.key === r.key)) this.results.push(r);
      return { source: s.name, total: d.results.length, failed: d.failed, results: d.results.slice(0, 12).map((r) => this.brief(r)) };
    }
    if (name === 'filter_results') {
      let L = this.results;
      if (a.kind) L = L.filter((r) => r.kind === a.kind);
      if (a.contains) { const t = String(a.contains).toLowerCase(); L = L.filter((r) => `${r.title} ${r.snippet}`.toLowerCase().includes(t)); }
      if (a.domain) L = L.filter((r) => String(r.url).includes(a.domain));
      if (a.min_year) L = L.filter((r) => +(r.year || String(r.date || '').slice(0, 4)) >= a.min_year);
      return { total: L.length, results: L.slice(0, Math.min(30, a.limit || 12)).map((r) => this.brief(r)) };
    }
    if (name === 'compare') {
      const items = (a.ns || []).slice(0, 8).map((n) => { const ref = this.refs[n - 1]; const r = ref && this.results.find((x) => x.url === ref.url); return r ? this.brief(r) : ref ? { n, ...ref } : null; }).filter(Boolean);
      return { aspects: a.aspects || [], items, hint: '请用 Markdown 表格输出对比，缺失值写“—”。' };
    }
    if (name === 'list_sources') {
      const f = String(a.filter || '').toLowerCase();
      const L = this.store.list().filter((s) => (!f || (s.id + s.name + (s.site || '') + (s.url || '')).toLowerCase().includes(f)) && (!a.category || s.category === a.category));
      return { total: L.length, categories: this.store.categories, sources: L.slice(0, 60).map((s) => ({ id: s.id, name: s.name, category: s.category, kind: s.kind, enabled: s.enabled !== false, health: this.health?.get(s.id)?.status })) };
    }
    if (name === 'create_source') {
      let src; try { src = validate({ ...a.source, id: 'ai-' + String(a.source?.id || 'src').replace(/^ai-/, '').replace(/[^a-z0-9._-]/gi, '-').toLowerCase() }, { strict: true }); } catch (e) { return { error: '配置校验失败：' + e.message }; }
      let test = null; try { const r = await this.engine.runSource(src, a.test_query || 'test', 1, this.signal); test = { ok: r.length > 0, count: r.length, sample: r.slice(0, 2).map((x) => x.title) }; } catch (e) { test = { ok: false, error: e.message }; }
      const p = { id: 'P' + Date.now() + this.proposals.length, summary: `新增来源「${src.name}」` + (test.ok ? `（实测 ${test.count} 条）` : '（实测失败）'), changes: [{ op: 'upsert', source: src, isNew: !this.store.get(src.id), test }] };
      this.proposals.push(p); this.emit({ type: 'proposal', proposal: p });
      return { proposal: p.id, test, note: '已生成提案，等待用户在界面确认' };
    }
    if (name === 'create_dimension') {
      const ids = (a.source_ids || []).filter((id) => this.store.get(id));
      const changes = []; if (a.category && !this.store.categories[a.category]) changes.push({ op: 'category', key: String(a.category).replace(/[^a-z0-9_-]/gi, '').toLowerCase(), label: a.category_label || a.category });
      changes.push({ op: 'scene', scene: { id: 'sc-ai-' + Date.now().toString(36), name: String(a.name).slice(0, 30), icon: 'compass-3-line', categories: [...new Set([...(a.categories || []), ...(a.category ? [a.category] : [])])], sourceIds: ids.length ? ids : undefined, view: 'auto' } });
      const p = { id: 'P' + Date.now() + this.proposals.length, summary: `创建搜索维度「${a.name}」（${ids.length} 个来源）`, changes };
      this.proposals.push(p); this.emit({ type: 'proposal', proposal: p });
      return { proposal: p.id, note: '已生成提案，等待用户确认' };
    }
    if (name === 'remember') return { memory: this.convs.remember(a.note) };
    return { error: '未知工具：' + name };
  }

  /** history: [{role:'user'|'assistant', content}]，返回 {text, refs, steps, proposals} */
  async run(history) {
    const L = this.llm; L.ensure();
    const sys = L.prompt('copilot', { maxSteps: this.maxSteps, memory: (this.convs?.d.memory || []).join('；') || '（无）' }) + `\n当前日期：${new Date().toISOString().slice(0, 10)}\n可用分类：${JSON.stringify(this.store.categories)}`;
    const msgs = [{ role: 'system', content: sys }, ...history.slice(-16).map((m) => ({ role: m.role, content: String(m.content).slice(0, 8000) }))];
    const steps = []; let text = ''; let mode = '';
    for (let i = 0; i < this.maxSteps; i++) {
      if (this.signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
      let streamed = '';
      let r = await L.tools('copilot', msgs, TOOLS, { signal: this.signal, onToken: (t) => { streamed += t; this.emit({ type: 'token', t }); } });
      if (!r.toolCalls?.length && !r.text && !streamed) r = await L.tools('copilot', msgs, TOOLS, { signal: this.signal, noCache: true }); // 部分服务流式不返回工具调用：回退非流式
      mode = r.mode;
      if (!r.toolCalls?.length) { text = r.text || streamed; break; }
      if (streamed) this.emit({ type: 'retract' });
      if (r.text) this.emit({ type: 'think', text: r.text });
      msgs.push({ role: 'assistant', content: r.text || '', toolCalls: r.toolCalls });
      for (const c of r.toolCalls.slice(0, 5)) {
        const st = { tool: c.name, args: c.args, at: Date.now() }; steps.push(st); this.emit({ type: 'tool', ...st });
        let out; try { out = await this.tool(c.name, c.args || {}); } catch (e) { if (e.name === 'AbortError') throw e; out = { error: String(e.message) }; }
        st.ms = Date.now() - st.at; st.brief = brief(c.name, out); st.ok = !out?.error; this.emit({ type: 'result', tool: c.name, brief: st.brief, ok: st.ok, ms: st.ms });
        msgs.push({ role: 'tool', toolCallId: c.id, name: c.name, content: JSON.stringify(out).slice(0, 9000) });
      }
      if (i === this.maxSteps - 1) { const f = await L.complete('copilot', [...msgs, { role: 'user', content: '工具调用次数已用完，请基于已有信息直接给出最终回答。' }], { signal: this.signal, onToken: (t) => this.emit({ type: 'token', t }) }); text = f.text; }
    }
    return { text, refs: this.refs, steps, proposals: this.proposals, mode };
  }
}
function brief(tool, r) {
  if (r?.error) return '错误：' + r.error;
  if (tool === 'search' || tool === 'run_source') return `${r.total} 条结果${r.queries?.length > 1 ? ' · 查询 ' + r.queries.join(' / ') : ''}${r.results?.[0] ? ' · 例：' + r.results[0].title : ''}`;
  if (tool === 'read_page') return `已读 [${r.n}] ${r.title || ''} · ${r.words || 0} 字${r.resources?.length ? ' · ' + r.resources.length + ' 个下载资源' : ''}`;
  if (tool === 'analyze_intent') return `${r.type} · 分类 ${(r.categories || []).join(',') || '—'} · 实体 ${(r.entities || []).map((e) => e.value).join(',') || '—'}`;
  if (tool === 'filter_results') return `筛出 ${r.total} 条`;
  if (tool === 'compare') return `对比 ${r.items?.length || 0} 项`;
  if (tool === 'list_sources') return `共 ${r.total} 个来源`;
  if (tool === 'create_source' || tool === 'create_dimension') return '已生成待确认提案';
  if (tool === 'remember') return '已记住';
  return 'OK';
}
module.exports = { Copilot, ConversationStore, TOOLS };
