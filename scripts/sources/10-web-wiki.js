const { J, H } = require('./lib');
// ===== 综合网页 =====
H('bing', 'Bing 网页', 'web', 'web', 'https://www.bing.com/search?q={qe}&count=20&setlang=zh-CN', 'li.b_algo', { title: 'h2', url: 'h2 a@href', snippet: '.b_caption p, p' }, { weight: 1.4 });
H('baidu', '百度', 'web', 'web', 'https://www.baidu.com/s?wd={qe}&rn=20', 'div.result[mu], div.c-container[mu]', { title: 'h3', url: { attr: 'mu' }, snippet: '[class*=content-right], .c-abstract, [class*=summary]' }, { weight: 1.4, region: 'cn' });
H('ddg', 'DuckDuckGo', 'web', 'web', 'https://html.duckduckgo.com/html/?q={qe}', '.result', { title: '.result__a', url: { sel: '.result__a', attr: 'href', regex: 'uddg=([^&]+)' }, snippet: '.result__snippet' }, { decode: ['url'], weight: 1.2 });
J('ddg-instant', 'DuckDuckGo 即时答案', 'web', 'web', 'https://api.duckduckgo.com/?q={qe}&format=json&no_html=1&skip_disambig=1', '$.RelatedTopics[?(@ && @.FirstURL)]', { title: { key: 'Text', regex: '^(.{1,80}?)(?: - |$)' }, url: 'FirstURL', snippet: 'Text' });
J('wiby', 'Wiby 小众网页', 'web', 'web', 'https://wiby.me/json/?q={qe}', '$[*]', { title: 'Title', url: 'URL', snippet: 'Snippet' });
J('marginalia', 'Marginalia 独立网页', 'web', 'web', 'https://api.marginalia.nu/public/search/{qe}?count=20', '$.results[*]', { title: 'title', url: 'url', snippet: 'description' });
H('mojeek', 'Mojeek', 'web', 'web', 'https://www.mojeek.com/search?q={qe}', 'ul.results-standard li', { title: 'h2 a', url: 'h2 a@href', snippet: 'p.s' });
H('sogou-web', '搜狗网页', 'web', 'web', 'https://www.sogou.com/web?query={qe}', '.vrwrap, .rb', { title: 'h3', url: 'h3 a@href', snippet: '.star-wiki, .str-text-info, .ft' }, { region: 'cn' });
H('so360', '360 搜索', 'web', 'web', 'https://www.so.com/s?q={qe}', 'li.res-list', { title: 'h3', url: { sel: 'h3 a', attr: 'data-mdurl', fallbackAttr: 'href' }, snippet: '.res-desc, p' }, { region: 'cn' });

// ===== MediaWiki 家族 =====
const MW = (id, name, apiDir, category = 'websites', kind = 'wiki', x = {}) => J(id, name, category, kind,
  apiDir + '/api.php?action=query&list=search&srsearch={qe}&format=json&srlimit=20&srprop=snippet|timestamp|wordcount&utf8=1',
  '$.query.search[*]', { title: 'title', url: { tpl: apiDir + '/index.php?curid={{pageid}}' }, snippet: 'snippet', date: { key: 'timestamp', fmt: 'date' } }, { family: 'mediawiki', ...x });
const wpLangs = [['zh', '中文', 1], ['en', 'English', 1], ['ja', '日本語', 1], ['zh-yue', '粤语', 0], ['zh-classical', '文言', 0], ['ko', '한국어', 0], ['fr', 'Français', 0], ['de', 'Deutsch', 0], ['es', 'Español', 0], ['ru', 'Русский', 0], ['pt', 'Português', 0], ['it', 'Italiano', 0],
  ['ar', 'العربية', 0], ['vi', 'Tiếng Việt', 0], ['id', 'Indonesia', 0], ['th', 'ไทย', 0], ['tr', 'Türkçe', 0], ['pl', 'Polski', 0], ['nl', 'Nederlands', 0], ['uk', 'Українська', 0], ['fa', 'فارسی', 0], ['he', 'עברית', 0], ['sv', 'Svenska', 0], ['hi', 'हिन्दी', 0]];
for (const [l, n, en] of wpLangs) MW('wikipedia-' + l, '维基百科 ' + n, `https://${l}.wikipedia.org/w`, 'websites', 'wiki', { enabled: !!en, lang: l, weight: l === 'zh' || l === 'en' ? 1.3 : 1 });
for (const [p, n, cat, kind, langs] of [['wiktionary', '维基词典', 'websites', 'wiki', ['zh', 'en', 'ja']], ['wikisource', '维基文库', 'ebooks', 'book', ['zh', 'en']], ['wikibooks', '维基教科书', 'ebooks', 'book', ['zh', 'en']],
  ['wikiquote', '维基语录', 'websites', 'wiki', ['zh', 'en']], ['wikivoyage', '维基导游', 'websites', 'wiki', ['zh', 'en']], ['wikinews', '维基新闻', 'news', 'news', ['zh', 'en']], ['wikiversity', '维基学院', 'courses', 'wiki', ['en']]])
  for (const l of langs) MW(`${p}-${l}`, `${n} ${l}`, `https://${l}.${p}.org/w`, cat, kind, { enabled: l === 'zh' || p === 'wikisource', lang: l });
for (const [id, n, dir, cat, en] of [
  ['mediawiki', 'MediaWiki.org', 'https://www.mediawiki.org/w', 'dev', 0], ['wikispecies', '维基物种', 'https://species.wikimedia.org/w', 'websites', 0], ['meta-wikimedia', 'Wikimedia Meta', 'https://meta.wikimedia.org/w', 'websites', 0],
  ['archwiki', 'Arch Wiki', 'https://wiki.archlinux.org', 'dev', 1], ['gentoo-wiki', 'Gentoo Wiki', 'https://wiki.gentoo.org', 'dev', 0], ['osm-wiki', 'OpenStreetMap Wiki', 'https://wiki.openstreetmap.org/w', 'websites', 0],
  ['cppreference', 'cppreference', 'https://en.cppreference.com/mwiki', 'dev', 1], ['cppreference-zh', 'cppreference 中文', 'https://zh.cppreference.com/mwiki', 'dev', 1], ['osdev', 'OSDev Wiki', 'https://wiki.osdev.org', 'dev', 0],
  ['minecraft-wiki-zh', 'Minecraft Wiki 中文', 'https://zh.minecraft.wiki', 'games', 1], ['minecraft-wiki', 'Minecraft Wiki', 'https://minecraft.wiki', 'games', 0], ['moegirl', '萌娘百科', 'https://zh.moegirl.org.cn', 'websites', 1],
  ['huiji-lol', '灰机 英雄联盟 Wiki', 'https://lol.huijiwiki.com', 'games', 0], ['huiji-hp', '灰机 哈利波特 Wiki', 'https://harrypotter.huijiwiki.com', 'websites', 0], ['huiji-asoiaf', '灰机 冰与火之歌 Wiki', 'https://asoiaf.huijiwiki.com', 'websites', 0],
  ['wikihow', 'wikiHow', 'https://www.wikihow.com', 'courses', 1], ['wikihow-zh', 'wikiHow 中文', 'https://zh.wikihow.com', 'courses', 1], ['rationalwiki', 'RationalWiki', 'https://rationalwiki.org/w', 'websites', 0],
  ['scholarpedia', 'Scholarpedia', 'http://www.scholarpedia.org/w', 'papers', 0], ['fandom-community', 'Fandom Community', 'https://community.fandom.com', 'websites', 0],
  ['starwars-fandom', 'Wookieepedia 星战', 'https://starwars.fandom.com', 'websites', 0], ['genshin-fandom', 'Genshin Impact Wiki', 'https://genshin-impact.fandom.com', 'games', 0], ['terraria-wiki', 'Terraria Wiki', 'https://terraria.wiki.gg', 'games', 0],
  ['stardew-wiki', 'Stardew Valley Wiki', 'https://stardewvalleywiki.com/mediawiki', 'games', 0], ['bulbapedia', 'Bulbapedia 宝可梦', 'https://bulbapedia.bulbagarden.net/w', 'games', 0], ['pcgamingwiki', 'PCGamingWiki', 'https://www.pcgamingwiki.com/w', 'games', 1],
  ['winehq-wiki', 'WineHQ Wiki', 'https://wiki.winehq.org', 'software', 0], ['commons-pages', 'Wikimedia Commons 页面', 'https://commons.wikimedia.org/w', 'images', 0], ['wikidata-pages', 'Wikidata 页面', 'https://www.wikidata.org/w', 'websites', 0],
  ['appropedia', 'Appropedia', 'https://www.appropedia.org/w', 'courses', 0], ['citizendium', 'Citizendium', 'https://citizendium.org/wiki', 'websites', 0], ['ballotpedia', 'Ballotpedia', 'https://ballotpedia.org/wiki', 'gov', 0],
  ['zh-wikimedia-baike', '求闻百科', 'https://www.qiuwenbaike.cn', 'websites', 0], ['thwiki', 'THBWiki 东方', 'https://thwiki.cc', 'games', 0], ['wiki-biligame-ys', 'BWIKI 原神', 'https://wiki.biligame.com/ys', 'games', 0],
]) MW(id, n, dir, cat, cat === 'papers' ? 'wiki' : 'wiki', { enabled: !!en, region: /[\u4e00-\u9fa5]/.test(n) ? 'cn' : undefined });
J('wikidata', 'Wikidata 实体', 'websites', 'wiki', 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search={qe}&language=zh&uselang=zh&format=json&limit=20', '$.search[*]', { title: 'label|id', url: { tpl: 'https://www.wikidata.org/wiki/{{id}}' }, snippet: 'description' });
J('baidu-baike', '百度百科', 'websites', 'wiki', 'https://baike.baidu.com/api/openapi/BaikeLemmaCardApi?scope=103&format=json&appid=379020&bk_key={qe}&bk_length=600', '$[?(@.title)]', { title: 'title', url: 'url', snippet: 'abstract', thumb: 'image' }, { region: 'cn', weight: 1.3 });

// ===== StackExchange 家族（167 站，一个 API） =====
const se = require('../data/se-sites.json');
const seOn = new Set(['stackoverflow', 'superuser', 'askubuntu', 'serverfault', 'softwarerecs', 'unix', 'ru.stackoverflow', 'ja.stackoverflow', 'math', 'ai', 'datascience', 'security', 'webapps', 'apple', 'android', 'gaming', 'chinese']);
for (const s of se) J('se-' + s.p.replace(/\./g, '-'), s.n, s.p === 'softwarerecs' ? 'software' : 'qa', 'qa',
  `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q={qe}&site=${s.p}&pagesize=20`, '$.items[*]',
  { title: 'title', url: 'link', author: 'owner.display_name', date: { key: 'creation_date', fmt: 'date' }, keywords: 'tags', extra: { tpl: '{{score}} 票 · {{answer_count}} 回答' }, views: { key: 'view_count', fmt: 'num' } },
  { family: 'stackexchange', enabled: seOn.has(s.p), weight: s.p === 'stackoverflow' ? 1.3 : 1 });
