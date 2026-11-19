'use strict';
const fs = require('fs'); const path = require('path');
const builtin = require('../sources/builtin.json');

const KINDS = new Set(['web', 'wiki', 'qa', 'news', 'book', 'video', 'music', 'image', 'software', 'package', 'code', 'paper', 'report', 'data']);
const TYPES = new Set(['json', 'html', 'xml', 'regex', 'jsonp']);

function validate(s, { strict = false } = {}) {
  if (!s || typeof s !== 'object') throw new Error('来源配置无效');
  if (!s.id || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(s.id))) throw new Error('来源 id 须为 1–64 位字母数字/._-');
  if (!s.name || String(s.name).trim().length < 1) throw new Error('来源缺少 name');
  if (!s.url && !s.request && !s.plugin && !s.site) throw new Error(`来源 ${s.id} 缺少 url/request/site/plugin`);
  if (!s.plugin && !s.site && !s.parse?.list) throw new Error(`来源 ${s.id} 缺少 parse.list`);
  if (strict) {
    if (s.kind && !KINDS.has(s.kind)) throw new Error(`未知 kind: ${s.kind}`);
    if (s.type && !TYPES.has(s.type)) throw new Error(`未知 type: ${s.type}`);
    if (s.url && !/^https?:\/\//i.test(s.url) && !/\{q/.test(s.url)) throw new Error('url 须以 http(s):// 开头或含查询占位符');
    if (s.site && /[<>\s]/.test(s.site)) throw new Error('site 域名非法');
    if (s.parse?.fields && typeof s.parse.fields !== 'object') throw new Error('parse.fields 须为对象');
    // 拒绝明显危险的脚本字段
    for (const k of Object.keys(s)) if (/^(eval|script|onload)$/i.test(k)) throw new Error('不允许的字段: ' + k);
  }
  s.category ||= 'web'; s.kind ||= 'web'; s.enabled ??= true;
  if (s.site && !s.url && !s.request) s.fallback = true;
  return s;
}

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, d) => { fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 1)); fs.renameSync(f + '.tmp', f); };

class HealthStore {
  constructor(file) { this.file = file; this.d = readJson(file, {}); this.t = null; }
  get(id) { return this.d[id]; }
  record(id, s) {
    const h = (this.d[id] ||= { fails: 0, runs: 0, avgMs: 0 });
    h.runs++; h.avgMs = Math.round(h.avgMs ? h.avgMs * 0.7 + s.ms * 0.3 : s.ms); h.at = Date.now();
    if (s.status !== 'error' && Number.isFinite(s.ms)) { (h.samples ||= []).push(s.ms); if (h.samples.length > 30) h.samples.shift(); const q = [...h.samples].sort((a, b) => a - b); h.p50 = q[Math.floor(q.length * 0.5)]; h.p95 = q[Math.min(q.length - 1, Math.floor(q.length * 0.95))]; }
    h.okRate = Math.round(((h.okN = (h.okN || 0) + (s.status === 'error' ? 0 : 1)) / h.runs) * 100);
    if (s.status === 'error') {
      h.fails++; h.status = h.fails >= 2 ? 'dead' : 'error'; h.lastError = s.error;
      if (s.http) h.http = s.http;
    } else if (s.status === 'empty') {
      h.fails = Math.max(0, h.fails - 0); // empty 不算致命
      h.status = 'empty';
    } else {
      h.fails = 0; h.status = s.status; delete h.lastError; delete h.http;
    }
    clearTimeout(this.t); this.t = setTimeout(() => writeJson(this.file, this.d), 2000);
    return h;
  }
  reset(id) { if (id) delete this.d[id]; else this.d = {}; writeJson(this.file, this.d); }
  speed(list, n = 20) { // 2.2：按来源速度统计
    return list.map((s) => ({ id: s.id, name: s.name, category: s.category, ...(this.get(s.id) || {}) })).filter((x) => x.runs).map(({ samples, ...x }) => x).sort((a, b) => (a.p50 || a.avgMs) - (b.p50 || b.avgMs)).slice(0, n);
  }
  summary(list) {
    const by = {};
    for (const s of list) {
      const st = this.get(s.id)?.status || s.health?.status || (s.enabled === false ? 'off' : 'unknown');
      by[st] = (by[st] || 0) + 1;
    }
    return by;
  }
}

class SourceStore {
  constructor(dataDir, engine, galleryDir) {
    this.dir = dataDir; this.engine = engine; this.galleryDir = galleryDir;
    this.userFile = path.join(dataDir, 'sources.json');
    this.pluginDir = path.join(dataDir, 'plugins');
    fs.mkdirSync(this.pluginDir, { recursive: true });
    this.load();
  }
  load() {
    this.user = { categories: {}, sources: [], overrides: {}, defaultsApplied: false, ...readJson(this.userFile, {}) };
    this.categories = { ...builtin.categories, ...this.user.categories };
    const map = new Map();
    for (const s of builtin.sources) map.set(s.id, { ...s });
    this.plugins = [];
    for (const f of fs.readdirSync(this.pluginDir)) {
      const fp = path.join(this.pluginDir, f);
      try {
        if (f.endsWith('.json')) {
          const pack = JSON.parse(fs.readFileSync(fp, 'utf8'));
          Object.assign(this.categories, pack.categories || {});
          for (const s of pack.sources || []) map.set(s.id, { ...validate(s), pack: f });
          this.plugins.push({ file: f, kind: 'pack', name: pack.name || f, description: pack.description || '', count: (pack.sources || []).length });
        } else if (f.endsWith('.js')) {
          delete require.cache[require.resolve(fp)];
          const mod = require(fp); const list = Array.isArray(mod) ? mod : [mod];
          for (const p of list) {
            this.engine.registerPlugin(p);
            map.set(p.id, { id: p.id, name: p.name, category: p.category || 'web', kind: p.kind || 'web', plugin: p.id, weight: p.weight, enabled: true, pack: f, description: p.description });
            if (p.categoryLabel) this.categories[p.category] = p.categoryLabel;
          }
          this.plugins.push({ file: f, kind: 'script', name: list.map((p) => p.name).join(', '), description: list[0]?.description || '', count: list.length });
        }
      } catch (e) { this.plugins.push({ file: f, kind: 'error', name: String(e.message), count: 0 }); }
    }
    for (const s of this.user.sources) { try { map.set(s.id, { ...validate({ ...s }), custom: true }); } catch {} }
    for (const [id, o] of Object.entries(this.user.overrides)) if (map.has(id)) {
      const base = map.get(id);
      const merged = { ...base, ...o };
      if (o.vars) merged.vars = { ...(base.vars || {}), ...o.vars };
      map.set(id, merged);
    }
    this.map = map;
  }
  /** 首次运行：禁用失效来源 + 默认关闭站内回退（有原生接口时更干净） */
  applySmartDefaults(force = false) {
    if (this.user.defaultsApplied && !force) return { applied: false };
    let n = 0;
    for (const s of this.map.values()) {
      if (s.custom || s.pack) continue;
      const dead = ['dead', 'error'].includes(s.health?.status);
      const fallback = !!(s.site && !s.url && !s.request && !s.plugin);
      if (dead || fallback) {
        const o = this.user.overrides[s.id] || {};
        if (o.enabled === undefined && s.enabled !== false) {
          this.override(s.id, { enabled: false, autoDisabled: dead, smartDefault: true });
          n++;
        }
      }
    }
    // 提升常用中文/国际原生源权重与启用
    const prefer = ['bilibili', 'youtube', 'douban-book', 'douban-movie', 'juejin', 'csdn', 'zhihu', 'sov2ex', 'github', 'npm', 'pypi', 'arxiv', 'pubmed', 'openalex', 'crossref', 'wikipedia-zh', 'weread', 'steam', 'itunes-app', 'bing', 'ddg'];
    for (const id of prefer) {
      const s = this.map.get(id);
      if (!s) continue;
      if (s.enabled === false && this.user.overrides[id]?.smartDefault) this.override(id, { enabled: true, smartDefault: false });
      else if (s.enabled === false && !this.user.overrides[id]) this.override(id, { enabled: true });
    }
    this.user.defaultsApplied = true;
    this.save();
    return { applied: true, disabled: n };
  }
  save() { writeJson(this.userFile, this.user); this.load(); }
  list() { return [...this.map.values()]; }
  get(id) { return this.map.get(id); }
  override(id, patch) {
    const o = (this.user.overrides[id] ||= {});
    if (patch.vars) { o.vars = { ...(o.vars || {}), ...patch.vars }; delete patch.vars; }
    Object.assign(o, patch);
  }
  setEnabled(id, enabled) { this.override(id, { enabled, autoDisabled: false, smartDefault: false }); this.save(); }
  setMany(ids, enabled, extra = {}) { for (const id of ids) if (this.map.has(id)) this.override(id, { enabled, ...extra }); this.save(); }
  setVars(id, vars) { this.override(id, { vars }); this.save(); }
  upsert(src, { strict = true } = {}) {
    src = validate({ ...src }, { strict });
    delete src.builtin; delete src.health; delete src.rt; delete src.hasParse;
    this.user.sources = this.user.sources.filter((s) => s.id !== src.id);
    this.user.sources.push(src);
    this.save();
    return src;
  }
  remove(id) { this.user.sources = this.user.sources.filter((s) => s.id !== id); delete this.user.overrides[id]; this.save(); }
  addCategory(key, label) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key)) throw new Error('分类 key 非法');
    this.user.categories[key] = label || key;
    this.save();
  }
  gallery() {
    if (!this.galleryDir || !fs.existsSync(this.galleryDir)) return [];
    const idx = readJson(path.join(this.galleryDir, 'index.json'), []);
    const installed = new Set(fs.readdirSync(this.pluginDir));
    return idx.map((g) => ({ ...g, installed: installed.has(g.file) }));
  }
  install(file) { fs.copyFileSync(path.join(this.galleryDir, path.basename(file)), path.join(this.pluginDir, path.basename(file))); this.load(); }
  uninstall(file) { fs.rmSync(path.join(this.pluginDir, path.basename(file)), { force: true }); this.load(); }
  writeExtension(filename, content) {
    const f = path.basename(filename).replace(/[^\w.\-]/g, '_');
    if (!/\.(js|json)$/.test(f)) throw new Error('扩展文件必须是 .js 或 .json');
    if (f.endsWith('.json')) JSON.parse(content);
    if (f.endsWith('.js') && /\b(require\s*\(\s*['"]child_process|process\.exit|eval\s*\(|Function\s*\(|fs\.rmSync|fs\.unlink)/.test(content)) {
      throw new Error('扩展脚本含有不允许的危险调用');
    }
    fs.writeFileSync(path.join(this.pluginDir, f), content);
    this.load();
    return f;
  }
}

class Library {
  constructor(file) { this.file = file; this.d = { collections: [{ id: 'default', name: '默认收藏夹' }], items: [], history: [], saved: [], scenes: [], ...readJson(file, {}) }; }
  save() { writeJson(this.file, this.d); return this.d; }
  addHistory(h) { this.d.history = [h, ...this.d.history.filter((x) => x.q !== h.q)].slice(0, 300); this.save(); }
  fav(item, collection = 'default') { this.d.items = this.d.items.filter((x) => !(x.url === item.url && x.collection === collection)); this.d.items.unshift({ ...item, collection, addedAt: Date.now() }); return this.save(); }
  unfav(url, collection) { this.d.items = this.d.items.filter((x) => !(x.url === url && (!collection || x.collection === collection))); return this.save(); }
  addCollection(name) { const id = 'c' + Date.now(); this.d.collections.push({ id, name }); this.save(); return id; }
  removeCollection(id) { if (id === 'default') return this.d; this.d.collections = this.d.collections.filter((c) => c.id !== id); this.d.items = this.d.items.filter((x) => x.collection !== id); return this.save(); }
  saveSearch(s) { this.d.saved.unshift({ id: 's' + Date.now(), at: Date.now(), ...s }); return this.save(); }
  removeSaved(id) { this.d.saved = this.d.saved.filter((x) => x.id !== id); return this.save(); }
  saveScene(s) { this.d.scenes = this.d.scenes.filter((x) => x.id !== s.id); this.d.scenes.push(s); return this.save(); }
  removeScene(id) { this.d.scenes = this.d.scenes.filter((x) => x.id !== id); return this.save(); }
}
module.exports = { SourceStore, HealthStore, Library, validate, KINDS, TYPES };
