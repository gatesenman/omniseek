// Markdown 渲染（安全：先转义）—— 2.3 支持表格、有序列表、分隔线、删除线、引用编号
function md(src, refs = []) {
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inline = (s) => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>').replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a data-href="$2">$1</a>')
    .replace(/\[(\d+(?:\s*[,，、]\s*\d+)*)\]/g, (m, ns) => ns.split(/[,，、]/).map((n) => { const r = refs[+n - 1]; return r ? `<a class="cite" data-href="${e(r.url)}" title="${e(r.title)} · ${e(r.sourceName || '')}">${+n}</a>` : `[${n}]`; }).join(''));
  const lines = String(src ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').split('\n'); const out = []; let list = null, lt = 'ul', code = null;
  const flush = () => { if (list) { out.push(`<${lt}>${list.join('')}</${lt}>`); list = null; } };
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { if (code) { out.push(`<pre><code>${e(code.join('\n'))}</code></pre>`); code = null; } else { flush(); code = []; } continue; }
    if (code) { code.push(line); continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      flush(); const head = cells(line); i++; const rows = [];
      while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(cells(lines[++i]));
      out.push(`<div class="mdtable"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    const li = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)/);
    if (li) { const t = /\d/.test(li[1]) ? 'ol' : 'ul'; if (list && t !== lt) flush(); if (!list) { list = []; lt = t; } list.push(`<li>${inline(li[2])}</li>`); continue; }
    flush();
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) out.push('<hr>');
    else if (/^>\s?/.test(line)) out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  flush(); if (code) out.push(`<pre><code>${e(code.join('\n'))}</code></pre>`);
  return out.join('');
}
if (typeof module !== 'undefined') module.exports = { md };
