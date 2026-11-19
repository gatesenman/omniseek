'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme, Tray, Menu, globalShortcut, nativeImage, clipboard, safeStorage } = require('electron');
const path = require('path'); const fs = require('fs'); require('events').setMaxListeners(200);
const { SearchEngine } = require('../engine/engine');
const { SourceStore, HealthStore, Library } = require('../engine/sources');
const { AI } = require('../engine/ai');
const { SourceAgent } = require('../engine/agent');
const { PRESETS, Provider } = require('../engine/providers');
const builtinPlugins = require('../engine/builtin-plugins');
const exporter = require('./export');
const reader = require('../engine/reader');
const { DeepSearch } = require('../engine/deep');
const { LLM } = require('../engine/llm');
const { PROMPTS } = require('../engine/prompts');
const intentMod = require('../engine/intent');
const { enhance } = require('../engine/enhance');
const { Research } = require('../engine/research');
const { Copilot, ConversationStore } = require('../engine/copilot');

// ---------- 2.2：错误日志 ----------
const logFile = () => path.join(app.getPath('userData'), 'logs', 'error.log');
function logError(scope, err) {
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    const line = JSON.stringify({ at: new Date().toISOString(), scope, msg: String(err?.message || err).slice(0, 2000), stack: String(err?.stack || '').split('\n').slice(0, 8).join('\n') }) + '\n';
    fs.appendFileSync(logFile(), line);
    const st = fs.statSync(logFile()); if (st.size > 2e6) { const t = fs.readFileSync(logFile(), 'utf8'); fs.writeFileSync(logFile(), t.slice(-1e6)); }
  } catch {}
}
process.on('uncaughtException', (e) => { logError('main.uncaught', e); console.error(e); });
process.on('unhandledRejection', (e) => { logError('main.rejection', e); });
const readLogs = (n = 300) => { try { return fs.readFileSync(logFile(), 'utf8').trim().split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch { return { msg: l }; } }).reverse(); } catch { return []; } };
const cmpVer = (a, b) => { const x = String(a).split(/[.-]/).map((n) => parseInt(n) || 0), y = String(b).split(/[.-]/).map((n) => parseInt(n) || 0); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

if (process.env.OMNISEEK_USERDATA) app.setPath('userData', process.env.OMNISEEK_USERDATA);
if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('app.omniseek.desktop');
let win, quick, tray, store, engine, settings, health, lib;
const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const DEFAULTS = { concurrency: 128, perHost: 4, timeout: 12000, maxPerSource: 20, retries: 2, theme: 'system', lang: 'zh', siteEngine: 'bing',
  profiles: [], activeProfile: '', autoExpand: false, autoDigest: false, answerMode: false, view: 'auto', hotkey: 'Alt+Space', closeToTray: true, autoDisable: true, scene: '', onboarded: false, preferNative: true, updateFeed: '', autoUpdateCheck: true, suggestOnline: true, previewInApp: true, groupByDomain: false,
  aiRouting: { fast: '', strong: '' }, aiCache: true, aiCacheTtl: 60, aiRetries: 2, aiTimeout: 120000, aiToolMode: 'auto', aiAudit: true, prompts: {},
  smartRoute: true, aiIntent: true, multiLang: true, aiEnhance: false, autoRepairHint: true, researchDepth: 2, researchPages: 10, copilotSteps: 10 };
function loadSettings() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch {}
  settings = { ...DEFAULTS, ...s };
  if (s.ai && !s.profiles?.length) { // v1 迁移
    if (s.ai.apiKey || /localhost/.test(s.ai.baseUrl || '')) { settings.profiles = [{ id: 'p1', name: '迁移的配置', provider: 'custom', kind: 'openai', ...s.ai }]; settings.activeProfile = 'p1'; }
    delete settings.ai;
  }
  if (Array.isArray(settings.history)) delete settings.history;
  for (const p of settings.profiles || []) if (p.apiKeyEnc) { try { p.apiKey = safeStorage.decryptString(Buffer.from(p.apiKeyEnc, 'base64')); } catch { p.apiKey = ''; p.keyError = '无法解密（可能来自另一台电脑或另一用户），请重新填写'; } delete p.apiKeyEnc; }
}
const canEncrypt = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
function settingsForDisk() {
  const enc = canEncrypt();
  return { ...settings, hotkeyActive: undefined, profiles: (settings.profiles || []).map(({ keyError, ...p }) => { if (p.apiKey && enc) { const { apiKey, ...r } = p; return { ...r, apiKeyEnc: safeStorage.encryptString(apiKey).toString('base64') }; } return p; }) };
}
// ---------- 2.3 模型层 ----------
const llmHooks = { cache: new Map(), auditLog: [], noNativeTools: new Set(), usage: null };
let llm = null;
function buildLLM() {
  if (!llmHooks.usage) { const f = path.join(dataDir(), 'ai-usage.json'); let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { d = { total: {}, byModel: {}, byTask: {}, days: {} }; } let t; llmHooks.usage = { d, save() { clearTimeout(t); t = setTimeout(() => { try { fs.writeFileSync(f, JSON.stringify(this.d)); } catch {} }, 1000); } }; }
  llm = new LLM({ profiles: settings.profiles, activeProfile: settings.activeProfile, routing: settings.aiRouting || {}, cache: settings.aiCache !== false, cacheTtlMin: +settings.aiCacheTtl || 60, retries: Number.isFinite(+settings.aiRetries) ? +settings.aiRetries : 2, timeoutMs: +settings.aiTimeout || 120000, toolMode: settings.aiToolMode || 'auto', prompts: settings.prompts || {}, audit: settings.aiAudit !== false }, llmHooks);
  return llm;
}
function applySettings() {
  fs.writeFileSync(settingsFile(), JSON.stringify(settingsForDisk(), null, 2)); buildLLM();
  Object.assign(engine.opts, { concurrency: +settings.concurrency, perHost: +settings.perHost, timeout: +settings.timeout, maxPerSource: +settings.maxPerSource, siteEngine: settings.siteEngine, retries: +settings.retries || 2 });
  nativeTheme.themeSource = settings.theme; registerHotkey();
}
const profile = (id) => settings.profiles.find((p) => p.id === (id || settings.activeProfile)) || settings.profiles[0];
const ai = () => new AI(llm || buildLLM());
const send = (ch, d, w = win) => { if (w && !w.isDestroyed()) w.webContents.send(ch, d); };
const assets = (...f) => path.join(__dirname, '../assets', ...f);
const appIcon = () => process.platform === 'win32' && fs.existsSync(assets('icon.ico')) ? assets('icon.ico') : assets('icon.png');
const trayIcon = () => {
  if (process.platform === 'win32') {
    const p16 = assets('tray16.png');
    if (fs.existsSync(p16)) return p16;
  }
  return assets('tray.png');
};
const webPrefs = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false };

const winStateFile = () => path.join(dataDir(), 'window-state.json');
function loadWinState() {
  try {
    const st = JSON.parse(fs.readFileSync(winStateFile(), 'utf8'));
    const { screen } = require('electron');
    const ok = screen.getAllDisplays().some((d) => { const a = d.workArea; return st.x >= a.x - 50 && st.y >= a.y - 50 && st.x + 200 <= a.x + a.width && st.y + 100 <= a.y + a.height; });
    return ok ? st : { width: st.width, height: st.height, maximized: st.maximized };
  } catch { return {}; }
}
function saveWinState() { try { if (!win || win.isDestroyed()) return; const b = win.getNormalBounds(); fs.writeFileSync(winStateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch {} }
function createWindow() {
  const ws = loadWinState();
  win = new BrowserWindow({ width: ws.width || 1400, height: ws.height || 880, ...(Number.isFinite(ws.x) ? { x: ws.x, y: ws.y } : {}), minWidth: 1000, minHeight: 620, title: 'OmniSeek 万搜', icon: appIcon(), backgroundColor: '#1b1c1f', show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#888', height: 40 }, webPreferences: webPrefs });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => { if (ws.maximized) win.maximize(); win.show(); });
  let wt; const sv = () => { clearTimeout(wt); wt = setTimeout(saveWinState, 400); };
  win.on('resize', sv); win.on('move', sv); win.on('maximize', sv); win.on('unmaximize', sv);
  win.webContents.on('render-process-gone', (e, d) => logError('renderer.gone', new Error(d.reason + ' exit=' + d.exitCode)));
  win.webContents.on('console-message', (e, lvl, msg, line, src) => { if (lvl >= 3) logError('renderer', new Error(msg + ' @' + String(src).split('/').pop() + ':' + line)); });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', (e) => { saveWinState(); if (settings.closeToTray && !app.isQuitting && tray) { e.preventDefault(); win.hide(); } });
}
function showMain(q) { if (!win || win.isDestroyed()) createWindow(); win.show(); win.focus(); if (q) send('nav', { page: 'search', q }); }
function createQuick() {
  quick = new BrowserWindow({ width: 720, height: 460, frame: false, resizable: false, show: false, skipTaskbar: true, alwaysOnTop: true, transparent: true, backgroundColor: '#00000000', webPreferences: webPrefs });
  quick.loadFile(path.join(__dirname, '../renderer/quick.html'));
  quick.on('blur', () => quick.hide());
  quick.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function toggleQuick() { if (!quick || quick.isDestroyed()) createQuick(); if (quick.isVisible()) return quick.hide(); quick.center(); quick.show(); quick.focus(); send('quick:focus', {}, quick); }
let hotkeyNow = '';
function registerHotkey() {
  if (hotkeyNow === settings.hotkey) return;
  if (hotkeyNow) globalShortcut.unregister(hotkeyNow);
  hotkeyNow = '';
  for (const k of [settings.hotkey, 'Alt+Shift+Space', 'CommandOrControl+Shift+K']) { try { if (k && globalShortcut.register(k, toggleQuick)) { hotkeyNow = k; break; } } catch {} }
  settings.hotkeyActive = hotkeyNow;
}
function createTray() {
  try {
    tray = new Tray(nativeImage.createFromPath(trayIcon()));
    tray.setToolTip('OmniSeek 万搜');
    const m = () => Menu.buildFromTemplate([
      { label: '打开主窗口', click: () => showMain() }, { label: `快速搜索 (${hotkeyNow || '未注册'})`, click: toggleQuick }, { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }]);
    tray.setContextMenu(m()); tray.on('click', () => showMain()); tray.on('right-click', () => tray.setContextMenu(m()));
  } catch (e) { tray = null; }
}

// ---------------- 搜索 ----------------
const searches = new Map();
function pickSources({ sourceIds, category, categories, filters }) {
  if (sourceIds?.length) return sourceIds.map((id) => store.get(id)).filter(Boolean);
  const cats = categories?.length ? new Set(categories) : category && category !== 'all' ? new Set([category]) : null;
  const nativeOnly = filters?.nativeOnly || (settings.preferNative && !filters?.includeFallback);
  return store.list().filter((s) => s.enabled !== false && (!cats || cats.has(s.category))
    && (!filters?.region || filters.region === 'all' || (filters.region === 'cn' ? s.region === 'cn' : s.region !== 'cn'))
    && (!filters?.kinds?.length || filters.kinds.includes(s.kind))
    && (!nativeOnly || !(s.site && !s.url && !s.request && !s.plugin))
    && (filters?.includeDead || !['dead'].includes(health.get(s.id)?.status)));
}
function recordHealth(s) {
  const h = health.record(s.id, s);
  if (settings.autoDisable && h.status === 'dead' && h.fails >= 3) { const src = store.get(s.id); if (src && src.enabled !== false) { store.override(s.id, { enabled: false, autoDisabled: true }); store.save(); send('notice', { type: 'autoDisabled', id: s.id, name: src.name, error: h.lastError, repairable: settings.autoRepairHint !== false && ai().enabled }); } }
}
async function startSearch({ sid, query, expand, queries, smart, ...sel }, target = win) {
  let qs = queries?.length ? queries : [query];
  if (smart && settings.smartRoute !== false && !queries) {
    const it = settings.aiIntent !== false && ai().enabled ? await intentMod.analyze(query, { llm, categories: store.categories }).catch(() => intentMod.ruleIntent(query, store.categories)) : intentMod.ruleIntent(query, store.categories);
    const free = !sel.category && !sel.categories?.length && !sel.sourceIds?.length;
    if (free && it.categories.length) sel.categories = [...new Set([...it.categories, 'web', 'wiki'].filter((c) => store.categories[c]))];
    if (settings.multiLang !== false) qs = intentMod.queriesFor(query, it, { max: 3 });
    send('search:event', { sid, type: 'intent', data: { ...it, applied: free ? sel.categories : null, queries: qs } }, target);
  }
  const srcs = pickSources(sel);
  if (expand && ai().enabled && !queries) { try { qs = [query, ...(await ai().expand(query)).slice(0, 3)]; send('search:event', { sid, type: 'expanded', data: qs }, target); } catch (err) { send('search:event', { sid, type: 'notice', data: '查询扩展失败：' + err.message }, target); } }
  const tasks = qs.length === 1 ? srcs : srcs.flatMap((s) => qs.map((q) => ({ ...s, _query: q })));
  const ev = engine.search(query, tasks, { page: sel.page || 1 });
  const rec = { ev, query, results: [] }; searches.set(sid, rec);
  if (searches.size > 30) searches.delete(searches.keys().next().value);
  send('search:event', { sid, type: 'start', data: { total: tasks.length, sources: srcs.length, queries: qs } }, target);
  let buf = [], timer = null;
  const flush = () => { timer = null; if (buf.length) { send('search:event', { sid, type: 'results', data: buf }, target); buf = []; } };
  ev.on('results', (r) => { buf.push(...r); if (!timer) timer = setTimeout(flush, 120); });
  ev.on('source', (s) => { recordHealth(s); send('search:event', { sid, type: 'source', data: s }, target); });
  ev.on('done', (d) => { flush(); rec.results = d.results; send('search:event', { sid, type: 'done', data: { total: d.total, ok: d.ok, failed: d.failed, ms: d.ms } }, target); });
  if (!sel.noHistory) lib.addHistory({ q: query, at: Date.now(), category: sel.category, scene: sel.scene });
  return { total: tasks.length };
}

// 2.2：更新检查 —— 读取本地/内网版本文件（latest.json：{version, notes, installer}）
const defaultFeed = () => path.join(app.getPath('home'), 'GrokBot-Apps', 'OmniSeek', 'latest.json');
let lastUpdate = null;
async function checkUpdate() {
  const feed = settings.updateFeed || defaultFeed(); const cur = app.getVersion();
  try {
    let txt;
    if (/^https?:/i.test(feed)) { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 5000); txt = await (await fetch(feed, { signal: ac.signal })).text(); clearTimeout(t); }
    else { if (!fs.existsSync(feed)) return { ok: true, current: cur, latest: cur, newer: false, feed, note: '未找到版本文件' }; txt = fs.readFileSync(feed, 'utf8').replace(/^\uFEFF/, ''); }
    const j = JSON.parse(txt); const newer = cmpVer(j.version, cur) > 0;
    let installer = j.installer || ''; if (installer && !/^https?:/i.test(installer) && !path.isAbsolute(installer) && !/^https?:/i.test(feed)) installer = path.join(path.dirname(feed), installer);
    return { ok: true, current: cur, latest: j.version, newer, notes: j.notes || '', installer, feed };
  } catch (e) { return { ok: false, current: cur, feed, error: e.message }; }
}
const srcSummary = (s) => { const { parse, request, ...r } = s; const h = health.get(s.id); return { ...r, hasParse: !!parse, rt: h ? { status: h.status, avgMs: h.avgMs, fails: h.fails, lastError: h.lastError, at: h.at } : null }; };

app.whenReady().then(() => {
  loadSettings(); buildLLM();
  engine = new SearchEngine({});
  for (const p of builtinPlugins) engine.registerPlugin(p);
  const galleryDir = path.join(__dirname, '../gallery');
  store = new SourceStore(dataDir(), engine, galleryDir);
  health = new HealthStore(path.join(dataDir(), 'health-runtime.json'));
  lib = new Library(path.join(dataDir(), 'library.json'));
  try { const r = store.applySmartDefaults(); if (r.applied) console.log('[OmniSeek] smart defaults: disabled', r.disabled, 'fallback/dead sources'); } catch (e) { console.warn('smart defaults', e.message); }
  const rd = path.join(store.pluginDir, 'README.txt');
  if (!fs.existsSync(rd)) fs.writeFileSync(rd, '扩展目录：把来源包 (*.json) 或脚本扩展 (*.js) 放到这里，然后在“扩展”页点击“重新加载”。');
  const H = (ch, fn) => ipcMain.handle(ch, (e, ...a) => fn(...a, e));

  H('settings:get', () => ({ ...settings, dataDir: dataDir(), version: app.getVersion() }));
  H('settings:set', (s) => { settings = { ...settings, ...s }; applySettings(); return settings; });
  H('providers:presets', () => PRESETS);
  H('providers:models', async (p) => { try { return { ok: true, models: await new Provider(p).listModels() }; } catch (e) { return { ok: false, error: e.message }; } });
  H('providers:test', async (p) => { const t = Date.now(); try { const r = await new Provider(p).chat([{ role: 'user', content: 'Reply with exactly: OK' }], { temperature: 0 }); return { ok: true, text: String(r).slice(0, 200), ms: Date.now() - t }; } catch (e) { return { ok: false, error: e.message }; } });

  H('sources:list', () => ({ categories: store.categories, sources: store.list().map(srcSummary) }));
  H('sources:get', (id) => store.get(id));
  H('sources:toggle', (id, en) => store.setEnabled(id, en));
  H('sources:setMany', (ids, en) => store.setMany(ids, en));
  H('sources:toggleCategory', (cat, en) => store.setMany(store.list().filter((s) => s.category === cat).map((s) => s.id), en));
  H('sources:setVars', (id, v) => store.setVars(id, v));
  H('sources:upsert', (s) => store.upsert(s, { strict: true }));
  H('sources:applyDefaults', () => store.applySmartDefaults(true));
  H('sources:remove', (id) => store.remove(id));
  H('sources:addCategory', (k, l) => store.addCategory(k, l));
  H('sources:test', async (src, q) => { const t = Date.now(); try { const r = await engine.runSource(src, q || 'test'); return { ok: true, ms: Date.now() - t, results: r.slice(0, 10) }; } catch (err) { return { ok: false, error: String(err.message), ms: Date.now() - t } } });
  // 健康检查（应用内）
  let hcRun = null;
  H('health:run', async ({ ids, query } = {}) => {
    if (hcRun) return { busy: true };
    const list = (ids?.length ? ids.map((id) => store.get(id)).filter(Boolean) : store.list());
    const Q = { books: '三体', ebooks: 'python', video: '纪录片', music: '周杰伦', images: 'cat', papers: 'transformer', software: 'vscode', apps: 'wechat', code: 'json', dev: 'react', news: 'AI', qa: 'python', games: 'minecraft', data: 'population', reports: 'climate', gov: 'education', courses: 'python', ai: 'llama' };
    const tasks = list.map((s) => ({ ...s, _query: query || Q[s.category] || 'python' }));
    const ev = engine.search('health', tasks); hcRun = ev; let n = 0;
    ev.on('source', (s) => { n++; recordHealth({ ...s, status: s.status }); send('health:progress', { ...s, n, total: tasks.length }); });
    ev.on('done', (d) => { hcRun = null; send('health:done', { total: d.total, ok: d.ok, failed: d.failed, ms: d.ms }); });
    return { total: tasks.length };
  });
  H('health:cancel', () => { hcRun?.cancel(); hcRun = null; });
  H('health:reset', (id) => health.reset(id));
  H('health:disableDead', () => { const ids = store.list().filter((s) => s.enabled !== false && ['dead'].includes(health.get(s.id)?.status || s.health?.status)).map((s) => s.id); store.setMany(ids, false, { autoDisabled: true }); return ids.length; });

  H('ext:list', () => ({ dir: store.pluginDir, plugins: store.plugins, gallery: store.gallery() }));
  H('ext:reload', () => { store.load(); return store.plugins; });
  H('ext:openDir', () => shell.openPath(store.pluginDir));
  H('ext:install', (f) => store.install(f));
  H('ext:uninstall', (f) => store.uninstall(f));
  H('ext:import', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: '扩展', extensions: ['json', 'js'] }], properties: ['openFile', 'multiSelections'] });
    for (const f of r.filePaths || []) fs.copyFileSync(f, path.join(store.pluginDir, path.basename(f)));
    store.load(); return store.plugins;
  });

  H('lib:get', () => lib.d);
  H('lib:fav', (item, c) => lib.fav(item, c));
  H('lib:unfav', (url, c) => lib.unfav(url, c));
  H('lib:addCollection', (n) => lib.addCollection(n));
  H('lib:removeCollection', (id) => lib.removeCollection(id));
  H('lib:saveSearch', (s) => lib.saveSearch(s));
  H('lib:removeSaved', (id) => lib.removeSaved(id));
  H('lib:saveScene', (s) => lib.saveScene(s));
  H('lib:removeScene', (id) => lib.removeScene(id));
  H('lib:clearHistory', () => { lib.d.history = []; return lib.save(); });
  H('export', async ({ format, title, items, query, report }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: `${(title || query || 'omniseek').replace(/[\\/:*?"<>|]/g, '_')}.${format === 'csv' ? 'csv' : 'md'}`, filters: [{ name: format.toUpperCase(), extensions: [format === 'csv' ? 'csv' : 'md'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, format === 'csv' ? exporter.csv(items) : report ? `# ${title}\n\n${report}\n\n## 引用\n\n${items.map((x, i) => `${i + 1}. [${x.title}](${x.url})${x.sourceName ? ' — ' + x.sourceName : ''}`).join('\n')}\n` : exporter.md(title || query, items, query)); return r.filePath;
  });
  H('open', (url) => { if (!/^(https?|magnet|mailto):/i.test(String(url))) throw new Error('不支持的链接'); return shell.openExternal(url); });
  // ---------- 2.2 预览 / 深度搜索 / 联想 / 日志 / 备份 / 更新 ----------
  H('preview:fetch', async (url) => { try { return { ok: true, ...(await reader.read(url)) }; } catch (e) { return { ok: false, error: e.message, url }; } });
  H('preview:window', (url) => {
    const w = new BrowserWindow({ width: 1100, height: 800, title: 'OmniSeek 预览', icon: appIcon(), autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'preview' } });
    w.webContents.setWindowOpenHandler(({ url: u }) => { w.loadURL(u); return { action: 'deny' }; });
    w.webContents.session.on('will-download', (e, item) => { e.preventDefault(); shell.openExternal(item.getURL()); });
    w.loadURL(url); return true;
  });
  const deeps = new Map();
  H('deep:run', async ({ did, query, ...sel }) => {
    const ac = new AbortController(); deeps.set(did, ac);
    try {
      const onStep = (st) => send('deep:step', { did, ...st });
      const r = ai().enabled
        ? await new Research({ engine, llm, pickSources, signal: ac.signal, onStep, budget: { depth: +(sel.budget?.depth || settings.researchDepth) || 2, pages: +(sel.budget?.pages || settings.researchPages) || 10 } }).run(query, { ...sel, categoriesMap: store.categories }, (t) => send('deep:token', { did, t }))
        : await new DeepSearch({ engine, ai: ai(), pickSources, signal: ac.signal, onStep, opts: { rounds: 1, read: +settings.deepRead || 6 } }).run(query, sel, (t) => send('deep:token', { did, t }));
      if (!sel.noHistory) lib.addHistory({ q: query, at: Date.now(), deep: true });
      return { ...r, results: r.results.slice(0, 40) };
    } catch (e) { logError('deep', e); throw e; } finally { deeps.delete(did); }
  });
  H('deep:cancel', (did) => deeps.get(did)?.abort());
  H('suggest', async (q) => {
    q = String(q || '').trim(); const local = []; const ql = q.toLowerCase();
    for (const h of lib.d.history || []) if (h.q && h.q.toLowerCase().includes(ql) && !local.includes(h.q)) local.push(h.q);
    const out = local.slice(0, 6).map((t) => ({ t, from: 'history' }));
    if (q && settings.suggestOnline) {
      const cn = /[\u4e00-\u9fa5]/.test(q);
      const url = cn ? 'https://suggestion.baidu.com/su?action=opensearch&ie=utf-8&oe=utf-8&wd=' + encodeURIComponent(q) : 'https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(q);
      try { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 1500); const r = await fetch(url, { signal: ac.signal }); clearTimeout(t); const j = JSON.parse(await r.text()); for (const s of j[1] || []) if (!out.some((o) => o.t === s)) out.push({ t: s, from: 'web' }); } catch {}
    }
    return out.slice(0, 10);
  });
  H('logs:get', () => readLogs());
  H('logs:clear', () => { try { fs.writeFileSync(logFile(), ''); } catch {} return true; });
  H('logs:open', () => { fs.mkdirSync(path.dirname(logFile()), { recursive: true }); if (!fs.existsSync(logFile())) fs.writeFileSync(logFile(), ''); return shell.showItemInFolder(logFile()); });
  H('logs:write', (scope, msg, stack) => logError('renderer.' + String(scope).slice(0, 30), Object.assign(new Error(String(msg).slice(0, 2000)), { stack: String(stack || '') })));
  H('health:speed', () => health.speed(store.list(), 40));
  H('backup:export', async () => {
    const r = await dialog.showSaveDialog(win, { defaultPath: `OmniSeek-backup-${new Date().toISOString().slice(0, 10)}.json`, filters: [{ name: 'OmniSeek 备份', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    const b = { app: 'OmniSeek', version: app.getVersion(), at: new Date().toISOString(), settings: { ...settings, profiles: settings.profiles.map(({ apiKey, keyError, ...p }) => ({ ...p, apiKey: '' })) }, sources: store.user, library: lib.d, note: 'API Key 未包含在备份中' };
    fs.writeFileSync(r.filePath, JSON.stringify(b, null, 2)); return r.filePath;
  });
  H('backup:import', async () => {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'OmniSeek 备份', extensions: ['json'] }], properties: ['openFile'] });
    const f = r.filePaths?.[0]; if (!f) return null;
    const b = JSON.parse(fs.readFileSync(f, 'utf8')); if (b.app !== 'OmniSeek' || !b.settings) throw new Error('不是有效的 OmniSeek 备份文件');
    const auto = path.join(dataDir(), 'backups'); fs.mkdirSync(auto, { recursive: true });
    const stamp = Date.now(); for (const n of ['settings.json', 'sources.json', 'library.json']) { const p = path.join(dataDir(), n); if (fs.existsSync(p)) fs.copyFileSync(p, path.join(auto, stamp + '-' + n)); }
    const oldKeys = Object.fromEntries(settings.profiles.map((p) => [p.id, p.apiKey])); settings = { ...DEFAULTS, ...b.settings }; for (const p of settings.profiles || []) if (!p.apiKey && oldKeys[p.id]) p.apiKey = oldKeys[p.id]; applySettings();
    if (b.sources) { fs.writeFileSync(store.userFile, JSON.stringify(b.sources, null, 2)); store.load(); }
    if (b.library) { lib.d = { ...lib.d, ...b.library }; lib.save(); }
    return { file: f, version: b.version, restoredFrom: b.at, previousBackup: auto };
  });
  H('backup:openDir', () => { const d = path.join(dataDir(), 'backups'); fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
  H('update:check', async () => (lastUpdate = await checkUpdate()));
  H('update:install', (p) => { const u = (lastUpdate || {}).installer; if (!u || p !== u) throw new Error('安装包路径无效'); return /^https?:/i.test(u) ? shell.openExternal(u) : shell.openPath(u); });
  H('copy', (t) => clipboard.writeText(String(t)));
  H('main:show', (q) => { quick?.hide(); showMain(q); });
  H('quick:hide', () => quick?.hide());

  H('search:start', (o, e) => startSearch(o, BrowserWindow.fromWebContents(e.sender)));
  H('search:cancel', (sid) => searches.get(sid)?.ev.cancel());
  const resultsOf = (sid, ids) => { const rec = searches.get(sid); if (!rec) throw new Error('搜索已过期'); let rs = rec.results; if (ids?.length) rs = rs.filter((r) => ids.includes(r.key)); return { rec, list: rs.slice(0, 50) }; };
  const refs = (list) => list.map((r) => ({ title: r.title, url: r.url, sourceName: r.sourceName }));
  const pending = new Map();
  H('ai:status', () => ({ enabled: ai().enabled, profile: profile()?.name, fast: llm?.profile('intent')?.name, strong: llm?.profile('copilot')?.name, secure: canEncrypt() }));
  // ---------- 2.3 AI ----------
  H('ai:intent', (q) => ai().enabled && settings.aiIntent !== false ? intentMod.analyze(q, { llm, categories: store.categories }) : intentMod.ruleIntent(q, store.categories));
  H('ai:enhance', async ({ sid, n, keys }) => { const rec = searches.get(sid); if (!rec) throw new Error('搜索已过期'); let L = rec.results; if (keys?.length) { const m = new Map(L.map((r) => [r.key, r])); L = keys.map((k) => m.get(k)).filter(Boolean); } return enhance(rec.query, L, { llm: ai().enabled ? llm : null, n: Math.min(40, n || 24) }); });
  H('ai:promptFill', (name, vars) => (llm || buildLLM()).prompt(name, vars || {}));
  H('ai:usage', () => llmHooks.usage?.d || {});
  H('ai:usageReset', () => { if (llmHooks.usage) { llmHooks.usage.d = { total: {}, byModel: {}, byTask: {}, days: {} }; llmHooks.usage.save(); } return true; });
  H('ai:audit', () => llmHooks.auditLog);
  H('ai:auditClear', () => { llmHooks.auditLog.length = 0; return true; });
  H('ai:cacheClear', () => { const n = llmHooks.cache.size; llmHooks.cache.clear(); llmHooks.noNativeTools.clear(); return n; });
  H('ai:prompts', () => Object.fromEntries(Object.entries(PROMPTS).map(([k, v]) => [k, { label: v.label, text: v.text, custom: settings.prompts?.[k] || '' }])));
  H('saveFile', async ({ name, content, ext }) => { const r = await dialog.showSaveDialog(win, { defaultPath: String(name || 'omniseek').replace(/[\\/:*?"<>|\r\n]/g, '_') + '.' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (r.canceled || !r.filePath) return null; fs.writeFileSync(r.filePath, content); return r.filePath; });
  const convs = new ConversationStore(path.join(dataDir(), 'conversations.json'));
  app.on('before-quit', () => convs.flush());
  H('conv:list', () => convs.list()); H('conv:get', (id) => convs.get(id)); H('conv:create', () => convs.create()); H('conv:remove', (id) => convs.remove(id)); H('conv:rename', (id, t) => convs.rename(id, t));
  H('memory:get', () => convs.d.memory); H('memory:forget', (i) => convs.forget(i)); H('memory:add', (n) => convs.remember(n));
  const copilots = new Map();
  H('copilot:run', async ({ cid, text, retry }) => {
    let c = convs.get(cid) || convs.create();
    if (retry) { const i = c.messages.map((m) => m.role).lastIndexOf('user'); if (i >= 0) { text = c.messages[i].content; convs.truncateFrom(c.id, i); } }
    if (!text) throw new Error('消息为空');
    convs.push(c.id, { role: 'user', content: text });
    const ac = new AbortController(); copilots.set(c.id, ac);
    const ev = (e) => send('copilot:event', { cid: c.id, ...e });
    try {
      const cp = new Copilot({ llm: llm || buildLLM(), engine, store, health, pickSources, convs, signal: ac.signal, onEvent: ev, maxSteps: +settings.copilotSteps || 10 });
      const r = await cp.run(convs.get(c.id).messages.map((m) => ({ role: m.role, content: m.content })));
      for (const p of r.proposals) pending.set(p.id, p);
      convs.push(c.id, { role: 'assistant', content: r.text, refs: r.refs, steps: r.steps, proposals: r.proposals.map((p) => p.id), mode: r.mode });
      return { cid: c.id, ...r };
    } catch (e) {
      const msg = e.name === 'AbortError' ? '（已停止）' : '出错：' + String(e.message);
      convs.push(c.id, { role: 'assistant', content: '> ' + msg, error: true });
      if (e.name !== 'AbortError') logError('copilot', e);
      return { cid: c.id, error: msg, stopped: e.name === 'AbortError' };
    } finally { copilots.delete(c.id); }
  });
  H('copilot:cancel', (cid) => { copilots.get(cid)?.abort(); return true; });
  H('ai:expand', (q) => ai().expand(q));
  H('ai:digest', async ({ sid, ids }) => { const { rec, list } = resultsOf(sid, ids); return { text: await ai().digest(rec.query, list, (t) => send('ai:token', { sid, t })), refs: refs(list) }; });
  H('ai:answer', async ({ sid, history, ids }) => { const { rec, list } = resultsOf(sid, ids); return { text: await ai().answer(rec.query, list, history || [], (t) => send('ai:token', { sid, t })), refs: refs(list) }; });
  H('ai:plan', (need) => ai().plan(need, store.categories, store.list().filter((s) => s.enabled !== false).map((s) => ({ id: s.id, name: s.name, category: s.category, kind: s.kind }))));
  H('ai:applyPlan', (plan) => {
    for (const [k, l] of Object.entries(plan.newCategories || {})) store.user.categories[k] = l;
    for (const d of plan.dimensions || []) if (d.category && d.categoryLabel && !store.categories[d.category]) store.user.categories[d.category] = d.categoryLabel;
    const created = [], failed = [];
    for (const s of plan.newSources || []) { try { s.id = 'ai-' + String(s.id).replace(/^ai-/, '').replace(/[^a-z0-9._-]/gi, '-').toLowerCase(); s.aiGenerated = true; store.upsert(s, { strict: true }); created.push(s.id); } catch (err) { failed.push({ id: s.id, error: err.message }); } }
    store.save();
    for (const d of plan.dimensions || []) d.sourceIds = [...new Set([...(d.sourceIds || []), ...created.filter((id) => store.get(id)?.category === d.category)])].filter((id) => store.get(id));
    return { plan, created, failed };
  });
  // AI 来源助手
  H('agent:run', async ({ cid, history }) => {
    if (!ai().enabled) throw new Error('尚未配置 AI 模型。请打开「设置 → 模型服务」添加服务商并填写 API Key（本地 Ollama/LM Studio 可留空），然后即可使用来源助手。');
    const ag = new SourceAgent({ ai: ai(), store, engine, healthStore: health });
    const r = await ag.run(history, (st) => send('agent:step', { cid, ...st }));
    if (r.proposal) pending.set(r.proposal.id, r.proposal);
    return r;
  });
  H('agent:apply', (pid, selected) => {
    const p = pending.get(pid); if (!p) throw new Error('提案已过期');
    const done = [], failed = [];
    p.changes.forEach((c, i) => {
      if (selected && !selected.includes(i)) return;
      try {
        if (c.op === 'upsert') {
          if (c.validationError) throw new Error(c.validationError);
          store.upsert({ ...c.source, aiGenerated: true }, { strict: true });
          done.push('更新 ' + c.source.id);
        } else if (c.op === 'disable' || c.op === 'enable') { store.setMany(c.ids, c.op === 'enable'); done.push(`${c.op === 'enable' ? '启用' : '禁用'} ${c.ids.length} 个`); }
        else if (c.op === 'remove') { for (const id of c.ids) { if (store.get(id)?.custom) store.remove(id); else store.setEnabled(id, false); } done.push('移除 ' + c.ids.length + ' 个'); }
        else if (c.op === 'category') { store.addCategory(c.key, c.label); done.push('分类 ' + c.label); }
        else if (c.op === 'scene') { lib.saveScene(c.scene); done.push('维度 ' + c.scene.name); }
        else if (c.op === 'extension') { done.push('扩展 ' + store.writeExtension(c.filename, c.content)); }
      } catch (e) { failed.push(String(e.message)); }
    });
    pending.delete(pid); if (failed.length && !done.length) throw new Error(failed.join('; '));
    return failed.length ? [...done, '部分失败: ' + failed.join('; ')] : done;
  });

  createWindow(); applySettings();
  // 托盘与快捷键延后，缩短首屏时间
  setImmediate(() => { try { createTray(); registerHotkey(); } catch (e) { console.warn(e.message); } });
  if (settings.autoUpdateCheck) setTimeout(async () => { const u = await checkUpdate(); lastUpdate = u; if (u.newer) send('notice', { type: 'update', ...u }); }, 6000);
  app.on('second-instance', () => showMain());
});
app.on('before-quit', () => { app.isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (!tray) app.quit(); });
// 开发自检：OMNISEEK_SMOKE=目录 时自动截图各页面后退出
if (process.env.OMNISEEK_SMOKE) app.whenReady().then(() => setTimeout(async () => {
  const out = process.env.OMNISEEK_SMOKE; fs.mkdirSync(out, { recursive: true });
  const js = (c) => win.webContents.executeJavaScript(c).catch((e) => console.log('JSERR', e.message));
  const shot = async (n) => { await new Promise((r) => setTimeout(r, 1500)); fs.writeFileSync(path.join(out, n + '.png'), (await win.capturePage()).toPNG()); console.log('shot', n); };
  win.webContents.on('console-message', (e, lvl, msg) => { if (lvl >= 2) console.log('RENDERER', msg); });
  await js(`document.querySelector('#onboard').hidden=true`); await shot('01-welcome');
  for (const [q, sc, n, wait] of (process.env.OMNISEEK_Q || '三体|sc-books|02-books|14000;python|sc-soft|03-software|14000;纪录片|sc-media|04-video|14000;transformer|sc-academic|05-papers|14000;cat|sc-images|06-images|12000').split(';').map((x) => x.split('|'))) {
    await js(`document.querySelector('#scene').value='${sc}';document.querySelector('#scene').dispatchEvent(new Event('change'));document.querySelector('#q').value='${q}';doSearch();`);
    await new Promise((r) => setTimeout(r, +wait)); await shot(n);
  }
  await js(`document.querySelector('#results .card [data-act=preview]')?.click()`); await new Promise((r) => setTimeout(r, 5000)); await shot('11-preview');
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'j'}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'j',bubbles:true}))`); await shot('12-kbnav');
  await js(`document.querySelector('#sort').value='domain';document.querySelector('#sort').dispatchEvent(new Event('change'))`); await shot('13-domain');
  await js(`document.querySelector('#sort').value='rel';document.querySelector('#q').value='vscode 下载';doSearch({newTab:true})`); await new Promise((r) => setTimeout(r, 10000)); await shot('14-tabs');
  await js(`document.querySelector('#deepBtn').click()`); await new Promise((r) => setTimeout(r, 25000)); await shot('15-deep');
  await js(`document.querySelector('#sideClose').click();document.querySelector('#srcPanelBtn').click()`); await shot('07-srcpanel');
  for (const p of ['assistant', 'sources', 'health', 'ext', 'library', 'settings']) { await js(`go('${p}')`); await shot('08-' + p); }
  await js(`go('settings');setTimeout(()=>document.querySelector('[data-prov=anthropic]').click(),800)`); await shot('09-provider');
  await js(`closeModal();showLogs()`); await shot('16-logs');
  if (process.env.OMNISEEK_SMOKE_AI) {
    await js(`closeModal();go('assistant');document.querySelector('#asSeg [data-m=copilot]').click();document.querySelector('#cpIn').value='推荐一个 Windows 代码编辑器并对比';document.querySelector('#cpSend').click()`); await new Promise((r) => setTimeout(r, 14000)); await shot('17-copilot');
    await js(`go('search');document.querySelector('#optSmart').checked=true;document.querySelector('#scene').value='';document.querySelector('#q').value='vscode 下载';doSearch()`); await new Promise((r) => setTimeout(r, 14000));
    await js(`document.querySelector('#enhBtn').click()`); await new Promise((r) => setTimeout(r, 4000)); await shot('18-enhance');
    await js(`document.querySelector('#deepBtn').click()`); await new Promise((r) => setTimeout(r, 30000)); await shot('19-research');
    await js(`go('settings');setTimeout(()=>document.querySelector('#aiCenter')?.scrollIntoView(),800)`); await shot('20-aicenter');
    await js(`document.querySelector('#aAuditView').click()`); await shot('21-audit');
    await js(`closeModal();document.querySelector('#aPrompts').click()`); await shot('22-prompts');
  }
  await js(`closeModal();go('ext')`); toggleQuick(); await new Promise((r) => setTimeout(r, 1000));
  await quick.webContents.executeJavaScript(`document.querySelector('#qq').value='vscode';search();`); await new Promise((r) => setTimeout(r, 8000));
  fs.writeFileSync(path.join(out, '10-quick.png'), (await quick.capturePage()).toPNG());
  app.isQuitting = true; app.exit(0);
}, 2500));
