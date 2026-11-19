// 界面文案（zh / en）
const I18N = {
  zh: { search: '搜索', assistant: 'AI 助手', sources: '来源库', health: '健康', ext: '扩展', library: '收藏', settings: '设置',
    placeholder: '搜索全部来源…（Enter 搜索，Ctrl+Enter AI 回答）', go: '搜索', stop: '停止', expand: 'AI 扩展', answer: 'AI 回答', digest: 'AI 摘要',
    all: '全部', allTypes: '全部类型', anyTime: '任意时间', d1: '一天内', w1: '一周内', m1: '一月内', y1: '一年内', y5: '五年内', anyLang: '任意语言', zhOnly: '中文', enOnly: '英文',
    region: '地区', regionAll: '全球+国内', regionCn: '仅国内来源', regionIntl: '仅国际来源', nativeOnly: '仅原生接口', scene: '场景', noScene: '无场景',
    view: '视图', vAuto: '自动', vList: '列表', vGrid: '网格', sort: '排序', sRel: '相关度', sDate: '最新', sSrc: '多源命中', sDomain: '按域名分组', deep: '深度搜索', preview: '预览',
    exportMd: '导出 Markdown', exportCsv: '导出 CSV', saveSearch: '保存搜索', results: '条结果', sourcesDone: '个来源', failed: '失败', elapsed: '耗时',
    empty: '输入关键词开始搜索', emptySub: '同时检索数百个来源 · 结果按类型展示 · 支持 AI 回答与追问', noResults: '没有匹配的结果', fav: '收藏', unfav: '取消收藏', copyLink: '复制链接', open: '打开',
    followUp: '继续追问…', send: '发送', aiOff: '未配置模型：在“设置 → 模型服务”添加一个服务商后可使用 AI 功能。', history: '最近搜索', saved: '已保存搜索', collections: '收藏夹', newCollection: '新建收藏夹',
    clear: '清空', delete: '删除', enable: '启用', disable: '禁用', test: '测试', edit: '编辑', save: '保存', cancel: '取消', apply: '应用', reload: '重新加载', openDir: '打开目录', import: '导入文件', install: '安装', uninstall: '卸载', installed: '已安装',
    lang: '界面语言', theme: '主题', tSystem: '跟随系统', tDark: '深色', tLight: '浅色',
    shortcuts: '快捷键', noSources: '没有可用来源', noSourcesSub: '当前场景/筛选下没有启用的来源，请调整筛选或到「来源库」启用。也可取消勾选「仅原生接口」。',
    searchFailed: '搜索遇到问题', retry: '重试', onboardTitle: '欢迎使用 OmniSeek 万搜',
    onboard1: '一次搜索，同时查询数百个来源', onboard2: '按图书/视频/软件/论文等类型智能展示',
    onboard3: '可选配 AI：摘要、追问、对话管理来源', onboard4: 'Alt+Space 呼出快速搜索',
    onboardGo: '开始使用', onboardSkip: '跳过', preferNative: '默认跳过站内回退来源',
    healthHint: '健康数据来自本机实测；内置标记来自打包时的检测。失效来源可一键禁用。',
    aiNeedKey: '尚未配置模型', aiNeedKeySub: '打开「设置 → 模型服务」添加任一服务商即可。不配置也能正常搜索。',
    goSettings: '去设置', loadingResults: '正在汇聚结果…', cancelled: '已取消搜索'
  },
  en: { search: 'Search', assistant: 'AI Assistant', sources: 'Sources', health: 'Health', ext: 'Extensions', library: 'Saved', settings: 'Settings',
    placeholder: 'Search all sources… (Enter to search, Ctrl+Enter for AI answer)', go: 'Search', stop: 'Stop', expand: 'AI expand', answer: 'AI answer', digest: 'AI digest',
    all: 'All', allTypes: 'All types', anyTime: 'Any time', d1: 'Past day', w1: 'Past week', m1: 'Past month', y1: 'Past year', y5: 'Past 5 years', anyLang: 'Any language', zhOnly: 'Chinese', enOnly: 'English',
    region: 'Region', regionAll: 'Global + China', regionCn: 'China sources only', regionIntl: 'International only', nativeOnly: 'Native APIs only', scene: 'Scene', noScene: 'No scene',
    view: 'View', vAuto: 'Auto', vList: 'List', vGrid: 'Grid', sort: 'Sort', sRel: 'Relevance', sDate: 'Newest', sSrc: 'Multi-source', sDomain: 'Group by domain', deep: 'Deep search', preview: 'Preview',
    exportMd: 'Export Markdown', exportCsv: 'Export CSV', saveSearch: 'Save search', results: 'results', sourcesDone: 'sources', failed: 'failed', elapsed: 'time',
    empty: 'Type to search', emptySub: 'Hundreds of sources at once · type-aware results · AI answers with follow-ups', noResults: 'No matching results', fav: 'Save', unfav: 'Unsave', copyLink: 'Copy link', open: 'Open',
    followUp: 'Ask a follow-up…', send: 'Send', aiOff: 'No model configured: add a provider in Settings → Models to use AI features.', history: 'Recent searches', saved: 'Saved searches', collections: 'Collections', newCollection: 'New collection',
    clear: 'Clear', delete: 'Delete', enable: 'Enable', disable: 'Disable', test: 'Test', edit: 'Edit', save: 'Save', cancel: 'Cancel', apply: 'Apply', reload: 'Reload', openDir: 'Open folder', import: 'Import file', install: 'Install', uninstall: 'Uninstall', installed: 'Installed',
    lang: 'Language', theme: 'Theme', tSystem: 'System', tDark: 'Dark', tLight: 'Light',
    shortcuts: 'Shortcuts', noSources: 'No sources available', noSourcesSub: 'No enabled sources match the current scene/filters. Adjust filters or enable sources in the library.',
    searchFailed: 'Search ran into a problem', retry: 'Retry', onboardTitle: 'Welcome to OmniSeek',
    onboard1: 'Search hundreds of sources at once', onboard2: 'Type-aware cards for books, videos, software, papers',
    onboard3: 'Optional AI: digests, follow-ups, source assistant', onboard4: 'Alt+Space for quick search',
    onboardGo: 'Get started', onboardSkip: 'Skip', preferNative: 'Skip site: fallback sources by default',
    healthHint: 'Health comes from live checks; bundled marks are from packaging-time tests.',
    aiNeedKey: 'No model configured', aiNeedKeySub: 'Add a provider in Settings → Models. Search works without AI.',
    goSettings: 'Open settings', loadingResults: 'Gathering results…', cancelled: 'Search cancelled'
  },
};
let LANG = 'zh';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.zh[k] || k;
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
}
