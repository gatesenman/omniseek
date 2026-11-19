const test = require('node:test'); const assert = require('node:assert'); const http = require('http');
const { score, tokens, Aggregator } = require('../src/engine/rank');
const { validate } = require('../src/engine/sources');
const { SearchEngine } = require('../src/engine/engine');
const { Limiter, HostPool } = require('../src/engine/pool');

test('rank: exact title beats partial; fallback penalized', () => {
  const q = '三体'; const qt = tokens(q);
  const a = score({ title: '三体', snippet: '', weight: 1, rank: 0, sources: ['x'] }, qt, q);
  const b = score({ title: '关于三体的讨论贴', snippet: '三体', weight: 1, rank: 0, sources: ['x'] }, qt, q);
  const c = score({ title: '三体', snippet: '', weight: 1, rank: 0, sources: ['x'], fallback: true }, qt, q);
  assert.ok(a > b); assert.ok(a > c);
});

test('rank: aggregator merges fields across sources', () => {
  const agg = new Aggregator('python');
  agg.add([{ title: 'Py', url: 'https://example.com/a', source: 'a', snippet: '' }]);
  agg.add([{ title: 'Python Guide', url: 'https://example.com/a?utm_source=x', source: 'b', snippet: 'learn', author: 'Ada' }]);
  const r = agg.sorted()[0];
  assert.strictEqual(r.sources.length, 2);
  assert.ok(r.snippet === 'learn');
  assert.ok(r.author === 'Ada');
  assert.ok(r.title.includes('Python'));
});

test('validate: strict rejects bad id and accepts site source', () => {
  assert.throws(() => validate({ id: 'bad id', name: 'x', site: 'a.com' }, { strict: true }));
  const s = validate({ id: 'my-src', name: 'X', site: 'example.com' }, { strict: true });
  assert.ok(s.fallback);
  assert.throws(() => validate({ id: 'ok-id', name: 'X', type: 'html', url: 'https://x.com?q={qe}' }, { strict: true })); // missing parse.list
});

test('engine cancel aborts in-flight', async () => {
  const srv = http.createServer((req, res) => { setTimeout(() => { res.end('ok'); }, 2000); }).listen(0);
  const port = srv.address().port;
  const e = new SearchEngine({ timeout: 5000, concurrency: 4 });
  const sources = Array.from({ length: 8 }, (_, i) => ({
    id: 's' + i, name: 'S', category: 'web', kind: 'web', type: 'regex',
    url: `http://127.0.0.1:${port}/`, parse: { list: '.*', fields: { title: { regex: '(.*)', group: 1 }, url: { tpl: 'http://x/' + i } } },
  }));
  // simpler: html that returns empty quickly after cancel
  const ev = e.search('q', sources.map((s) => ({ ...s, type: 'html', parse: { list: 'a', fields: { title: 'a', url: 'a@href' } } })));
  await new Promise((r) => setTimeout(r, 30));
  ev.cancel();
  const done = await new Promise((res) => ev.on('done', res));
  assert.ok(done.cancelled);
  srv.close();
});

test('limiter queue clears on HostPool.clear', async () => {
  const pool = new HostPool(1, 1);
  let started = 0;
  const slow = () => new Promise((r) => setTimeout(r, 500));
  const p1 = pool.run('http://a/', async () => { started++; return slow(); });
  const p2 = pool.run('http://a/', async () => { started++; return 'b'; });
  await new Promise((r) => setTimeout(r, 20));
  pool.clear();
  await assert.rejects(p2, (e) => e.name === 'AbortError');
  await p1.catch(() => {});
});
