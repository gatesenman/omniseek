// 类型化结果卡片（主窗口与快速搜索共用）
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '')) ? String(u) : '');
const ic = (n, cls = '') => `<i class="ri-${n} ${cls}"></i>`;
const KIND = {
  web: { icon: 'global-line', label: '网页', layout: 'web' }, wiki: { icon: 'book-open-line', label: '百科', layout: 'web' }, news: { icon: 'newspaper-line', label: '资讯', layout: 'web' },
  qa: { icon: 'question-answer-line', label: '问答', layout: 'web' }, data: { icon: 'database-2-line', label: '数据', layout: 'web' },
  book: { icon: 'book-2-line', label: '图书', layout: 'book' }, video: { icon: 'movie-2-line', label: '视频', layout: 'video' }, music: { icon: 'music-2-line', label: '音乐', layout: 'video' },
  image: { icon: 'image-line', label: '图片', layout: 'image' }, software: { icon: 'apps-2-line', label: '软件', layout: 'app' }, package: { icon: 'box-3-line', label: '软件包', layout: 'app' },
  code: { icon: 'code-box-line', label: '代码', layout: 'app' }, paper: { icon: 'article-line', label: '论文', layout: 'paper' }, report: { icon: 'file-chart-line', label: '报告', layout: 'paper' },
};
const kindOf = (r) => KIND[r.kind] || KIND.web;
const img = (src, cls, fallbackIcon) => { const u = safeUrl(src); return u ? `<img class="${cls}" src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer" data-fb="${fallbackIcon}">` : `<div class="${cls} ph">${ic(fallbackIcon)}</div>`; };
// 图片加载失败时替换为图标占位（CSP 禁止内联 onerror）
document.addEventListener('error', (e) => { const el = e.target; if (el.tagName === 'IMG' && el.dataset.fb) { const d = document.createElement('div'); d.className = el.className + ' ph'; d.innerHTML = ic(el.dataset.fb); el.replaceWith(d); } }, true);
const chip = (iconName, v, title = '') => (v === undefined || v === null || v === '' ? '' : `<span class="chip" title="${esc(title)}">${ic(iconName)}${esc(v)}</span>`);
function srcBadge(r) { const n = r.sources?.length || 1; return `<span class="src" title="${esc((r.sources || []).join(', '))}">${esc(r.sourceName || r.source)}${n > 1 ? ` <b>+${n - 1}</b>` : ''}</span>`; }
function actions(r, favd) {
  return `<span class="acts"><button class="icon-btn" data-act="preview" title="${t('preview')} (Space)">${ic('eye-line')}</button><button class="icon-btn" data-act="fav" title="${t(favd ? 'unfav' : 'fav')}">${ic(favd ? 'star-fill' : 'star-line')}</button><button class="icon-btn" data-act="copy" title="${t('copyLink')}">${ic('link')}</button></span>`;
}
function snippet(r, n = 260) { const s = String(r.snippet || '').trim(); return s ? `<div class="snip">${esc(s.length > n ? s.slice(0, n) + '…' : s)}</div>` : ''; }

const LAYOUTS = {
  web(r) {
    const h = host(r.url); const fav = r.icon || (h ? `https://${h}/favicon.ico` : '');
    return `<div class="c-web"><div class="row1">${img(fav, 'favicon', kindOf(r).icon)}<span class="host">${esc(h)}</span>${r.date ? `<span class="dim">${esc(r.date)}</span>` : ''}</div>
      <a class="title" data-open>${esc(r.title)}</a>${snippet(r)}
      <div class="meta">${chip('user-line', r.author)}${chip('price-tag-3-line', r.keywords, '关键词')}${chip('eye-line', r.views)}${chip('thumb-up-line', r.rating)}${chip('translate-2', r.lang)}${r.extra ? chip('information-line', r.extra) : ''}</div></div>`;
  },
  book(r) {
    return `<div class="c-book">${img(r.cover || r.thumb, 'cover', 'book-2-line')}<div class="body"><a class="title" data-open>${esc(r.title)}</a>
      <div class="meta">${chip('quill-pen-line', r.author, '作者')}${chip('calendar-line', r.year || r.date, '年份')}${chip('building-line', r.publisher, '出版社')}${chip('file-text-line', r.format, '格式')}${chip('pages-line', r.pages && r.pages + ' 页')}${chip('star-line', r.rating, '评分')}${chip('money-cny-circle-line', r.price)}${chip('barcode-line', r.doi || r.extra)}</div>${snippet(r, 200)}</div></div>`;
  },
  video(r) {
    const th = r.thumb || r.cover;
    return `<div class="c-video"><div class="thumbwrap" data-open>${img(th, 'thumb', kindOf(r).icon)}${r.duration ? `<span class="dur">${esc(r.duration)}</span>` : ''}<span class="play">${ic(r.kind === 'music' ? 'music-2-fill' : 'play-fill')}</span></div>
      <div class="body"><a class="title" data-open>${esc(r.title)}</a><div class="meta">${chip('user-3-line', r.channel || r.author, '频道/作者')}${chip('eye-line', r.views, '播放')}${chip('calendar-line', r.date || r.year)}${chip('album-line', r.extra)}</div>${snippet(r, 140)}</div></div>`;
  },
  image(r) {
    return `<div class="c-image" data-open>${img(r.thumb || r.cover || r.url, 'pic', 'image-line')}<div class="cap"><span>${esc(r.title)}</span><span class="dim">${esc(r.author || host(r.url))}</span></div></div>`;
  },
  app(r) {
    const h = host(r.url);
    return `<div class="c-app">${img(r.icon || r.thumb || (r.kind === 'code' ? '' : ''), 'appicon', kindOf(r).icon)}<div class="body"><div class="row1"><a class="title" data-open>${esc(r.title)}</a>${r.version ? `<span class="ver">v${esc(String(r.version).replace(/^v/i, ''))}</span>` : ''}</div>
      ${snippet(r, 200)}<div class="meta">${chip('computer-line', r.platform, '平台')}${chip('download-2-line', r.downloads, '下载量')}${chip('star-line', r.stars, '星标')}${chip('code-s-slash-line', r.lang, '语言')}${chip('scales-3-line', r.license, '许可证')}${chip('hard-drive-2-line', r.size)}${chip('price-tag-3-line', r.price)}${chip('user-line', r.author)}${chip('time-line', r.date)}${chip('global-line', h)}</div></div></div>`;
  },
  paper(r) {
    const pdf = safeUrl(r.pdf);
    return `<div class="c-paper"><div class="pico">${ic(r.kind === 'report' ? 'file-chart-line' : 'article-line')}</div><div class="body"><a class="title" data-open>${esc(r.title)}</a>
      <div class="authors">${esc(r.author || '')}</div><div class="meta">${chip('bank-line', r.venue || r.publisher, '期刊/会议/机构')}${chip('calendar-line', r.year || r.date)}${chip('double-quotes-l', r.extra)}${r.doi ? chip('fingerprint-line', r.doi, 'DOI') : ''}${pdf ? `<a class="chip pdf" data-href="${esc(pdf)}">${ic('file-pdf-2-line')}PDF</a>` : ''}</div>${snippet(r, 300)}</div></div>`;
  },
};
function renderCard(r, { favd = false, view = 'list' } = {}) {
  const k = kindOf(r); let lay = k.layout;
  const el = document.createElement('div');
  el.className = `card k-${r.kind || 'web'} l-${lay}`; el.dataset.key = r.key || r.url; el.setAttribute('role','article');
  el.innerHTML = `${LAYOUTS[lay](r)}<div class="foot"><span class="kind">${ic(k.icon)}${esc(LANG === 'en' ? (r.kind || 'web') : k.label)}</span>${srcBadge(r)}<span class="grow"></span>${actions(r, favd)}</div>`;
  return el;
}
