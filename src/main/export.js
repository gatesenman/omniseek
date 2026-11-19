'use strict';
const COLS = ['title', 'url', 'kind', 'sourceName', 'author', 'year', 'date', 'publisher', 'venue', 'version', 'platform', 'duration', 'channel', 'snippet'];
const esc = (v) => { const s = Array.isArray(v) ? v.join('; ') : String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
exports.csv = (items) => '\ufeff' + [COLS.join(','), ...items.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\r\n');
exports.md = (title, items, query) => {
  const meta = (r) => ['author', 'year', 'publisher', 'venue', 'version', 'platform', 'duration', 'channel'].map((k) => r[k]).filter(Boolean).join(' · ');
  return `# ${title}\n\n${query ? `> 查询：${query}  \n` : ''}> 导出时间：${new Date().toLocaleString('zh-CN')} · ${items.length} 条 · OmniSeek 万搜\n\n` +
    items.map((r, i) => `${i + 1}. **[${String(r.title).replace(/[[\]]/g, '')}](${r.url})**  \n   ${[r.sourceName, meta(r)].filter(Boolean).join(' · ')}${r.snippet ? '  \n   ' + String(r.snippet).replace(/\s+/g, ' ').slice(0, 300) : ''}${r.pdf ? `  \n   [PDF](${r.pdf})` : ''}`).join('\n') + '\n';
};
