// 扩展示例（脚本型）：GitHub 热门仓库搜索（按 star 排序，按最近一年创建过滤）
module.exports = {
  id: 'gx-github-hot', name: 'GitHub 近一年热门', category: 'code', kind: 'software',
  description: '搜索近一年新建、按星标排序的 GitHub 仓库',
  async search(query, ctx) {
    const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const j = await ctx.fetchJson(`https://api.github.com/search/repositories?q=${encodeURIComponent(query + ' created:>' + since)}&sort=stars&per_page=${ctx.limit}`, { headers: { Accept: 'application/vnd.github+json' } });
    return (j.items || []).map((r) => ({ title: r.full_name, url: r.html_url, snippet: r.description || '', stars: r.stargazers_count, lang: r.language, icon: r.owner?.avatar_url, date: r.pushed_at?.slice(0, 10), license: r.license?.spdx_id, kind: 'software' }));
  },
};
