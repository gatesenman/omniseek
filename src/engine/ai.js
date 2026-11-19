'use strict';
const { extractJson } = require('./providers');
const { LLM } = require('./llm');

function ctxBlock(results, n = 40) {
  return results.slice(0, n).map((r, i) => `[${i + 1}] ${r.title}\n来源:${r.sourceName} 类型:${r.kind} 链接:${r.url}\n${[r.author && '作者:' + r.author, r.year && '年份:' + r.year, r.venue, r.version && '版本:' + r.version, r.publisher, r.date && '日期:' + r.date].filter(Boolean).join(' · ')}\n${String(r.snippet || '').slice(0, 220)}`).join('\n\n');
}

class AI {
  /** 参数可以是 LLM 实例（2.3 推荐）或单个模型配置（兼容旧用法） */
  constructor(x) { this.llm = x instanceof LLM ? x : new LLM({ profiles: x ? [{ id: 'p', ...x }] : [], activeProfile: 'p', cache: false }); }
  get enabled() { return this.llm.enabled; }
  ensure() { this.llm.ensure(); }
  chat(m, o = {}) { this.ensure(); return this.llm.chat(o.task || 'deep', m, o); }

  async expand(query) {
    const r = await this.llm.json('expand', [{ role: 'system', content: '你是搜索查询扩展助手。只输出 JSON：{"queries":["..."]}，给出 3-5 个改写/同义/中英文互译的搜索词，保留原意，每个不超过 8 个词。' }, { role: 'user', content: query }]);
    return (r.queries || []).filter((q) => typeof q === 'string' && q.trim()).slice(0, 5);
  }

  async plan(need, categories, sourceIndex) {
    const sys = `你是联合搜索规划器。用户给出一个需求，你需要设计“搜索维度”。
可用分类：${JSON.stringify(categories)}
已有来源（id|名称|分类|类型）：
${sourceIndex.map((s) => `${s.id}|${s.name}|${s.category}|${s.kind}`).join('\n')}

只输出 JSON：
{"title":"方案标题","dimensions":[{"name":"维度名","category":"分类key(可新建)","categoryLabel":"中文分类名","query":"该维度的搜索词","sourceIds":["已有来源id"],"reason":"简述"}],
 "newCategories":{"key":"中文名"},
 "newSources":[{"id":"小写-短横线","name":"名称","category":"分类key","kind":"web|book|video|software|package|paper|report|image|music|data|news|qa|wiki","site":"example.com"}]}
规则：3-8 个维度；每个维度选 3-20 个最相关的已有来源；优先选原生接口来源（非 site: 回退）；已有来源不足时在 newSources 中补充。`;
    return this.llm.json('plan', [{ role: 'system', content: sys }, { role: 'user', content: need }], { temperature: 0.4 });
  }

  digest(query, results, onToken) {
    return this.llm.chat('digest', [{ role: 'system', content: this.llm.prompt('digest') }, { role: 'user', content: `查询：${query}\n\n搜索结果：\n${ctxBlock(results)}` }], { onToken });
  }

  answer(query, results, history, onToken) {
    const msgs = [{ role: 'system', content: `${this.llm.prompt('answer')}\n\n原始查询：${query}\n\n搜索结果：\n${ctxBlock(results, 50)}` }];
    for (const h of history) msgs.push(h);
    return this.llm.chat('answer', msgs, { onToken });
  }
}
module.exports = { AI, ctxBlock, extractJson };
