// 其它页面：AI 助手、来源库、健康、扩展、收藏、设置
const errMsg = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const hStatus = (s) => { if (s.enabled === false) return s.autoDisabled ? 'auto' : 'off'; const h = s.rt?.status || s.health?.status; if (!h) return 'unknown'; if ((s.rt?.avgMs || s.health?.ms || 0) > 8000 && h === 'ok') return 'slow'; return h; };
const ST_LABEL = { ok: '正常', empty: '无结果', error: '错误', dead: '失效', slow: '慢', off: '已禁用', auto: '自动禁用', unknown: '未检测' };
const stBadge = (st) => `<span class="badge b-${st}">${ST_LABEL[st] || st}</span>`;

// ================= AI 助手 =================
const AG = { history: [], cid: 'c' + Date.now() };
PAGES.assistant = () => {
  $('#asModel').innerHTML = S.ai.enabled ? `<i class="ri-cpu-line"></i> ${esc(S.ai.profile)}` : `<span class="warnc">${t('aiNeedKey')}</span>`;
  if (!S.ai.enabled && !$('#agentLog').querySelector('.ai-cta')) {
    $('#agentLog').innerHTML = `<div class="ai-cta"><i class="ri-cpu-line"></i><div><b>${t('aiNeedKey')}</b><p class="dim">${t('aiNeedKeySub')}</p><button class="small primary" id="asToSet">${t('goSettings')}</button></div></div>` + ($('#agentLog').innerHTML||'');
    $('#asToSet')?.addEventListener('click', () => go('settings'));
  }
  if (!$('#agentLog').children.length) agentWelcome();
};
$$('#asSeg button').forEach((b) => b.onclick = () => { $$('#asSeg button').forEach((x) => x.classList.toggle('on', x === b)); $('#asAgent').hidden = b.dataset.m !== 'agent'; $('#asPlan').hidden = b.dataset.m !== 'plan'; $('#asCopilot').hidden = b.dataset.m !== 'copilot'; });
const ASKS = ['添加一个搜索“少数派 sspai”文章的来源', '列出所有失效的来源并给出修复建议', '禁用所有平均耗时超过 8 秒的来源', '写一个扩展：按关键词搜索 npm 包并显示周下载量', '新建“播客”分类，并添加 2 个播客搜索来源'];
function agentWelcome() {
  $('#agentLog').innerHTML = `<div class="msg bot"><b><i class="ri-sparkling-2-line"></i> 来源助手</b><p>我可以帮你用自然语言管理来源：<b>新增</b>（我会抓取目标网站、分析搜索接口、生成配置并实测）、<b>修复</b>解析错误、<b>批量启用/禁用</b>、新建分类，甚至<b>写一个扩展脚本</b>。所有改动都会先展示差异，确认后才应用。</p></div>`;
  $('#agentAsks').innerHTML = ASKS.map((a) => `<span class="hchip">${esc(a)}</span>`).join('');
  $$('#agentAsks .hchip').forEach((c) => c.onclick = () => { $('#agentIn').value = c.textContent; $('#agentIn').focus(); });
}
function agentAppend(html, cls = 'bot') { const d = document.createElement('div'); d.className = 'msg ' + cls; d.innerHTML = html; $('#agentLog').append(d); $('#agentLog').scrollTop = 1e9; return d; }
api.on('agent:step', (st) => {
  if (st.cid !== AG.cid) return;
  if (st.type === 'say') agentAppend(md(st.text));
  else if (st.type === 'tool') agentAppend(`<i class="ri-tools-line"></i> <b>${esc(st.tool)}</b> <code>${esc(JSON.stringify(st.args || {}).slice(0, 160))}</code>`, 'tool');
  else if (st.type === 'result') agentAppend(`<i class="ri-arrow-right-s-line"></i> ${esc(st.brief)}`, 'tool res');
  else if (st.type === 'proposal') renderProposal(st.proposal);
});
function diffHtml(lines) { return `<pre class="diff">${lines.map((l) => `<span class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}">${esc(l)}</span>`).join('\n')}</pre>`; }
function renderProposal(p) {
  const d = agentAppend(`<div class="proposal"><div class="ph"><i class="ri-git-pull-request-line"></i> 变更提案：${esc(p.summary)}</div>${p.changes.map((c, i) => `<div class="chg"><label class="chk"><input type="checkbox" data-i="${i}" checked> <b>${esc({ upsert: c.isNew ? '新增来源' : '修改来源', disable: '禁用', enable: '启用', remove: '移除', category: '新建分类', extension: '写入扩展' }[c.op] || c.op)}</b> ${esc(c.source?.name || c.label || c.filename || (c.names || []).slice(0, 8).join('、') + ((c.ids || []).length > 8 ? ` 等 ${c.ids.length} 个` : ''))}</label>
    ${c.validationError ? `<div class="notice err">校验失败：${esc(c.validationError)}（将跳过应用）</div>` : ''}${c.diff ? diffHtml(c.diff) : c.op === 'extension' ? `<div class="dim">${esc(c.description || '')}</div><pre class="diff">${esc(String(c.content).slice(0, 4000))}</pre>` : ''}</div>`).join('')}
    <div class="dlgbtns"><button class="discard">放弃</button><button class="primary applyp"><i class="ri-check-line"></i> 确认应用</button></div></div>`, 'bot wide');
  $('.discard', d).onclick = () => { d.querySelector('.dlgbtns').innerHTML = '<span class="dim">已放弃</span>'; AG.history.push({ role: 'user', content: '（用户放弃了这个提案）' }); };
  $('.applyp', d).onclick = async () => { const sel = $$('input[data-i]', d).filter((x) => x.checked).map((x) => +x.dataset.i);
    try { const done = await api.agent.apply(p.id, sel); d.querySelector('.dlgbtns').innerHTML = `<span class="okc"><i class="ri-check-double-line"></i> 已应用：${esc(done.join('；'))}</span>`; AG.history.push({ role: 'user', content: '（用户已确认并应用了提案：' + done.join('；') + '）' }); await refreshSources(); initFilters(); }
    catch (e) { toast(esc(errMsg(e)), 'err'); } };
}
async function agentSend() {
  const v = $('#agentIn').value.trim(); if (!v) return; $('#agentIn').value = ''; $('#agentAsks').innerHTML = '';
  agentAppend(esc(v), 'user'); AG.history.push({ role: 'user', content: v });
  const wait = agentAppend('<span class="typing"><i></i><i></i><i></i></span>'); $('#agentSend').disabled = true;
  try { const r = await api.agent.run({ cid: AG.cid, history: AG.history }); AG.history.push({ role: 'assistant', content: r.reply || (r.proposal ? '已提出变更提案：' + r.proposal.summary : '') }); }
  catch (e) { agentAppend(`<span class="errc">${esc(errMsg(e))}</span>`); }
  wait.remove(); $('#agentSend').disabled = false;
}
$('#agentSend').onclick = agentSend; $('#agentIn').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSend(); } });
// 搜索规划
$('#planGo').onclick = async () => {
  const need = $('#planNeed').value.trim(); if (!need) return; if (!S.ai.enabled) return toast(t('aiOff'), 'warn');
  $('#planOut').innerHTML = '<span class="typing"><i></i><i></i><i></i></span> 正在规划搜索维度…';
  try {
    const plan = await api.ai.plan(need);
    $('#planOut').innerHTML = `<h3>${esc(plan.title || '搜索方案')}</h3>${(plan.dimensions || []).map((d) => `<div class="dim-card"><b><i class="ri-focus-3-line"></i> ${esc(d.name)}</b> <span class="badge">${esc(S.cats[d.category] || d.categoryLabel || d.category)}</span><div>查询：<code>${esc(d.query)}</code></div><div class="dim">${esc(d.reason || '')}</div><div class="dim">来源：${(d.sourceIds || []).map((id) => esc(S.srcMap.get(id)?.name || id)).join('、')}</div></div>`).join('')}
      ${(plan.newSources || []).length ? `<div class="dim">将新建 ${plan.newSources.length} 个来源：${plan.newSources.map((s) => esc(s.name)).join('、')}</div>` : ''}<div class="dlgbtns"><button class="primary" id="planRun"><i class="ri-play-line"></i> 应用并按维度搜索</button></div>`;
    $('#planRun').onclick = async () => { const r = await api.ai.applyPlan(plan); await refreshSources(); const ids = [...new Set(r.plan.dimensions.flatMap((d) => d.sourceIds))]; const qs = [...new Set(r.plan.dimensions.map((d) => d.query))]; go('search'); $('#q').value = need.slice(0, 60); doSearch({ sourceIds: ids, queries: qs.slice(0, 6) }); };
  } catch (e) { $('#planOut').innerHTML = `<div class="notice err">${esc(errMsg(e))}</div>`; }
};

// ================= 来源库 =================
const SL = { sel: new Set() };
PAGES.sources = async () => { await refreshSources(); $('#srcCat').innerHTML = '<option value="">全部分类</option>' + Object.entries(S.cats).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join(''); renderSources(); };
['#srcFilter', '#srcCat', '#srcStatus'].forEach((s) => $(s).addEventListener('input', () => renderSources()));
function srcFiltered() {
  const f = $('#srcFilter').value.toLowerCase(), c = $('#srcCat').value, st = $('#srcStatus').value;
  return S.sources.filter((s) => (!f || (s.id + s.name + (s.site || '') + (s.url || '')).toLowerCase().includes(f)) && (!c || s.category === c) && (!st || (st === 'fallback' ? !!s.site : st === 'off' ? s.enabled === false : hStatus(s) === st)));
}
function renderSources() {
  const L = srcFiltered(); const en = S.sources.filter((s) => s.enabled !== false).length;
  $('#srcCount').textContent = `共 ${S.sources.length} · 已启用 ${en} · 当前 ${L.length}`;
  $('#srcBulk').innerHTML = `<button class="small" id="bkEn"><i class="ri-checkbox-circle-line"></i> 启用当前 ${L.length} 个</button><button class="small" id="bkDis"><i class="ri-forbid-line"></i> 禁用当前 ${L.length} 个</button><span class="dim">提示：点击行查看/编辑配置；“站内”表示没有原生接口，通过网页搜索引擎的 site: 检索。</span>`;
  $('#bkEn').onclick = async () => { await api.sources.setMany(L.map((s) => s.id), true); PAGES.sources(); };
  $('#bkDis').onclick = async () => { await api.sources.setMany(L.map((s) => s.id), false); PAGES.sources(); };
  const groups = {}; for (const s of L.slice(0, 1500)) (groups[s.category] ||= []).push(s);
  $('#srcList').innerHTML = Object.entries(groups).map(([c, arr]) => `<div class="sgroup"><div class="sghead"><b>${esc(S.cats[c] || c)}</b><span class="dim">${arr.length}</span><span class="grow"></span><button class="small" data-cat="${esc(c)}" data-en="1">全部启用</button><button class="small" data-cat="${esc(c)}" data-en="0">全部禁用</button></div>
    ${arr.map((s) => { const st = hStatus(s); const ms = s.rt?.avgMs || s.health?.ms; return `<div class="srcrow" data-id="${esc(s.id)}"><label class="switch"><input type="checkbox" ${s.enabled !== false ? 'checked' : ''} data-tog="${esc(s.id)}"><span></span></label><i class="ri-${(KIND[s.kind] || KIND.web).icon}"></i><span class="nm">${esc(s.name)}</span><span class="dim id">${esc(s.id)}</span>${s.site ? '<span class="badge">站内</span>' : s.plugin ? '<span class="badge">脚本</span>' : `<span class="badge">${esc(s.type || '')}</span>`}${s.region === 'cn' ? '<span class="badge cn">国内</span>' : ''}${s.custom ? '<span class="badge">自定义</span>' : ''}${s.pack ? '<span class="badge">扩展</span>' : ''}<span class="grow"></span>${ms ? `<span class="dim">${fmtMs(ms)}</span>` : ''}${stBadge(st)}</div>`; }).join('')}</div>`).join('');
}
$('#srcList').addEventListener('click', async (e) => {
  const cb = e.target.closest('[data-cat]'); if (cb) { await api.sources.toggleCategory(cb.dataset.cat, cb.dataset.en === '1'); return PAGES.sources(); }
  if (e.target.closest('.switch')) return;
  const row = e.target.closest('.srcrow'); if (row) editSource(row.dataset.id);
});
$('#srcList').addEventListener('change', async (e) => { const t2 = e.target.dataset.tog; if (t2) { await api.sources.toggle(t2, e.target.checked); await refreshSources(); renderSources(); } });
$('#srcNew').onclick = () => editSource(null);
async function editSource(id) {
  const s = id ? await api.sources.get(id) : { id: 'my-source', name: '我的来源', category: 'web', kind: 'web', type: 'html', url: 'https://example.com/search?q={qe}', parse: { list: '.result', fields: { title: 'a', url: 'a@href', snippet: 'p' } } };
  const meta = S.srcMap.get(id);
  const { health, builtin, custom, pack, rt, hasParse, ...cfg } = s;
  modal(`<h3><i class="ri-edit-2-line"></i> ${id ? esc(s.name) : '新建来源'} ${meta ? stBadge(hStatus(meta)) : ''}</h3>
    ${meta?.rt?.lastError || s.health?.error ? `<div class="notice err">${esc(meta?.rt?.lastError || s.health?.error)}</div>` : ''}
    <div class="row"><label class="fld grow">配置 JSON<textarea id="cfg" rows="16" spellcheck="false">${esc(JSON.stringify(cfg, null, 2))}</textarea></label></div>
    ${s.requiresKey || cfg.vars ? `<label class="fld">API Key（vars.key）<input id="vkey" value="${esc(cfg.vars?.key || '')}"></label>` : ''}
    <div class="row"><input id="tq" placeholder="测试关键词" value="python"><button id="tst"><i class="ri-flask-line"></i> ${t('test')}</button><button id="aifix"><i class="ri-sparkling-2-line"></i> 让 AI 修复</button><span class="grow"></span>${id && s.custom ? `<button id="del" class="danger"><i class="ri-delete-bin-line"></i> ${t('delete')}</button>` : ''}<button id="cc">${t('cancel')}</button><button class="primary" id="sv">${t('save')}</button></div>
    <div id="tout" class="tout"></div>`, (d) => {
    const read = () => JSON.parse($('#cfg', d).value);
    $('#cc', d).onclick = closeModal;
    $('#tst', d).onclick = async () => { $('#tout', d).innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; try { const r = await api.sources.test(read(), $('#tq', d).value); $('#tout', d).innerHTML = r.ok ? `<div class="okc">${r.results.length} 条 · ${fmtMs(r.ms)}</div>` + r.results.slice(0, 5).map((x) => renderCard({ ...x, sources: [], sourceName: s.name }).outerHTML).join('') : `<div class="errc">${esc(r.error)}</div>`; } catch (e) { $('#tout', d).innerHTML = `<div class="errc">${esc(errMsg(e))}</div>`; } };
    $('#sv', d).onclick = async () => { try { if ($('#vkey', d)) await api.sources.setVars(id, { key: $('#vkey', d).value.trim() }); await api.sources.upsert(read()); closeModal(); toast('已保存'); PAGES.sources(); } catch (e) { toast(esc(errMsg(e)), 'err'); } };
    if ($('#del', d)) $('#del', d).onclick = async () => { await api.sources.remove(id); closeModal(); PAGES.sources(); };
    $('#aifix', d).onclick = () => { closeModal(); go('assistant'); $('#agentIn').value = `修复来源 ${id || ''}（${s.name}）：${meta?.rt?.lastError || s.health?.error || '结果为空或字段不全'}。请抓取页面重新分析解析规则并实测。`; $('#agentIn').focus(); };
  });
}

// ================= 健康 =================
PAGES.health = async () => { await refreshSources(); $('#autoDisable').checked = S.settings.autoDisable !== false; renderDash(); };
$('#autoDisable').onchange = () => api.settings.set({ autoDisable: $('#autoDisable').checked });
function renderDash() {
  const L = S.sources; const by = {}; const cat = {};
  for (const s of L) { const st = hStatus(s); by[st] = (by[st] || 0) + 1; const c = (cat[s.category] ||= { n: 0, ok: 0, en: 0, native: 0 }); c.n++; if (s.enabled !== false) c.en++; if ((s.rt?.status || s.health?.status) === 'ok') c.ok++; if (!s.site) c.native++; }
  const raw = (s) => s.rt?.status || s.health?.status; const checked = L.filter(raw).length; const okN = L.filter((s) => raw(s) === 'ok').length; const okEn = L.filter((s) => s.enabled !== false && raw(s) === 'ok').length; const en = L.filter((s) => s.enabled !== false).length;
  const slow = L.filter((s) => (s.rt?.avgMs || s.health?.ms || 0) > 6000).sort((a, b) => (b.rt?.avgMs || b.health?.ms) - (a.rt?.avgMs || a.health?.ms)).slice(0, 30);
  const dead = L.filter((s) => ['dead', 'error', 'auto'].includes(hStatus(s))).slice(0, 80);
  $('#dash').innerHTML = `<div class="health-legend">
    <span><span class="badge b-ok">正常</span> 返回结果</span>
    <span><span class="badge b-empty">无结果</span> 可达但无匹配（站内回退常见）</span>
    <span><span class="badge b-dead">失效</span> HTTP/解析错误</span>
    <span><span class="badge b-slow">慢</span> &gt;8s</span>
    <span><span class="badge b-off">已禁用</span></span>
  </div><p class="dim">${t('healthHint')}</p><div class="kpis">
    <div class="kpi"><b>${L.length}</b><span>来源总数</span></div><div class="kpi"><b>${L.filter((s) => s.enabled !== false).length}</b><span>已启用</span></div>
    <div class="kpi"><b>${L.filter((s) => !s.site).length}</b><span>原生接口</span></div><div class="kpi ok"><b>${okN}</b><span>正常</span></div>
    <div class="kpi"><b>${L.filter((s) => raw(s) === 'empty').length}</b><span>无结果（多为站内回退）</span></div><div class="kpi err"><b>${(by.dead || 0) + (by.error || 0) + (by.auto || 0)}</b><span>失效/错误</span></div>
    <div class="kpi"><b>${checked ? Math.round((okN / checked) * 100) : 0}%</b><span>全部健康率（已检测 ${checked}）</span></div><div class="kpi ok"><b>${en ? Math.round((okEn / en) * 100) : 0}%</b><span>已启用来源健康率</span></div></div>
    <div class="dash-cols"><div class="panel"><h4><i class="ri-bar-chart-2-line"></i> 分类健康</h4><table class="tbl"><tr><th>分类</th><th>来源</th><th>原生</th><th>启用</th><th>正常</th><th></th></tr>${Object.entries(cat).sort((a, b) => b[1].n - a[1].n).map(([k, c]) => `<tr><td>${esc(S.cats[k] || k)}</td><td>${c.n}</td><td>${c.native}</td><td>${c.en}</td><td>${c.ok}</td><td><div class="hbar"><i style="width:${Math.round((c.ok / c.n) * 100)}%"></i></div></td></tr>`).join('')}</table></div>
    <div class="panel"><h4><i class="ri-error-warning-line"></i> 失效 / 错误（${dead.length}）</h4>${dead.map((s) => `<div class="srow"><span class="nm">${esc(s.name)}</span><span class="dim">${esc(String(s.rt?.lastError || s.health?.error || '').slice(0, 50))}</span>${stBadge(hStatus(s))}<button class="small" data-fix="${esc(s.id)}"><i class="ri-sparkling-2-line"></i> 修复</button></div>`).join('') || '<div class="dim">没有失效来源</div>'}
      <h4><i class="ri-timer-line"></i> 慢来源（&gt; 6s）</h4>${slow.map((s) => `<div class="srow"><span class="nm">${esc(s.name)}</span><span class="ms">${fmtMs(s.rt?.avgMs || s.health?.ms)}</span>${stBadge(hStatus(s))}</div>`).join('') || '<div class="dim">无</div>'}</div></div>
    <p class="dim">内置健康数据来自打包时在美国数据中心网络的实测；点击“全部检测”可在你的网络环境中重新检测（国内来源在国内网络下通常更快更稳定）。</p>`;
  $$('[data-fix]').forEach((b) => b.onclick = () => editSource(b.dataset.fix));
}
async function runHealth(enabledOnly) { const ids = enabledOnly ? S.sources.filter((s) => s.enabled !== false).map((s) => s.id) : undefined; const r = await api.health.run({ ids }); if (r.busy) return toast('检测正在进行'); $('#hcProg').hidden = false; $('#hcStat').textContent = `0 / ${r.total}`; }
$('#hcRun').onclick = () => runHealth(false); $('#hcEnabled').onclick = () => runHealth(true);
$('#hcDisable').onclick = async () => { const n = await api.health.disableDead(); toast(`已禁用 ${n} 个失效来源`); PAGES.health(); };
api.on('health:progress', (p) => { $('#hcBar').style.width = (p.n / p.total) * 100 + '%'; $('#hcStat').textContent = `${p.n} / ${p.total} · ${p.id} ${p.status}`; });
api.on('health:done', async (d) => { $('#hcStat').textContent = `完成：${d.ok} 个可用，${d.failed} 个失败，用时 ${fmtMs(d.ms)}`; await refreshSources(); renderDash(); });

// ================= 扩展 =================
PAGES.ext = async () => {
  const r = await api.ext.list();
  $('#extBody').innerHTML = `<div class="explain"><i class="ri-puzzle-2-line big"></i><div><h3>什么是扩展？</h3><p>扩展就是给万搜<b>增加新的搜索来源</b>的小文件，装上后它的来源会和内置来源一起被同时搜索。分两种：</p>
    <ul><li><b>来源包（.json）</b>：一组来源配置——告诉万搜“去哪个网址搜、结果里哪部分是标题/链接/封面”。不含代码，最安全。</li><li><b>脚本扩展（.js）</b>：一小段 JavaScript，适合需要多步请求、签名或特殊处理的网站。只安装你信任的脚本。</li></ul>
    <p>不会写也没关系：点右上角“<b>让 AI 写一个扩展</b>”，用一句话描述想搜什么网站即可。扩展目录：<code>${esc(r.dir)}</code></p></div></div>
    <h3><i class="ri-store-2-line"></i> 扩展画廊</h3><div class="gallery">${r.gallery.map((g) => `<div class="gcard"><i class="ri-${esc(String(g.icon || 'puzzle-line').replace(/^ri-/, ''))} gi"></i><div class="body"><b>${esc(g.name)}</b> <span class="badge">${esc(g.type)}</span><p class="dim">${esc(g.description)}</p></div>${g.installed ? `<button class="small" data-un="${esc(g.file)}">${t('uninstall')}</button>` : `<button class="small primary" data-in="${esc(g.file)}"><i class="ri-download-line"></i> ${t('install')}</button>`}</div>`).join('')}</div>
    <h3><i class="ri-folder-3-line"></i> 已安装（${r.plugins.length}）</h3>${r.plugins.map((p) => `<div class="srow"><i class="ri-${p.kind === 'script' ? 'code-s-slash-line' : p.kind === 'error' ? 'error-warning-line' : 'file-list-3-line'}"></i><span class="nm">${esc(p.file)}</span><span class="dim">${esc(p.name)} · ${p.count} 个来源</span><span class="grow"></span><button class="small" data-un="${esc(p.file)}">${t('uninstall')}</button></div>`).join('') || '<div class="dim">尚未安装扩展</div>'}`;
  $$('[data-in]', $('#extBody')).forEach((b) => b.onclick = async () => { await api.ext.install(b.dataset.in); toast('已安装'); await refreshSources(); initFilters(); PAGES.ext(); });
  $$('[data-un]', $('#extBody')).forEach((b) => b.onclick = async () => { await api.ext.uninstall(b.dataset.un); await refreshSources(); PAGES.ext(); });
};
$('#extReload').onclick = async () => { await api.ext.reload(); await refreshSources(); PAGES.ext(); toast('已重新加载'); };
$('#extDir').onclick = () => api.ext.openDir(); $('#extImport').onclick = async () => { await api.ext.import(); await refreshSources(); PAGES.ext(); };
$('#extAi').onclick = () => { go('assistant'); $('#agentIn').value = '帮我写一个扩展：'; $('#agentIn').focus(); };

// ================= 收藏 / 历史 / 场景 =================
let LIBM = 'fav', LIBC = 'all';
$$('#libSeg button').forEach((b) => b.onclick = () => { LIBM = b.dataset.m; $$('#libSeg button').forEach((x) => x.classList.toggle('on', x === b)); PAGES.library(); });
PAGES.library = async () => {
  await refreshLib(); const L = S.lib; const body = $('#libBody'); $('#libActs').innerHTML = '';
  if (LIBM === 'fav') {
    const items = L.items.filter((x) => LIBC === 'all' || x.collection === LIBC);
    $('#libActs').innerHTML = `<button class="small" id="lbNew"><i class="ri-folder-add-line"></i> ${t('newCollection')}</button><button class="small" id="lbMd"><i class="ri-markdown-line"></i></button><button class="small" id="lbCsv"><i class="ri-file-excel-2-line"></i></button>`;
    body.innerHTML = `<div class="chips colls"><span class="hchip ${LIBC === 'all' ? 'on' : ''}" data-c="all">全部 (${L.items.length})</span>${L.collections.map((c) => `<span class="hchip ${LIBC === c.id ? 'on' : ''}" data-c="${c.id}"><i class="ri-folder-line"></i>${esc(c.name)} (${L.items.filter((x) => x.collection === c.id).length})${c.id !== 'default' ? ` <i class="ri-close-line" data-rmc="${c.id}"></i>` : ''}</span>`).join('')}</div><div class="results list" id="favList"></div>`;
    const fl = $('#favList'); if (!items.length) fl.innerHTML = emptyState('还没有收藏', '在搜索结果卡片上点击星标即可收藏'); for (const it of items) { const c = renderCard({ ...it, sources: [it.source] }, { favd: true }); c.dataset.key = it.url; fl.append(c); }
    fl.onclick = async (e) => { const card = e.target.closest('.card'); if (!card) return; const it = items.find((x) => x.url === card.dataset.key); const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'fav') { await api.lib.unfav(it.url, it.collection); PAGES.library(); } else if (act === 'copy') api.copy(it.url); else if (e.target.closest('[data-open]')) api.open(it.url); };
    $$('[data-c]', body).forEach((c) => c.onclick = (e) => { if (e.target.dataset.rmc) return; LIBC = c.dataset.c; PAGES.library(); });
    $$('[data-rmc]', body).forEach((c) => c.onclick = async () => { await api.lib.removeCollection(c.dataset.rmc); LIBC = 'all'; PAGES.library(); });
    $('#lbNew').onclick = async () => { const n = await prompt2(t('newCollection'), '名称'); if (n) { await api.lib.addCollection(n); PAGES.library(); } };
    $('#lbMd').onclick = () => api.export({ format: 'md', title: '收藏夹', items }); $('#lbCsv').onclick = () => api.export({ format: 'csv', title: '收藏夹', items });
  } else if (LIBM === 'saved') {
    body.innerHTML = L.saved.map((s) => `<div class="srow"><i class="ri-bookmark-line"></i><span class="nm">${esc(s.name)}</span><span class="dim">${esc(s.q)} ${s.scene ? '· ' + esc(allScenes().find((x) => x.id === s.scene)?.name || s.scene) : ''}</span><span class="grow"></span><button class="small primary" data-run="${s.id}"><i class="ri-play-line"></i></button><button class="small" data-rm="${s.id}"><i class="ri-delete-bin-line"></i></button></div>`).join('') || emptyState('没有已保存搜索', '在搜索页点击书签图标保存当前搜索（含场景与筛选）');
    $$('[data-run]', body).forEach((b) => b.onclick = () => runSaved(L.saved.find((x) => x.id === b.dataset.run)));
    $$('[data-rm]', body).forEach((b) => b.onclick = async () => { await api.lib.removeSaved(b.dataset.rm); PAGES.library(); });
  } else if (LIBM === 'history') {
    $('#libActs').innerHTML = `<button class="small" id="hClr"><i class="ri-delete-bin-line"></i> ${t('clear')}</button>`; $('#hClr').onclick = async () => { await api.lib.clearHistory(); PAGES.library(); };
    body.innerHTML = L.history.map((h) => `<div class="srow hist" data-q="${esc(h.q)}"><i class="ri-history-line"></i><span class="nm">${esc(h.q)}</span><span class="grow"></span><span class="dim">${new Date(h.at).toLocaleString()}</span></div>`).join('') || emptyState('暂无历史', '');
    $$('.hist', body).forEach((r) => r.onclick = () => { go('search'); $('#q').value = r.dataset.q; doSearch(); });
  } else {
    $('#libActs').innerHTML = `<button class="small" id="scNew"><i class="ri-add-line"></i> 新建场景</button>`; $('#scNew').onclick = () => editScene();
    body.innerHTML = `<p class="dim">场景 = 预设好的“搜哪些分类/来源 + 筛选 + 视图”。在搜索框右侧的下拉中切换。</p>` + allScenes().map((s) => `<div class="srow"><i class="ri-${esc(s.icon || 'bookmark-line')}"></i><span class="nm">${esc(s.name)}</span><span class="dim">${(s.categories || []).map((c) => esc(S.cats[c] || c)).join('、') || '全部分类'}${s.filters?.region === 'cn' ? ' · 仅国内' : ''}</span><span class="grow"></span>${s.id.startsWith('sc-') ? '<span class="badge">内置</span>' : `<button class="small" data-ed="${s.id}">${t('edit')}</button><button class="small" data-rs="${s.id}"><i class="ri-delete-bin-line"></i></button>`}</div>`).join('');
    $$('[data-ed]', body).forEach((b) => b.onclick = () => editScene(L.scenes.find((x) => x.id === b.dataset.ed)));
    $$('[data-rs]', body).forEach((b) => b.onclick = async () => { await api.lib.removeScene(b.dataset.rs); await refreshLib(); initFilters(); PAGES.library(); });
  }
};
function editScene(sc = { id: 'u' + Date.now(), name: '', icon: 'bookmark-line', categories: [], view: 'auto', filters: {} }) {
  modal(`<h3>场景</h3><label class="fld">名称<input id="scn" value="${esc(sc.name)}"></label><div class="fld">分类<div class="catpick">${Object.entries(S.cats).map(([k, v]) => `<label class="chk"><input type="checkbox" value="${k}" ${sc.categories.includes(k) ? 'checked' : ''}>${esc(v)}</label>`).join('')}</div></div>
    <div class="row"><label class="fld">视图<select id="scv"><option value="auto">自动</option><option value="list">列表</option><option value="grid">网格</option></select></label><label class="fld">地区<select id="scr"><option value="all">全部</option><option value="cn">仅国内</option><option value="intl">仅国际</option></select></label></div>
    <div class="dlgbtns"><button id="c0">${t('cancel')}</button><button class="primary" id="c1">${t('save')}</button></div>`, (d) => {
    $('#scv', d).value = sc.view || 'auto'; $('#scr', d).value = sc.filters?.region || 'all'; $('#c0', d).onclick = closeModal;
    $('#c1', d).onclick = async () => { const s2 = { ...sc, name: $('#scn', d).value.trim() || '未命名场景', categories: $$('.catpick input', d).filter((x) => x.checked).map((x) => x.value), view: $('#scv', d).value, filters: { region: $('#scr', d).value } }; await api.lib.saveScene(s2); closeModal(); await refreshLib(); initFilters(); PAGES.library(); };
  });
}

// ================= 设置 =================
let PRESETS = null;
PAGES.settings = async () => {
  S.settings = await api.settings.get(); PRESETS ||= await api.providers.presets(); const st = S.settings;
  const groups = [...new Set(PRESETS.map((p) => p.group))];
  $('#setBody').innerHTML = `<h2><i class="ri-settings-3-line"></i> ${t('settings')}</h2>
  <div class="panel"><h4><i class="ri-cpu-line"></i> 模型服务（AI 功能可选；不配置也能正常搜索）</h4>
    <div class="profiles">${st.profiles.map((p) => `<div class="prof ${p.id === st.activeProfile ? 'on' : ''}" data-id="${p.id}"><i class="ri-${p.id === st.activeProfile ? 'radio-button-fill' : 'radio-button-line'}" data-act-p="use"></i><div class="body"><b>${esc(p.name)}</b><span class="dim">${esc(PRESETS.find((x) => x.id === p.provider)?.name || p.provider)} · ${esc(p.model)}</span></div><button class="small" data-act-p="edit">${t('edit')}</button><button class="small" data-act-p="del"><i class="ri-delete-bin-line"></i></button></div>`).join('') || '<div class="dim">尚未添加模型服务</div>'}</div>
    <div class="dim">添加服务商：</div><div class="provgrid">${groups.map((g) => `<div><div class="pg">${esc(g)}</div>${PRESETS.filter((p) => p.group === g).map((p) => `<button class="small prov" data-prov="${p.id}">${esc(p.name)}</button>`).join('')}</div>`).join('')}</div></div>
  <div class="panel"><h4><i class="ri-equalizer-line"></i> 常规</h4><div class="grid2">
    <label class="fld">${t('lang')}<select id="sLang"><option value="zh">中文</option><option value="en">English</option></select></label>
    <label class="fld">${t('theme')}<select id="sTheme"><option value="system">${t('tSystem')}</option><option value="dark">${t('tDark')}</option><option value="light">${t('tLight')}</option></select></label>
    <label class="fld">快速搜索快捷键（当前生效：${esc(st.hotkeyActive || '无')}）<input id="sHot" value="${esc(st.hotkey)}"></label>
    <label class="fld">站内回退所用搜索引擎<select id="sSite"><option value="bing">Bing</option><option value="baidu">百度</option><option value="ddg">DuckDuckGo</option></select></label>
    <label class="chk"><input type="checkbox" id="sTray"> 关闭窗口时最小化到托盘</label>
    <label class="chk"><input type="checkbox" id="sAuto"> 连续失败的来源自动禁用</label>
    <label class="chk"><input type="checkbox" id="sNative"> ${t('preferNative')}</label>
    <label class="chk"><input type="checkbox" id="sOnboard"> 下次启动显示新手引导</label></div>
    <p class="settings-hint">站内回退（Bing/百度 site:）在部分网络下不稳定；默认关闭后仍可在筛选里临时开启。</p></div>
  <div class="panel"><h4><i class="ri-speed-up-line"></i> 性能</h4><div class="grid2">
    <label class="fld">全局并发（最高 1000）<input type="number" id="sConc" min="4" max="1000" value="${st.concurrency}"></label><label class="fld">单域名并发<input type="number" id="sHost" min="1" max="16" value="${st.perHost}"></label>
    <label class="fld">单来源超时（毫秒）<input type="number" id="sTo" min="2000" max="60000" step="1000" value="${st.timeout}"></label><label class="fld">每来源最多结果<input type="number" id="sMax" min="5" max="100" value="${st.maxPerSource}"></label>
    <label class="fld">限流重试次数（429/503）<input type="number" id="sRetry" min="0" max="5" value="${st.retries ?? 2}"></label></div>
    <div class="dim">数据目录：<code>${esc(st.dataDir)}</code> · 版本 ${esc(st.version)} · <button class="link" id="sDefaults">重新应用智能默认来源</button></div></div>`;
  $('#sLang').value = st.lang || 'zh'; $('#sTheme').value = st.theme; $('#sSite').value = st.siteEngine || 'bing'; $('#sTray').checked = st.closeToTray !== false; $('#sAuto').checked = st.autoDisable !== false;
  $('#sNative').checked = st.preferNative !== false; $('#sOnboard').checked = !st.onboarded;
  $('#sDefaults')?.addEventListener('click', async () => { const r = await api.sources.applyDefaults(); toast('已重新应用智能默认'); await refreshSources(); });
  const save = async () => { const lang = $('#sLang').value; await api.settings.set({ lang, theme: $('#sTheme').value, hotkey: $('#sHot').value.trim(), siteEngine: $('#sSite').value, closeToTray: $('#sTray').checked, autoDisable: $('#sAuto').checked, preferNative: $('#sNative').checked, onboarded: !$('#sOnboard').checked, concurrency: Math.min(1000, +$('#sConc').value || 128), perHost: +$('#sHost').value || 4, timeout: +$('#sTo').value || 12000, maxPerSource: +$('#sMax').value || 20, retries: Math.min(5, Math.max(0, +$('#sRetry')?.value || 2)) }); $('#fNative').checked = $('#sNative').checked; if (lang !== LANG) { LANG = lang; applyI18n(); initFilters(); } S.settings = await api.settings.get(); };
  $$('#setBody select, #setBody input').forEach((el) => el.addEventListener('change', save));
  $$('.prov').forEach((b) => b.onclick = () => editProfile({ provider: b.dataset.prov }));
  $$('.prof').forEach((el) => el.onclick = async (e) => { const a = e.target.closest('[data-act-p]')?.dataset.actP; const p = st.profiles.find((x) => x.id === el.dataset.id);
    if (a === 'edit') return editProfile(p); if (a === 'del') { await api.settings.set({ profiles: st.profiles.filter((x) => x.id !== p.id), activeProfile: st.activeProfile === p.id ? st.profiles.find((x) => x.id !== p.id)?.id || '' : st.activeProfile }); }
    else await api.settings.set({ activeProfile: p.id });
    await refreshAi(); PAGES.settings(); });
};
function editProfile(p) {
  const pre = PRESETS.find((x) => x.id === p.provider) || PRESETS.at(-1);
  const prof = { id: p.id || 'p' + Date.now(), name: p.name || pre.name, provider: pre.id, kind: p.kind || pre.kind, baseUrl: p.baseUrl ?? pre.baseUrl, apiKey: p.apiKey || '', model: p.model || pre.models[0] || '' };
  modal(`<h3><i class="ri-cpu-line"></i> ${esc(pre.name)}</h3>${pre.note ? `<div class="notice">${esc(pre.note)}</div>` : ''}
    <label class="fld">配置名称<input id="pn" value="${esc(prof.name)}"></label>
    <div class="row"><label class="fld grow">接口地址 Base URL<input id="pb" value="${esc(prof.baseUrl)}"></label><label class="fld">协议<select id="pk"><option value="openai">OpenAI 兼容</option><option value="anthropic">Anthropic 原生</option><option value="gemini">Gemini 原生</option></select></label></div>
    <label class="fld">API Key ${pre.keyUrl ? `<a data-href="${esc(pre.keyUrl)}">获取 Key <i class="ri-external-link-line"></i></a>` : ''}${pre.noKey ? '（本地服务可留空）' : ''}<input id="pa" type="password" value="${esc(prof.apiKey)}"></label>
    <div class="row"><label class="fld grow">模型<input id="pm" list="pml" value="${esc(prof.model)}"><datalist id="pml">${pre.models.map((m) => `<option value="${esc(m)}">`).join('')}</datalist></label><button id="pfetch"><i class="ri-download-cloud-2-line"></i> 获取模型列表</button></div>
    <div id="pout" class="tout"></div>
    <div class="dlgbtns"><button id="ptest"><i class="ri-plug-line"></i> 测试连接</button><span class="grow"></span><button id="pc">${t('cancel')}</button><button class="primary" id="ps">${t('save')}并启用</button></div>`, (d) => {
    $('#pk', d).value = prof.kind;
    const read = () => ({ ...prof, name: $('#pn', d).value.trim() || pre.name, baseUrl: $('#pb', d).value.trim(), kind: $('#pk', d).value, apiKey: $('#pa', d).value.trim(), model: $('#pm', d).value.trim() });
    $('#pc', d).onclick = closeModal;
    $('#pfetch', d).onclick = async () => { $('#pout', d).innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; const r = await api.providers.models(read()); if (r.ok) { $('#pml', d).innerHTML = r.models.map((m) => `<option value="${esc(m)}">`).join(''); $('#pout', d).innerHTML = `<div class="okc">获取到 ${r.models.length} 个模型</div><div class="mlist">${r.models.slice(0, 300).map((m) => `<span class="hchip">${esc(m)}</span>`).join('')}</div>`; $$('.mlist .hchip', d).forEach((c) => c.onclick = () => { $('#pm', d).value = c.textContent; }); } else $('#pout', d).innerHTML = `<div class="errc">${esc(r.error)}</div>`; };
    $('#ptest', d).onclick = async () => { $('#pout', d).innerHTML = '<span class="typing"><i></i><i></i><i></i></span>'; const r = await api.providers.test(read()); $('#pout', d).innerHTML = r.ok ? `<div class="okc"><i class="ri-check-line"></i> 连接成功（${fmtMs(r.ms)}）：${esc(r.text)}</div>` : `<div class="errc"><i class="ri-close-line"></i> ${esc(r.error)}</div>`; };
    $('#ps', d).onclick = async () => { const np = read(); const list = S.settings.profiles.filter((x) => x.id !== np.id).concat(np); await api.settings.set({ profiles: list, activeProfile: np.id }); closeModal(); await refreshAi(); PAGES.settings(); toast('已保存模型配置'); };
  });
}
