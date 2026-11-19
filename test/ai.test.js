const test = require('node:test'); const assert = require('node:assert'); const http = require('http');
const { AI } = require('../src/engine/ai'); const { Provider } = require('../src/engine/providers'); const { SourceAgent, diff } = require('../src/engine/agent');
function mock(handler) { return new Promise((r) => { const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => handler(req, res, b ? JSON.parse(b) : {})); }).listen(0, () => r(srv)); }); }
const sse = (res, objs) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const o of objs) res.write(`data: ${JSON.stringify(o)}\n\n`); res.end('data: [DONE]\n\n'); };

test('OpenAI kind: models, json plan, streaming digest/answer', async () => {
  const srv = await mock((req, res, j) => {
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }));
    if (j.stream) return sse(res, ['结论', '：好 [1]'].map((t) => ({ choices: [{ delta: { content: t } }] })));
    res.end(JSON.stringify({ choices: [{ message: { content: '<think>x</think>```json\n{"title":"t","dimensions":[{"name":"d","category":"games","query":"q","sourceIds":["bing"]}]}\n```' } }] }));
  });
  const prof = { provider: 'custom', baseUrl: `http://127.0.0.1:${srv.address().port}/v1`, apiKey: 'k', model: 'm' };
  assert.deepStrictEqual(await new Provider(prof).listModels(), ['m1', 'm2']);
  const ai = new AI(prof); assert.ok(ai.enabled);
  assert.strictEqual((await ai.plan('need', {}, [])).dimensions[0].category, 'games');
  let toks = ''; assert.strictEqual(await ai.digest('q', [{ title: 'a', url: 'u', sourceName: 's' }], (t) => (toks += t)), '结论：好 [1]'); assert.strictEqual(toks, '结论：好 [1]');
  assert.strictEqual(await ai.answer('q', [], [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }, { role: 'user', content: 'more?' }], () => {}), '结论：好 [1]');
  srv.close();
});
test('Anthropic native: headers, system split, SSE', async () => {
  let seen;
  const srv = await mock((req, res, j) => {
    if (req.url.startsWith('/v1/models')) return res.end(JSON.stringify({ data: [{ id: 'claude-x' }] }));
    seen = { key: req.headers['x-api-key'], ver: req.headers['anthropic-version'], sys: j.system, roles: j.messages.map((m) => m.role) };
    if (j.stream) return sse(res, [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: '!' } }]);
    res.end(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }));
  });
  const p = new Provider({ provider: 'anthropic', baseUrl: `http://127.0.0.1:${srv.address().port}`, apiKey: 'ak', model: 'claude-x' });
  assert.deepStrictEqual(await p.listModels(), ['claude-x']);
  assert.strictEqual(await p.chat([{ role: 'system', content: 'S' }, { role: 'user', content: 'u' }]), 'OK');
  assert.strictEqual(seen.key, 'ak'); assert.strictEqual(seen.ver, '2023-06-01'); assert.match(JSON.stringify(seen.sys), /S/); assert.deepStrictEqual(seen.roles, ['user']);
  let s = ''; assert.strictEqual(await p.chat([{ role: 'user', content: 'u' }], { onToken: (t) => (s += t) }), 'Hi!'); assert.strictEqual(s, 'Hi!');
  srv.close();
});
test('Gemini native: models + generateContent + stream', async () => {
  let path0;
  const srv = await mock((req, res, j) => {
    if (req.url.startsWith('/v1beta/models?')) return res.end(JSON.stringify({ models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }, { name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }));
    path0 = req.url;
    if (req.url.includes('stream')) return sse(res, [{ candidates: [{ content: { parts: [{ text: 'A' }] } }] }, { candidates: [{ content: { parts: [{ text: 'B' }] } }] }]);
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'G' }] } }] }));
  });
  const p = new Provider({ provider: 'gemini', baseUrl: `http://127.0.0.1:${srv.address().port}`, apiKey: 'gk', model: 'gemini-x' });
  assert.deepStrictEqual(await p.listModels(), ['gemini-x']);
  assert.strictEqual(await p.chat([{ role: 'system', content: 's' }, { role: 'user', content: 'u' }]), 'G'); assert.match(path0, /gemini-x:generateContent/);
  assert.strictEqual(await p.chat([{ role: 'user', content: 'u' }], { onToken: () => {} }), 'AB');
  srv.close();
});
test('AI disabled without key', async () => { assert.strictEqual(new AI({}).enabled, false); assert.throws(() => new AI({}).chat([]), /尚未配置/); });
test('SourceAgent: tool loop -> proposal with diff', async () => {
  const replies = [JSON.stringify({ say: '先测试', actions: [{ tool: 'test_source', args: { config: { id: 'x', name: 'X', type: 'json', url: 'u', parse: { list: '$' } }, query: 'q' } }] }),
    JSON.stringify({ say: '可以', actions: [{ tool: 'propose', args: { summary: '改名', changes: [{ op: 'upsert', source: { id: 'a', name: 'A2', category: 'web', kind: 'web', site: 'example.com' } }, { op: 'disable', ids: ['a', 'zz'] }] } }] })];
  const ai = { chat: async () => replies.shift() };
  const store = { categories: {}, get: (id) => (id === 'a' ? { id: 'a', name: 'A', category: 'web', kind: 'web', site: 'example.com', health: {} } : null), list: () => [] };
  const engine = { runSource: async () => [{ title: 't', url: 'u' }] };
  const steps = []; const r = await new SourceAgent({ ai, store, engine, healthStore: { get: () => null } }).run([{ role: 'user', content: 'hi' }], (s) => steps.push(s.type));
  assert.deepStrictEqual(steps, ['say', 'tool', 'result', 'say', 'proposal']);
  assert.ok(r.proposal.changes[0].diff.some((l) => l.startsWith('+') && l.includes('A2'))); assert.deepStrictEqual(r.proposal.changes[1].ids, ['a']);
  assert.deepStrictEqual(diff({ a: 1 }, { a: 2 }).filter((l) => l[0] !== ' '), ['-  "a": 1', '+  "a": 2']);
});
