// OmniSeek 2.3 —— 万搜 Copilot、智能路由、AI 结果增强、AI 来源维护、模型路由/用量/缓存/审计/提示词设置
(() => {
const errMsg = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const TOOL_IC = { analyze_intent: 'focus-3-line', search: 'search-2-line', read_page: 'book-read-line', run_source: 'play-circle-line', filter_results: 'filter-3-line', compare: 'scales-3-line', list_sources: 'stack-line', create_source: 'add-box-line', create_dimension: 'compass-3-line', remember: 'brain-line' };
const TOOL_LB = { analyze_intent: '分析意图', search: '联合搜索', read_page: '阅读网页', run_source: '运行来源', filter_results: '筛选结果', compare: '对比', list_sources: '查看来源', create_source: '创建来源', create_dimension: '创建维度', remember: '记住偏好' };
const OP_LB = { upsert: '新增/修改来源', disable: '禁用', enable: '启用', remove: '移除', category: '新建分类', extension: '写入扩展', scene: '新建搜索维度' };

// ================= Copilot =================
const CP = { cid: null, running: false, buf: '', live: null, trace: null };
const cpLog = () => $('#cpLog');
const append = (html, cls = 'bot') => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; cpLog().append(d); cpLog().scrollTop = 1e9; return d; };
function stepHtml(st) { return `<div class="tstep ${st.ok === false ? 'bad' : ''}"><i class="ri-${TOOL_IC[st.tool] || 'tools-line'}"></i><b>${esc(TOOL_LB[st.tool] || st.tool)}</b><code>${esc(JSON.stringify(st.args || {}).slice(0, 140))}</code>${st.brief ? `<div class="tb">${esc(st.brief)}${st.ms != null ? ` · ${fmtMs(st.ms)}` : ''}</div>` : '<div class="tb dim"><i class="ri-loader-4-line spin"></i> 运行中…</div>'}</div>`; }
function traceBox(steps = [], open = false) { return `<details class="trace" ${open ? 'open' : ''}><summary><i class="ri-route-line"></i> 执行轨迹 · ${steps.length} 步</summary><div class="tsteps">${steps.map(stepHtml).join('')}</div></details>`; }
function proposalCard(p, applied) {
  const d = append(`<div class="proposal"><div class="ph"><i class="ri-git-pull-request-line"></i> 待确认提案：${esc(p.summary)}</div>${p.changes.map((c, i) => `<div class="chg"><label class="chk"><input type="checkbox" data-i="${i}" ${c.test?.ok === false ? '' : 'checked'}> <b>${esc(OP_LB[c.op] || c.op)}</b> ${esc(c.source?.name || c.scene?.name || c.label || '')}</label>
    ${c.test ? `<div class="${c.test.ok ? 'okc' : 'errc'}"><i class="ri-${c.test.ok ? 'checkbox-circle-line' : 'error-warning-line'}"></i> 实测：${c.test.ok ? c.test.count + ' 条 · ' + esc((c.test.sample || []).join(' / ')) : esc(c.test.error || '0 条结果')}</div>` : ''}
    ${c.source ? `<pre class="diff">${esc(JSON.stringify(c.source, null, 2).slice(0, 3000))}</pre>` : c.scene ? `<div class="dim">分类：${esc((c.scene.categories || []).join('、') || '—')} · 来源 ${(c.scene.sourceIds || []).length} 个</div>` : ''}</div>`).join('')}
    <div class="dlgbtns"><button class="discard">放弃</button><button class="primary applyp"><i class="ri-check-line"></i> 确认应用</button></div></div>`, 'bot wide');
  if (applied) d.querySelector('.dlgbtns').innerHTML = '<span class="dim">（历史提案）</span>';
  $('.discard', d).onclick = () => { d.querySelector('.dlgbtns').innerHTML = '<span class="dim">已放弃</span>'; };
  $('.applyp', d).onclick = async () => { const sel = $$('input[data-i]', d).filter((x) => x.checked).map((x) => +x.dataset.i);
    try { const done = await api.agent.apply(p.id, sel); d.querySelector('.dlgbtns').innerHTML = `<span class="okc"><i class="ri-check-double-line"></i> 已应用：${esc(done.join('；'))}</span>`; await refreshSources(); await refreshLib(); initFilters(); }
    catch (e) { toast(esc(errMsg(e)), 'err'); } };
}
function renderMsg(m) {
  if (m.role === 'user') return append(esc(m.content).replace(/\n/g, '<br>'), 'user');
  const d = append(`${m.steps?.length ? traceBox(m.steps) : ''}<div class="md">${md(m.content || '', m.refs || [])}</div>${m.refs?.length ? refsHtml(m.refs) : ''}${m.mode ? `<div class="dim mode">${m.mode === 'json' ? 'JSON 工具协议（模型不支持原生函数调用）' : '原生函数调用'}</div>` : ''}`, 'bot' + (m.error ? ' err' : ''));
  return d;
}
const refsHtml = (refs) => `<details class="refs"><summary><i class="ri-links-line"></i> 引用 ${refs.length}</summary>${refs.map((r, i) => `<div><span class="cn">${i + 1}</span> <a data-href="${esc(r.url)}">${esc(r.title || r.url)}</a> <span class="dim">${esc(r.sourceName || '')}</span></div>`).join('')}</details>`;
async function loadConvs() {
  const L = await api.conv.list(); const f = ($('#cvFilter').value || '').toLowerCase();
  $('#cvList').innerHTML = L.filter((c) => !f || c.title.toLowerCase().includes(f)).map((c) => `<div class="cv ${c.id === CP.cid ? 'on' : ''}" data-cv="${c.id}"><i class="ri-chat-3-line"></i><span>${esc(c.title)}</span><em>${c.count}</em><i class="ri-edit-line x" data-ren="${c.id}" title="重命名"></i><i class="ri-delete-bin-line x" data-del="${c.id}" title="删除"></i></div>`).join('') || '<div class="dim" style="padding:8px">暂无对话</div>';
  const mem = await api.memory.get();
  $('#cvMem').innerHTML = `<div class="pv-sec"><i class="ri-brain-line"></i> 长期记忆 <span class="grow"></span><button class="icon-btn" id="memAdd" title="添加"><i class="ri-add-line"></i></button></div>${mem.map((n, i) => `<div class="memi"><span>${esc(n)}</span><i class="ri-close-line x" data-forget="${i}"></i></div>`).join('') || '<div class="dim">Copilot 会记住你明确表达的偏好（如“我更喜欢 epub”）。</div>'}`;
  $('#memAdd').onclick = async () => { const n = await prompt2('添加记忆', '偏好 / 背景', ''); if (n) { await api.memory.add(n); loadConvs(); } };
}
$('#cvFilter').addEventListener('input', loadConvs);
$('#cvList').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]'), ren = e.target.closest('[data-ren]'), cv = e.target.closest('[data-cv]');
  if (del) { e.stopPropagation(); await api.conv.remove(del.dataset.del); if (CP.cid === del.dataset.del) newConv(); return loadConvs(); }
  if (ren) { e.stopPropagation(); const t = await prompt2('重命名对话', '标题', ''); if (t) { await api.conv.rename(ren.dataset.ren, t); loadConvs(); } return; }
  if (cv) openConv(cv.dataset.cv);
});
$('#cvMem').addEventListener('click', async (e) => { const f = e.target.closest('[data-forget]'); if (f) { await api.memory.forget(+f.dataset.forget); loadConvs(); } });
const CP_ASKS = ['帮我找《三体》英文版电子书，比较各版本的格式与来源', '对比 VS Code、Zed、Cursor 的最新版本与特点，给出表格', '调研 2026 年固态电池的产业化进展，附引用', '找一个免费、开源、适合 Windows 的 PDF 编辑器，给出首选', '为“新能源汽车政策”创建一个搜索维度'];
function welcomeCp() {
  cpLog().innerHTML = '';
  append(`<b><i class="ri-robot-2-line"></i> 万搜 Copilot</b><p>我是一个会<b>自己动手搜索</b>的智能体：分析意图 → 选择来源联合搜索 → 阅读网页 → 筛选与对比 → 给出带引用的回答。也能帮你<b>创建来源与搜索维度</b>（需要你确认）。每一步都会显示在“执行轨迹”中，随时可以停止或重试。</p>${S.ai.enabled ? '' : `<div class="ai-cta"><i class="ri-cpu-line"></i><div><b>${t('aiNeedKey')}</b><p class="dim">${t('aiNeedKeySub')}</p><button class="small primary" id="cpToSet">${t('goSettings')}</button></div></div>`}`);
  $('#cpToSet')?.addEventListener('click', () => go('settings'));
  $('#cpAsks').innerHTML = CP_ASKS.map((a) => `<span class="hchip">${esc(a)}</span>`).join('');
  $$('#cpAsks .hchip').forEach((c) => c.onclick = () => { $('#cpIn').value = c.textContent; $('#cpIn').focus(); });
}
function newConv() { CP.cid = null; welcomeCp(); loadConvs(); $('#cpIn').focus(); }
async function openConv(id) { const c = await api.conv.get(id); if (!c) return; CP.cid = id; cpLog().innerHTML = ''; $('#cpAsks').innerHTML = ''; for (const m of c.messages) renderMsg(m); loadConvs(); }
$('#cvNew').onclick = newConv;
function setRunning(on) { CP.running = on; $('#cpSend').hidden = on; $('#cpStop').hidden = !on; $('#cpRetry').disabled = on; }
async function cpSend(retry = false) {
  if (CP.running) return; const text = $('#cpIn').value.trim(); if (!text && !retry) return;
  if (!S.ai.enabled) { toast(t('aiNeedKey'), 'warn'); return go('settings'); }
  $('#cpIn').value = ''; $('#cpAsks').innerHTML = '';
  if (retry) { const us = $$('.msg.user', cpLog()); const last = us[us.length - 1]; if (!last) return; let n = last.nextElementSibling; while (n) { const x = n.nextElementSibling; n.remove(); n = x; } }
  else append(esc(text).replace(/\n/g, '<br>'), 'user');
  CP.buf = ''; CP.steps = [];
  CP.live = append(`${traceBox([], true)}<div class="md live"><span class="typing"><i></i><i></i><i></i></span></div>`, 'bot');
  setRunning(true);
  if (!CP.cid) { const c = await api.conv.create(); CP.cid = c.id; }
  const r = await api.copilot.run({ cid: CP.cid, text, retry });
  setRunning(false);
  const live = CP.live; CP.live = null;
  const m = { role: 'assistant', content: r.error || r.text, refs: r.refs, steps: r.steps || CP.steps, mode: r.mode, error: !!r.error };
  const d = renderMsg(m); live.replaceWith(d);
  for (const p of r.proposals || []) proposalCard(p);
  loadConvs();
}
$('#cpSend').onclick = () => cpSend(); $('#cpRetry').onclick = () => cpSend(true);
$('#cpStop').onclick = () => CP.cid && api.copilot.cancel(CP.cid);
$('#cpIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cpSend(); } });
api.on('copilot:event', (e) => {
  if (e.cid !== CP.cid || !CP.live) return;
  const box = $('.tsteps', CP.live), out = $('.md.live', CP.live);
  if (e.type === 'tool') { CP.steps.push({ tool: e.tool, args: e.args }); box.innerHTML = CP.steps.map(stepHtml).join(''); $('summary', CP.live).innerHTML = `<i class="ri-route-line"></i> 执行轨迹 · ${CP.steps.length} 步`; }
  else if (e.type === 'result') { const st = [...CP.steps].reverse().find((x) => x.tool === e.tool && !x.brief); if (st) Object.assign(st, { brief: e.brief, ok: e.ok, ms: e.ms }); box.innerHTML = CP.steps.map(stepHtml).join(''); }
  else if (e.type === 'think') { out.innerHTML = `<span class="dim"><i class="ri-lightbulb-line"></i> ${esc(e.text)}</span>`; }
  else if (e.type === 'progress') { out.innerHTML = `<span class="dim"><i class="ri-loader-4-line spin"></i> ${esc(e.msg)}</span>`; }
  else if (e.type === 'retract') { CP.buf = ''; }
  else if (e.type === 'token') { CP.buf += e.t; out.innerHTML = md(CP.buf); }
  else if (e.type === 'proposal') { /* 在完成后统一渲染 */ }
  cpLog().scrollTop = 1e9;
});
window.copilotAsk = (text) => { go('assistant'); $('#asSeg [data-m=copilot]').click(); newConv(); $('#cpIn').value = text; $('#cpIn').focus(); };
const oAssist = PAGES.assistant;
PAGES.assistant = () => {
  oAssist(); const st = S.ai;
  $('#asModel').innerHTML = st.enabled ? `<i class="ri-cpu-line"></i> ${esc(st.profile || '')}${st.fast && st.fast !== st.profile ? ` · <i class="ri-flashlight-line"></i> ${esc(st.fast)}` : ''}${st.strong && st.strong !== st.profile ? ` · <i class="ri-brain-line"></i> ${esc(st.strong)}` : ''}` : `<span class="warnc">${t('aiNeedKey')}</span>`;
  $('#asAgent').hidden = !$('#asSeg [data-m=agent]').classList.contains('on'); $('#asCopilot').hidden = !$('#asSeg [data-m=copilot]').classList.contains('on');
  if (!cpLog().children.length) welcomeCp(); loadConvs();
};
// 来源助手：快捷“发现来源/批量修复”
function agentAsk(text) { go('assistant'); $('#asSeg [data-m=agent]').click(); $('#agentIn').value = text; agentSend(); }
window.agentAsk = agentAsk;
async function discover() { const topic = await prompt2('AI 来源发现', '主题（例如：播客、开源硬件、法律法规）', ''); if (!topic) return; agentAsk(await api.ai.promptFill('discover', { topic })); }
async function repair(id, error) { const s = S.srcMap?.get(id) || {}; agentAsk(await api.ai.promptFill('repair', { id, name: s.name || id, error: error || s.rt?.lastError || '未知错误', query: { books: '三体', software: 'vscode', papers: 'transformer', video: '纪录片' }[s.category] || 'python' })); }
window.aiRepair = repair;
setTimeout(() => {
  const asks = $('#agentAsks'); if (!asks) return;
  const bar = document.createElement('div'); bar.className = 'agent-tools';
  bar.innerHTML = `<button class="small" id="agDisc"><i class="ri-compass-discover-line"></i> 为主题发现新来源</button><button class="small" id="agFix"><i class="ri-tools-line"></i> 批量修复失效来源</button>`;
  asks.parentElement.insertBefore(bar, asks); $('#agDisc').onclick = discover;
  $('#agFix').onclick = () => agentAsk('调用 health 列出失效（dead/error）且仍启用或被自动禁用的来源，逐个 get_source 与 fetch_url 诊断原因：能修复的修正 parse 并 test_source 验证；无法修复的建议禁用。最后一次性 propose 全部变更（修复 upsert + 禁用列表），我确认后再应用。');
}, 0);
api.on('notice', (n) => {
  if (n.type === 'autoDisabled' && n.repairable) { const d = document.createElement('div'); d.className = 'toast warn'; d.innerHTML = `<i class="ri-tools-line"></i> 「${esc(n.name)}」已自动禁用 <button class="small primary">AI 修复</button>`; $('#toasts').append(d); d.querySelector('button').onclick = () => { d.remove(); repair(n.id, n.error); }; setTimeout(() => d.remove(), 12000); }
});
// 健康页 & 来源行：AI 修复入口
const oHealth = PAGES.health;
PAGES.health = async () => { await oHealth(); if (!$('#hcAiFix')) { const b = document.createElement('button'); b.id = 'hcAiFix'; b.innerHTML = '<i class="ri-sparkling-2-line"></i> AI 批量修复'; b.onclick = () => $('#agFix') ? (go('assistant'), $('#agFix').click()) : null; $('#hcDisable').after(b); } };
document.addEventListener('contextmenu', (e) => { const row = e.target.closest('.srcrow'); if (!row || !S.ai.enabled) return; e.preventDefault(); repair(row.dataset.id); });

// ================= 搜索：智能路由 =================
const oScope = scopeFromUi;
scopeFromUi = function () { return { ...oScope(), smart: $('#optSmart').checked }; };
$('#optSmart').addEventListener('change', () => api.settings.set({ smartRoute: $('#optSmart').checked }));
const ENT_LB = { book: '书', author: '作者', software: '软件', version: '版本', isbn: 'ISBN', doi: 'DOI', arxiv: 'arXiv', format: '格式', year: '年份', person: '人物', org: '机构', product: '产品', paper: '论文', place: '地点', other: '实体' };
const TYPE_LB = { lookup: '查找', download: '下载', research: '研究', compare: '对比', howto: '教程', news: '资讯', navigate: '导航' };
api.on('search:event', ({ sid, type, data }) => {
  if (sid !== R.sid) return;
  if (type === 'intent') { R.intent = data; $('#expanded').innerHTML = `<span class="intent" title="${esc(data.intent)}"><i class="ri-route-line"></i> ${esc(TYPE_LB[data.type] || data.type)}${data.entities?.length ? ' · ' + data.entities.slice(0, 4).map((e) => `<span class="tag">${esc(ENT_LB[e.type] || e.type)}:${esc(e.value)}</span>`).join('') : ''}${data.applied?.length ? ' · 路由到 ' + data.applied.map((c) => esc(S.cats[c] || c)).join('、') : ''}${data.queries?.length > 1 ? ' · 多语言 ' + data.queries.slice(1).map(esc).join(' / ') : ''}${data.by === 'ai' ? ' <i class="ri-sparkling-2-line" title="AI 识别"></i>' : ''}</span>`; }
  if (type === 'start') { R.enh = null; }
  if (type === 'done' && S.settings.aiEnhance && !data.cancelled && R.results.size) setTimeout(() => runEnhance(true), 50);
});

// ================= AI 结果增强 =================
const QL = { good: ['medal-line', '优质', 'okc'], ok: null, low: ['error-warning-line', '低质', 'warnc'], spam: ['spam-2-line', '疑似垃圾', 'errc'] };
const BEST_LB = { book: '最佳图书', ebook: '最佳电子书', software: '最佳软件', other: '最佳推荐' };
async function runEnhance(auto) {
  if (!R.sid || !R.results.size) return toast('请先搜索', 'warn');
  const sid = R.sid; $('#enhBtn').innerHTML = '<i class="ri-loader-4-line spin"></i> 增强中…';
  try {
    const keys = filtered().L.slice(0, 30).map((r) => r.key);
    const e = await api.ai.enhance({ sid, keys, n: 30 }); if (sid !== R.sid) return;
    R.enh = e; if (!auto || $('#sort').value === 'rel') $('#sort').value = 'ai';
    render(); toast(`<i class="ri-sparkling-line"></i> 已增强 ${Object.keys(e.items).length} 条结果${e.by === 'rules' ? '（未配置 AI：规则质检与推荐）' : ''}`);
  } catch (err) { toast(esc(errMsg(err)), 'warn'); }
  finally { $('#enhBtn').innerHTML = '<i class="ri-sparkling-line"></i> AI 增强'; }
}
$('#enhBtn').onclick = () => runEnhance(false);
const prevRender = render;
render = function () {
  if ($('#sort').value === 'ai' && R.enh) { const pos = new Map(R.enh.order.map((k, i) => [k, i])); for (const r of R.results.values()) r._aiPos = pos.has(r.key) ? pos.get(r.key) : 1e6; }
  prevRender();
  if (!R.sid || !R.enh) return;
  const box = $('#results');
  for (const c of $$('.card', box)) {
    const x = R.enh.items[c.dataset.key]; if (!x || c.querySelector('.aienh')) continue;
    const q = QL[x.quality]; if (x.quality === 'spam') c.classList.add('spammy'); else if (x.quality === 'low') c.classList.add('lowq');
    const html = `${x.summary ? `<div class="ais"><i class="ri-sparkling-2-line"></i> ${esc(x.summary)}</div>` : ''}${x.why ? `<div class="aiw dim">相关性：${esc(x.why)}</div>` : ''}<div class="ait">${q ? `<span class="${q[2]}"><i class="ri-${q[0]}"></i> ${q[1]}</span>` : ''}${(x.flags || []).map((f) => `<span class="tag warn">${esc(f)}</span>`).join('')}${(x.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${x.aiScore != null ? `<span class="dim">AI 相关度 ${x.aiScore}/10</span>` : ''}</div>`;
    const el = document.createElement('div'); el.className = 'aienh'; el.innerHTML = html; const foot = c.querySelector('.foot'); foot ? c.insertBefore(el, foot) : c.append(el);
  }
  if (R.enh.best?.length && !box.querySelector('.bestpick') && R.tab === 'all') {
    const items = R.enh.best.map((b) => ({ b, r: R.results.get(b.key) })).filter((x) => x.r);
    if (items.length) { const d = document.createElement('div'); d.className = 'bestpick'; d.innerHTML = `<div class="pv-sec"><i class="ri-award-line"></i> 最佳推荐${R.enh.by === 'ai' ? '' : '（规则）'}</div>` + items.map(({ b, r }) => `<div class="bp" data-key="${esc(r.key)}"><span class="tag">${esc(BEST_LB[b.kind] || BEST_LB.other)}</span><a data-href="${esc(r.url)}">${esc(r.title)}</a><span class="dim">${esc(r.sourceName || '')}</span><div class="dim">${esc(b.reason)}</div></div>`).join(''); box.prepend(d); }
  }
};
// AI 重排排序：在 filtered() 中按 _aiPos
const oFiltered = filtered;
filtered = function () { const r = oFiltered(); if ($('#sort').value === 'ai' && R.enh) r.L.sort((a, b) => (a._aiPos ?? 1e6) - (b._aiPos ?? 1e6) || b.score - a.score); return r; };

// ================= 设置：AI 中心 =================
const oSet = PAGES.settings;
PAGES.settings = async () => {
  await oSet(); const st = S.settings; const P = st.profiles || [];
  const opt = (v) => `<option value="">跟随当前模型</option>` + P.map((p) => `<option value="${esc(p.id)}" ${v === p.id ? 'selected' : ''}>${esc(p.name)} · ${esc(p.model)}</option>`).join('');
  const status = await api.ai.status();
  const anchor = $('#setBody .panel:nth-of-type(2)');
  const html = `<div class="panel" id="aiCenter"><h4><i class="ri-brain-line"></i> AI 中心：路由、可靠性与隐私</h4>
    <div class="grid2">
      <label class="fld"><span><i class="ri-flashlight-line"></i> 快模型（意图识别 / 结果增强 / 事实抽取）</span><select id="aFast">${opt(st.aiRouting?.fast)}</select></label>
      <label class="fld"><span><i class="ri-brain-line"></i> 强模型（Copilot / 研究规划 / 反思 / 报告）</span><select id="aStrong">${opt(st.aiRouting?.strong)}</select></label>
      <label class="fld">工具调用方式<select id="aTool"><option value="auto">自动（原生函数调用，失败回退 JSON）</option><option value="native">仅原生函数调用</option><option value="json">JSON 协议（兼容所有模型）</option></select></label>
      <label class="fld">请求超时（秒）<input type="number" id="aTo" min="10" max="600" value="${Math.round((st.aiTimeout || 120000) / 1000)}"></label>
      <label class="fld">失败重试次数（429/5xx/网络）<input type="number" id="aRetry" min="0" max="5" value="${st.aiRetries ?? 2}"></label>
      <label class="fld">响应缓存有效期（分钟）<input type="number" id="aTtl" min="1" max="1440" value="${st.aiCacheTtl || 60}"></label>
      <label class="fld">Copilot 最多工具步数<input type="number" id="aSteps" min="2" max="20" value="${st.copilotSteps || 10}"></label>
      <label class="fld">深度研究：轮数 / 阅读页数<span class="row2"><input type="number" id="aDepth" min="1" max="4" value="${st.researchDepth || 2}"><input type="number" id="aPages" min="4" max="30" value="${st.researchPages || 10}"></span></label>
      <label class="chk"><input type="checkbox" id="aCache"> 缓存相同请求的 AI 响应</label>
      <label class="chk"><input type="checkbox" id="aSmart"> 搜索默认开启智能路由（意图 → 分类/来源）</label>
      <label class="chk"><input type="checkbox" id="aIntent"> 意图识别使用 AI（关闭则仅用本地规则）</label>
      <label class="chk"><input type="checkbox" id="aMulti"> 多语言检索（自动加入中/英文改写）</label>
      <label class="chk"><input type="checkbox" id="aEnh"> 搜索完成后自动 AI 增强结果</label>
      <label class="chk"><input type="checkbox" id="aRepair"> 来源失效时提示 AI 修复</label>
      <label class="chk"><input type="checkbox" id="aAudit"> 记录发送给 AI 的内容（仅本机内存，用于审计）</label>
    </div>
    <div class="pv-sec" style="margin-top:10px"><i class="ri-money-dollar-circle-line"></i> 单价（每百万 token，用于费用估算）</div>
    <table class="speed"><thead><tr><th>模型配置</th><th>输入</th><th>输出</th></tr></thead><tbody>${P.map((p) => `<tr><td>${esc(p.name)} · ${esc(p.model)}</td><td><input class="pin" data-pid="${esc(p.id)}" data-k="in" type="number" step="0.01" min="0" value="${p.price?.in ?? ''}" placeholder="0"></td><td><input class="pin" data-pid="${esc(p.id)}" data-k="out" type="number" step="0.01" min="0" value="${p.price?.out ?? ''}" placeholder="0"></td></tr>`).join('') || '<tr><td colspan="3" class="dim">尚未添加模型</td></tr>'}</tbody></table>
    <div class="pv-sec" style="margin-top:10px"><i class="ri-bar-chart-2-line"></i> 用量统计 <span class="grow"></span><button class="small" id="aUsageReset">清零</button></div><div id="aUsage"></div>
    <div class="btnrow" style="margin-top:10px"><button id="aPrompts"><i class="ri-file-edit-line"></i> 编辑提示词模板</button><button id="aAuditView"><i class="ri-eye-line"></i> 查看发送给 AI 的内容</button><button id="aCacheClr"><i class="ri-delete-bin-6-line"></i> 清空 AI 缓存</button></div>
    <p class="settings-hint"><i class="ri-lock-2-line"></i> API Key ${status.secure ? '使用系统安全存储（Windows DPAPI / safeStorage）加密保存在本机，设置文件中不含明文' : '当前系统不支持安全存储，以明文保存在本机设置文件'}；备份导出不包含 API Key。AI 仅接收：你的问题、搜索结果标题/摘要/链接、以及你要求阅读的网页正文。</p></div>`;
  anchor ? anchor.insertAdjacentHTML('afterend', html) : $('#setBody').insertAdjacentHTML('beforeend', html);
  $('#aTool').value = st.aiToolMode || 'auto';
  const ck = { aCache: 'aiCache', aSmart: 'smartRoute', aIntent: 'aiIntent', aMulti: 'multiLang', aEnh: 'aiEnhance', aRepair: 'autoRepairHint', aAudit: 'aiAudit' };
  const defOff = { aiEnhance: true };
  for (const [id, k] of Object.entries(ck)) $('#' + id).checked = defOff[k] ? !!st[k] : st[k] !== false;
  const save = async () => {
    const prices = {}; $$('.pin').forEach((i) => { (prices[i.dataset.pid] ||= {})[i.dataset.k] = i.value === '' ? undefined : +i.value; });
    const profiles = (S.settings.profiles || []).map((p) => (prices[p.id] ? { ...p, price: prices[p.id] } : p));
    const patch = { aiRouting: { fast: $('#aFast').value, strong: $('#aStrong').value }, aiToolMode: $('#aTool').value, aiTimeout: Math.max(10, +$('#aTo').value || 120) * 1000, aiRetries: Math.min(5, Math.max(0, +$('#aRetry').value)), aiCacheTtl: Math.max(1, +$('#aTtl').value || 60), copilotSteps: Math.min(20, Math.max(2, +$('#aSteps').value || 10)), researchDepth: Math.min(4, Math.max(1, +$('#aDepth').value || 2)), researchPages: Math.min(30, Math.max(4, +$('#aPages').value || 10)), profiles };
    for (const [id, k] of Object.entries(ck)) patch[k] = $('#' + id).checked;
    S.settings = await api.settings.set(patch); $('#optSmart').checked = patch.smartRoute; await refreshAi();
  };
  $$('#aiCenter select, #aiCenter input').forEach((el) => el.addEventListener('change', save));
  const showUsage = async () => {
    const u = await api.ai.usage(); const T = u.total || {}; const row = (n, o) => `<tr><td>${esc(n)}</td><td>${o.calls || 0}</td><td>${(o.in || 0).toLocaleString()}</td><td>${(o.out || 0).toLocaleString()}</td><td>${o.cacheHits || 0}</td><td>$${(o.cost || 0).toFixed(4)}</td></tr>`;
    const today = (u.days || {})[new Date().toISOString().slice(0, 10)] || {};
    $('#aUsage').innerHTML = `<table class="speed"><thead><tr><th>维度</th><th>调用</th><th>输入 tok</th><th>输出 tok</th><th>缓存命中</th><th>费用</th></tr></thead><tbody>${row('合计', T)}${row('今天', today)}${Object.entries(u.byModel || {}).map(([k, v]) => row('模型 ' + k, v)).join('')}${Object.entries(u.byTask || {}).map(([k, v]) => row('任务 ' + k, v)).join('')}</tbody></table>`;
  };
  showUsage();
  $('#aUsageReset').onclick = async () => { await api.ai.usageReset(); showUsage(); };
  $('#aCacheClr').onclick = async () => { const n = await api.ai.cacheClear(); toast(`已清空 ${n} 条缓存`); };
  $('#aAuditView').onclick = showAudit; $('#aPrompts').onclick = editPrompts;
};
async function showAudit() {
  const L = await api.ai.audit();
  modal(`<h3><i class="ri-eye-line"></i> 发送给 AI 的内容 <span class="dim">（最近 ${L.length} 次请求，仅保存在本机内存，重启后清空）</span></h3><div class="logbox">${L.length ? L.map((x) => `<details class="logi"><summary><span class="dim">${new Date(x.at).toLocaleTimeString()}</span> <span class="tag">${esc(x.task)}</span> ${esc(x.model || '')} → <b>${esc(x.host || '')}</b> · ${x.chars} 字符${x.tokens ? ` · ${x.tokens.in}/${x.tokens.out} tok${x.tokens.est ? '(估)' : ''}` : ''}${x.cached ? ' · <span class="okc">缓存</span>' : ''}${x.error ? ` · <span class="errc">${esc(x.error.slice(0, 60))}</span>` : ''} · ${fmtMs(x.ms || 0)}</summary>${(x.messages || []).map((m) => `<div class="am"><span class="tag">${esc(m.role)}</span><pre>${esc(m.content)}</pre></div>`).join('')}</details>`).join('') : '<div class="empty small"><i class="ri-shield-check-line"></i><p>暂无 AI 请求</p></div>'}</div>
    <div class="dlgbtns"><button class="danger" id="auClr"><i class="ri-delete-bin-line"></i> 清空</button><button class="primary" id="auOk">关闭</button></div>`, (d) => { $('#auOk', d).onclick = closeModal; $('#auClr', d).onclick = async () => { await api.ai.auditClear(); closeModal(); }; });
}
async function editPrompts() {
  const P = await api.ai.prompts(); const keys = Object.keys(P); let cur = keys[0];
  modal(`<h3><i class="ri-file-edit-line"></i> 提示词模板</h3><div class="ptabs">${keys.map((k) => `<button class="small ${k === cur ? 'on' : ''}" data-pk="${k}">${esc(P[k].label)}${P[k].custom ? ' *' : ''}</button>`).join('')}</div>
    <textarea id="ptxt" rows="16" class="ptxt"></textarea><div class="dim">可用变量以 {{name}} 表示（如 {{query}}、{{categories}}、{{memory}}）。留空或“恢复默认”即使用内置模板。</div>
    <div class="dlgbtns"><button id="pReset">恢复默认</button><button id="pCancel">关闭</button><button class="primary" id="pSave">保存</button></div>`, (d) => {
    const show = () => { $('#ptxt', d).value = P[cur].custom || P[cur].text; $$('[data-pk]', d).forEach((b) => b.classList.toggle('on', b.dataset.pk === cur)); };
    $$('[data-pk]', d).forEach((b) => b.onclick = () => { cur = b.dataset.pk; show(); }); show();
    const persist = async () => { const prompts = Object.fromEntries(keys.filter((k) => P[k].custom).map((k) => [k, P[k].custom])); S.settings = await api.settings.set({ prompts }); };
    $('#pSave', d).onclick = async () => { const v = $('#ptxt', d).value.trim(); P[cur].custom = v && v !== P[cur].text ? v : ''; await persist(); toast('已保存提示词：' + esc(P[cur].label)); };
    $('#pReset', d).onclick = async () => { P[cur].custom = ''; show(); await persist(); toast('已恢复默认'); };
    $('#pCancel', d).onclick = closeModal;
  });
}
// 启动：同步智能开关
setTimeout(async () => { const s = await api.settings.get(); $('#optSmart').checked = s.smartRoute !== false; }, 0);
})();
