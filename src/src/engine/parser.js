'use strict';
const cheerio = require('cheerio');
const { JSONPath } = require('jsonpath-plus');

// URL/请求模板：{q} {qe} {qj} {page} {page0} {offset} {limit} {key} 以及 source.vars 中的任意变量
function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// 结果字段（类型化 schema）
const FIELDS = ['title', 'url', 'snippet', 'author', 'date', 'year', 'cover', 'thumb', 'icon', 'publisher', 'format', 'duration', 'channel',
  'views', 'version', 'platform', 'downloads', 'size', 'license', 'stars', 'lang', 'keywords', 'venue', 'pdf', 'doi', 'price', 'rating', 'pages', 'extra', 'type'];
const TEXT_FIELDS = new Set(['title', 'snippet', 'author', 'publisher', 'channel', 'venue', 'extra', 'keywords']);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', middot: '·', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
function fmtNum(n) { n = +n; if (!Number.isFinite(n)) return ''; if (n >= 1e8) return (n / 1e8).toFixed(1) + '亿'; if (n >= 1e4) return (n / 1e4).toFixed(1) + '万'; return String(Math.round(n)); }
function fmtDur(s) { s = Math.round(+s); if (!Number.isFinite(s) || s <= 0) return ''; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
function fmtBytes(b) { b = +b; if (!Number.isFinite(b)) return ''; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (b >= 1024 && i < 4) { b /= 1024; i++; } return b.toFixed(i ? 1 : 0) + ' ' + u[i]; }
function fmtDate(v) {
  if (v == null || v === '') return '';
  if (/^\d{9,13}$/.test(String(v))) { const n = +v; return new Date(n < 1e12 ? n * 1000 : n).toISOString().slice(0, 10); }
  const s = String(v); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  const d = new Date(s); return isNaN(d) ? s.slice(0, 20) : d.toISOString().slice(0, 10);
}
const FMT = { num: fmtNum, duration: fmtDur, ms: (v) => fmtDur(+v / 1000), bytes: fmtBytes, date: fmtDate, cents: (v) => (Number.isFinite(+v) ? (+v / 100).toFixed(2) : ''), year: (v) => (String(v).match(/\d{4}/) || [''])[0], https: (v) => (String(v).startsWith('//') ? 'https:' + v : String(v).replace(/^http:/, 'https:')) };

function applyPost(val, rule, base, field) {
  if (val == null) return '';
  if (Array.isArray(val)) val = [...new Set(val.filter((x) => x != null && x !== '').map(String))].slice(0, rule.take || 12).join(rule.join || ', ');
  if (typeof val === 'object') val = Object.values(val)[0] ?? '';
  val = String(val);
  if (TEXT_FIELDS.has(field) && rule.html !== true) val = decodeEntities(val.replace(/<[^>]+>/g, ''));
  val = val.replace(/\s+/g, ' ').trim();
  if (rule.regex) { const m = val.match(new RegExp(rule.regex, rule.flags || '')); val = m ? (m[1] ?? m[0]) : ''; }
  if (rule.replace) for (const [a, b] of rule.replace) val = val.replace(new RegExp(a, 'g'), b);
  if (rule.decode) { try { val = decodeURIComponent(val); } catch {} }
  if (rule.fmt && val !== '') val = (FMT[rule.fmt] || ((x) => x))(val);
  if (rule.template && val !== '') val = rule.template.replace(/\{\{value\}\}/g, val);
  if ((rule.absolute || ['url', 'cover', 'thumb', 'icon', 'pdf'].includes(field)) && base && val && !/^(https?:|data:)/.test(val)) { try { val = new URL(val, base).href; } catch {} }
  if (rule.maxLen && val.length > rule.maxLen) val = val.slice(0, rule.maxLen) + '…';
  if (rule.prefix && val) val = rule.prefix + val;
  return val;
}

function getPath(o, k) { if (k === '.') return o; return k.split('.').reduce((x, p) => (x == null ? x : x[p]), o); }

// 字段规则：
//  HTML：字符串 "css选择器@属性"，或 {sel, attr, all, regex, replace, fmt, template, maxLen, const}
//  JSON：字符串 "key.path" 或 "$.jsonpath"，或 {key|path|tpl, ...}；tpl 形如 "https://x/{{id}}"，缺失字段时整个值为空
function getHtmlField($, el, rule, base, field) {
  if (typeof rule === 'string') { const [sel, attr] = rule.split('@'); rule = { sel, attr }; }
  if (rule.const != null) return rule.const;
  const nodes = rule.sel ? $(el).find(rule.sel) : $(el);
  const pick = (n) => (rule.attr ? $(n).attr(rule.attr) : $(n).text());
  let v = rule.all ? nodes.toArray().map(pick) : pick(nodes.first());
  if (rule.attr && !v && rule.fallbackAttr) v = nodes.first().attr(rule.fallbackAttr);
  return applyPost(v, rule, base, field);
}
function getJsonField(item, rule, base, field) {
  if (typeof rule === 'string') rule = rule.startsWith('$') ? { path: rule } : { key: rule };
  if (rule.const != null) return rule.const;
  let v;
  if (rule.tpl) {
    let missing = false;
    v = rule.tpl.replace(/\{\{([\w.\-:]+)\}\}/g, (m, k) => { const x = getPath(item, k); if (x == null || x === '') missing = true; return x == null ? '' : x; });
    if (missing && rule.req !== false) v = '';
  } else if (rule.path) {
    const r = JSONPath({ path: rule.path, json: item, wrap: true });
    v = r.length > 1 ? r : r[0];
  } else if (rule.key) {
    for (const k of rule.key.split('|')) { v = getPath(item, k); if (v != null && v !== '') break; }
  }
  return applyPost(v, rule, base, field);
}

function parse(source, body, base) {
  const p = source.parse || {};
  const type = source.type || 'html';
  const out = [];
  if (type === 'json' || type === 'jsonp') {
    let data = body;
    if (typeof body === 'string') { const s = type === 'jsonp' ? body.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '') : body; data = JSON.parse(s); }
    const items = JSONPath({ path: p.list || '$[*]', json: data, wrap: true });
    for (const it of items) { const r = {}; for (const f of FIELDS) if (p.fields?.[f] != null) r[f] = getJsonField(it, p.fields[f], base, f); out.push(r); }
  } else if (type === 'regex') {
    const re = new RegExp(p.list, 'g' + (p.flags || ''));
    let m;
    while ((m = re.exec(body)) && out.length < 200) {
      const r = {};
      for (const f of FIELDS) { const fr = p.fields?.[f]; if (fr == null) continue; const key = typeof fr === 'object' ? fr.group : fr; r[f] = applyPost(m.groups?.[key] ?? m[key], typeof fr === 'object' ? fr : {}, base, f); }
      out.push(r);
    }
  } else {
    const $ = cheerio.load(body, { xml: type === 'xml' });
    $(p.list).each((i, el) => { const r = {}; for (const f of FIELDS) if (p.fields?.[f] != null) r[f] = getHtmlField($, el, p.fields[f], base, f); out.push(r); });
  }
  let res = out.filter((r) => r.title && r.url).map((r) => {
    try { r.url = new URL(r.url, base).href; } catch {}
    for (const k of Object.keys(r)) if (r[k] === '') delete r[k];
    return r;
  }).filter((r) => /^https?:/.test(r.url));
  for (const r of res) if (r.url && /bing\.com\/ck\/a/.test(r.url)) { const m = r.url.match(/[?&]u=a1([^&]+)/); if (m) { try { r.url = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch {} } }
  for (const f of source.decode || []) for (const r of res) if (r[f]) { try { r[f] = decodeURIComponent(r[f]); } catch {} }
  return res;
}
module.exports = { parse, fill, FIELDS, fmtNum, fmtDur, fmtDate, decodeEntities };
