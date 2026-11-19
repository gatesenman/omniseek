window.addEventListener('error', (e) => console.error('UNCAUGHT', e.message, e.filename + ':' + e.lineno)); window.addEventListener('unhandledrejection', (e) => console.error('UNHANDLED', String(e.reason && (e.reason.stack || e.reason))));
// OmniSeek 万搜 v2 — 主界面核心与搜索页
const $ = (s, r = document) => r.querySelector(s); const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = { settings: {}, cats: {}, sources: [], lib: { items: [], history: [], saved: [], scenes: [], collections: [] }, ai: { enabled: false } };
const toast = (msg, type = '') => { const d = document.createElement('div'); d.className = 'toast ' + type; d.innerHTML = msg; $('#toasts').append(d); setTimeout(() => d.remove(), 4200); };
const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms');
function modal(html, onMount) { $('#dialog').innerHTML = html; $('#modal').hidden = false; onMount && onMount($('#dialog')); }
const closeModal = () => { $('#modal').hidden = true; $('#dialog').innerHTML = ''; };
$('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
// 全局链接处理
document.addEventListener('click', (e) => { const a = e.target.closest('[data-href]'); if (a) { e.preventDefault(); api.open(a.dataset.href); } });

const BUILTIN_SCENES = [
  { id: 'sc-academic', name: '学术研究', icon: 'graduation-cap-line', categories: ['papers', 'reports', 'data', 'books'], view: 'list' },
  { id: 'sc-books', name: '找书', icon: 'book-2-line', categories: ['books', 'ebooks'], view: 'auto' },
  { id: 'sc-soft', name: '找软件', icon: 'apps-2-line', categories: ['software', 'apps', 'dev', 'code'], view: 'list' },
  { id: 'sc-media', name: '影音', icon: 'film-line', categories: ['video', 'music'], view: 'grid' },
  { id: 'sc-images', name: '图片素材', icon: 'image-line', categories: ['images'], view: 'grid' },
  { id: 'sc-dev', name: '开发者', icon: 'terminal-box-line', categories: ['dev', 'code', 'qa', 'ai'], view: 'list' },
  { id: 'sc-cn', name: '中文社区', icon: 'chat-3-line', categories: [], filters: { region: 'cn' }, view: 'auto' },
  { id: 'sc-news', name: '资讯动态', icon: 'newspaper-line', categories: ['news', 'social'], view: 'list' },
  { id: 'sc-gov', name: '政策与数据', icon: 'government-line', categories: ['gov', 'data', 'reports'], view: 'list' },
];
const allScenes = () => [...BUILTIN_SCENES, ...(S.lib.scenes || [])];

async function refreshSources() { const r = await api.sources.list(); S.cats = r.categories; S.sources = r.sources; S.srcMap = new Map(r.sources.map((s) => [s.id, s])); }
async function refreshLib() { S.lib = await api.lib.get(); S.favSet = new Set(S.lib.items.map((x) => x.url)); }
async function refreshAi() { S.ai = await api.ai.status(); }

// ---------------- 导航 ----------------
const PAGES = {};
function go(page) {
  $$('.nav').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'p-' + page));
  PAGES[page]?.();
}
$$('.nav').forEach((b) => b.addEventListener('click', () => go(b.dataset.page)));
api.on('nav', ({ page, q }) => { go(page); if (q) { $('#q').value = q; doSearch(); } });
api.on('notice', (n) => { if (n.type === 'autoDisabled') toast(`<i class="ri-forbid-line"></i> 来源「${esc(n.name)}」连续失败，已自动禁用`, 'warn'); });

// ---------------- 搜索状态 ----------------
const R = { sid: null, results: new Map(), statuses: new Map(), total: 0, tab: 'all', limit: 120, running: false, query: '', chat: [], refs: [] };
const KIND_LABEL = () => Object.fromEntries(Object.entries(KIND).map(([k, v]) => [k, LANG === 'en' ? k : v.label]));
function initFilters() {
  $('#fKind').innerHTML = `<option value="">${t('allTypes')}</option>` + Object.entries(KIND_LABEL()).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('#scene').innerHTML = `<option value="">${t('noScene')}</option>` + allScenes().map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('') + `<optgroup label="分类">` + Object.entries(S.cats).map(([k, v]) => `<option value="cat:${k}">${esc(v)}</option>`).join('') + '</optgroup>';
  $('#scene').value = S.settings.scene || '';
  setView(S.settings.view || 'auto', false);
}
function setView(v, save = true) { S.view = v; $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.v === v)); if (save) api.settings.set({ view: v }); render(); }
$$('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
['#fKind', '#fDate', '#fLang', '#fSource', '#sort'].forEach((s) => $(s).addEventListener('change', () => { R.limit = 120; render(); }));
$('#scene').addEventListener('change', () => { api.settings.set({ scene: $('#scene').value }); const sc = allScenes().find((x) => x.id === $('#scene').value); if (sc?.view) setView(sc.view, false); if (sc?.filters?.region) $('#fRegion').value = sc.filters.region; });
$('#fNative').addEventListener('change', () => api.settings.set({ preferNative: $('#fNative').checked }));

function scopeFromUi() {
  const v = $('#scene').value; const filters = { region: $('#fRegion').value, nativeOnly: $('#fNative').checked };
  if (v.startsWith('cat:')) return { category: v.slice(4), filters };
  const sc = allScenes().find((x) => x.id === v);
  if (sc) return { categories: sc.categories, sourceIds: sc.sourceIds, filters: { ...filters, ...(sc.filters || {}) }, scene: sc.id };
  return { filters };
}
async function doSearch(opts = {}) {
  const q = $('#q').value.trim(); if (!q) return;
  hideSuggest();
  if (R.sid) api.search.cancel(R.sid);
  Object.assign(R, { sid: 's' + Date.now(), results: new Map(), statuses: new Map(), total: 0, tab: 'all', limit: 120, running: true, query: q, chat: [], refs: [], done: null });
  $('#results').innerHTML = `<div class="skeleton"><div class="dim" style="margin-bottom:8px"><i class="ri-loader-4-line"></i> ${t('loadingResults')}</div>${'<div class="sk tall"></div>'.repeat(5)}</div>`;
  $('#bar').style.width = '0'; $('#expanded').textContent = ''; $('#stop').hidden = false; $('#go').hidden = true;
  if ($('#side').dataset.mode !== 'sources') $('#side').hidden = true;
  const r = await api.search.start({ sid: R.sid, query: q, expand: $('#optExpand').checked, ...scopeFromUi(), ...opts });
  R.total = r.total; if (!r.total) { R.running = false;
    const acts=[{label:t('sources'),icon:'stack-line',fn:()=>go('sources')},{label:'放宽筛选',icon:'filter-off-line',fn:()=>{$('#fNative').checked=false;$('#fRegion').value='all';doSearch();}}];
    $('#results').innerHTML = emptyState(t('noSources'), t('noSourcesSub'), acts);
    bindEmptyActs(acts);
    $('#stop').hidden = true; $('#go').hidden = false; }
  refreshLib();
}
const emptyState = (a, b, acts = []) => `<div class="empty"><i class="ri-search-eye-line"></i><h3>${a}</h3><p>${b || ''}</p>${acts.length ? `<div class="acts">${acts.map((x,i)=>`<button class="small" data-ea="${i}"><i class="ri-${x.icon||'arrow-right-line'}"></i> ${x.label}</button>`).join('')}</div>` : ''}</div>`;
function bindEmptyActs(acts){ $$('[data-ea]', $('#results')).forEach((b)=>{ b.onclick=()=>{ const a=acts[+b.dataset.ea]; if(!a)return; if(typeof a.fn==='function') a.fn(); else if(typeof a.fn==='string') eval(a.fn); }; }); }
$('#go').onclick = () => doSearch(); $('#stop').onclick = () => { api.search.cancel(R.sid); finish(true); };
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { if (e.ctrlKey) $('#optAnswer').checked = true; doSearch(); } if (e.key === 'Escape') hideSuggest(); });
function finish(cancelled) { R.running = false; $('#stop').hidden = true; $('#go').hidden = false; $('#bar').style.width = '100%'; if (cancelled) { const el=$('#stat'); if(el) el.innerHTML += ` · <span class="warnc">${t('cancelled')}</span>`; } }

api.on('search:event', ({ sid, type, data }) => {
  if (sid !== R.sid) return;
  if (type === 'expanded') $('#expanded').innerHTML = `<i class="ri-magic-line"></i> ${data.map(esc).join(' · ')}`;
  else if (type === 'notice') toast(esc(data), 'warn');
  else if (type === 'results') { for (const r of data) R.results.set(r.key, r); schedule(); }
  else if (type === 'source') { R.statuses.set(data.id + (data.q || ''), data); stat(); if ($('#side').dataset.mode === 'sources' && !$('#side').hidden) schedulePanel(); }
  else if (type === 'done') { R.done = data; finish(data.cancelled); stat(); render(); if ($('#optAnswer').checked && R.results.size && !data.cancelled) runAnswer(); }
});
function stat() {
  const n = R.statuses.size; const ok = [...R.statuses.values()].filter((s) => s.status === 'ok').length; const bad = [...R.statuses.values()].filter((s) => s.status === 'error').length;
  $('#bar').style.width = (R.total ? (n / R.total) * 100 : 0) + '%';
  $('#stat').innerHTML = `<b>${R.results.size}</b> ${t('results')} · ${n}/${R.total} ${t('sourcesDone')} · <span class="okc">${ok} 有结果</span> · <span class="errc">${bad} ${t('failed')}</span>${R.done ? ` · ${t('elapsed')} ${fmtMs(R.done.ms)}` : ''}`;
}
let rt = null; const schedule = () => { if (!rt) rt = setTimeout(() => { rt = null; render(); }, 250); };
let pt = null; const schedulePanel = () => { if (!pt) pt = setTimeout(() => { pt = null; showSourcePanel(); }, 500); };

function inDate(r, days) {
  if (!days) return true; const d = r.date ? Date.parse(String(r.date).replace(/年|月/g, '-').replace(/日/, '')) : r.year ? Date.parse(r.year + '-07-01') : NaN;
  return !isNaN(d) && d >= Date.now() - days * 864e5;
}
const isZh = (r) => /[\u4e00-\u9fa5]/.test(r.title + (r.snippet || '').slice(0, 60));
function filtered() {
  const k = $('#fKind').value, days = +$('#fDate').value, lang = $('#fLang').value, src = $('#fSource').value;
  let L = [...R.results.values()].filter((r) => (!k || r.kind === k) && inDate(r, days) && (!lang || (lang === 'zh' ? isZh(r) : !isZh(r))) && (!src || r.sources.includes(src)));
  const tabs = {}; for (const r of L) tabs[r.category] = (tabs[r.category] || 0) + 1;
  if (R.tab !== 'all') L = L.filter((r) => r.category === R.tab);
  const s = $('#sort').value;
  const dk = (r) => Date.parse(r.date || '') || (r.year ? Date.parse(r.year + '-01-01') : 0);
  L.sort(s === 'date' ? (a, b) => dk(b) - dk(a) : s === 'multi' ? (a, b) => b.sources.length - a.sources.length || b.score - a.score : (a, b) => b.score - a.score);
  return { L, tabs };
}
function render() {
  if (!R.sid) { $('#results').innerHTML = welcome(); bindWelcome(); return; }
  let { L, tabs } = filtered();
  const total = Object.values(tabs).reduce((a, b) => a + b, 0);
  $('#tabs').innerHTML = `<div class="tab ${R.tab === 'all' ? 'active' : ''}" data-tab="all">${t('all')}<em>${total}</em></div>` + Object.entries(tabs).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<div class="tab ${R.tab === c ? 'active' : ''}" data-tab="${esc(c)}">${esc(S.cats[c] || c)}<em>${n}</em></div>`).join('');
  // 来源筛选下拉
  const cur = $('#fSource').value; const cnt = {}; for (const r of R.results.values()) for (const s of r.sources) cnt[s] = (cnt[s] || 0) + 1;
  $('#fSource').innerHTML = '<option value="">全部来源</option>' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([id, n]) => `<option value="${esc(id)}">${esc(S.srcMap?.get(id)?.name || id)} (${n})</option>`).join(''); $('#fSource').value = cur;
  const box = $('#results');
  if (!L.length) {
    if (R.running) { box.innerHTML = `<div class="skeleton">${'<div class="sk tall"></div>'.repeat(4)}</div>`; return; }
    const acts=[{label:'清除筛选',icon:'filter-off-line',fn:()=>{$('#fKind').value='';$('#fDate').value='';$('#fLang').value='';$('#fSource').value='';render();}},{label:t('expand'),icon:'magic-line',fn:()=>{$('#optExpand').checked=true;doSearch({expand:true});}}];
    box.innerHTML = emptyState(t('noResults'), '试试更换关键词、放宽筛选或开启 AI 扩展', acts);
    bindEmptyActs(acts); return;
  }
  const visual = L.filter((r) => ['image', 'video', 'music'].includes(r.kind)).length / L.length;
  const grid = S.view === 'grid' || (S.view === 'auto' && visual > 0.6);
  box.className = 'results ' + (grid ? 'grid' : 'list');
  const frag = document.createDocumentFragment();
  if (!grid && S.view === 'auto' && R.tab === 'all') { // 自动视图：图片聚成一行图墙
    const imgs = L.filter((r) => r.kind === 'image').slice(0, 12);
    if (imgs.length >= 4) { const strip = document.createElement('div'); strip.className = 'imgstrip'; for (const r of imgs) strip.append(renderCard(r, { favd: S.favSet?.has(r.url) })); frag.append(strip); }
    L = L.filter((r) => r.kind !== 'image' || !imgs.includes(r));
  }
  for (const r of L.slice(0, R.limit)) frag.append(renderCard(r, { favd: S.favSet?.has(r.url), view: grid ? 'grid' : 'list' }));
  if (L.length > R.limit) { const m = document.createElement('button'); m.className = 'more'; m.textContent = `显示更多（剩余 ${L.length - R.limit}）`; m.onclick = () => { R.limit += 200; render(); }; frag.append(m); }
  box.replaceChildren(frag);
}
$('#tabs').addEventListener('click', (e) => { const tb = e.target.closest('.tab'); if (tb) { R.tab = tb.dataset.tab; R.limit = 120; render(); } });
$('#results').addEventListener('click', async (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const r = R.results.get(card.dataset.key) || [...R.results.values()].find((x) => x.url === card.dataset.key); if (!r) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'fav') { await toggleFav(r); render(); return; }
  if (act === 'copy') { api.copy(r.url); toast('<i class="ri-check-line"></i> 已复制链接'); return; }
  if (e.target.closest('[data-open]')) api.open(r.url);
});
async function toggleFav(r, coll) {
  if (S.favSet.has(r.url)) { await api.lib.unfav(r.url); toast('已取消收藏'); }
  else { const { key, score, rank, ...item } = r; await api.lib.fav(item, coll || 'default'); toast('<i class="ri-star-fill"></i> 已加入收藏夹'); }
  await refreshLib();
}
// 欢迎页
function welcome() {
  const hist = (S.lib.history || []).slice(0, 12), saved = (S.lib.saved || []).slice(0, 6);
  const n = S.sources.filter((s) => s.enabled !== false).length;
  return `<div class="welcome"><img src="../assets/icon.png" class="wlogo"><h1>OmniSeek 万搜</h1><p class="dim">${t('emptySub')}<br>已启用 <b>${n}</b> / ${S.sources.length} 个来源 · ${S.ai.enabled ? `<i class="ri-sparkling-2-line"></i> 模型：${esc(S.ai.profile || '')}` : '<i class="ri-information-line"></i> 未配置 AI（可选）'} · 快捷键 <kbd>${esc(S.settings.hotkeyActive || S.settings.hotkey || '')}</kbd></p>
   <div class="scenes">${allScenes().map((s) => `<button class="scene" data-scene="${s.id}"><i class="ri-${s.icon || 'bookmark-line'}"></i>${esc(s.name)}</button>`).join('')}</div>
   ${saved.length ? `<h4><i class="ri-bookmark-line"></i> ${t('saved')}</h4><div class="chips">${saved.map((s) => `<span class="hchip" data-saved="${s.id}">${esc(s.name || s.q)}</span>`).join('')}</div>` : ''}
   ${hist.length ? `<h4><i class="ri-history-line"></i> ${t('history')}</h4><div class="chips">${hist.map((h) => `<span class="hchip" data-q="${esc(h.q)}">${esc(h.q)}</span>`).join('')}</div>` : ''}</div>`;
}
function bindWelcome() {
  $$('.scene', $('#results')).forEach((b) => b.onclick = () => { $('#scene').value = b.dataset.scene; $('#scene').dispatchEvent(new Event('change')); $('#q').focus(); });
  $$('[data-q]', $('#results')).forEach((b) => b.onclick = () => { $('#q').value = b.dataset.q; doSearch(); });
  $$('[data-saved]', $('#results')).forEach((b) => b.onclick = () => runSaved(S.lib.saved.find((x) => x.id === b.dataset.saved)));
}
function runSaved(s) { if (!s) return; go('search'); $('#q').value = s.q; $('#scene').value = s.scene || ''; if (s.filters) { $('#fRegion').value = s.filters.region || 'all'; $('#fNative').checked = !!s.filters.nativeOnly; } doSearch(); }
// 输入建议（历史）
function hideSuggest() { $('#suggest').classList.remove('on'); }
$('#q').addEventListener('input', () => {
  const v = $('#q').value.trim().toLowerCase(); const L = (S.lib.history || []).filter((h) => !v || h.q.toLowerCase().includes(v)).slice(0, 8);
  $('#suggest').innerHTML = L.map((h) => `<div class="sg" data-q="${esc(h.q)}"><i class="ri-history-line"></i>${esc(h.q)}</div>`).join(''); $('#suggest').classList.toggle('on', !!L.length && !!v);
});
$('#suggest').addEventListener('mousedown', (e) => { const d = e.target.closest('.sg'); if (d) { $('#q').value = d.dataset.q; doSearch(); } });
$('#q').addEventListener('blur', () => setTimeout(hideSuggest, 150));
// 保存搜索 / 导出
$('#saveSearch').onclick = async () => { const q = $('#q').value.trim(); if (!q) return toast('请先输入关键词', 'warn'); const name = await prompt2('保存搜索', '名称', q); if (name == null) return; await api.lib.saveSearch({ name, q, scene: $('#scene').value, filters: scopeFromUi().filters }); await refreshLib(); toast('<i class="ri-bookmark-fill"></i> 已保存'); };
async function exportNow(format) { const { L } = filtered(); if (!L.length) return toast('没有可导出的结果', 'warn'); const p = await api.export({ format, query: R.query, title: 'OmniSeek：' + R.query, items: L }); if (p) toast('已导出到 ' + esc(p)); }
$('#expMd').onclick = () => exportNow('md'); $('#expCsv').onclick = () => exportNow('csv');
function prompt2(title, label, val = '') { return new Promise((res) => { modal(`<h3>${esc(title)}</h3><label class="fld">${esc(label)}<input id="pv" value="${esc(val)}"></label><div class="dlgbtns"><button id="pc">${t('cancel')}</button><button class="primary" id="po">${t('save')}</button></div>`, (d) => { const i = $('#pv', d); i.focus(); i.select(); const ok = () => { const v = i.value.trim(); closeModal(); res(v || null); }; $('#po', d).onclick = ok; i.onkeydown = (e) => e.key === 'Enter' && ok(); $('#pc', d).onclick = () => { closeModal(); res(null); }; }); }); }

// ---------------- 侧栏：AI 回答 / 摘要 / 来源状态 ----------------
function openSide(mode, title) { const sd = $('#side'); sd.hidden = false; sd.dataset.mode = mode; $('#sideTitle').innerHTML = title; $('#followWrap').hidden = mode !== 'answer'; }
$('#sideClose').onclick = () => { $('#side').hidden = true; $('#side').dataset.mode = ''; };
$('#srcPanelBtn').onclick = () => { openSide('sources', '<i class="ri-pulse-line"></i> 来源状态'); showSourcePanel(); };
function showSourcePanel() {
  const L = [...R.statuses.values()].sort((a, b) => (b.count || 0) - (a.count || 0));
  const pending = R.total - L.length;
  $('#sideBody').innerHTML = `<div class="dim">${pending > 0 ? `进行中：${pending} 个来源等待响应` : '全部完成'}</div>` + L.map((s) => { const src = S.srcMap?.get(s.id); return `<div class="srow st-${s.status}"><span class="dot"></span><span class="nm">${esc(src?.name || s.id)}${s.q && s.q !== R.query ? ` <span class="dim">(${esc(s.q)})</span>` : ''}</span><span class="dim">${s.status === 'error' ? esc(String(s.error).slice(0, 40)) : (s.count || 0) + ' 条'}</span><span class="ms">${fmtMs(s.ms)}</span></div>`; }).join('');
}
let streamBuf = '';
api.on('ai:token', ({ sid, t: tok }) => { if (sid !== R.sid) return; streamBuf += tok; const el = $('#streaming'); if (el) { el.innerHTML = md(streamBuf, R.refs); $('#sideBody').scrollTop = 1e9; } });
function chatHtml() {
  return R.chat.map((m) => m.role === 'user' ? `<div class="msg user">${esc(m.content)}</div>` : `<div class="msg bot md">${md(m.content, R.refs)}</div>`).join('');
}
async function runAnswer(followUp) {
  if (!S.ai.enabled) { openSide('answer', '<i class="ri-chat-smile-2-line"></i> AI 回答'); $('#sideBody').innerHTML = `<div class="ai-cta"><i class="ri-cpu-line"></i><div><b>${t('aiNeedKey')}</b><p class="dim">${t('aiNeedKeySub')}</p><button class="small primary" id="toSetAi">${t('goSettings')}</button></div></div>`; $('#toSetAi').onclick=()=>go('settings'); return; }
  openSide('answer', `<i class="ri-chat-smile-2-line"></i> AI 回答 · ${esc(R.query)}`);
  if (followUp) R.chat.push({ role: 'user', content: followUp });
  else if (!R.chat.length) R.chat.push({ role: 'user', content: R.query });
  streamBuf = ''; $('#sideBody').innerHTML = chatHtml() + '<div class="msg bot md" id="streaming"><span class="typing"><i></i><i></i><i></i></span></div>';
  R.refs = [...R.results.values()].sort((a, b) => b.score - a.score).slice(0, 50).map((r) => ({ title: r.title, url: r.url, sourceName: r.sourceName }));
  try { const r = await api.ai.answer({ sid: R.sid, history: R.chat }); R.refs = r.refs; R.chat.push({ role: 'assistant', content: r.text }); }
  catch (e) { R.chat.push({ role: 'assistant', content: '> 出错：' + String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }); }
  $('#sideBody').innerHTML = chatHtml(); $('#sideBody').scrollTop = 1e9;
}
$('#followSend').onclick = () => { const v = $('#follow').value.trim(); if (!v || !R.sid) return; $('#follow').value = ''; runAnswer(v); };
$('#follow').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#followSend').click(); } });
$('#optAnswer').addEventListener('change', () => { api.settings.set({ answerMode: $('#optAnswer').checked }); if ($('#optAnswer').checked && R.done && !R.chat.length) runAnswer(); });
$('#optExpand').addEventListener('change', () => api.settings.set({ autoExpand: $('#optExpand').checked }));
$('#digestBtn').onclick = async () => {
  if (!R.sid || !R.results.size) return toast('请先搜索', 'warn');
  openSide('digest', '<i class="ri-quill-pen-line"></i> AI 摘要');
  if (!S.ai.enabled) { $('#sideBody').innerHTML = `<div class="notice">${t('aiOff')}</div>`; return; }
  streamBuf = ''; R.refs = [...R.results.values()].sort((a, b) => b.score - a.score).slice(0, 40).map((r) => ({ title: r.title, url: r.url, sourceName: r.sourceName }));
  $('#sideBody').innerHTML = '<div class="msg bot md" id="streaming"><span class="typing"><i></i><i></i><i></i></span></div>';
  try { const r = await api.ai.digest({ sid: R.sid }); R.refs = r.refs; $('#sideBody').innerHTML = `<div class="msg bot md">${md(r.text, r.refs)}</div>`; }
  catch (e) { $('#sideBody').innerHTML = `<div class="notice err">${esc(e.message)}</div>`; }
};

// ---------------- 启动 ----------------
async function boot() {
  S.settings = await api.settings.get(); LANG = S.settings.lang || 'zh'; document.documentElement.lang = LANG === 'en' ? 'en' : 'zh-CN';
  // 首屏只拉设置+来源；资料库与 AI 状态并行延后一点点
  await refreshSources();
  const rest = Promise.all([refreshLib(), refreshAi()]);
  $('#optExpand').checked = !!S.settings.autoExpand; $('#optAnswer').checked = !!S.settings.answerMode;
  $('#fNative').checked = S.settings.preferNative !== false;
  $('#tbSub').textContent = 'v' + S.settings.version;
  applyI18n(); initFilters();
  await rest; render();
  $('#q').focus();
  if (!S.settings.onboarded) showOnboard();
  bindGlobalShortcuts();
}
function showOnboard() {
  const el = $('#onboard'); if (!el) return;
  el.hidden = false;
  el.innerHTML = `<div class="card"><img src="../assets/icon.png" width="56" height="56" alt="" style="border-radius:12px">
    <h2>${t('onboardTitle')}</h2>
    <ul class="olist">
      <li><i class="ri-search-eye-line"></i><span>${t('onboard1')}</span></li>
      <li><i class="ri-layout-masonry-line"></i><span>${t('onboard2')}</span></li>
      <li><i class="ri-sparkling-2-line"></i><span>${t('onboard3')}</span></li>
      <li><i class="ri-keyboard-box-line"></i><span>${t('onboard4')}</span></li>
    </ul>
    <div class="actions"><button id="obSkip">${t('onboardSkip')}</button><button class="primary" id="obGo">${t('onboardGo')}</button></div></div>`;
  const done = async () => { el.hidden = true; await api.settings.set({ onboarded: true }); S.settings.onboarded = true; $('#q').focus(); };
  $('#obGo').onclick = done; $('#obSkip').onclick = done;
}
function showShortcuts() {
  modal(`<h3><i class="ri-keyboard-box-line"></i> ${t('shortcuts')}</h3>
    <div class="shortcut-grid">
      <span>搜索</span><kbd>Enter</kbd>
      <span>AI 回答模式搜索</span><kbd>Ctrl</kbd>+<kbd>Enter</kbd>
      <span>停止搜索</span><kbd>Esc</kbd>（搜索中）
      <span>快速搜索弹窗</span><kbd>${esc(S.settings.hotkeyActive || S.settings.hotkey || 'Alt+Space')}</kbd>
      <span>关闭弹窗 / 对话框</span><kbd>Esc</kbd>
      <span>结果中打开</span><kbd>点击标题</kbd>
      <span>本帮助</span><kbd>?</kbd> 或 <kbd>Ctrl</kbd>+<kbd>/</kbd>
    </div>
    <div class="dlgbtns"><button class="primary" id="scOk">知道了</button></div>`, (d) => { $('#scOk', d).onclick = closeModal; });
}
function bindGlobalShortcuts() {
  $('#helpBtn')?.addEventListener('click', showShortcuts);
  document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input,textarea,[contenteditable]')) {
      if (e.key === 'Escape' && R.running) { api.search.cancel(R.sid); finish(true); }
      return;
    }
    if (e.key === '?' || (e.key === '/' && e.ctrlKey)) { e.preventDefault(); showShortcuts(); }
    if (e.key === '/' && !e.ctrlKey) { e.preventDefault(); $('#q').focus(); }
  });
}
window.addEventListener('DOMContentLoaded', boot);
