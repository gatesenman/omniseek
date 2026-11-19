const test = require('node:test'); const assert = require('node:assert');
const { SearchEngine } = require('../src/engine/engine');
const { parse } = require('../src/engine/parser');
const { Aggregator, normUrl } = require('../src/engine/rank');
const { Limiter } = require('../src/engine/pool');
const lib = require('../src/sources/builtin.json');
const byId = (id) => lib.sources.find((s) => s.id === id);

test('parser: html css selectors', () => {
  const r = parse({ type: 'html', parse: { list: 'li', fields: { title: 'a', url: 'a@href', snippet: 'p' } } }, '<ul><li><a href="/x">T1</a><p>S</p></li><li><a href="https://b.com/y">T2</a></li></ul>', 'https://a.com/');
  assert.deepStrictEqual(r.map((x) => x.url), ['https://a.com/x', 'https://b.com/y']);
});
test('parser: json path + template', () => {
  const r = parse({ type: 'json', parse: { list: '$.items[*]', fields: { title: 'name', url: { tpl: 'https://x.com/{{name}}' }, author: '$.a[*]' } } }, { items: [{ name: 'n1', a: ['p', 'q'] }] }, '');
  assert.strictEqual(r[0].url, 'https://x.com/n1'); assert.strictEqual(r[0].author, 'p, q');
});
test('parser: regex', () => {
  const r = parse({ type: 'regex', parse: { list: '<a href="(?<u>[^"]+)">(?<t>[^<]+)</a>', fields: { title: 't', url: 'u' } } }, '<a href="https://z.com">Z</a>', '');
  assert.strictEqual(r[0].title, 'Z');
});
test('rank: dedupe across sources', () => {
  const a = new Aggregator('vscode');
  a.add([{ title: 'VSCode', url: 'https://www.code.com/?utm_source=x', source: 's1' }]);
  a.add([{ title: 'VSCode', url: 'https://code.com', source: 's2' }]);
  assert.strictEqual(a.sorted().length, 1); assert.strictEqual(a.sorted()[0].sources.length, 2);
  assert.strictEqual(normUrl('https://www.A.com/b/'), 'a.com/b');
});
test('limiter respects concurrency', async () => {
  const l = new Limiter(5); let cur = 0, peak = 0;
  await Promise.all(Array.from({ length: 1000 }, () => l.run(async () => { cur++; peak = Math.max(peak, cur); await new Promise((r) => setTimeout(r, 1)); cur--; })));
  assert.strictEqual(peak, 5);
});
test('engine: 1000 mock sources fan-out with timeouts', async () => {
  const e = new SearchEngine({ concurrency: 128, timeout: 200 });
  const slow = { id: 'p', search: async (q, c) => { await new Promise((r) => setTimeout(r, Math.random() * 50)); return [{ title: q + Math.random(), url: 'https://m.com/' + Math.random() }]; } };
  e.registerPlugin(slow);
  const srcs = Array.from({ length: 1000 }, (_, i) => ({ id: 's' + i, name: 's' + i, category: 'web', plugin: 'p' }));
  const t = Date.now(); const d = await e.searchAll('q', srcs);
  assert.strictEqual(d.ok, 1000); assert.strictEqual(d.results.length, 1000); assert.ok(Date.now() - t < 3000);
});
test('engine: real sources (network)', { timeout: 60000 }, async () => {
  const e = new SearchEngine({ timeout: 15000 }); for (const p of require('../src/engine/builtin-plugins')) e.registerPlugin(p);
  const ids = ['bing', 'github', 'npm', 'openlibrary', 'wikipedia-zh', 'crossref', 'openalex', 'archive-texts', 'hn', 'bilibili', 'pubmed', 'pypi', 'crates', 'dockerhub', 'ddg', 'mojeek', 'arxiv', 'douban-book', 'gutendex'];
  const d = await e.searchAll('python', ids.map(byId));
  for (const s of d.statuses) console.log(`  ${s.id.padEnd(16)} ${s.status.padEnd(6)} ${s.count ?? ''} ${s.ms}ms ${s.error || ''}`);
  const okCount = d.statuses.filter((s) => s.status === 'ok').length;
  console.log('  ok', okCount, '/', ids.length, 'merged', d.results.length); console.log('  top:', d.results.slice(0, 3).map((r) => r.title + ' ' + r.url));
  assert.ok(okCount >= 8);
});
