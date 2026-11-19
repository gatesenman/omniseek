'use strict';
const { EventEmitter } = require('events');
const { HostPool } = require('./pool');
const { parse, fill } = require('./parser');
const { Aggregator } = require('./rank');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OmniSeek/2.3';

function siteConfig(site, engine = 'bing') {
  const s = encodeURIComponent(site);
  if (engine === 'baidu') return { type: 'html', url: 'https://www.baidu.com/s?wd={qe}%20site%3A' + s + '&rn=20', parse: { list: 'div.result[mu], div.c-container[mu]', fields: { title: 'h3', url: { attr: 'mu' }, snippet: '[class*=content-right], .c-abstract, [class*=summary]' } }, _fallback: true };
  if (engine === 'ddg') return { type: 'html', url: 'https://html.duckduckgo.com/html/?q={qe}+site%3A' + s, decode: ['url'], parse: { list: '.result', fields: { title: '.result__a', url: { sel: '.result__a', attr: 'href', regex: 'uddg=([^&]+)' }, snippet: '.result__snippet' } }, _fallback: true };
  return { type: 'html', url: 'https://www.bing.com/search?q={qe}+site%3A' + s + '&count=20&setlang=zh-CN', parse: { list: 'li.b_algo', fields: { title: 'h2', url: 'h2 a@href', snippet: '.b_caption p, p' } }, _fallback: true };
}

function sleep(ms, signal) {
  return new Promise((res, rej) => {
    if (signal?.aborted) return rej(Object.assign(new Error('已取消'), { name: 'AbortError' }));
    const t = setTimeout(res, ms);
    const on = () => { clearTimeout(t); rej(Object.assign(new Error('已取消'), { name: 'AbortError' })); };
    signal?.addEventListener('abort', on, { once: true });
  });
}

async function fetchText(url, opt, timeout, signal) {
  const ac = new AbortController();
  const onParent = () => ac.abort();
  if (signal) {
    if (signal.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
    signal.addEventListener('abort', onParent, { once: true });
  }
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const res = await fetch(url, { ...opt, signal: ac.signal, redirect: 'follow' });
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }
    return { text: await res.text(), finalUrl: res.url, status: res.status };
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onParent);
  }
}

/** 429/503 退避重试；其它错误直接抛出 */
async function fetchWithRetry(url, opt, timeout, signal, retries = 2) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchText(url, opt, timeout, signal);
    } catch (e) {
      last = e;
      if (e.name === 'AbortError') throw e;
      const retryable = e.status === 429 || e.status === 503 || e.status === 502 || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(e.message || '');
      if (!retryable || i === retries) throw e;
      const wait = Math.min(4000, 400 * Math.pow(2, i)) + Math.random() * 200;
      await sleep(wait, signal);
    }
  }
  throw last;
}

class SearchEngine {
  constructor(opts = {}) {
    this.opts = { concurrency: 128, perHost: 4, timeout: 12000, maxPerSource: 20, retries: 2, ...opts };
    this.plugins = new Map();
  }
  registerPlugin(p) { this.plugins.set(p.id, p); }
  ctx(page, signal) {
    const self = this;
    this.cache ||= new Map();
    return {
      page, limit: this.opts.maxPerSource, parse, cache: this.cache, UA, signal,
      fetchText: (u, o = {}) => (self.pool || (self.pool = new HostPool(self.opts.concurrency, self.opts.perHost)))
        .run(u, () => fetchWithRetry(u, { ...o, headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', ...(o.headers || {}) } }, o.timeout || self.opts.timeout, signal, self.opts.retries), signal),
      fetchJson: async (u, o) => JSON.parse((await self.ctx(page, signal).fetchText(u, o)).text),
    };
  }

  async runSource(src, query, page = 1, signal) {
    if (src.plugin && this.plugins.has(src.plugin)) {
      return await this.plugins.get(src.plugin).search(query, this.ctx(page, signal), src);
    }
    const isFallback = !!(src.site && !src.url && !src.request);
    if (isFallback) src = { ...src, ...siteConfig(src.site, this.opts.siteEngine) };
    const vars = { q: query, qe: encodeURIComponent(query), qj: JSON.stringify(String(query)).slice(1, -1), page, page0: page - 1, offset: (page - 1) * 10, limit: this.opts.maxPerSource, key: '', ...(src.vars || {}) };
    if (src.requiresKey && !vars.key) throw new Error('需要 API Key（来源库 → 编辑 → vars.key）');
    const rq = src.request || { url: src.url, headers: src.headers, method: src.method, body: src.body };
    const url = fill(rq.url, vars);
    const headers = { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8', Accept: src.type === 'json' ? 'application/json, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    for (const [k, v] of Object.entries(rq.headers || {})) { if (v == null) delete headers[k]; else headers[k] = fill(v, vars); }
    if (rq.body && !headers['Content-Type']) headers['Content-Type'] = typeof rq.body === 'string' && !rq.body.trim().startsWith('{') ? 'application/x-www-form-urlencoded' : 'application/json';
    const opt = { method: rq.method || 'GET', headers };
    if (rq.body) opt.body = fill(typeof rq.body === 'string' ? rq.body : JSON.stringify(rq.body), vars);
    if (opt.body && opt.method === 'GET') opt.method = 'POST';
    const { text, finalUrl } = await (this.pool ||= new HostPool(this.opts.concurrency, this.opts.perHost))
      .run(url, () => fetchWithRetry(url, opt, src.timeout || this.opts.timeout, signal, this.opts.retries), signal);
    let items = parse(src, text, src.baseUrl || finalUrl || url);
    if (src.site && src.strictSite !== false) {
      const [dom, ...rest] = src.site.replace(/^www\./, '').split('/'); const pfx = rest.length ? '/' + rest.join('/') : '';
      items = items.filter((r) => { try { const u = new URL(r.url); return (u.host === dom || u.host.endsWith('.' + dom)) && u.pathname.startsWith(pfx); } catch { return false; } });
    }
    if (src.parse?.match) {
      const ts = String(query).toLowerCase().split(/\s+/).filter(Boolean);
      items = items.filter((r) => ts.every((t) => String(r[src.parse.match] || '').toLowerCase().includes(t)));
    }
    for (const r of items) { r.kind ||= src.kind || 'web'; if (isFallback || src._fallback) r._fallback = true; }
    return items;
  }

  search(query, sources, { page = 1 } = {}) {
    const ev = new EventEmitter();
    this.pool = new HostPool(this.opts.concurrency, this.opts.perHost);
    const agg = new Aggregator(query);
    const t0 = Date.now();
    let ok = 0, failed = 0, cancelled = false;
    const ac = new AbortController();
    ev.cancel = () => {
      if (cancelled) return;
      cancelled = true;
      try { ac.abort(); } catch {}
      try { this.pool?.clear(); } catch {}
    };
    setImmediate(async () => {
      await Promise.all(sources.map(async (src) => {
        if (cancelled) return;
        const s0 = Date.now();
        try {
          let items = await this.runSource(src, src._query || query, page, ac.signal);
          if (cancelled) return;
          items = items.slice(0, src.maxResults || this.opts.maxPerSource).map((r, i) => ({
            ...r, source: src.id, sourceName: src.name, category: src.category,
            weight: src.weight ?? (src.site && !src.url ? 0.6 : 1),
            rank: i, fallback: !!(src.site && !src.url) || r._fallback,
          }));
          ok++;
          for (const r of items) r.kind ||= src.kind || 'web';
          ev.emit('source', { id: src.id, q: src._query, status: items.length ? 'ok' : 'empty', count: items.length, ms: Date.now() - s0 });
          if (items.length) ev.emit('results', agg.add(items));
        } catch (e) {
          if (cancelled || e.name === 'AbortError') return;
          failed++;
          const msg = e.status === 429 ? '限流 429（已退避重试）' : e.name === 'AbortError' ? '超时' : String(e.message || e);
          ev.emit('source', { id: src.id, q: src._query, status: 'error', error: msg, ms: Date.now() - s0, http: e.status });
        }
      }));
      ev.emit('done', { total: sources.length, ok, failed, ms: Date.now() - t0, results: agg.sorted(), cancelled });
    });
    return ev;
  }

  searchAll(query, sources, o) {
    return new Promise((res) => { const e = this.search(query, sources, o); const st = []; e.on('source', (s) => st.push(s)); e.on('done', (d) => res({ ...d, statuses: st })); });
  }
}
module.exports = { SearchEngine, fetchText, fetchWithRetry, siteConfig, UA };
