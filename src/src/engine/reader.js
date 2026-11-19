'use strict';
// 2.2：阅读模式抽取 + 下载/资源识别 + 安全提示
const cheerio = require('cheerio');
const { UA } = require('./engine');

const RES_EXT = {
  ebook: ['pdf', 'epub', 'mobi', 'azw3', 'azw', 'djvu', 'fb2', 'txt', 'cbz', 'cbr'],
  software: ['exe', 'msi', 'msix', 'appx', 'dmg', 'pkg', 'apk', 'xapk', 'ipa', 'deb', 'rpm', 'appimage', 'jar'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'xz', 'bz2', 'iso', 'img'],
  media: ['mp4', 'mkv', 'avi', 'mov', 'mp3', 'flac', 'wav', 'm4a', 'ogg'],
  doc: ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'odt'],
  torrent: ['torrent'],
};
const EXT2KIND = {}; for (const [k, a] of Object.entries(RES_EXT)) for (const e of a) EXT2KIND[e] = k;
const RISKY = new Set(['exe', 'msi', 'msix', 'appx', 'apk', 'xapk', 'ipa', 'jar', 'dmg', 'pkg', 'appimage', 'deb', 'rpm', 'bat', 'cmd', 'scr', 'ps1', 'vbs']);
const TRUSTED = ['github.com', 'githubusercontent.com', 'gitlab.com', 'sourceforge.net', 'microsoft.com', 'apple.com', 'google.com', 'mozilla.org', 'python.org', 'nodejs.org', 'apache.org', 'gnu.org', 'kernel.org', 'debian.org', 'ubuntu.com', 'fedoraproject.org', 'archlinux.org', 'videolan.org', 'npmjs.com', 'pypi.org', 'pythonhosted.org', 'arxiv.org', 'archive.org', 'gutenberg.org', 'f-droid.org', 'jetbrains.com', 'adobe.com', 'oracle.com', 'aliyun.com', 'tsinghua.edu.cn', 'ustc.edu.cn', 'huaweicloud.com', 'qq.com', 'baidu.com', 'bilibili.com', 'mi.com', 'lenovo.com', 'intel.com', 'nvidia.com', 'amd.com', 'steampowered.com', 'winget.run', 'chocolatey.org', 'flathub.org', 'nih.gov', 'springer.com', 'wiley.com', 'acm.org', 'ieee.org'];
const SHORTENERS = ['bit.ly', 't.cn', 'tinyurl.com', 'goo.gl', 'is.gd', 'ow.ly', 'dwz.cn', 'url.cn', 'adf.ly'];
const NETDISK = { 'pan.baidu.com': '百度网盘', 'aliyundrive.com': '阿里云盘', 'alipan.com': '阿里云盘', 'lanzou': '蓝奏云', 'lanzn.com': '蓝奏云', '123pan.com': '123云盘', '123684.com': '123云盘', 'quark.cn': '夸克网盘', 'pan.xunlei.com': '迅雷云盘', 'cowtransfer.com': '奶牛快传', 'mega.nz': 'MEGA', 'drive.google.com': 'Google Drive', '1drv.ms': 'OneDrive', 'onedrive.live.com': 'OneDrive', 'dropbox.com': 'Dropbox', 'mediafire.com': 'MediaFire' };

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const hostIn = (h, list) => list.some((d) => h === d || h.endsWith('.' + d));
function extOf(u) {
  try { const p = new URL(u).pathname.toLowerCase(); const m = p.match(/\.([a-z0-9]{2,9})$/); if (!m) return ''; if (m[1] === 'gz' && p.endsWith('.tar.gz')) return 'tar.gz'; return m[1]; } catch { return ''; }
}
const SIZE_RE = /(\d+(?:\.\d+)?)\s*(KB|MB|GB|TB|K|M|G|KiB|MiB|GiB)\b/i;
function sizeOf(s) { const m = String(s || '').match(SIZE_RE); return m ? m[1] + ' ' + m[2].toUpperCase().replace(/^([KMGT])$/, '$1B') : ''; }

function safety(u, ext, pageHost) {
  const h = host(u); const hints = []; let level = 'ok';
  const warn = (t, l = 'warn') => { hints.push(t); if (l === 'danger' || level === 'ok') level = l; };
  if (/^http:/i.test(u)) warn('非 HTTPS 链接，可能被篡改');
  if (hostIn(h, SHORTENERS)) warn('短链接，无法确认真实目标', 'danger');
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) warn('直接使用 IP 地址的下载源', 'danger');
  const trusted = hostIn(h, TRUSTED);
  if (RISKY.has(ext)) {
    if (trusted) hints.push('可执行文件 · 来自知名官方/托管站点');
    else warn('可执行/安装包来自非知名域名，运行前请校验签名或哈希、使用杀毒软件扫描', 'danger');
  }
  if (/\.(pdf|docx?|zip|rar)\.(exe|scr|bat|cmd)$/i.test(u)) warn('双扩展名伪装文件', 'danger');
  if (pageHost && h && h !== pageHost && !trusted && !NETDISK[h]) hints.push('外部域名：' + h);
  if (trusted && !hints.length) hints.push('知名站点');
  return { level, hints };
}

function netdiskOf(u) { const h = host(u); for (const [k, v] of Object.entries(NETDISK)) if (h === k || h.endsWith('.' + k) || h.includes(k)) return v; return ''; }

// 从页面中识别可下载资源
function detectResources($, base) {
  const pageHost = host(base); const seen = new Map();
  $('a[href]').each((_, a) => {
    let href = $(a).attr('href') || ''; if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;
    let abs; try { abs = new URL(href, base).href; } catch { return; }
    const text = $(a).text().replace(/\s+/g, ' ').trim().slice(0, 120);
    const ext = extOf(abs); const nd = netdiskOf(abs);
    const magnet = abs.startsWith('magnet:');
    const isDl = magnet || nd || EXT2KIND[ext] || /^(下载|download|立即下载|本地下载|高速下载|镜像|mirror)/i.test(text) || $(a).is('[download]');
    if (!isDl || seen.has(abs)) return;
    const ph = $(a).parent().html() || ''; const oh = $.html(a); const at = ph.indexOf(oh);
    const after = at >= 0 ? ph.slice(at + oh.length, at + oh.length + 400).replace(/<a[\s\S]*$/i, '').replace(/<[^>]+>/g, ' ') : '';
    const ctx = text + ' ' + ($(a).attr('title') || '') + ' ' + after + ' ' + ($(a).parent().text().length < 300 ? $(a).parent().text() : '');
    const fmt = magnet ? 'magnet' : (ext || '');
    const r = { url: abs, text: text || abs.split('/').pop().slice(0, 80), format: fmt, kind: magnet ? 'torrent' : nd ? 'netdisk' : EXT2KIND[ext] || 'link', size: sizeOf(ctx), host: host(abs), netdisk: nd, ...(magnet ? { level: 'warn', hints: ['磁力链接：需 BT 客户端，注意版权与安全'] } : safety(abs, ext, pageHost)) };
    const pw = ctx.match(/(?:提取码|密码|访问码|code)[:：\s]*([a-z0-9]{4})/i); if (pw && nd) r.code = pw[1];
    seen.set(abs, r);
  });
  const list = [...seen.values()];
  // 同名文件不同域名 → 镜像分组
  const byName = new Map();
  for (const r of list) { const n = r.format && r.kind !== 'link' ? decodeURIComponent(r.url.split(/[?#]/)[0].split('/').pop()).toLowerCase() : ''; if (!n) continue; (byName.get(n) || byName.set(n, []).get(n)).push(r); }
  for (const [n, g] of byName) if (g.length > 1 && new Set(g.map((x) => x.host)).size > 1) g.forEach((x, i) => { x.mirrorGroup = n; x.mirrorIndex = i + 1; });
  const order = { danger: 0, warn: 1, ok: 2 };
  return list.slice(0, 60).sort((a, b) => (a.kind === 'link') - (b.kind === 'link') || order[b.level] - order[a.level]);
}

function decodeBody(buf, ctype) {
  let cs = (String(ctype).match(/charset=([\w-]+)/i) || [])[1];
  if (!cs) { const head = Buffer.from(buf.slice(0, 4096)).toString('latin1'); cs = (head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1]; }
  cs = (cs || 'utf-8').toLowerCase(); if (cs === 'gb2312') cs = 'gbk';
  try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// 阅读模式：启发式正文抽取（文本密度 + 段落数）
function extract(html, base) {
  const $ = cheerio.load(html);
  const meta = (n) => $(`meta[property="${n}"],meta[name="${n}"]`).attr('content') || '';
  const title = (meta('og:title') || $('h1').first().text() || $('title').text()).replace(/\s+/g, ' ').trim();
  const info = { title, siteName: meta('og:site_name') || host(base), description: meta('og:description') || meta('description'), image: meta('og:image'), author: meta('author') || meta('article:author'), date: meta('article:published_time') || meta('pubdate') || $('time[datetime]').attr('datetime') || '', lang: $('html').attr('lang') || '' };
  const resources = detectResources($, base);
  $('script,style,noscript,iframe,svg,form,nav,footer,header,aside,button,input,select,textarea,[role=navigation],[aria-hidden=true],.nav,.menu,.footer,.header,.sidebar,.comment,.comments,.ad,.ads,.advert,.share,.related,.breadcrumb').remove();
  let best = null, bestScore = 0;
  $('article,main,[role=main],section,div,td').each((_, el) => {
    const $el = $(el); const ps = $el.children('p,h2,h3,pre,blockquote,ul,ol,figure,img').length; const txt = $el.text().replace(/\s+/g, ' ');
    if (txt.length < 140) return;
    const links = $el.find('a').text().length; const density = 1 - links / (txt.length + 1);
    let s = (ps * 40 + Math.min(txt.length, 8000) / 10) * density * density;
    if (/article|content|post|entry|main|正文|text|body/i.test(($el.attr('class') || '') + ($el.attr('id') || ''))) s *= 1.3;
    if (el.tagName === 'article' || el.tagName === 'main') s *= 1.4;
    if (s > bestScore) { bestScore = s; best = el; }
  });
  let root = best ? $(best) : $('body');
  for (let i = 0; best && i < 4; i++) { // 正文被拆成多个 section 时向上合并
    const par = root.parent(); if (!par.length || par.is('body,html')) break;
    const pc = root.find('p').length, ppc = par.find('p').length; const pt = par.text().length || 1;
    if (ppc >= pc * 1.6 && par.find('a').text().length / pt < 0.35) root = par; else break;
  }
  const blocks = []; let chars = 0;
  root.find('h1,h2,h3,h4,p,pre,blockquote,li,img,figcaption').each((_, el) => {
    if (chars > 30000 || blocks.length > 400) return false;
    const t = el.tagName.toLowerCase();
    if (t === 'img') { let src = $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('src') || ''; if (!src || src.startsWith('data:')) return; try { src = new URL(src, base).href; } catch { return; } if (blocks.length < 400) blocks.push({ t: 'img', src, alt: $(el).attr('alt') || '' }); return; }
    if (t === 'li' && $(el).parents('li').length) return;
    if (t === 'p' && $(el).parents('li,blockquote').length) return;
    const text = (t === 'pre' ? $(el).text() : $(el).text().replace(/\s+/g, ' ')).trim(); if (!text) return;
    if (blocks.length && blocks[blocks.length - 1].text === text) return;
    blocks.push({ t: /^h[1-4]$/.test(t) ? 'h' : t, text }); chars += text.length;
  });
  if (!blocks.filter((b) => b.text).length) { const txt = root.text().replace(/\s+/g, ' ').trim(); for (let i = 0; i < Math.min(txt.length, 20000); i += 600) blocks.push({ t: 'p', text: txt.slice(i, i + 600) }); }
  let text = blocks.filter((b) => b.text).map((b) => b.text).join('\n\n');
  if (text.length < 300) { // 正文由脚本字符串注入（如央视网）
    const m = html.match(/(['"])(\s*<p[^]{300,}?)\1\s*[;,]/);
    if (m) { const $2 = cheerio.load(m[2].replace(/\\(['"\/])/g, '$1')); const bl = []; $2('p,h2,h3,img').each((_, el) => { if (el.tagName === 'img') { const src = $2(el).attr('src'); if (src) try { bl.push({ t: 'img', src: new URL(src, base).href, alt: '' }); } catch {} return; } const t = $2(el).text().replace(/\s+/g, ' ').trim(); if (t) bl.push({ t: el.tagName === 'p' ? 'p' : 'h', text: t }); }); const t2 = bl.filter((b) => b.text).map((b) => b.text).join('\n\n'); if (t2.length > text.length) { blocks.length = 0; blocks.push(...bl); text = t2; } }
  }
  return { ...info, url: base, blocks, text, words: text.length, readMin: Math.max(1, Math.round(text.length / 500)), resources };
}

const cache = new Map();
async function read(url, { timeout = 15000, signal } = {}) {
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https 链接');
  if (cache.has(url)) return cache.get(url);
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout); signal?.addEventListener('abort', () => ac.abort(), { once: true });
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, redirect: 'follow', signal: ac.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = res.headers.get('content-type') || ''; const len = +res.headers.get('content-length') || 0;
    const fin = res.url || url; const ext = extOf(fin);
    if (!/html|xml|text\/plain/i.test(ct)) {
      try { await res.body?.cancel(); } catch {}
      const r = { url: fin, title: decodeURIComponent(fin.split('/').pop() || fin), binary: true, contentType: ct, blocks: [], text: '', words: 0, readMin: 0, resources: [{ url: fin, text: fin.split('/').pop(), format: ext || ct.split('/').pop(), kind: EXT2KIND[ext] || 'file', size: len ? (len / 1048576).toFixed(1) + ' MB' : '', host: host(fin), ...safety(fin, ext) }] };
      cache.set(url, r); return r;
    }
    const buf = new Uint8Array(await res.arrayBuffer()); if (buf.length > 6e6) throw new Error('页面过大');
    const r = /text\/plain/i.test(ct) ? { url: fin, title: fin.split('/').pop(), blocks: decodeBody(buf, ct).slice(0, 30000).split(/\n{2,}/).map((x) => ({ t: 'p', text: x })), resources: [] } : extract(decodeBody(buf, ct), fin);
    r.text ??= r.blocks.map((b) => b.text).join('\n\n'); r.words ??= r.text.length; r.readMin ??= Math.max(1, Math.round(r.text.length / 500));
    if (cache.size > 80) cache.delete(cache.keys().next().value);
    cache.set(url, r); return r;
  } catch (e) { if (e.name === 'AbortError') throw new Error('加载超时或已取消'); throw e; } finally { clearTimeout(t); }
}
module.exports = { read, extract, detectResources, safety, extOf, sizeOf, host, netdiskOf, cheerio };
