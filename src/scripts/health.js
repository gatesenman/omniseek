// 来源健康检查：对每个来源发起真实搜索，记录状态 / 耗时 / 结果数 / 类型字段覆盖率 → src/sources/health.json
// 用法：node scripts/health.js [--only id1,id2] [--family stackexchange]
const fs = require('fs'); const path = require('path');
const { SearchEngine } = require('../src/engine/engine');
const lib = require('../src/sources/builtin.json');
const Q = { software: ['vlc', '微信'], apps: ['vlc', '微信'], dev: ['json', 'http'], code: ['editor', 'vue'], ai: ['llama', 'bert'], books: ['三体', 'python'], ebooks: ['python', '论语'], video: ['python', '三体'], music: ['love', '周杰伦'], images: ['cat', 'flower'],
  papers: ['transformer', 'deep learning'], reports: ['climate', '新能源'], gov: ['energy', '人工智能'], data: ['covid', 'population'], news: ['AI', '人工智能'], qa: ['python', 'linux'], social: ['python', 'linux'], websites: ['python', '北京'], web: ['python', 'linux'], games: ['zelda', 'minecraft'], courses: ['python', 'linux'] };
const args = process.argv.slice(2); const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null; const fam = args.includes('--family') ? args[args.indexOf('--family') + 1] : null;
const file = path.join(__dirname, '../src/sources/health.json');
let prev = { sources: {} }; try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
const e = new SearchEngine({ timeout: 15000, concurrency: 48, perHost: 3 }); for (const p of require('../src/engine/builtin-plugins')) e.registerPlugin(p);
const KEYF = { book: ['cover', 'author', 'year'], video: ['thumb', 'duration', 'channel'], software: ['icon', 'version'], package: ['version'], paper: ['author', 'year', 'venue'], report: ['date'], image: ['thumb'], music: ['cover', 'author'], data: ['publisher', 'format'], news: ['date'] };
(async () => {
  let list = lib.sources.filter((s) => !s.requiresKey && (!only || only.has(s.id)) && (!fam || s.family === fam || (fam === 'fallback' && s.site)));
  console.log('checking', list.length);
  const t0 = Date.now(); let done = 0;
  await Promise.all(list.map(async (s) => {
    const qs = Q[s.category] || ['python', 'test']; if (s.region === 'cn') qs.reverse();
    let rec = { status: 'error', count: 0 };
    for (const q of qs) {
      const st = Date.now();
      try {
        const r = await e.runSource(s, q);
        const kf = KEYF[s.kind] || []; const cov = kf.length && r.length ? Math.round(100 * kf.reduce((a, f) => a + r.filter((x) => x[f]).length, 0) / (kf.length * r.length)) : undefined;
        rec = { status: r.length ? 'ok' : 'empty', count: r.length, ms: Date.now() - st, q, fieldCoverage: cov };
        if (r.length) break;
      } catch (err) { rec = { status: 'error', count: 0, ms: Date.now() - st, q, error: String(err.message || err).slice(0, 120) }; }
    }
    rec.checked = new Date().toISOString().slice(0, 16);
    if (rec.status === 'ok' && rec.ms > 8000) rec.slow = true;
    if (rec.status === 'error' && /HTTP (40[134]|410|5\d\d)|ENOTFOUND|fetch failed|JSON|Unexpected/.test(rec.error || '')) rec.status = 'dead';
    prev.sources[s.id] = rec;
    if (++done % 50 === 0) console.log(done, '/', list.length, Math.round((Date.now() - t0) / 1000) + 's');
  }));
  const all = Object.entries(prev.sources).filter(([id]) => lib.sources.some((s) => s.id === id));
  const cnt = (st) => all.filter(([, r]) => r.status === st).length;
  prev.summary = { checked: all.length, ok: cnt('ok'), empty: cnt('empty'), error: cnt('error'), dead: cnt('dead'), at: new Date().toISOString(), network: process.env.HEALTH_NET || 'box (US datacenter)' };
  fs.writeFileSync(file, JSON.stringify(prev, null, 1));
  console.log(prev.summary, Math.round((Date.now() - t0) / 1000) + 's');
})();
