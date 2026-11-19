'use strict';
// 内置脚本来源（需要多步请求 / Cookie / 页面内嵌 JSON 的平台）
const { fmtNum, fmtDur, fmtDate, decodeEntities } = require('./parser');
const strip = (s) => decodeEntities(String(s || '').replace(/<[^>]+>/g, '')).trim();

const bilibili = {
  id: 'builtin-bilibili', name: '哔哩哔哩', category: 'video',
  async cookie(ctx) {
    if (ctx.cache.has('bili')) return ctx.cache.get('bili');
    const p = (async () => { try { const d = await ctx.fetchJson('https://api.bilibili.com/x/frontend/finger/spi'); return `buvid3=${d.data.b_3}; buvid4=${encodeURIComponent(d.data.b_4)}`; } catch { return 'buvid3=' + crypto.randomUUID() + 'infoc'; } })();
    ctx.cache.set('bili', p); return p;
  },
  async search(q, ctx, src) {
    const type = src?.vars?.type || 'video';
    const d = await ctx.fetchJson(`https://api.bilibili.com/x/web-interface/search/type?search_type=${type}&keyword=${encodeURIComponent(q)}&page=1`, { headers: { Cookie: await this.cookie(ctx), Referer: 'https://search.bilibili.com/' } });
    if (d.code !== 0) throw new Error('B站接口: ' + d.message);
    return (d.data?.result || []).map((r) => {
      if (type === 'article') return { title: strip(r.title), url: 'https://www.bilibili.com/read/cv' + r.id, snippet: strip(r.desc), thumb: r.image_urls?.[0] && 'https:' + r.image_urls[0].replace(/^https?:/, ''), views: fmtNum(r.view), author: r.author_name };
      if (type !== 'video') return { title: strip(r.title), url: r.url || r.goto_url, cover: r.cover?.replace(/^\/\//, 'https://').replace(/^http:/, 'https:'), snippet: strip(r.desc), year: fmtDate(r.pubtime).slice(0, 4), rating: r.media_score?.score, format: r.index_show || r.season_type_name, keywords: r.styles, author: strip(r.cv || r.staff).slice(0, 60) };
      const dur = String(r.duration || '').split(':').reduce((a, b) => a * 60 + +b, 0);
      return { title: strip(r.title), url: r.arcurl || 'https://www.bilibili.com/video/' + r.bvid, thumb: 'https:' + String(r.pic).replace(/^https?:/, ''), duration: fmtDur(dur), channel: r.author, views: fmtNum(r.play), date: fmtDate(r.pubdate), snippet: strip(r.description).slice(0, 160), keywords: r.tag };
    });
  },
};

const youtube = {
  id: 'builtin-youtube', name: 'YouTube', category: 'video',
  async search(q, ctx) {
    const { text } = await ctx.fetchText('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&hl=zh-CN', { headers: { Cookie: 'CONSENT=YES+1' } });
    const m = text.match(/var ytInitialData\s*=\s*(\{.+?\});<\/script>/s) || text.match(/ytInitialData"\]\s*=\s*(\{.+?\});/s);
    if (!m) throw new Error('未解析到 ytInitialData');
    const out = []; const walk = (o) => { if (!o || typeof o !== 'object' || out.length >= 25) return; if (o.videoRenderer) { out.push(o.videoRenderer); return; } for (const k in o) walk(o[k]); };
    walk(JSON.parse(m[1]));
    const txt = (x) => x?.simpleText || x?.runs?.map((r) => r.text).join('') || '';
    return out.map((v) => ({ title: txt(v.title), url: 'https://www.youtube.com/watch?v=' + v.videoId, thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, duration: txt(v.lengthText), channel: txt(v.ownerText), views: txt(v.shortViewCountText) || txt(v.viewCountText), date: txt(v.publishedTimeText), snippet: txt(v.detailedMetadataSnippets?.[0]?.snippetText) }));
  },
};

const pubmed = {
  id: 'builtin-pubmed', name: 'PubMed', category: 'papers',
  async search(q, ctx) {
    const s = await ctx.fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=20&sort=relevance&term=${encodeURIComponent(q)}`);
    const ids = s.esearchresult?.idlist || []; if (!ids.length) return [];
    const d = await ctx.fetchJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`);
    return ids.map((id) => d.result[id]).filter(Boolean).map((r) => ({ title: strip(r.title), url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`, author: (r.authors || []).slice(0, 6).map((a) => a.name).join(', '), venue: r.fulljournalname || r.source, year: String(r.pubdate || '').slice(0, 4), date: r.sortpubdate?.slice(0, 10).replace(/\//g, '-'), doi: (r.articleids || []).find((a) => a.idtype === 'doi')?.value, pdf: (r.articleids || []).find((a) => a.idtype === 'pmc') ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${(r.articleids || []).find((a) => a.idtype === 'pmc').value}/pdf/` : undefined }));
  },
};

const met = {
  id: 'builtin-met', name: '大都会艺术博物馆', category: 'images',
  async search(q, ctx) {
    const s = await ctx.fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(q)}`);
    const ids = (s.objectIDs || []).slice(0, 16);
    const objs = await Promise.all(ids.map((id) => ctx.fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`).catch(() => null)));
    return objs.filter((o) => o && o.primaryImageSmall).map((o) => ({ title: o.title, url: o.objectURL, thumb: o.primaryImageSmall, author: o.artistDisplayName, date: o.objectDate, license: o.isPublicDomain ? '公有领域' : '' }));
  },
};

module.exports = [bilibili, youtube, pubmed, met];
