const test = require('node:test'); const assert = require('node:assert'); const http = require('http'); const os = require('os'); const path = require('path'); const { EventEmitter } = require('events');
const { LLM } = require('../src/engine/llm'); const { Provider } = require('../src/engine/providers');
const { Copilot, ConversationStore } = require('../src/engine/copilot'); const { Research, credibility } = require('../src/engine/research');
const intent = require('../src/engine/intent'); const { enhance, heuristicQuality } = require('../src/engine/enhance'); const { md } = require('../src/renderer/md.js');
function mock(handler) { return new Promise((r) => { const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => handler(req, res, b ? JSON.parse(b) : {})); }).listen(0, () => r(srv)); }); }
const sse = (res, objs) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const o of objs) res.write(`data: ${JSON.stringify(o)}\n\n`); res.end('data: [DONE]\n\n'); };
const prof = (srv, x = {}) => ({ id: 'p1', name: 'P1', provider: 'custom', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, apiKey: 'k', model: 'm', ...x });
const fakeEngine = (fn) => ({ search(q, tasks) { const e = new EventEmitter(); e.cancel = () => {}; setImmediate(() => e.emit('done', { results: fn(q, tasks), ok: 1, failed: 0 })); return e; }, runSource: async () => [{ title: 'T', url: 'https://x.org/1' }] });

test('OpenAI native tool calls (non-stream + stream) and usage', async () => {
  let n = 0; const srv = await mock((req, res, j) => {
    n++; assert.ok(j.tools?.[0]?.function?.name === 'search');
    if (j.stream) return sse(res, [{ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'search', arguments: '{"que' } }] } }] }, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] } }] }, { usage: { prompt_tokens: 11, completion_tokens: 3 }, choices: [] }]);
    res.end(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search', arguments: '{"query":"x"}' } }] } }], usage: { prompt_tokens: 7, completion_tokens: 2 } }));
  });
  const p = new Provider(prof(srv)); const tools = [{ name: 'search', description: 'd', parameters: { type: 'object', properties: { query: { type: 'string' } } } }];
  const a = await p.complete([{ role: 'user', content: 'hi' }], { tools }); assert.deepStrictEqual(a.toolCalls[0], { id: 'c1', name: 'search', args: { query: 'x' } }); assert.strictEqual(a.usage.in, 7);
  const b = await p.complete([{ role: 'user', content: 'hi' }], { tools, onToken: () => {} }); assert.deepStrictEqual(b.toolCalls[0].args, { query: 'x' }); assert.strictEqual(b.usage.out, 3);
  srv.close();
});
test('Anthropic + Gemini native tool use mapping', async () => {
  let seenA, seenG; const srv = await mock((req, res, j) => {
    if (req.url.startsWith('/v1/messages')) { seenA = j; return res.end(JSON.stringify({ content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', id: 't1', name: 'read_page', input: { n: 2 } }], usage: { input_tokens: 5, output_tokens: 1 } })); }
    seenG = j; res.end(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'search', args: { query: 'q' } } }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }));
  });
  const base = `http://127.0.0.1:${srv.address().port}`; const tools = [{ name: 'read_page', description: 'r', parameters: { type: 'object', properties: { n: { type: 'integer' } } } }];
  const hist = [{ role: 'system', content: 'S' }, { role: 'user', content: 'u' }, { role: 'assistant', content: '', toolCalls: [{ id: 't0', name: 'read_page', args: { n: 1 } }] }, { role: 'tool', toolCallId: 't0', name: 'read_page', content: '{"x":1}' }];
  const a = await new Provider({ provider: 'anthropic', baseUrl: base, apiKey: 'k', model: 'c' }).complete(hist, { tools });
  assert.strictEqual(a.toolCalls[0].name, 'read_page'); assert.strictEqual(seenA.tools[0].input_schema.type, 'object'); assert.strictEqual(seenA.messages[1].content[0].type, 'tool_use'); assert.strictEqual(seenA.messages[2].content[0].type, 'tool_result');
  const g = await new Provider({ provider: 'gemini', baseUrl: base, apiKey: 'k', model: 'g' }).complete(hist, { tools });
  assert.deepStrictEqual(g.toolCalls[0].args, { query: 'q' }); assert.ok(seenG.tools[0].functionDeclarations); assert.ok(seenG.contents[1].parts[0].functionCall); assert.ok(seenG.contents[2].parts[0].functionResponse); assert.strictEqual(g.usage.in, 4);
  srv.close();
});
test('LLM: routing fast/strong, cache, retry on 429, usage, audit, JSON repair', async () => {
  const seen = []; let fails = 1; const srv = await mock((req, res, j) => {
    seen.push(j.model); if (j.model === 'strong' && fails-- > 0) { res.writeHead(429); return res.end('slow down'); }
    const c = j.messages.at(-1).content; res.end(JSON.stringify({ choices: [{ message: { content: c === 'bad' ? 'not json' : c.includes('不是有效 JSON') ? '{"ok":2}' : '{"ok":1}' } }] }));
  });
  const P = [prof(srv, { id: 'f', model: 'fast' }), prof(srv, { id: 's', model: 'strong', price: { in: 1000000, out: 0 } })];
  const usage = { d: {}, save() {} }; const L = new LLM({ profiles: P, activeProfile: 'f', routing: { fast: 'f', strong: 's' }, retries: 2 }, { usage });
  assert.strictEqual(L.profile('intent').model, 'fast'); assert.strictEqual(L.profile('copilot').model, 'strong');
  assert.deepStrictEqual(await L.json('report', [{ role: 'user', content: 'x' }]), { ok: 1 }); // 先 429 再成功
  assert.deepStrictEqual(seen, ['strong', 'strong']);
  await L.json('report', [{ role: 'user', content: 'x' }]); assert.strictEqual(seen.length, 2, 'cached');
  assert.strictEqual(usage.d.total.cacheHits, 1); assert.ok(usage.d.byModel.strong.cost > 0); assert.ok(L.auditLog.length >= 2 && L.auditLog[0].cached);
  assert.deepStrictEqual(await L.json('intent', [{ role: 'user', content: 'bad' }]), { ok: 2 });
  srv.close();
});
test('LLM tools: JSON fallback when native tools unsupported (400)', async () => {
  const srv = await mock((req, res, j) => {
    if (j.tools) { res.writeHead(400); return res.end('tools not supported'); }
    const sys = j.messages[0].content; assert.match(sys, /工具调用协议/);
    const hasResult = j.messages.some((m) => String(m.content).startsWith('TOOL_RESULT'));
    res.end(JSON.stringify({ choices: [{ message: { content: hasResult ? '{"final":"答案 [1]"}' : '{"say":"先搜","tool_calls":[{"name":"search","args":{"query":"q"}}]}' } }] }));
  });
  const L = new LLM({ profiles: [prof(srv)], activeProfile: 'p1', cache: false });
  const tools = [{ name: 'search', description: 's', parameters: { type: 'object', properties: { query: { type: 'string' } } } }];
  const r1 = await L.tools('copilot', [{ role: 'system', content: 'S' }, { role: 'user', content: 'u' }], tools);
  assert.strictEqual(r1.mode, 'json'); assert.strictEqual(r1.toolCalls[0].name, 'search');
  const r2 = await L.tools('copilot', [{ role: 'system', content: 'S' }, { role: 'user', content: 'u' }, { role: 'assistant', content: '先搜', toolCalls: r1.toolCalls }, { role: 'tool', toolCallId: r1.toolCalls[0].id, name: 'search', content: '{}' }], tools);
  assert.strictEqual(r2.text, '答案 [1]'); assert.strictEqual(r2.toolCalls.length, 0);
  srv.close();
});
test('Copilot: tool loop search → filter → compare → final with refs, memory, proposals', async () => {
  const script = [
    { toolCalls: [{ id: '1', name: 'search', args: { query: 'vscode' } }] },
    { toolCalls: [{ id: '2', name: 'filter_results', args: { kind: 'software' } }, { id: '3', name: 'compare', args: { ns: [1, 2] } }, { id: '4', name: 'remember', args: { note: '偏好 Windows' } }] },
    { toolCalls: [{ id: '5', name: 'create_dimension', args: { name: '编辑器', categories: ['software'], source_ids: ['s1'] } }] },
    { text: '首选 VS Code [1]，其次 Zed [2]。' }];
  let i = 0; const llm = { enabled: true, ensure() {}, prompt: () => 'SYS', tools: async (task, msgs, tools, o) => { const s = script[i++]; if (s.text) o.onToken?.(s.text); return { text: s.text || '', toolCalls: s.toolCalls || [], mode: 'native' }; }, complete: async () => ({ text: 'x' }) };
  const engine = fakeEngine(() => [{ key: 'a', title: 'VS Code', url: 'https://code.visualstudio.com', kind: 'software', version: '1.95', score: 3 }, { key: 'b', title: 'Zed', url: 'https://zed.dev', kind: 'software', score: 2 }]);
  const store = { categories: { software: '软件' }, get: (id) => (id === 's1' ? { id: 's1', name: 'S1' } : null), list: () => [] };
  const convs = new ConversationStore(path.join(os.tmpdir(), 'cv-' + Date.now() + '.json'));
  const ev = []; const cp = new Copilot({ llm, engine, store, pickSources: () => [{ id: 's1' }], convs, onEvent: (e) => ev.push(e.type) });
  const r = await cp.run([{ role: 'user', content: '推荐编辑器' }]);
  assert.match(r.text, /首选 VS Code/); assert.strictEqual(r.refs[0].url, 'https://code.visualstudio.com'); assert.strictEqual(r.steps.length, 5);
  assert.ok(r.steps.every((s) => s.ok)); assert.deepStrictEqual(convs.d.memory, ['偏好 Windows']); assert.strictEqual(r.proposals[0].changes.at(-1).op, 'scene');
  assert.ok(ev.includes('tool') && ev.includes('result') && ev.includes('token') && ev.includes('proposal'));
});
test('Copilot: stop via AbortSignal', async () => {
  const ac = new AbortController(); const llm = { enabled: true, ensure() {}, prompt: () => '', tools: async () => { ac.abort(); return { toolCalls: [{ id: 1, name: 'list_sources', args: {} }] }; } };
  const cp = new Copilot({ llm, engine: fakeEngine(() => []), store: { categories: {}, list: () => [] }, pickSources: () => [], convs: { d: { memory: [] } }, signal: ac.signal });
  await assert.rejects(cp.run([{ role: 'user', content: 'x' }]), { name: 'AbortError' });
});
test('ConversationStore: create, title, retry truncate, persist', async () => {
  const f = path.join(os.tmpdir(), 'cv2-' + Date.now() + '.json'); const s = new ConversationStore(f); const c = s.create();
  s.push(c.id, { role: 'user', content: '你好世界' }); s.push(c.id, { role: 'assistant', content: 'hi' }); assert.strictEqual(s.get(c.id).title, '你好世界');
  s.truncateFrom(c.id, 1); assert.strictEqual(s.get(c.id).messages.length, 1); s.flush(); assert.strictEqual(new ConversationStore(f).list()[0].count, 1);
});
test('Research: plan → search → read → facts dedupe → reflect gap-fill → report', async () => {
  const pages = { 'https://www.gov.cn/a': 'A'.repeat(10), 'https://news.example.com/b': 'B' };
  const reader = require('../src/engine/reader'); const orig = reader.read;
  reader.read = async (u) => ({ title: 'T ' + u, text: '固态电池量产时间在 2027 年左右，多家厂商公布了路线图与产能规划。'.repeat(4), resources: [] });
  const calls = []; const llm = { enabled: true, ensure() {}, prompt: (n) => n,
    json: async (task, msgs) => { calls.push(task); if (task === 'planner') return { intent: '了解进展', subquestions: [{ q: '量产', queries: ['固态电池 量产'] }] };
      if (task === 'facts') return { facts: [{ text: '固态电池预计 2027 年量产', confidence: 'high' }], entities: [{ name: 'X 公司', attrs: { 产能: '10GWh' } }] };
      if (task === 'reflect') return { coverage: 60, gaps: ['成本'], queries: ['固态电池 成本'], done: false }; },
    chat: async (task, msgs, o) => { o.onToken?.('## 摘要'); return '## 摘要\n固态电池 [1][2]'; } };
  const seenQ = []; const engine = fakeEngine((q, tasks) => { seenQ.push(tasks.map((t) => t._query)); return Object.keys(pages).map((u, i) => ({ key: u + q, url: u, title: 'R' + i + q, score: 2 - i, sourceName: 'S' })); });
  const r = await new Research({ engine, llm, pickSources: () => [{ id: 's' }], budget: { depth: 2, pages: 6 } }).run('固态电池进展', {});
  reader.read = orig;
  assert.strictEqual(r.intent, '了解进展'); assert.ok(seenQ[1].includes('固态电池 成本'), 'gap-fill query ran');
  assert.ok(r.facts.length >= 1 && r.facts[0].ns.length >= 2, 'facts deduped across sources'); assert.ok(r.cites.find((c) => c.url.includes('gov.cn')).cred.level === 'high');
  assert.ok(calls.includes('reflect')); assert.match(r.report, /摘要/);
});
test('Intent rules: entities & routing', () => {
  const a = intent.ruleIntent('《三体》 刘慈欣 epub', { books: 1, ebooks: 1, software: 1 }); assert.deepStrictEqual(a.categories, ['books', 'ebooks']); assert.ok(a.entities.find((e) => e.type === 'book' && e.value === '三体'));
  const b = intent.ruleIntent('vscode 1.95 下载', { software: 1, apps: 1 }); assert.strictEqual(b.type, 'download'); assert.ok(b.entities.find((e) => e.type === 'version' && e.value === '1.95'));
  assert.strictEqual(intent.ruleIntent('React vs Vue 对比').type, 'compare');
  assert.deepStrictEqual(intent.queriesFor('q', { rewrites: { zh: ['q2'], en: ['qe'] } }), ['q', 'q2', 'qe']);
});
test('Intent with AI merges and validates categories', async () => {
  const llm = { enabled: true, prompt: () => '', json: async () => ({ intent: 'i', type: 'download', categories: ['software', 'bogus'], entities: [{ type: 'software', value: 'Zed' }], rewrites: { en: ['zed editor download'] } }) };
  const r = await intent.analyze('zed 下载', { llm, categories: { software: '软件' } }); assert.deepStrictEqual(r.categories, ['software']); assert.strictEqual(r.by, 'ai'); assert.deepStrictEqual(intent.queriesFor('zed 下载', r), ['zed 下载', 'zed editor download']);
});
test('Enhance: heuristics + AI summaries, best pick, spam sinks', async () => {
  assert.strictEqual(heuristicQuality({ title: 'Office 2024 破解版 激活码', url: 'https://x.com' }).quality, 'spam');
  const L = [{ key: 'a', title: 'Spam 破解版', url: 'http://bad.cn', score: 5, kind: 'software' }, { key: 'b', title: 'VS Code', url: 'https://github.com/microsoft/vscode', score: 3, kind: 'software', version: '1.95' }];
  const rules = await enhance('vscode', L, {}); assert.strictEqual(rules.order[0], 'b'); assert.strictEqual(rules.best[0].key, 'b');
  const llm = { enabled: true, prompt: () => '', json: async () => ({ items: [{ i: 2, summary: '微软开源编辑器', why: '官方仓库', tags: ['开源'], quality: 'good', score: 9 }], best: [{ i: 2, kind: 'software', reason: '官方' }] }) };
  const ai = await enhance('vscode', L, { llm }); assert.strictEqual(ai.items.b.summary, '微软开源编辑器'); assert.strictEqual(ai.items.a.quality, 'spam'); assert.strictEqual(ai.by, 'ai');
});
test('Credibility + markdown tables', () => {
  assert.strictEqual(credibility('https://arxiv.org/abs/1').level, 'high'); assert.strictEqual(credibility('http://spam.example/破解').level, 'low');
  const h = md('| a | b |\n|---|---|\n| 1 [1] | 2 |', [{ title: 't', url: 'https://u' }]); assert.match(h, /<table>/); assert.match(h, /class="cite"/);
});
