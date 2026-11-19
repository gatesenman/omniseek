// 开发用：模拟 OpenAI 兼容接口（含函数调用与流式），用于界面联调与冒烟测试
const http = require('http');
const sse = (res, objs) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); for (const o of objs) res.write(`data: ${JSON.stringify(o)}\n\n`); res.end('data: [DONE]\n\n'); };
const chunks = (t) => t.match(/[\s\S]{1,12}/g).map((c) => ({ choices: [{ delta: { content: c } }] }));
http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
  if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'mock-fast' }, { id: 'mock-strong' }] }));
  const j = JSON.parse(b || '{}'); const sys = j.messages?.[0]?.content || ''; const last = String(j.messages?.at(-1)?.content || '');
  const toolReply = (content, calls) => j.stream ? sse(res, [...(content ? chunks(content) : []), ...calls.map((c, i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id: c.id, function: { name: c.function.name, arguments: c.function.arguments } }] } }] }))]) : res.end(JSON.stringify({ choices: [{ message: { content, tool_calls: calls } }] }));
  const reply = (text) => j.stream ? sse(res, chunks(text)) : res.end(JSON.stringify({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 120, completion_tokens: 40 } }));
  if (j.tools) {
    const toolMsgs = j.messages.filter((m) => m.role === 'tool');
    if (!toolMsgs.length) return toolReply('我先联合搜索。', [{ id: 'c1', type: 'function', function: { name: 'search', arguments: JSON.stringify({ query: 'vscode', categories: ['software'], limit: 6 }) } }]);
    if (toolMsgs.length === 1) return toolReply('', [{ id: 'c2', type: 'function', function: { name: 'compare', arguments: '{"ns":[1,2,3]}' } }]);
    return reply('## 结论\n首选 **VS Code** [1]，轻量可选 [2]。\n\n| 名称 | 特点 |\n|---|---|\n| VS Code | 生态最全 [1] |\n| 其他 | 轻量 [2] |');
  }
  if (/搜索意图分析器/.test(sys)) return reply(JSON.stringify({ intent: '下载 VS Code', type: 'download', lang: 'mixed', entities: [{ type: 'software', value: 'vscode' }], categories: ['software', 'apps'], rewrites: { zh: [], en: ['visual studio code download'] }, dimensions: [] }));
  if (/质检与推荐/.test(sys)) { const n = (last.match(/^\[\d+\]/gm) || []).length; return reply(JSON.stringify({ items: Array.from({ length: Math.min(n, 12) }, (_, i) => ({ i: i + 1, summary: '结果 ' + (i + 1) + ' 的一句话摘要', why: '与查询直接相关', tags: ['编辑器', '开源'], quality: i === 3 ? 'low' : 'good', score: 9 - (i % 5) })), best: [{ i: 1, kind: 'software', reason: '官方发布，生态最完善' }] })); }
  if (/研究规划师/.test(sys)) return reply(JSON.stringify({ intent: '了解 VS Code 最新特性', subquestions: [{ q: '最新版本', queries: ['vscode release notes'], categories: ['software', 'dev'] }, { q: '扩展生态', queries: ['vscode extensions'] }], compare: '' }));
  if (/抽取与研究问题相关的关键事实/.test(sys)) return reply(JSON.stringify({ facts: [{ text: 'VS Code 每月发布一次更新', confidence: 'high' }, { text: '扩展市场有大量插件', confidence: 'medium' }], entities: [] }));
  if (/研究审稿人/.test(sys)) return reply(JSON.stringify({ coverage: 90, gaps: [], queries: [], done: true }));
  if (/严谨的研究助理/.test(sys)) return reply('## 摘要\nVS Code 按月发布 [1]，扩展生态丰富 [2]。\n\n## 关键发现\n- 月度更新 [1]\n- 扩展众多 [2]\n\n## 对比表\n| 项 | 值 |\n|---|---|\n| 发布节奏 | 月度 [1] |');
  if (j.response_format) return reply('{"queries":["vscode download"]}');
  return reply('OK');
}); }).listen(+process.env.PORT || 18080, () => console.log('mock llm on', +process.env.PORT || 18080));
