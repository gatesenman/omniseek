'use strict';
// 2.3：模型层 —— 任务路由（快/强模型）、重试与超时、响应缓存、用量/费用统计、请求审计、原生工具调用 + JSON 模式回退
const crypto = require('crypto');
const { Provider, extractJson } = require('./providers');
const { getPrompt } = require('./prompts');

const TASK_ROUTE = { intent: 'fast', enhance: 'fast', facts: 'fast', rewrite: 'fast', expand: 'fast', reflect: 'strong', planner: 'strong', report: 'strong', copilot: 'strong', agent: 'strong', digest: 'default', answer: 'default', plan: 'strong', deep: 'default', test: 'default' };
const sleep = (ms, sig) => new Promise((r, j) => { const t = setTimeout(r, ms); sig?.addEventListener('abort', () => { clearTimeout(t); j(Object.assign(new Error('已取消'), { name: 'AbortError' })); }, { once: true }); });
const estTok = (s) => Math.ceil(String(s || '').length / 3);
const msgChars = (ms) => ms.reduce((n, m) => n + String(m.content || '').length + JSON.stringify(m.toolCalls || '').length, 0);

class LLM {
  /**
   * cfg: {profiles, activeProfile, routing:{fast,strong}, cache:boolean, cacheTtlMin, retries, timeoutMs, toolMode:'auto'|'native'|'json', prompts, audit:boolean}
   * hooks: {usage:{d,save()}, onAudit(entry)}
   */
  constructor(cfg = {}, hooks = {}) {
    this.cfg = { retries: 2, cache: true, cacheTtlMin: 60, toolMode: 'auto', audit: true, ...cfg };
    this.hooks = hooks; this.cache = hooks.cache || new Map(); this.auditLog = hooks.auditLog || [];
    this.usage = hooks.usage || { d: { total: {}, byModel: {}, byTask: {}, days: {} }, save() {} };
    this.noNativeTools = hooks.noNativeTools || new Set();
  }
  profile(task) {
    const P = this.cfg.profiles || []; const route = TASK_ROUTE[task] || 'default';
    const id = route === 'fast' ? this.cfg.routing?.fast : route === 'strong' ? this.cfg.routing?.strong : null;
    return P.find((p) => p.id === id) || P.find((p) => p.id === this.cfg.activeProfile) || P[0];
  }
  provider(task) { const p = this.profile(task); return p ? new Provider({ timeout: this.cfg.timeoutMs, ...p }) : null; }
  get enabled() { return !!this.provider('default')?.enabled; }
  prompt(name, vars) { return getPrompt(name, this.cfg.prompts, vars); }
  ensure() { if (!this.enabled) { const e = new Error('尚未配置 AI 模型。请打开「设置 → 模型服务」，添加 OpenAI / DeepSeek / 通义 / Ollama 等任一服务商并填写 API Key（本地 Ollama/LM Studio 可留空）。'); e.code = 'AI_NOT_CONFIGURED'; throw e; } }

  key(p, messages, o) { return crypto.createHash('sha256').update(JSON.stringify([p.provider, p.baseUrl, p.model, messages, !!o.json, o.tools?.map((t) => t.name) || null, o.temperature ?? null])).digest('hex'); }

  track(p, task, usage, cost) {
    const d = this.usage.d; const day = new Date().toISOString().slice(0, 10);
    const add = (o) => { o.calls = (o.calls || 0) + 1; o.in = (o.in || 0) + usage.in; o.out = (o.out || 0) + usage.out; o.cost = +((o.cost || 0) + cost).toFixed(6); if (usage.cached) o.cacheHits = (o.cacheHits || 0) + 1; };
    add(d.total ||= {}); add((d.byModel ||= {})[p.model] ||= {}); add((d.byTask ||= {})[task] ||= {}); add((d.days ||= {})[day] ||= {});
    const ks = Object.keys(d.days).sort(); while (ks.length > 60) delete d.days[ks.shift()];
    this.usage.save?.();
  }
  audit(e) {
    if (!this.cfg.audit) return;
    this.auditLog.unshift(e); if (this.auditLog.length > 200) this.auditLog.length = 200; this.hooks.onAudit?.(e);
  }

  /** 核心调用：complete(task, messages, {json, onToken, tools, signal, temperature, maxTokens, noCache}) */
  async complete(task, messages, o = {}) {
    this.ensure();
    const p = this.profile(task); const prov = new Provider({ timeout: this.cfg.timeoutMs, ...p });
    const useCache = this.cfg.cache && !o.noCache && !o.signal?.aborted;
    const k = useCache ? this.key(p, messages, o) : null; const t0 = Date.now();
    const host = (() => { try { return new URL(p.baseUrl).host; } catch { return p.baseUrl; } })();
    const preview = messages.map((m) => ({ role: m.role, content: String(m.content || (m.toolCalls ? JSON.stringify(m.toolCalls) : '')).slice(0, 1500) }));
    if (k) {
      const hit = this.cache.get(k);
      if (hit && Date.now() - hit.at < this.cfg.cacheTtlMin * 60000) {
        if (o.onToken && hit.r.text) o.onToken(hit.r.text);
        this.track(p, task, { in: 0, out: 0, cached: true }, 0);
        this.audit({ at: Date.now(), task, model: p.model, provider: p.provider, host, chars: msgChars(messages), cached: true, ms: 0, messages: preview });
        return { ...hit.r, cached: true };
      }
    }
    let lastErr;
    for (let a = 0; a <= (this.cfg.retries ?? 2); a++) {
      try {
        const r = await prov.complete(messages, { json: o.json, onToken: o.onToken, tools: o.tools, signal: o.signal, temperature: o.temperature, maxTokens: o.maxTokens });
        const usage = { in: r.usage?.in || estTok(JSON.stringify(messages)), out: r.usage?.out || estTok(r.text + JSON.stringify(r.toolCalls || '')), est: !r.usage?.in };
        const price = p.price || {}; const cost = (usage.in * (+price.in || 0) + usage.out * (+price.out || 0)) / 1e6;
        this.track(p, task, usage, cost);
        this.audit({ at: Date.now(), task, model: p.model, provider: p.provider, host, chars: msgChars(messages), tokens: usage, cost, ms: Date.now() - t0, tools: o.tools?.map((t) => t.name), messages: preview });
        if (k) { this.cache.set(k, { at: Date.now(), r }); if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value); }
        return { ...r, usage };
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError' || o.signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' });
        const retryable = !e.status || e.status === 429 || e.status >= 500 || e.name === 'TimeoutError';
        if (!retryable || a === (this.cfg.retries ?? 2) || o.onToken && a > 0) break;
        await sleep(600 * 2 ** a + Math.random() * 300, o.signal);
      }
    }
    this.audit({ at: Date.now(), task, model: p.model, provider: p.provider, host, chars: msgChars(messages), error: String(lastErr?.message || lastErr).slice(0, 300), ms: Date.now() - t0, messages: preview });
    throw lastErr;
  }
  async chat(task, messages, o = {}) { return (await this.complete(task, messages, o)).text; }
  async json(task, messages, o = {}) {
    const r = await this.complete(task, messages, { ...o, json: true });
    try { return extractJson(r.text); } catch {
      const r2 = await this.complete(task, [...messages, { role: 'assistant', content: r.text }, { role: 'user', content: '上面的输出不是有效 JSON。请只输出一个合法 JSON 对象。' }], { ...o, json: true, noCache: true });
      return extractJson(r2.text);
    }
  }

  /** 工具调用：原生 function calling，失败或不支持时回退到 JSON 协议 */
  async tools(task, messages, tools, o = {}) {
    const p = this.profile(task); const mode = p?.toolMode && p.toolMode !== 'auto' ? p.toolMode : this.cfg.toolMode;
    const native = mode === 'native' || (mode === 'auto' && !this.noNativeTools.has(p?.id + ':' + p?.model));
    if (native) {
      try { const r = await this.complete(task, messages, { ...o, tools }); return { ...r, mode: 'native' }; }
      catch (e) {
        if (mode === 'native' || e.name === 'AbortError' || !(e.status === 400 || e.status === 404 || e.status === 422 || /tool|function/i.test(e.message))) throw e;
        this.noNativeTools.add(p.id + ':' + p.model);
      }
    }
    return { ...(await this.jsonTools(task, messages, tools, o)), mode: 'json' };
  }
  async jsonTools(task, messages, tools, o) {
    const spec = tools.map((t) => `- ${t.name}: ${t.description}\n  参数: ${JSON.stringify(t.parameters?.properties || {})}`).join('\n');
    const sys = `\n\n【工具调用协议】你无法直接调用函数，请只输出一个 JSON 对象：\n需要调用工具时：{"say":"简短说明","tool_calls":[{"name":"工具名","args":{...}}]}\n可以作答时：{"final":"给用户的完整 Markdown 回答"}\n可用工具：\n${spec}`;
    const conv = []; let sysDone = false;
    for (const m of messages) {
      if (m.role === 'system') { conv.push({ role: 'system', content: m.content + (sysDone ? '' : sys) }); sysDone = true; }
      else if (m.role === 'tool') conv.push({ role: 'user', content: `TOOL_RESULT(${m.name}#${m.toolCallId}):\n${m.content}` });
      else if (m.role === 'assistant' && m.toolCalls?.length) conv.push({ role: 'assistant', content: JSON.stringify({ say: m.content || '', tool_calls: m.toolCalls.map((c) => ({ name: c.name, args: c.args })) }) });
      else conv.push({ role: m.role, content: m.content });
    }
    if (!sysDone) conv.unshift({ role: 'system', content: sys.trim() });
    const r = await this.complete(task, conv, { ...o, json: true, onToken: undefined });
    let j; try { j = extractJson(r.text); } catch { o.onToken?.(r.text); return { text: r.text, toolCalls: [], usage: r.usage }; }
    const calls = (Array.isArray(j.tool_calls) ? j.tool_calls : Array.isArray(j.actions) ? j.actions.map((a) => ({ name: a.tool, args: a.args })) : []).filter((c) => c && c.name).map((c, i) => ({ id: 'j' + Date.now().toString(36) + i, name: c.name, args: c.args || {} }));
    const text = calls.length ? String(j.say || '') : String(j.final ?? j.say ?? j.answer ?? r.text);
    if (!calls.length && o.onToken) o.onToken(text);
    return { text, toolCalls: calls, usage: r.usage };
  }
}
module.exports = { LLM, TASK_ROUTE, estTok };
