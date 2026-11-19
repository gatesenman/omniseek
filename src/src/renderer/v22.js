// OmniSeek 2.2 —— 预览/阅读模式、深度搜索、资源识别、搜索标签页、联想、键盘导航、域名分组、日志/备份/更新
(() => {
const errMsg = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const getR = (key) => R.results.get(key) || [...R.results.values()].find((x) => x.url === key);

// ================= 搜索标签页 =================
const TABS = []; let active = null; let tabSeq = 0;
const FIELDS = ['sid', 'results', 'statuses', 'total', 'tab', 'limit', 'running', 'query', 'chat', 'refs', 'done'];
const snap = () => Object.fromEntries(FIELDS.map((f) => [f, R[f]]));
function renderTabs() {
  const el = $('#stabs'); el.classList.toggle('one', TABS.length < 2); if (TABS.length < 2) { el.innerHTML = TABS.length ? `<div class="stab-add" id="stabNew" title="新标签页 (Ctrl+T)"><i class="ri-add-line"></i></div>` : ''; }
  else el.innerHTML = TABS.map((tb) => { const st = tb === active ? R : tb.state; return `<div class="stab ${tb === active ? 'on' : ''}" data-tid="${tb.id}" title="${esc(st.query || '')}">${st.running ? '<i class="ri-loader-4-line spin"></i>' : '<i class="ri-search-line"></i>'}<span>${esc(st.query || '新标签')}</span><em>${st.results?.size || 0}</em><i class="ri-close-line x" data-close="${tb.id}"></i></div>`; }).join('') + `<div class="stab-add" id="stabNew" title="新标签页 (Ctrl+T)"><i class="ri-add-line"></i></div>`;
  $('#stabNew') && ($('#stabNew').onclick = () => newTab());
}
function switchTab(tb) {
  if (!tb || tb === active) return;
  if (active) active.state = snap();
  active = tb; Object.assign(R, tb.state);
  $('#q').value = R.query || ''; $('#stop').hidden = !R.running; $('#go').hidden = !!R.running;
  if (['answer', 'digest', 'deep', 'preview'].includes($('#side').dataset.mode)) { $('#side').hidden = true; $('#side').dataset.mode = ''; }
  if (R.sid) stat(); else { $('#stat').textContent = ''; $('#bar').style.width = '0'; }
  render(); renderTabs(); kb.idx = -1;
}
function newTab(q) {
  if (active) active.state = snap();
  const tb = { id: ++tabSeq, state: { sid: null, results: new Map(), statuses: new Map(), total: 0, tab: 'all', limit: 120, running: false, query: '', chat: [], refs: [], done: null } };
  TABS.push(tb); active = null; switchTab(tb);
  if (TABS.length > 10) closeTab(TABS.find((x) => x !== active));
  if (q) { $('#q').value = q; doSearch(); } else $('#q').focus();
}
function closeTab(tb) {
  if (!tb) return; const st = tb === active ? R : tb.state; if (st.running && st.sid) api.search.cancel(st.sid);
  const i = TABS.indexOf(tb); TABS.splice(i, 1);
  if (!TABS.length) { active = null; newTab(); return; }
  if (tb === active) { active = null; Object.assign(R, TABS[Math.max(0, i - 1)].state); const nx = TABS[Math.max(0, i - 1)]; active = nx; Object.assign(R, nx.state); $('#q').value = R.query || ''; $('#stop').hidden = !R.running; $('#go').hidden = !!R.running; render(); if (R.sid) stat(); }
  renderTabs();
}
$('#stabs').addEventListener('click', (e) => { const c = e.target.closest('[data-close]'); if (c) { e.stopPropagation(); return closeTab(TABS.find((x) => x.id === +c.dataset.close)); } const tb = e.target.closest('.stab'); if (tb) switchTab(TABS.find((x) => x.id === +tb.dataset.tid)); });
$('#stabs').addEventListener('auxclick', (e) => { const tb = e.target.closest('.stab'); if (tb && e.button === 1) closeTab(TABS.find((x) => x.id === +tb.dataset.tid)); });
// 后台标签继续接收流式结果
api.on('search:event', ({ sid, type, data }) => {
  if (sid === R.sid) { if (type === 'done' || type === 'start') setTimeout(renderTabs, 0); return; }
  const tb = TABS.find((x) => x !== active && x.state.sid === sid); if (!tb) return; const st = tb.state;
  if (type === 'results') for (const r of data) st.results.set(r.key, r);
  else if (type === 'source') st.statuses.set(data.id + (data.q || ''), data);
  else if (type === 'done') { st.done = data; st.running = false; renderTabs(); }
  if (type === 'results') { clearTimeout(tb.t); tb.t = setTimeout(renderTabs, 400); }
});
const origSearch = doSearch;
doSearch = async function (opts = {}) {
  if (!active) { TABS.push(active = { id: ++tabSeq, state: snap() }); }
  if (opts.newTab) { const q = $('#q').value; active.state = snap(); const tb = { id: ++tabSeq, state: {} }; TABS.push(tb); active = tb; R.sid = null; $('#q').value = q; delete opts.newTab; }
  await origSearch(opts); renderTabs(); kb.idx = -1;
};

// ================= 渲染增强：域名分组 + 键盘选中 =================
const origRender = render;
render = function () {
  origRender();
  if (!R.sid) return;
  const box = $('#results');
  if ($('#sort').value === 'domain' && !box.classList.contains('grid')) {
    const cards = $$(':scope > .card', box); const groups = new Map();
    for (const c of cards) { const r = getR(c.dataset.key); const h = hostOf(r?.url) || '其他'; (groups.get(h) || groups.set(h, { n: 0, best: 0, els: [] }).get(h)).els.push(c); const g = groups.get(h); g.n++; g.best = Math.max(g.best, r?.score || 0); }
    const order = [...groups.entries()].sort((a, b) => b[1].n - a[1].n || b[1].best - a[1].best);
    const frag = document.createDocumentFragment();
    for (const [h, g] of order) { const d = document.createElement('div'); d.className = 'dgroup' + (g.n > 6 ? ' collapsed' : ''); d.innerHTML = `<div class="dghead"><img src="https://icons.duckduckgo.com/ip3/${esc(h)}.ico" alt=""><b>${esc(h)}</b><em>${g.n}</em><span class="grow"></span>${g.n > 6 ? '<button class="link dgmore">展开全部</button>' : ''}</div>`; g.els.forEach((c) => d.append(c)); frag.append(d); }
    const more = box.querySelector(':scope > .more'); box.querySelectorAll(':scope > .card').forEach((c) => c.remove()); box.insertBefore(frag, more || null);
  }
  if (kb.idx >= 0) markSel(false);
};
$('#results').addEventListener('click', (e) => { const b = e.target.closest('.dgmore'); if (b) { b.closest('.dgroup').classList.remove('collapsed'); b.remove(); } }, true);

// ================= 预览 / 阅读模式 =================
let pvToken = 0;
const LV = { ok: ['shield-check-line', '安全提示：正常'], warn: ['error-warning-line', '注意'], danger: ['alarm-warning-line', '高风险'] };
const KIND_IC = { ebook: 'book-open-line', software: 'install-line', archive: 'file-zip-line', media: 'movie-2-line', doc: 'file-text-line', torrent: 'magnet-line', netdisk: 'cloud-line', file: 'file-download-line', link: 'download-2-line' };
function resHtml(list) {
  if (!list?.length) return '';
  const real = list.filter((x) => x.kind !== 'link'); const L = (real.length ? real : list).slice(0, 24);
  const danger = L.filter((x) => x.level === 'danger').length;
  return `<div class="pv-res"><div class="pv-sec"><i class="ri-download-cloud-2-line"></i> 识别到 ${L.length} 个下载资源${danger ? ` · <span class="errc">${danger} 个高风险</span>` : ''}</div>
  ${L.map((x) => `<div class="res lv-${x.level}"><i class="ri-${KIND_IC[x.kind] || 'download-2-line'} rk"></i><div class="rb"><div class="rt" title="${esc(x.url)}">${esc(x.text || x.url)}</div><div class="rm">${x.format ? `<span class="tag">${esc(String(x.format).toUpperCase())}</span>` : ''}${x.size ? `<span class="tag">${esc(x.size)}</span>` : ''}${x.netdisk ? `<span class="tag">${esc(x.netdisk)}${x.code ? ' · 提取码 ' + esc(x.code) : ''}</span>` : ''}${x.mirrorGroup ? `<span class="tag">镜像 #${x.mirrorIndex}</span>` : ''}<span class="dim">${esc(x.host)}</span></div><div class="rh"><i class="ri-${LV[x.level]?.[0]}"></i> ${esc((x.hints || []).join('；') || LV[x.level]?.[1])}</div></div><div class="ra"><button class="icon-btn" data-ropen="${esc(x.url)}" title="在浏览器中打开/下载"><i class="ri-external-link-line"></i></button><button class="icon-btn" data-rcopy="${esc(x.url)}" title="复制链接"><i class="ri-file-copy-line"></i></button></div></div>`).join('')}
  <div class="dim pv-note"><i class="ri-information-line"></i> 安全提示基于域名、扩展名与链接特征的启发式判断，不能替代杀毒扫描；请优先从官方站点下载并核对哈希。</div></div>`;
}
async function preview(r) {
  if (!r) return; const tk = ++pvToken;
  openSide('preview', `<i class="ri-book-read-line"></i> ${t('preview')}`); $('#side').classList.add('wide');
  const head = `<div class="pv-head"><div class="pv-title">${esc(r.title)}</div><div class="dim pv-url">${esc(r.url)}</div>
    <div class="pv-acts"><button class="small primary" data-pv="browser"><i class="ri-external-link-line"></i> 浏览器打开</button><button class="small" data-pv="inapp"><i class="ri-window-line"></i> 应用内打开</button><button class="small" data-pv="copy"><i class="ri-link"></i> 复制链接</button><button class="small" data-pv="fav"><i class="ri-star-line"></i> 收藏</button><button class="small" data-pv="text" disabled><i class="ri-file-copy-2-line"></i> 复制正文</button></div></div>`;
  $('#sideBody').innerHTML = head + `<div class="pv-load"><i class="ri-loader-4-line spin"></i> 正在以阅读模式加载…</div>`;
  $('#sideBody').dataset.url = r.url; $('#sideBody').scrollTop = 0; S.pv = { r, page: null };
  const p = await api.preview.fetch(r.url); if (tk !== pvToken) return;
  S.pv.page = p;
  let body;
  if (!p.ok) body = `<div class="notice err"><i class="ri-error-warning-line"></i> 无法加载阅读模式：${esc(p.error)}<br><span class="dim">可能需要登录、被反爬拦截或为动态页面。可尝试「应用内打开」或浏览器打开。</span></div>${r.snippet ? `<p class="pv-p">${esc(r.snippet)}</p>` : ''}`;
  else if (p.binary) body = `<div class="notice"><i class="ri-file-download-line"></i> 这是一个文件（${esc(p.contentType || '')}），不是网页。</div>`;
  else {
    const meta = [p.siteName, p.author, p.date && String(p.date).slice(0, 10), p.words ? `约 ${p.words} 字 · ${p.readMin} 分钟` : ''].filter(Boolean).map(esc).join(' · ');
    let imgs = 0;
    body = `<div class="pv-meta dim">${meta}</div>${p.title && p.title !== r.title ? `<h3 class="pv-h1">${esc(p.title)}</h3>` : ''}` +
      (p.blocks.length ? p.blocks.map((b) => b.t === 'img' ? (imgs++ < 12 ? `<img class="pv-img" loading="lazy" src="${esc(b.src)}" alt="${esc(b.alt)}">` : '') : b.t === 'h' ? `<h4 class="pv-h">${esc(b.text)}</h4>` : b.t === 'pre' ? `<pre class="pv-pre">${esc(b.text)}</pre>` : b.t === 'blockquote' ? `<blockquote>${esc(b.text)}</blockquote>` : b.t === 'li' ? `<div class="pv-li">• ${esc(b.text)}</div>` : `<p class="pv-p">${esc(b.text)}</p>`).join('') : `<div class="dim">未能提取正文。</div>`);
  }
  const res = p.ok ? resHtml(p.resources) : '';
  $('#sideBody').innerHTML = head + res + `<div class="pv-body">${body}</div>`;
  const tb = $('[data-pv=text]', $('#sideBody')); if (tb) tb.disabled = !p.text;
}
$('#side').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-pv],[data-ropen],[data-rcopy]'); if (!b) return;
  if (b.dataset.ropen) return api.open(b.dataset.ropen);
  if (b.dataset.rcopy) { api.copy(b.dataset.rcopy); return toast('<i class="ri-check-line"></i> 已复制'); }
  const r = S.pv?.r; if (!r) return;
  const a = b.dataset.pv;
  if (a === 'browser') api.open(r.url);
  else if (a === 'inapp') api.preview.window(r.url);
  else if (a === 'copy') { api.copy(r.url); toast('<i class="ri-check-line"></i> 已复制链接'); }
  else if (a === 'fav') { await toggleFav(r); render(); }
  else if (a === 'text' && S.pv.page?.text) { api.copy(`${S.pv.page.title || r.title}\n${r.url}\n\n${S.pv.page.text}`); toast('<i class="ri-check-line"></i> 已复制正文'); }
});
const sideCloseOrig = $('#sideClose').onclick; $('#sideClose').onclick = () => { $('#side').classList.remove('wide'); pvToken++; sideCloseOrig(); };
const oOpenSide = openSide; openSide = function (mode, title) { if (mode !== 'preview' && mode !== 'deep') $('#side').classList.remove('wide'); oOpenSide(mode, title); };
$('#results').addEventListener('click', (e) => {
  const card = e.target.closest('.card'); if (!card) return;
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'preview') { e.stopPropagation(); selectCard(card); preview(getR(card.dataset.key)); return; }
  if (!act && !e.target.closest('[data-open],a,button,[data-href]') && S.settings.previewInApp !== false) { selectCard(card); preview(getR(card.dataset.key)); }
}, true);

// ================= 键盘导航 =================
const kb = { idx: -1 };
const cardsNow = () => $$('#results .card').filter((c) => c.offsetParent);
function markSel(scroll = true) { const L = cardsNow(); $$('#results .card.kbsel').forEach((c) => c.classList.remove('kbsel')); const c = L[kb.idx]; if (c) { c.classList.add('kbsel'); if (scroll) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } }
function selectCard(card) { kb.idx = cardsNow().indexOf(card); markSel(false); }
const selR = () => { const c = cardsNow()[kb.idx]; return c && getR(c.dataset.key); };
document.addEventListener('keydown', (e) => {
  if (!$('#modal').hidden || !$('#p-search').classList.contains('active')) return;
  if (e.ctrlKey && !e.shiftKey && !e.altKey) {
    if (e.key === 't') { e.preventDefault(); return newTab(); }
    if (e.key === 'w') { e.preventDefault(); return closeTab(active); }
    if (e.key === 'd') { e.preventDefault(); return runDeep(); }
    if (e.key === 'Tab') { e.preventDefault(); const i = TABS.indexOf(active); return switchTab(TABS[(i + 1) % TABS.length]); }
    if (/^[1-9]$/.test(e.key) && TABS[+e.key - 1]) { e.preventDefault(); return switchTab(TABS[+e.key - 1]); }
  }
  if (e.target.matches?.('input,textarea,select,[contenteditable]')) return;
  const L = cardsNow(); if (!L.length) return;
  const k = e.key;
  if (k === 'j' || k === 'ArrowDown') { kb.idx = Math.min(L.length - 1, kb.idx + 1); markSel(); e.preventDefault(); }
  else if (k === 'k' || k === 'ArrowUp') { kb.idx = Math.max(0, kb.idx - 1); markSel(); e.preventDefault(); }
  else if (k === 'g') { kb.idx = 0; markSel(); } else if (k === 'G') { kb.idx = L.length - 1; markSel(); }
  else if (kb.idx >= 0) {
    const r = selR(); if (!r) return;
    if (k === 'Enter') { e.preventDefault(); e.shiftKey ? api.preview.window(r.url) : api.open(r.url); }
    else if (k === ' ' || k === 'p') { e.preventDefault(); preview(r); }
    else if (k === 'o') api.preview.window(r.url);
    else if (k === 'f') toggleFav(r).then(render);
    else if (k === 'c') { api.copy(r.url); toast('<i class="ri-check-line"></i> 已复制链接'); }
    else if (k === 'Escape' && !$('#side').hidden) $('#sideClose').click();
  }
});
// 帮助里补充快捷键
const oShort = showShortcuts; showShortcuts = function () { oShort(); const g = $('.shortcut-grid'); if (g) g.insertAdjacentHTML('beforeend', `<span>上 / 下一条结果</span><span><kbd>J</kbd> <kbd>K</kbd> 或 <kbd>↑</kbd> <kbd>↓</kbd></span><span>预览（阅读模式）</span><kbd>Space</kbd><span>浏览器 / 应用内打开</span><span><kbd>Enter</kbd> / <kbd>Shift</kbd>+<kbd>Enter</kbd></span><span>收藏 / 复制链接</span><span><kbd>F</kbd> / <kbd>C</kbd></span><span>新建 / 关闭标签页</span><span><kbd>Ctrl</kbd>+<kbd>T</kbd> / <kbd>Ctrl</kbd>+<kbd>W</kbd></span><span>切换标签页</span><span><kbd>Ctrl</kbd>+<kbd>1-9</kbd> / <kbd>Ctrl</kbd>+<kbd>Tab</kbd></span><span>深度搜索</span><span><kbd>Ctrl</kbd>+<kbd>D</kbd></span><span>新标签中搜索</span><span><kbd>Alt</kbd>+<kbd>Enter</kbd></span>`); };

// ================= 联想（历史 + 在线） =================
let sgT = null, sgSel = -1, sgSeq = 0;
$('#q').addEventListener('input', () => {
  clearTimeout(sgT); const v = $('#q').value.trim(); if (!v) return;
  sgT = setTimeout(async () => { const my = ++sgSeq; const L = await api.suggest(v).catch(() => []); if (my !== sgSeq || $('#q').value.trim() !== v || document.activeElement !== $('#q')) return; sgSel = -1;
    $('#suggest').innerHTML = L.map((x) => `<div class="sg" data-q="${esc(x.t)}"><i class="ri-${x.from === 'history' ? 'history-line' : 'search-line'}"></i>${esc(x.t)}${x.from === 'history' ? '<span class="grow"></span><span class="dim">历史</span>' : ''}</div>`).join('');
    $('#suggest').classList.toggle('on', !!L.length); }, 160);
});
$('#q').addEventListener('keydown', (e) => {
  const L = $$('#suggest .sg'); const on = $('#suggest').classList.contains('on');
  if (on && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && L.length) { e.preventDefault(); sgSel = (sgSel + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length; L.forEach((x, i) => x.classList.toggle('sel', i === sgSel)); $('#q').value = L[sgSel].dataset.q; }
  if (e.key === 'Enter') { sgSeq++; clearTimeout(sgT); if (e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); hideSuggest(); doSearch({ newTab: true }); } }
}, true);

// ================= 深度搜索 =================
let deepId = null, deepBuf = '', deepRefs = [];
const CRED = { high: ['shield-check-line', '高可信', 'okc'], medium: ['shield-line', '中等', 'warnc'], low: ['shield-cross-line', '低可信', 'errc'] };
function reportHtml(title, r) {
  const css = 'body{font:15px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#1d2127}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #dde0e5;padding:6px 10px;text-align:left}th{background:#f4f5f7}a{color:#3b5bdb}a.cite{font-size:11px;vertical-align:super;margin:0 1px}blockquote{border-left:3px solid #6d8dff;margin:0;padding:2px 12px;color:#555}.c{font-size:13px;color:#666}';
  const body = md(r.report, r.cites).replace(/data-href=/g, 'href=');
  const cites = r.cites.map((c) => `<li><a href="${esc(c.url)}">${esc(c.title)}</a> <span class="c">${esc(c.sourceName || '')} · ${esc(c.cred?.host || '')}${c.cred ? ' · 可信度 ' + c.cred.level + ' (' + c.cred.score + ')' : ''}</span></li>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style><h1>${esc(title)}</h1><p class="c">OmniSeek 万搜深度研究 · ${new Date().toLocaleString()} · ${r.read ?? r.cites.length} 个页面 · ${r.rounds} 个查询</p>${body}<h2>引用</h2><ol>${cites}</ol></html>`;
}
function reportMd(title, r) { return `# ${title}\n\n${r.report}\n\n## 引用\n\n${r.cites.map((c) => `${c.n}. [${c.title}](${c.url})${c.cred ? ` — ${c.cred.host} · 可信度 ${c.cred.level}` : ''}`).join('\n')}\n`; }
async function runDeep() {
  const q = $('#q').value.trim(); if (!q) { $('#q').focus(); return toast('请输入要深度研究的问题', 'warn'); }
  if (deepId) api.deep.cancel(deepId);
  const did = deepId = 'd' + Date.now(); deepBuf = ''; deepRefs = [];
  openSide('deep', `<i class="ri-radar-line"></i> 深度研究 · ${esc(q)}`); $('#side').classList.add('wide');
  const depth = +(S.settings.researchDepth || 2), pages = +(S.settings.researchPages || 10);
  $('#sideBody').innerHTML = `${S.ai.enabled ? '' : `<div class="notice"><i class="ri-information-line"></i> 未配置 AI 模型：将执行单轮检索 + 正文抽取。配置模型后支持规划、事实抽取、反思补缺与结构化报告。 <button class="link" id="dpSet">去设置</button></div>`}
    <div class="deep-budget">${S.ai.enabled ? `<label>深度 <select id="dpDepth">${[1, 2, 3, 4].map((n) => `<option ${n === depth ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>阅读预算 <select id="dpPages">${[4, 6, 10, 15, 20, 30].map((n) => `<option ${n === pages ? 'selected' : ''}>${n}</option>`).join('')}</select> 页</label><button class="small" id="dpRe"><i class="ri-restart-line"></i> 按此预算重新研究</button>` : ''}<span class="grow"></span><button class="small" id="dpStop"><i class="ri-stop-circle-line"></i> 停止</button></div>
    <div class="deep-steps" id="dpSteps"></div><div class="msg bot md" id="dpOut"></div><div id="dpCites"></div>`;
  $('#dpSet') && ($('#dpSet').onclick = () => go('settings'));
  $('#dpStop').onclick = () => { api.deep.cancel(did); };
  $('#dpRe') && ($('#dpRe').onclick = async () => { await api.settings.set({ researchDepth: +$('#dpDepth').value, researchPages: +$('#dpPages').value }); S.settings.researchDepth = +$('#dpDepth').value; S.settings.researchPages = +$('#dpPages').value; runDeep(); });
  try {
    const r = await api.deep.run({ did, query: q, ...scopeFromUi(), budget: S.ai.enabled ? { depth: +($('#dpDepth')?.value || depth), pages: +($('#dpPages')?.value || pages) } : undefined }); if (did !== deepId) return;
    deepRefs = r.cites;
    $('#dpOut').innerHTML = md(r.report, r.cites);
    const credBadge = (c) => c.cred ? `<span class="${CRED[c.cred.level][2]}" title="${esc((c.cred.why || []).join('、'))}"><i class="ri-${CRED[c.cred.level][0]}"></i> ${CRED[c.cred.level][1]} ${c.cred.score}</span>` : '';
    $('#dpCites').innerHTML = (r.facts?.length ? `<details class="facts"><summary><i class="ri-list-check-3"></i> 去重事实 ${r.facts.length} 条${r.coverage ? ' · 覆盖度 ' + r.coverage + '%' : ''}</summary>${r.facts.map((f) => `<div class="fact c-${f.confidence}">${esc(f.text)} ${f.ns.map((n) => `<a class="cite" data-href="${esc(r.cites[n - 1]?.url || '')}">${n}</a>`).join('')}</div>`).join('')}</details>` : '') +
      `<div class="pv-sec"><i class="ri-links-line"></i> 引用来源（${r.cites.length}）· ${fmtMs(r.ms)} · ${r.rounds} 个查询${r.subquestions?.length ? ' · ' + r.subquestions.length + ' 个子问题' : ''}</div>` + r.cites.map((c) => `<div class="citerow"><span class="cn">${c.n}</span><div class="cb"><a data-href="${esc(c.url)}">${esc(c.title)}</a><div class="dim">${esc(c.sourceName || '')} · ${esc(hostOf(c.url))}${c.ok ? ' · <span class="okc">已读正文</span>' : ''} ${credBadge(c)}${c.resources?.length ? ` · <span class="warnc">${c.resources.length} 个下载资源</span>` : ''}</div></div><button class="icon-btn" data-cpv="${c.n}" title="预览"><i class="ri-eye-line"></i></button></div>`).join('') +
      `<div class="deep-actions"><button class="small" id="dpCopy"><i class="ri-file-copy-line"></i> 复制报告</button><button class="small" id="dpExp"><i class="ri-markdown-line"></i> 导出 Markdown</button><button class="small" id="dpHtml"><i class="ri-html5-line"></i> 导出 HTML</button><button class="small" id="dpAsk"><i class="ri-chat-3-line"></i> 在 Copilot 中追问</button></div>`;
    $('#dpStop')?.remove();
    const title = '深度研究：' + q;
    $('#dpCopy').onclick = () => { api.copy(reportMd(title, r)); toast('<i class="ri-check-line"></i> 已复制报告'); };
    $('#dpExp').onclick = async () => { const p = await api.saveFile({ name: title, ext: 'md', content: reportMd(title, r) }); if (p) toast('已导出到 ' + esc(p)); };
    $('#dpHtml').onclick = async () => { const p = await api.saveFile({ name: title, ext: 'html', content: reportHtml(title, r) }); if (p) toast('已导出到 ' + esc(p)); };
    $('#dpAsk').onclick = () => window.copilotAsk?.(`基于这份研究报告继续追问：\n\n${r.report.slice(0, 3000)}\n\n我的问题：`);
    $$('[data-cpv]', $('#dpCites')).forEach((b) => b.onclick = () => { const c = r.cites[+b.dataset.cpv - 1]; preview({ title: c.title, url: c.url, snippet: c.excerpt }); });
  } catch (e) { if (did === deepId) $('#dpOut').innerHTML = `<div class="notice err">${esc(errMsg(e))}</div>`; }
}
$('#deepBtn').onclick = runDeep;
const STEP_IC = { facts: 'list-check-3', reflect: 'loop-left-line', plan: 'route-line', intent: 'focus-3-line', search: 'search-2-line', round: 'stack-line', rank: 'sort-desc', followup: 'question-answer-line', read: 'book-read-line', page: 'file-text-line', report: 'quill-pen-line', warn: 'error-warning-line' };
api.on('deep:step', (s) => { if (s.did !== deepId) return; const el = $('#dpSteps'); if (!el) return; el.insertAdjacentHTML('beforeend', `<div class="dstep st-${s.stage}"><i class="ri-${STEP_IC[s.stage] || 'arrow-right-s-line'}"></i><span>${s.stage === 'intent' ? '<b>意图：</b>' : ''}${esc(s.msg)}${s.subquestions?.length ? '<div class="subq">' + s.subquestions.map((x) => '<span class="tag">' + esc(x) + '</span>').join('') + '</div>' : ''}${s.cred ? ` <span class="${CRED[s.cred][2]}"><i class="ri-${CRED[s.cred][0]}"></i></span>` : ''}</span></div>`); });
api.on('deep:token', ({ did, t: tok }) => { if (did !== deepId) return; deepBuf += tok; const el = $('#dpOut'); if (el) el.innerHTML = md(deepBuf, deepRefs); });

// ================= 通知：更新 =================
api.on('notice', (n) => { if (n.type === 'update') { const d = document.createElement('div'); d.className = 'toast'; d.innerHTML = `<i class="ri-arrow-up-circle-line"></i> 发现新版本 <b>${esc(n.latest)}</b>（当前 ${esc(n.current)}） ${n.installer ? '<button class="small primary" id="updGo">安装</button>' : ''}`; $('#toasts').append(d); d.querySelector('#updGo')?.addEventListener('click', () => api.update.install(n.installer)); setTimeout(() => d.remove(), 15000); } });

// ================= 设置：数据与维护 =================
const oSet = PAGES.settings;
PAGES.settings = async () => {
  await oSet(); const st = S.settings;
  $('#setBody').insertAdjacentHTML('beforeend', `
  <div class="panel"><h4><i class="ri-search-eye-line"></i> 搜索体验</h4><div class="grid2">
    <label class="chk"><input type="checkbox" id="vSug"> 在线搜索联想（百度/Bing 建议）</label>
    <label class="chk"><input type="checkbox" id="vPv"> 点击结果卡片空白处打开预览</label>
    <label class="fld">深度搜索轮数（1-4）<input type="number" id="vRounds" min="1" max="4" value="${st.deepRounds || 2}"></label>
    <label class="fld">深度搜索阅读页面数（2-12）<input type="number" id="vRead" min="2" max="12" value="${st.deepRead || 6}"></label></div></div>
  <div class="panel"><h4><i class="ri-shield-check-line"></i> 数据、日志与更新</h4>
    <div class="btnrow"><button id="bkExp"><i class="ri-download-2-line"></i> 导出备份</button><button id="bkImp"><i class="ri-upload-2-line"></i> 从备份恢复</button><button id="bkDir"><i class="ri-folder-history-line"></i> 自动备份目录</button>
      <button id="lgView"><i class="ri-bug-line"></i> 错误日志</button><button id="upChk"><i class="ri-refresh-line"></i> 检查更新</button></div>
    <div class="grid2" style="margin-top:10px"><label class="fld">更新源（本地 latest.json 路径或 http(s) 地址；留空=默认）<input id="vFeed" value="${esc(st.updateFeed || '')}" placeholder="%USERPROFILE%\\GrokBot-Apps\\OmniSeek\\installer\\latest.json"></label>
    <label class="chk"><input type="checkbox" id="vAutoUp"> 启动时检查更新</label></div>
    <p class="settings-hint">备份包含设置（含模型 API Key，请妥善保管）、自定义来源与收藏/历史；恢复前会自动把当前数据备份到“自动备份目录”。</p><div id="upOut" class="dim"></div></div>`);
  $('#vSug').checked = st.suggestOnline !== false; $('#vPv').checked = st.previewInApp !== false; $('#vAutoUp').checked = st.autoUpdateCheck !== false;
  const sv = async () => { S.settings = await api.settings.set({ suggestOnline: $('#vSug').checked, previewInApp: $('#vPv').checked, deepRounds: Math.min(4, Math.max(1, +$('#vRounds').value || 2)), deepRead: Math.min(12, Math.max(2, +$('#vRead').value || 6)), updateFeed: $('#vFeed').value.trim(), autoUpdateCheck: $('#vAutoUp').checked }); };
  ['#vSug', '#vPv', '#vRounds', '#vRead', '#vFeed', '#vAutoUp'].forEach((s) => $(s).addEventListener('change', sv));
  $('#bkExp').onclick = async () => { const p = await api.backup.export(); if (p) toast('已导出备份：' + esc(p)); };
  $('#bkImp').onclick = async () => { try { const r = await api.backup.import(); if (!r) return; toast(`已从备份恢复（${esc(r.version || '')} · ${esc(String(r.restoredFrom || '').slice(0, 10))}）`); S.settings = await api.settings.get(); await refreshSources(); await refreshLib(); await refreshAi(); PAGES.settings(); } catch (e) { toast(esc(errMsg(e)), 'warn'); } };
  $('#bkDir').onclick = () => api.backup.openDir();
  $('#lgView').onclick = showLogs;
  $('#upChk').onclick = async () => { $('#upOut').textContent = '检查中…'; const u = await api.update.check(); $('#upOut').innerHTML = !u.ok ? `<span class="errc">检查失败：${esc(u.error)}</span>（${esc(u.feed)}）` : u.newer ? `<span class="okc">发现新版本 ${esc(u.latest)}</span>（当前 ${esc(u.current)}）${u.notes ? ' · ' + esc(u.notes) : ''} ${u.installer ? '<button class="small primary" id="upGo">运行安装包</button>' : ''}` : `已是最新版本 ${esc(u.current)}${u.note ? ' · ' + esc(u.note) : ''} <span class="dim">（${esc(u.feed)}）</span>`; $('#upGo') && ($('#upGo').onclick = () => api.update.install(u.installer)); };
};
async function showLogs() {
  const L = await api.logs.get();
  modal(`<h3><i class="ri-bug-line"></i> 错误日志 <span class="dim">（最近 ${L.length} 条）</span></h3><div class="logbox">${L.length ? L.map((x) => `<details class="logi"><summary><span class="dim">${esc(x.at ? new Date(x.at).toLocaleString() : '')}</span> <span class="tag">${esc(x.scope || '')}</span> ${esc(String(x.msg || '').slice(0, 160))}</summary>${x.stack ? `<pre>${esc(x.stack)}</pre>` : ''}</details>`).join('') : '<div class="empty small"><i class="ri-emotion-happy-line"></i><p>暂无错误记录</p></div>'}</div>
    <div class="dlgbtns"><button id="lgCopy"><i class="ri-file-copy-line"></i> 复制全部</button><button id="lgOpen"><i class="ri-folder-open-line"></i> 打开日志文件</button><button class="danger" id="lgClr"><i class="ri-delete-bin-line"></i> 清空</button><button class="primary" id="lgOk">关闭</button></div>`, (d) => {
    $('#lgOk', d).onclick = closeModal; $('#lgOpen', d).onclick = () => api.logs.open();
    $('#lgCopy', d).onclick = () => { api.copy(L.map((x) => `${x.at} [${x.scope}] ${x.msg}\n${x.stack || ''}`).join('\n')); toast('已复制'); };
    $('#lgClr', d).onclick = async () => { await api.logs.clear(); closeModal(); toast('日志已清空'); };
  });
}
window.showLogs = showLogs;

// ================= 健康页：来源速度统计 =================
const oHealth = PAGES.health;
PAGES.health = async () => {
  await oHealth(); const L = await api.health.speed(); if (!L.length) return;
  const slow = [...L].sort((a, b) => (b.p50 || b.avgMs) - (a.p50 || a.avgMs)).slice(0, 10), fast = L.slice(0, 10);
  const row = (x) => `<tr><td>${esc(x.name || x.id)}</td><td>${fmtMs(x.p50 || x.avgMs)}</td><td>${x.p95 ? fmtMs(x.p95) : '-'}</td><td>${x.okRate ?? '-'}%</td><td>${x.runs}</td></tr>`;
  const tbl = (title, ic, rows) => `<div class="panel"><h4><i class="ri-${ic}"></i> ${title}</h4><table class="speed"><thead><tr><th>来源</th><th>P50</th><th>P95</th><th>成功率</th><th>次数</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
  $('#dash').insertAdjacentHTML('beforeend', `<div class="speedwrap">${tbl('最快的来源', 'flashlight-line', fast)}${tbl('最慢的来源（可考虑禁用）', 'timer-line', slow)}</div>`);
};

document.addEventListener('error', (e) => { const el = e.target; if (el?.tagName === 'IMG' && el.closest('.pv-body,.dghead')) el.remove(); }, true);
renderTabs();
})();
