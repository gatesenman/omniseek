// OmniSeek 2.0 来源库生成器 → src/sources/builtin.json
// 原则：优先原生 API / 站内搜索页；同类平台用“家族模板”批量生成（MediaWiki / Discourse / WordPress / CKAN / Dataverse / GitLab / Gitea / StackExchange …）；
// 没有可用接口的平台才使用 site: 回退（标记 fallback）。分片定义见 scripts/sources/*.js
const fs = require('fs'); const path = require('path');
const { S } = require('./sources/lib');
const CATS = { web: '综合网页', websites: '百科/网站', qa: '问答社区', social: '社区/论坛', news: '资讯/新闻', software: '软件下载', apps: '应用商店', dev: '开发/包管理', code: '代码仓库', ai: 'AI 模型/数据',
  books: '图书', ebooks: '电子书', video: '视频/影视', music: '音乐/音频', images: '图片/素材', papers: '论文/学术', reports: '报告/白皮书', data: '开放数据', gov: '政府/政策', games: '游戏', courses: '课程/教程' };
for (const f of fs.readdirSync(path.join(__dirname, 'sources')).filter((f) => /^\d+-.*\.js$/.test(f)).sort()) require('./sources/' + f);
const seen = new Set();
const out = S.filter((s) => { if (seen.has(s.id)) { console.warn('dup', s.id); return false; } seen.add(s.id); return true; }).map((s) => {
  if (s.site && !s.url) { delete s.url; delete s.parse; s.type = 'html'; }
  if (s.parse?.fields) for (const k of Object.keys(s.parse.fields)) if (s.parse.fields[k] === undefined) delete s.parse.fields[k];
  s.builtin = true; return s;
});
let health = {}; try { health = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/sources/health.json'), 'utf8')); } catch {}
for (const s of out) { const h = health.sources?.[s.id]; if (h) { s.health = h; if (h.status === 'dead' && s.enabled) { s.enabled = false; s.autoDisabled = true; } } }
fs.writeFileSync(path.join(__dirname, '../src/sources/builtin.json'), JSON.stringify({ version: 2, categories: CATS, sources: out }));
const by = {}; for (const s of out) by[s.category] = (by[s.category] || 0) + 1;
console.log('sources:', out.length, 'native:', out.filter((s) => !s.site).length, 'fallback:', out.filter((s) => s.site).length, 'enabled:', out.filter((s) => s.enabled).length); console.log(by);
