// 脚本插件示例：导出 {id, name, category, search(query, ctx)}；也可导出数组
// ctx: { page, limit, fetchText(url, opt) -> {text, finalUrl}, parse(sourceConfig, body, baseUrl) }
module.exports = {
  id: 'plugin-wikidata', name: 'Wikidata 实体', category: 'websites', weight: 1,
  async search(query, ctx) {
    const { text } = await ctx.fetchText(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=zh&uselang=zh&format=json&limit=${ctx.limit}`, { headers: { 'User-Agent': 'OmniSeek/1.0' } });
    return JSON.parse(text).search.map((e) => ({ title: e.label || e.id, url: 'https://www.wikidata.org/wiki/' + e.id, snippet: e.description || '' }));
  },
};
