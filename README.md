# OmniSeek 万搜

**2.3.0** · AI 驱动的多平台联合搜索桌面工具：一次查询同时检索上百个来源，并可选用大模型做维度拆解与摘要。

## 功能特性

- 桌面风格界面：搜索、AI 维度、来源库、插件与设置；结果卡片与 AI 摘要侧栏。
- 高并发联合搜索：全局 / 单主机并发上限、超时、流式推送、URL 去重与多因子排序。
- 234 个内置来源（`src/sources/builtin.json`），覆盖软件、开发、图书、论文、影音、资讯等。
- 可选 OpenAI 兼容模型：自动生成搜索维度、查询扩展、带引用的流式摘要；无 Key 时仍可纯聚合搜索。
- 来源库可视化编辑与实时测试；插件目录支持 JSON 来源包和 JS 脚本。

## 技术栈

- Electron 33
- Node.js 主进程搜索引擎
- 原生 HTML/CSS/JS 渲染（无前端框架）

## 从源码运行

源码在 `src/`（注意内部还有一层 `src/src` 引擎代码）。本仓库不包含安装包。

```bash
cd src
npm install
npm start
npm test
```

## 文档

- [源码 README](src/README.md)
- [更新日志](src/CHANGELOG.md)

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

## Tech stack

- Electron 33
- Node.js 主进程搜索引擎
- 原生 HTML/CSS/JS 渲染（无前端框架）

## Getting started

Source is under `src/` (engine code lives in a nested `src/src`). This repository does not include installers.

```bash
cd src
npm install
npm start
npm test
```

## Documentation

- [源码 README](src/README.md)
- [更新日志](src/CHANGELOG.md)

