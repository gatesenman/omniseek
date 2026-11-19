'use strict';
// 模型服务商预设 + 统一调用（OpenAI 兼容 / Anthropic 原生 / Gemini 原生）
const PRESETS = [
  // 国际
  { id: 'openai', name: 'OpenAI', group: '国际', kind: 'openai', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o', 'o4-mini'], keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic Claude', group: '国际', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-5-haiku-latest'], keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Google Gemini', group: '国际', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'], keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'xai', name: 'xAI Grok', group: '国际', kind: 'openai', baseUrl: 'https://api.x.ai/v1', models: ['grok-4', 'grok-3-mini', 'grok-3'], keyUrl: 'https://console.x.ai' },
  { id: 'mistral', name: 'Mistral', group: '国际', kind: 'openai', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-small-latest'], keyUrl: 'https://console.mistral.ai/api-keys' },
  { id: 'groq', name: 'Groq', group: '国际', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b'], keyUrl: 'https://console.groq.com/keys' },
  // 国内
  { id: 'deepseek', name: 'DeepSeek 深度求索', group: '国内', kind: 'openai', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'dashscope', name: '通义千问 DashScope', group: '国内', kind: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen3-235b-a22b'], keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'zhipu', name: '智谱 GLM', group: '国内', kind: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4.5', 'glm-4-plus', 'glm-4-flash'], keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'moonshot', name: 'Moonshot Kimi', group: '国内', kind: 'openai', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-k2-0711-preview', 'moonshot-v1-32k', 'moonshot-v1-8k'], keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'volcengine', name: '豆包 火山方舟', group: '国内', kind: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-seed-1-6-250615', 'doubao-1-5-pro-32k-250115'], keyUrl: 'https://console.volcengine.com/ark', note: '模型名可填写推理接入点 ID（ep-xxxx）' },
  { id: 'qianfan', name: '文心 百度千帆', group: '国内', kind: 'openai', baseUrl: 'https://qianfan.baidubce.com/v2', models: ['ernie-4.5-turbo-128k', 'ernie-4.0-8k', 'ernie-speed-128k'], keyUrl: 'https://console.bce.baidu.com/iam/#/iam/apikey/list' },
  { id: 'minimax', name: 'MiniMax', group: '国内', kind: 'openai', baseUrl: 'https://api.minimaxi.com/v1', models: ['MiniMax-M1', 'MiniMax-Text-01'], keyUrl: 'https://platform.minimaxi.com' },
  { id: 'baichuan', name: '百川智能', group: '国内', kind: 'openai', baseUrl: 'https://api.baichuan-ai.com/v1', models: ['Baichuan4-Turbo', 'Baichuan4'], keyUrl: 'https://platform.baichuan-ai.com/console/apikey' },
  { id: 'lingyi', name: '零一万物', group: '国内', kind: 'openai', baseUrl: 'https://api.lingyiwanwu.com/v1', models: ['yi-lightning', 'yi-large'], keyUrl: 'https://platform.lingyiwanwu.com/apikeys' },
  { id: 'spark', name: '讯飞星火', group: '国内', kind: 'openai', baseUrl: 'https://spark-api-open.xf-yun.com/v1', models: ['4.0Ultra', 'generalv3.5', 'lite'], keyUrl: 'https://console.xfyun.cn/services/bm4', note: 'API Key 填写 APIPassword' },
  { id: 'siliconflow', name: '硅基流动 SiliconFlow', group: '国内', kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct', 'THUDM/glm-4-9b-chat'], keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  // 聚合
  { id: 'openrouter', name: 'OpenRouter', group: '聚合', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4.1-mini', 'anthropic/claude-sonnet-4.5', 'google/gemini-2.5-flash', 'deepseek/deepseek-chat'], keyUrl: 'https://openrouter.ai/keys' },
  { id: 'siliconflow-agg', name: '硅基流动（聚合开源模型）', group: '聚合', kind: 'openai', baseUrl: 'https://api.siliconflow.cn/v1', models: ['Qwen/Qwen3-235B-A22B', 'moonshotai/Kimi-K2-Instruct'], keyUrl: 'https://cloud.siliconflow.cn/account/ak' },
  { id: 'together', name: 'Together AI', group: '聚合', kind: 'openai', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'], keyUrl: 'https://api.together.ai/settings/api-keys' },
  // 本地
  { id: 'ollama', name: 'Ollama（本地）', group: '本地', kind: 'openai', baseUrl: 'http://localhost:11434/v1', models: ['qwen2.5:7b', 'llama3.1:8b'], noKey: true },
  { id: 'lmstudio', name: 'LM Studio（本地）', group: '本地', kind: 'openai', baseUrl: 'http://localhost:1234/v1', models: [], noKey: true },
  { id: 'custom', name: '自定义 OpenAI 兼容', group: '自定义', kind: 'openai', baseUrl: '', models: [] },
];

const trim = (u) => String(u || '').replace(/\/+$/, '');
async function readSSE(res, onData) {
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) { const m = l.match(/^data:\s*(.*)$/); if (!m || m[1] === '[DONE]') continue; try { onData(JSON.parse(m[1])); } catch {} }
  }
}
async function check(res) { if (!res.ok) { const t = await res.text().catch(() => ''); const e = new Error(`HTTP ${res.status}: ${t.slice(0, 300)}`); e.status = res.status; e.body = t; throw e; } return res; }
const anySignal = (list) => { const ac = new AbortController(); for (const s of list.filter(Boolean)) { if (s.aborted) { ac.abort(s.reason); break; } s.addEventListener('abort', () => ac.abort(s.reason), { once: true }); } return ac.signal; };
const safeJson = (s) => { try { return typeof s === 'string' ? (s.trim() ? JSON.parse(s) : {}) : s || {}; } catch { return { _raw: s }; } };

/**
 * 统一适配器（2.3）：complete(messages, {json, onToken, temperature, tools, signal, maxTokens})
 *  → {text, toolCalls:[{id,name,args}], usage:{in,out}, raw}
 * messages 支持 role: system | user | assistant(可带 toolCalls) | tool(toolCallId, name, content)
 */
class Provider {
  constructor(p = {}) { this.p = p; }
  get enabled() { const ps = PRESETS.find((x) => x.id === this.p.provider); return !!(this.p.baseUrl && this.p.model && (this.p.apiKey || ps?.noKey || /localhost|127\.0\.0\.1/.test(this.p.baseUrl))); }
  get kind() { return this.p.kind || PRESETS.find((x) => x.id === this.p.provider)?.kind || 'openai'; }
  signal(extra) { return anySignal([AbortSignal.timeout(this.p.timeout || 180000), extra]); }

  async listModels() {
    const b = trim(this.p.baseUrl), k = this.p.apiKey;
    if (this.kind === 'anthropic') { const r = await check(await fetch(b + '/v1/models?limit=100', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' }, signal: this.signal() })); return (await r.json()).data.map((m) => m.id); }
    if (this.kind === 'gemini') { const r = await check(await fetch(b + '/v1beta/models?pageSize=200&key=' + encodeURIComponent(k), { signal: this.signal() })); return (await r.json()).models.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, '')); }
    if (/11434/.test(b)) { try { const r = await check(await fetch(b.replace(/\/v1$/, '') + '/api/tags', { signal: this.signal() })); return (await r.json()).models.map((m) => m.name); } catch {} }
    const r = await check(await fetch(b + '/models', { headers: k ? { Authorization: 'Bearer ' + k } : {}, signal: this.signal() }));
    const d = await r.json(); return (d.data || d.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
  }

  async chat(messages, o = {}) { return (await this.complete(messages, o)).text; }

  async complete(messages, { json = false, onToken, temperature, tools, signal, maxTokens } = {}) {
    if (!this.enabled) throw new Error('尚未配置 AI 模型。请到「设置 → 模型服务」添加服务商并填写 API Key（Ollama/LM Studio 可留空）。');
    temperature ??= this.p.temperature ?? 0.3;
    const sig = this.signal(signal);
    if (this.kind === 'anthropic') return this.anthropic(messages, { json, onToken, temperature, tools, sig, maxTokens });
    if (this.kind === 'gemini') return this.gemini(messages, { json, onToken, temperature, tools, sig, maxTokens });
    return this.openai(messages, { json, onToken, temperature, tools, sig, maxTokens });
  }

  async openai(messages, { json, onToken, temperature, tools, sig, maxTokens }) {
    const b = trim(this.p.baseUrl), k = this.p.apiKey;
    const msgs = messages.map((m) => m.role === 'tool' ? { role: 'tool', tool_call_id: m.toolCallId, content: String(m.content) }
      : m.role === 'assistant' && m.toolCalls?.length ? { role: 'assistant', content: m.content || null, tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) }
      : { role: m.role, content: m.content });
    const body = { model: this.p.model, messages: msgs, temperature, stream: !!onToken };
    if (maxTokens || this.p.maxTokens) body.max_tokens = maxTokens || this.p.maxTokens;
    if (onToken) body.stream_options = { include_usage: true };
    if (json && !tools) body.response_format = { type: 'json_object' };
    if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } } }));
    let res;
    try { res = await check(await fetch(b + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(k ? { Authorization: 'Bearer ' + k } : {}) }, body: JSON.stringify(body), signal: sig })); }
    catch (e) {
      if (e.status === 400 && (body.response_format || body.stream_options)) { delete body.response_format; delete body.stream_options; res = await check(await fetch(b + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(k ? { Authorization: 'Bearer ' + k } : {}) }, body: JSON.stringify(body), signal: sig })); }
      else throw e;
    }
    if (!onToken) {
      const d = await res.json(); const m = d.choices?.[0]?.message || {};
      return { text: m.content || '', toolCalls: (m.tool_calls || []).map((c) => ({ id: c.id, name: c.function?.name, args: safeJson(c.function?.arguments) })), usage: { in: d.usage?.prompt_tokens || 0, out: d.usage?.completion_tokens || 0 } };
    }
    let text = ''; const calls = []; const usage = { in: 0, out: 0 };
    await readSSE(res, (d) => {
      if (d.usage) { usage.in = d.usage.prompt_tokens || 0; usage.out = d.usage.completion_tokens || 0; }
      const dl = d.choices?.[0]?.delta; if (!dl) return;
      if (dl.content) { text += dl.content; onToken(dl.content); }
      for (const tc of dl.tool_calls || []) { const c = (calls[tc.index ?? 0] ||= { id: '', name: '', a: '' }); if (tc.id) c.id = tc.id; if (tc.function?.name) c.name += tc.function.name; if (tc.function?.arguments) c.a += tc.function.arguments; }
    });
    return { text, toolCalls: calls.filter(Boolean).map((c) => ({ id: c.id || 'call_' + Math.random().toString(36).slice(2, 8), name: c.name, args: safeJson(c.a) })), usage };
  }

  async anthropic(messages, { json, onToken, temperature, tools, sig, maxTokens }) {
    const b = trim(this.p.baseUrl), k = this.p.apiKey;
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n') + (json && !tools ? '\n\n只输出一个 JSON 对象，不要输出其他文字。' : '');
    const conv = [];
    for (const m of messages.filter((x) => x.role !== 'system')) {
      let msg;
      if (m.role === 'tool') msg = { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: String(m.content) }] };
      else if (m.role === 'assistant' && m.toolCalls?.length) msg = { role: 'assistant', content: [...(m.content ? [{ type: 'text', text: m.content }] : []), ...m.toolCalls.map((c) => ({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} }))] };
      else msg = { role: m.role === 'assistant' ? 'assistant' : 'user', content: [{ type: 'text', text: String(m.content ?? '') }] };
      const last = conv[conv.length - 1];
      if (last && last.role === msg.role) last.content.push(...msg.content); else conv.push(msg);
    }
    const body = { model: this.p.model, max_tokens: maxTokens || this.p.maxTokens || 4096, temperature, system: sys, messages: conv, stream: !!onToken };
    if (tools?.length) body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters || { type: 'object', properties: {} } }));
    const res = await check(await fetch(b + '/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: sig }));
    if (!onToken) {
      const d = await res.json();
      return { text: (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''), toolCalls: (d.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, args: c.input || {} })), usage: { in: d.usage?.input_tokens || 0, out: d.usage?.output_tokens || 0 } };
    }
    let text = ''; const blocks = {}; const usage = { in: 0, out: 0 };
    await readSSE(res, (d) => {
      if (d.type === 'message_start') usage.in = d.message?.usage?.input_tokens || 0;
      if (d.type === 'message_delta') usage.out = d.usage?.output_tokens || usage.out;
      if (d.type === 'content_block_start' && d.content_block?.type === 'tool_use') blocks[d.index] = { id: d.content_block.id, name: d.content_block.name, a: '' };
      if (d.type === 'content_block_delta') { if (d.delta?.type === 'text_delta' || d.delta?.text) { text += d.delta.text || ''; onToken(d.delta.text || ''); } if (d.delta?.type === 'input_json_delta') blocks[d.index].a += d.delta.partial_json; }
    });
    return { text, toolCalls: Object.values(blocks).map((c) => ({ id: c.id, name: c.name, args: safeJson(c.a) })), usage };
  }

  async gemini(messages, { json, onToken, temperature, tools, sig, maxTokens }) {
    const b = trim(this.p.baseUrl), k = this.p.apiKey;
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = [];
    for (const m of messages.filter((x) => x.role !== 'system')) {
      let c;
      if (m.role === 'tool') c = { role: 'user', parts: [{ functionResponse: { name: m.name, response: { content: String(m.content) } } }] };
      else if (m.role === 'assistant' && m.toolCalls?.length) c = { role: 'model', parts: [...(m.content ? [{ text: m.content }] : []), ...m.toolCalls.map((x) => ({ functionCall: { name: x.name, args: x.args || {} } }))] };
      else c = { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] };
      const last = contents[contents.length - 1]; if (last && last.role === c.role) last.parts.push(...c.parts); else contents.push(c);
    }
    const body = { contents, generationConfig: { temperature, ...(maxTokens ? { maxOutputTokens: maxTokens } : {}), ...(json && !tools ? { responseMimeType: 'application/json' } : {}) } };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    if (tools?.length) body.tools = [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
    const path = `/v1beta/models/${encodeURIComponent(this.p.model)}:${onToken ? 'streamGenerateContent?alt=sse&' : 'generateContent?'}key=${encodeURIComponent(k)}`;
    const res = await check(await fetch(b + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: sig }));
    let text = ''; const calls = []; const usage = { in: 0, out: 0 };
    const eat = (d) => { for (const p of d.candidates?.[0]?.content?.parts || []) { if (p.text) { text += p.text; onToken?.(p.text); } if (p.functionCall) calls.push({ id: 'g' + calls.length + '_' + Date.now(), name: p.functionCall.name, args: p.functionCall.args || {} }); } if (d.usageMetadata) { usage.in = d.usageMetadata.promptTokenCount || 0; usage.out = d.usageMetadata.candidatesTokenCount || 0; } };
    if (!onToken) eat(await res.json()); else await readSSE(res, eat);
    return { text, toolCalls: calls, usage };
  }
}
function extractJson(s) {
  s = String(s).replace(/<think>[\s\S]*?<\/think>/g, '');
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (f) s = f[1];
  const i = s.indexOf('{'), j = s.lastIndexOf('}');
  return JSON.parse(i >= 0 ? s.slice(i, j + 1) : s);
}
module.exports = { PRESETS, Provider, extractJson };
