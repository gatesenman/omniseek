const $ = (s) => document.querySelector(s);
let sid = null, res = new Map(), sel = 0, tmr = null, view = [];
(async () => { const st = await api.settings.get(); LANG = st.lang || 'zh'; })();
api.on('quick:focus', () => { $('#qq').focus(); $('#qq').select(); });
function draw() {
  view = [...res.values()].sort((a, b) => b.score - a.score).slice(0, 30); sel = Math.min(sel, Math.max(0, view.length - 1));
  $('#ql').innerHTML = view.map((r, i) => { const k = kindOf(r); const h = host(r.url); const pic = r.thumb || r.cover || r.icon || (h ? `https://${h}/favicon.ico` : '');
    return `<div class="qi ${i === sel ? 'sel' : ''}" data-i="${i}">${img(pic, 'favicon', k.icon)}<div class="body"><span class="tt">${esc(r.title)}</span><span class="sub dim">${ic(k.icon)} ${esc(r.sourceName)} · ${esc([r.author, r.year || r.date, r.version && 'v' + r.version, r.duration].filter(Boolean).join(' · ') || h)}</span></div></div>`; }).join('');
}
function search() {
  const q = $('#qq').value.trim(); if (!q) { res.clear(); draw(); return; }
  if (sid) api.search.cancel(sid); sid = 'q' + Date.now(); res = new Map(); sel = 0;
  api.search.start({ sid, query: q, noHistory: true });
}
api.on('search:event', ({ sid: s, type, data }) => {
  if (s !== sid) return;
  if (type === 'results') { for (const r of data) res.set(r.key, r); draw(); }
  if (type === 'start') $('#qs').textContent = `0/${data.total}`;
  if (type === 'source') $('#qs').textContent = `${res.size} 条`;
  if (type === 'done') $('#qs').textContent = `${res.size} 条 · ${(data.ms / 1000).toFixed(1)}s`;
});
$('#qq').addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(search, 450); });
$('#qq').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') api.hideQuick();
  else if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, view.length - 1); draw(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
  else if (e.key === 'Enter') { if (e.ctrlKey || !view.length) api.showMain($('#qq').value.trim()); else { api.open(view[sel].url); api.hideQuick(); } }
});
$('#ql').addEventListener('click', (e) => { const d = e.target.closest('.qi'); if (d) { api.open(view[+d.dataset.i].url); api.hideQuick(); } });
