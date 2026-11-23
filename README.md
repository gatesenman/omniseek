# OmniSeek 万搜

**2.3.0** · AI 驱动的多平台联合搜索桌面工具：一次查询同时检索上百个来源，并可选用大模型做维度拆解与摘要。

## 功能特性

- 桌面风格界面：搜索、AI 维度、来源库、插件与设置；结果卡片与 AI 摘要侧栏。
- 高并发联合搜索：全局 / 单主机并发上限、超时、流式推送、URL 去重与多因子排序。
- 234 个内置来源（`src/sources/builtin.json`），覆盖软件、开发、图书、论文、影音、资讯等。
- 可选 OpenAI 兼容模型：自动生成搜索维度、查询扩展、带引用的流式摘要；无 Key 时仍可纯聚合搜索。
- 来源库可视化编辑与实时测试；插件目录支持 JSON 来源包和 JS 脚本。

## 下载

本仓库目前没有已发布的 GitHub Release 安装包。请从源码运行。GitHub 自动生成的 Source code zip/tar 不算安装包。

## 界面截图

仓库里目前还没有已提交的真实产品界面截图（图标、logo 或品牌图不算）。请不要把下列预留路径当成已经存在的图片去引用（避免破链）。待在真实运行窗口中截取后放入：

- `docs/screenshots/01-workbench.png`
- `docs/screenshots/02-main-or-result.png`

截图说明必须写明操作系统、软件版本、是否示例/演示数据，以及是否在 Windows 安装后截取。

## 技术栈

- Electron 33
- Node.js 主进程搜索引擎
- 原生 HTML/CSS/JS 渲染（无前端框架）

## 从源码运行

源码在仓库根目录（引擎代码在 `src/`）。本仓库不包含安装包。

```bash
npm install
npm start
npm test
```
## 文档

- [更新日志](CHANGELOG.md)

## 贡献

欢迎通过 Issue 和 Pull Request 参与，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。参与时请遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

本仓库尚未附带 LICENSE 文件，许可证未指定。

---

## English

# OmniSeek

**2.3.0** · An AI-powered federated search desktop app: one query fans out to hundreds of sources, with optional LLM dimension-splitting and summarization.

## Features

- Desktop UI for search, AI dimensions, source library, plugins, and settings, with result cards and an AI summary sidebar.
- High-concurrency federated search: global and per-host limits, timeouts, streaming, URL dedup, and multi-factor ranking.
- 234 built-in sources (`src/sources/builtin.json`) covering software, development, books, papers, media, and news.
- Optional OpenAI-compatible models for search dimensions, query expansion, and cited streaming summaries; works as a pure aggregator without a key.
- Visual source editor with live tests; the plugin directory accepts JSON source packs and JS scripts.

## Downloads

This repository has no published GitHub Release installer. Run it from source. The automatic Source code zip/tar from GitHub is not an installer.

## Screenshots

No real product-window screenshot has been committed yet (icons, logos, and brand art do not count). Do not add markdown image links to the reserved paths below until the files exist (that would be a broken link). After a live capture, place:

- `docs/screenshots/01-workbench.png`
- `docs/screenshots/02-main-or-result.png`

Captions must state the OS, version, whether the data is sample/demo, and whether the shot was taken after a Windows install.

## Tech stack

- Electron 33
- Node.js 主进程搜索引擎
- 原生 HTML/CSS/JS 渲染（无前端框架）

## Getting started

Source is at the repository root (engine code lives in `src/`). This repository does not include installers.

```bash
npm install
npm start
npm test
```
## Documentation

- [更新日志](CHANGELOG.md)

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please report vulnerabilities privately via [SECURITY.md](SECURITY.md). This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

No LICENSE file is included in this repository; the license is unspecified.
