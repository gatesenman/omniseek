'use strict';
// AI 来源助手：通过对话管理来源（查看 / 抓取页面 / 生成配置 / 实测 / 提出变更，由用户确认后应用）
const cheerio = require('cheerio');
const { extractJson } = require('./providers');
const { fetchText, UA } = require('./engine');

const SCHEMA = `来源配置 schema（JSON）：
{"id":"小写-短横线","name":"显示名","category":"分类key","kind":"web|wiki|qa|news|book|video|music|image|software|package|code|paper|report|data",
 "type":"json|html|xml|regex","url":"含占位符的 URL：{qe}=URL编码查询 {q}=原始查询 {qj}=JSON转义查询 {page} {limit} {key}",
 "headers":{"可选":"..."}, "request":{"url":"...","method":"POST","body":"{\\"q\\":\\"{qj}\\"}"} (POST 时用 request 代替 url),
 "parse":{"list":"列表：HTML 用 CSS 选择器；JSON 用 JSONPath 如 $.items[*]",
   "fields":{"title":"..","url":"..","snippet":"..", 其它可选类型化字段：author,date,year,cover,thumb,icon,publisher,format,duration,channel,views,version,platform,downloads,stars,license,lang,keywords,venue,pdf,doi,price,rating,extra}}}
字段规则：HTML 用 "css选择器@属性"（无 @ 取文本）或 {"sel","attr","all":true,"regex","fmt"}；JSON 用 "a.b.c"（可用 | 表示备选）或 "$.jsonpath" 或 {"tpl":"https://x.com/{{id}}"}。
fmt 可选：num | duration(秒) | ms | bytes | date | year | cents | https。
也可以只给 {"id","name","category","kind","site":"example.com/path"} 生成站内搜索回退来源（不推荐，优先找原生接口/搜索页）。`;

const SYS = `你是 OmniSeek 万搜的“来源助手”，通过工具帮助用户管理搜索来源：新增、修复解析、批量启用/禁用、生成扩展插件。
每一轮只输出一个 JSON 对象：
{"say":"给用户看的简短说明（中文）","actions":[{"tool":"工具名","args":{...}}]}
可用工具：
- list_sources {"filter":"关键词(可空)","category":"分类(可空)","status":"ok|empty|error|dead|slow|disabled(可空)"}  列出来源（最多 80 条）
- get_source {"id":"..."}  查看完整配置
- fetch_url {"url":"...","method":"GET|POST","body":"(可选)","headers":{}}  抓取页面/接口，返回状态、内容类型、精简内容与 HTML 结构提示（重复元素/候选列表选择器）
- test_source {"config":{...完整来源配置...},"query":"测试词"}  用引擎实测配置，返回结果数与样例
- health {}  返回来源健康统计、慢来源与失效来源列表
- propose {"summary":"变更说明","changes":[{"op":"upsert","source":{...}}, {"op":"disable","ids":[...]}, {"op":"enable","ids":[...]}, {"op":"remove","ids":[...]}, {"op":"category","key":"games","label":"游戏"}, {"op":"extension","filename":"xxx.js|xxx.json","content":"文件内容","description":"说明"}]}
  提出变更后结束本轮，等待用户确认（界面会展示 diff）。
工作方法：
1) 新增/修复前先 list_sources 或 get_source，避免重复；
2) fetch_url 研究目标站点（优先公开 JSON API / 官方搜索页，避免需要登录的接口）；
3) 写出配置后必须 test_source，至少 1 条有效结果（含 title+url），失败则继续修正，最多两轮；
4) 通过后再 propose；变更说明写清验证查询词与结果数；
5) 批量禁用/启用以 health 或 list_sources(status) 确认范围；默认不要启用纯 site: 回退来源；
6) 扩展脚本尽量简单，只用 ctx.fetchText/fetchJson，禁止 child_process/eval/fs 删除。
不需要工具时 actions 为空数组，say 中直接回答。脚本扩展格式：module.exports = { id, name, category, kind, async search(query, ctx) { const {text} = await ctx.fetchText(url); return [{title,url,snippet,...}] } }。
${SCHEMA}`;

function cleanHtml(html) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe,link,meta').remove();
  const counts = {};
  $('body *').each((i, el) => { const c = ($(el).attr('class') || '').trim().split(/\s+/)[0]; if (c) { const k = el.tagName + '.' + c; counts[k] = (counts[k] || 0) + 1; } });
  const repeated = Object.entries(counts).filter(([, n]) => n >= 5 && n <= 60).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k} ×${n}`);
  const title = $('title').text().trim();
  let body = $('body').html() || '';
  body = body.replace(/\s+/g, ' ').replace(/ (style|data-[\w-]+|aria-[\w-]+|role|onclick|width|height)="[^"]*"/g, '');
  return { title, repeated, html: body.slice(0, 7000) };
}

class SourceAgent {
  constructor({ ai, store, engine, healthStore }) { this.ai = ai; this.store = store; this.engine = engine; this.health = healthStore; }

  async tool(name, a = {}) {
    const st = this.store;
    if (name === 'list_sources') {
      const f = String(a.filter || '').toLowerCase();
      let l = st.list().filter((s) => (!f || (s.id + s.name + (s.site || '') + (s.url || '')).toLowerCase().includes(f)) && (!a.category || s.category === a.category));
      if (a.status) l = l.filter((s) => { const h = this.health.get(s.id); if (a.status === 'disabled') return s.enabled === false; if (a.status === 'slow') return (h?.avgMs || 0) > 6000; return (h?.status || s.health?.status) === a.status; });
      return { total: l.length, sources: l.slice(0, 80).map((s) => ({ id: s.id, name: s.name, category: s.category, kind: s.kind, enabled: s.enabled !== false, type: s.plugin ? 'plugin' : s.site ? 'site' : s.type, health: this.health.get(s.id)?.status || s.health?.status, avgMs: this.health.get(s.id)?.avgMs || s.health?.ms })) };
    }
    if (name === 'get_source') { const s = st.get(a.id); if (!s) return { error: '不存在' }; const { health, ...rest } = s; return rest; }
    if (name === 'fetch_url') {
      const t = Date.now();
      const r = await fetch(a.url, { method: a.method || 'GET', body: a.body, headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', ...(a.body ? { 'Content-Type': a.body.trim().startsWith('{') ? 'application/json' : 'application/x-www-form-urlencoded' } : {}), ...(a.headers || {}) }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      const ct = r.headers.get('content-type') || ''; const text = await r.text();
      const out = { status: r.status, finalUrl: r.url, contentType: ct, bytes: text.length, ms: Date.now() - t };
      if (/json/.test(ct) || /^\s*[[{]/.test(text)) out.json = text.slice(0, 7000);
      else if (/html|xml/.test(ct) || /<html/i.test(text)) Object.assign(out, cleanHtml(text));
      else out.text = text.slice(0, 5000);
      return out;
    }
    if (name === 'test_source') {
      const t = Date.now();
      try { const r = await this.engine.runSource(a.config, a.query || 'test'); return { ok: r.length > 0, count: r.length, ms: Date.now() - t, sample: r.slice(0, 3) }; }
      catch (e) { return { ok: false, error: String(e.message).slice(0, 300) }; }
    }
    if (name === 'health') {
      const all = st.list(); const H = (s) => this.health.get(s.id) || s.health || {};
      return { total: all.length, enabled: all.filter((s) => s.enabled !== false).length, byStatus: all.reduce((m, s) => { const k = H(s).status || 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {}),
        slow: all.filter((s) => (H(s).avgMs || H(s).ms || 0) > 6000).slice(0, 40).map((s) => ({ id: s.id, name: s.name, category: s.category, ms: H(s).avgMs || H(s).ms, enabled: s.enabled !== false })),
        dead: all.filter((s) => ['dead', 'error'].includes(H(s).status)).slice(0, 60).map((s) => ({ id: s.id, name: s.name, category: s.category, error: H(s).error || H(s).lastError, enabled: s.enabled !== false })) };
    }
    return { error: '未知工具 ' + name };
  }

  /**
   * 运行一轮对话。history: [{role, content}]（用户/助手可见消息）
   * onStep({type:'say'|'tool'|'result'|'proposal', ...})
   */
  async run(history, onStep, maxSteps = 8) {
    const msgs = [{ role: 'system', content: SYS + `\n当前分类：${JSON.stringify(this.store.categories)}` }, ...history];
    for (let step = 0; step < maxSteps; step++) {
      const raw = await this.ai.chat(msgs, { json: true, temperature: 0.2, task: 'agent', signal: this.signal });
      let j; try { j = extractJson(raw); } catch { onStep({ type: 'say', text: raw }); return { reply: raw }; }
      msgs.push({ role: 'assistant', content: JSON.stringify(j) });
      if (j.say) onStep({ type: 'say', text: j.say });
      const acts = Array.isArray(j.actions) ? j.actions : [];
      const prop = acts.find((x) => x.tool === 'propose');
      if (prop) { const p = this.buildProposal(prop.args || {}); onStep({ type: 'proposal', proposal: p }); return { reply: j.say, proposal: p }; }
      if (!acts.length) return { reply: j.say };
      const results = [];
      for (const a of acts.slice(0, 4)) {
        onStep({ type: 'tool', tool: a.tool, args: a.args });
        let r; try { r = await this.tool(a.tool, a.args); } catch (e) { r = { error: String(e.message) }; }
        onStep({ type: 'result', tool: a.tool, brief: brief(a.tool, r) });
        results.push({ tool: a.tool, result: r });
      }
      msgs.push({ role: 'user', content: 'TOOL_RESULTS:\n' + JSON.stringify(results).slice(0, 24000) });
    }
    onStep({ type: 'say', text: '已达到本轮最大步数，请补充说明后继续。' });
    return {};
  }

  buildProposal(args) {
    const changes = (args.changes || []).map((c) => {
      if (c.op === 'upsert' && c.source) {
        let err = null, src = c.source;
        try { src = require('./sources').validate({ ...c.source }, { strict: true }); } catch (e) { err = e.message; }
        const old = this.store.get(src.id);
        return { ...c, source: src, validationError: err, diff: err ? ['! 校验失败: ' + err] : diff(old ? strip(old) : null, src), isNew: !old };
      }
      if (['disable', 'enable', 'remove'].includes(c.op)) return { ...c, ids: (c.ids || []).filter((id) => this.store.get(id)), names: (c.ids || []).map((id) => this.store.get(id)?.name).filter(Boolean) };
      return c;
    });
    return { id: 'P' + Date.now(), summary: args.summary || '', changes };
  }
}
const strip = (s) => { const { health, builtin, custom, pack, ...r } = s; return r; };
function brief(tool, r) {
  if (r?.error) return '错误：' + r.error;
  if (tool === 'fetch_url') return `HTTP ${r.status} · ${r.contentType?.split(';')[0]} · ${r.bytes} 字节 · ${r.ms}ms`;
  if (tool === 'test_source') return r.ok ? `测试通过：${r.count} 条 · ${r.ms}ms · 例：${r.sample?.[0]?.title || ''}` : `测试失败：${r.error || '0 条结果'}`;
  if (tool === 'list_sources') return `共 ${r.total} 个来源`;
  if (tool === 'health') return `健康统计：${JSON.stringify(r.byStatus)}`;
  return 'OK';
}
// 行级 diff（LCS）
function diff(a, b) {
  const A = a ? JSON.stringify(a, null, 2).split('\n') : [], B = JSON.stringify(b, null, 2).split('\n');
  const n = A.length, m = B.length; const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { out.push(' ' + A[i]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push('-' + A[i++]); else out.push('+' + B[j++]); }
  while (i < n) out.push('-' + A[i++]); while (j < m) out.push('+' + B[j++]);
  return out;
}
module.exports = { SourceAgent, diff, cleanHtml };
