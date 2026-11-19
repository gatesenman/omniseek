const test = require('node:test'); const assert = require('node:assert');
const reader = require('../src/engine/reader');
const { DeepSearch } = require('../src/engine/deep');
const { HealthStore } = require('../src/engine/sources');
const { EventEmitter } = require('events');
const os = require('os'); const path = require('path');

const HTML = `<html><head><title>T</title><meta property="og:site_name" content="Demo"></head><body><nav><a href="/a">nav</a></nav>
<article class="post-content"><h1>标题</h1><p>${'正文内容。'.repeat(60)}</p><p>${'第二段。'.repeat(40)}</p><img src="/x.png">
<a href="https://github.com/o/r/releases/download/v1/app-1.0.exe">Download app-1.0.exe (12.5 MB)</a>
<a href="http://evil.example.net/app-1.0.exe">高速下载</a>
<a href="https://pan.baidu.com/s/abc">百度网盘</a> 提取码: ab12
<a href="https://bit.ly/xyz">下载</a>
<a href="/files/book.epub">book.epub</a><a href="magnet:?xt=urn:btih:abc">磁力</a></article><footer>foot</footer></body></html>`;

test('reader extracts main text and metadata', () => {
  const r = reader.extract(HTML, 'https://demo.com/p/1');
  assert.equal(r.siteName, 'Demo'); assert.ok(r.text.includes('正文内容')); assert.ok(!r.text.includes('foot'));
  assert.ok(r.blocks.some((b) => b.t === 'img' && b.src === 'https://demo.com/x.png'));
});
test('resource detection: formats, size, netdisk code, safety levels', () => {
  const r = reader.extract(HTML, 'https://demo.com/p/1').resources; const by = (s) => r.find((x) => x.url.includes(s));
  assert.equal(by('github.com').format, 'exe'); assert.equal(by('github.com').level, 'ok'); assert.equal(by('github.com').size, '12.5 MB');
  assert.equal(by('evil.example').level, 'danger');
  assert.equal(by('pan.baidu').netdisk, '百度网盘'); assert.equal(by('pan.baidu').code, 'ab12');
  assert.equal(by('bit.ly').level, 'danger');
  assert.equal(by('book.epub').kind, 'ebook'); assert.equal(by('magnet:').kind, 'torrent');
  assert.equal(r.filter((x) => x.mirrorGroup === 'app-1.0.exe').length, 2);
});
test('script-injected content fallback', () => {
  const p = '<p>' + '央视正文。'.repeat(80) + '</p>';
  const r = reader.extract(`<html><body><div>短</div><script>var contentdate = '${p}';</script></body></html>`, 'https://news.cctv.com/x');
  assert.ok(r.text.includes('央视正文'));
});
test('deep search without AI: single round, heuristic report', async () => {
  const engine = { search() { const e = new EventEmitter(); setImmediate(() => e.emit('done', { results: [{ key: 'a', url: 'file:///nope', title: 'A', score: 2, snippet: 'sa', sourceName: 'X' }, { key: 'b', url: 'about:blank', title: 'B', score: 1 }] })); e.cancel = () => {}; return e; } };
  const steps = []; const ds = new DeepSearch({ engine, ai: { enabled: false }, pickSources: () => [{ id: 's' }], onStep: (s) => steps.push(s.stage) });
  const r = await ds.run('q');
  assert.equal(r.ai, false); assert.ok(r.report.includes('深度搜索')); assert.equal(r.results[0].title, 'A'); assert.ok(steps.includes('round'));
});
test('deep search with AI: plan, rerank, follow-up, report', async () => {
  let calls = 0; const seen = [];
  const engine = { search(q, tasks) { seen.push(tasks.map((t) => t._query)); const e = new EventEmitter(); setImmediate(() => e.emit('done', { results: [{ key: q + '1', url: 'about:' + q, title: 'R-' + q, score: 1 }, { key: q + '2', url: 'about:x' + q, title: 'S-' + q, score: 2 }] })); e.cancel = () => {}; return e; } };
  const ai = { enabled: true, async chat(m, o) { calls++; const sys = m[0].content;
    if (sys.includes('规划器')) return '{"intent":"找资料","queries":["q2"]}';
    if (sys.includes('排序器')) return calls < 4 ? '{"ranking":[2,1],"followUp":["q3"],"reason":"r"}' : '{"ranking":[1],"followUp":[]}';
    o.onToken?.('报'); return '## 结论 [1]'; } };
  const r = await new DeepSearch({ engine, ai, pickSources: () => [{ id: 's' }], opts: { rounds: 3 } }).run('q1', {}, () => {});
  assert.equal(r.intent, '找资料'); assert.deepEqual(seen[0], ['q1', 'q2']); assert.deepEqual(seen[1], ['q3']); assert.ok(r.report.startsWith('## 结论')); assert.ok(r.cites.length >= 2);
});
test('health speed stats p50/p95/okRate', () => {
  const h = new HealthStore(path.join(os.tmpdir(), 'os-h-' + Date.now() + '.json'));
  for (const ms of [100, 200, 300, 400, 5000]) h.record('a', { status: 'ok', ms }); h.record('a', { status: 'error', ms: 9000, error: 'x' });
  const s = h.speed([{ id: 'a', name: 'A' }]); assert.equal(s[0].p50, 300); assert.equal(s[0].p95, 5000); assert.equal(s[0].okRate, 83); assert.equal(s[0].samples, undefined);
});
test('new native source cctv-search is in builtin library', () => {
  const b = require('../src/sources/builtin.json'); const s = b.sources.find((x) => x.id === 'cctv-search');
  assert.ok(s && s.type === 'html' && s.region === 'cn');
});
test('reader rejects non-http urls', async () => { await assert.rejects(reader.read('file:///etc/passwd'), /http/); });
