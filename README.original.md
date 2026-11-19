# OmniSeek 万搜 — AI 驱动的多平台联合搜索桌面工具

技术栈：Electron 33 + Node.js（主进程搜索引擎）+ 原生 HTML/CSS/JS 渲染层（无框架，启动快），electron-builder + NSIS 打包 Windows x64 安装包。

## 功能
- 桌面风格界面：自绘标题栏、左侧导航（搜索 / AI 维度 / 来源库 / 插件 / 设置）、分类结果页签、结果卡片、AI 摘要侧栏、来源状态面板。
- 高并发联合搜索引擎（src/engine）：全局并发上限 + 单主机并发上限、单来源超时、流式推送结果（120ms 批量）、URL 归一化去重（去 utm 等追踪参数）、多因子排序（标题/摘要命中、来源权重、位置衰减、多源命中加成）。已用 1000 个模拟来源测试扇出。
- 数据驱动来源配置（src/sources/builtin.json，由 scripts/gen-sources.js 生成）：234 个内置来源，覆盖软件/开发/图书/电子书/网站/报告论文/影音/资讯/综合网页。type: html(CSS 选择器) | json(JSONPath) | xml | regex；URL 模板占位符 {q} {qe} {page} {offset} {limit}；字段后处理 regex/replace/tpl/maxLen。只写 `site` 字段即自动生成站内搜索来源。
- AI（OpenAI 兼容：Base URL / Key / 模型）：① 自动生成搜索维度——新建分类、挑选已有来源、创建新来源配置、为每个维度设计搜索词，一键并行执行；② 查询扩展；③ 结果流式摘要，带 [n] 引用可点击。无 Key 时为纯聚合搜索。
- 扩展：来源库内可视化 JSON 编辑 + 实时测试；插件目录（%APPDATA%/OmniSeek/plugins）支持 JSON 来源包和 JS 脚本插件（见 plugins-example/）。

## 开发
    npm install
    npm start          # 运行
    npm test           # 单元测试（含真实来源联网测试）
    npm run gen-sources
    npm run dist:win   # Linux 下需 wine，输出 dist/OmniSeek-Setup-1.0.0-x64.exe
