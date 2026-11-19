// 来源定义辅助函数（家族模板）
const S = [];
const add = (o) => { o.enabled ??= true; S.push(o); return o; };
const J = (id, name, category, kind, url, list, fields, x = {}) => add({ id, name, category, kind, type: 'json', url, parse: { list, fields }, ...x });
const H = (id, name, category, kind, url, list, fields, x = {}) => add({ id, name, category, kind, type: 'html', url, parse: { list, fields }, ...x });
const X = (id, name, category, kind, url, list, fields, x = {}) => add({ id, name, category, kind, type: 'xml', url, parse: { list, fields }, ...x });
// 无公开接口的平台：通用搜索引擎 site: 回退（严格域名过滤）
const site = (id, name, category, kind, s, x = {}) => add({ id: 'site-' + id, name, category, kind, site: s, fallback: true, weight: 0.8, ...x });
const isCN = (n) => /[\u4e00-\u9fa5]/.test(n);
module.exports = { S, add, J, H, X, site, isCN };
