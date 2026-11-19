# OmniSeek Changelog

## 2.3.0 (2026-10-20) — AI 深度强化

### 万搜 Copilot（统一智能体）
- Copilot 的工具调用支持 10 种工具：意图分析、联合搜索（可多语言）、阅读网页、运行指定来源、筛选结果、结构化对比、查看来源、创建来源、创建搜索维度、记住偏好。其中“创建来源”和“创建搜索维度”需用户确认后才会生效。
- 回答以流式输出，执行轨迹可见（每步的参数、结果摘要和耗时），可随时停止或重试上一条。
- 对话历史可新建、搜索、重命名、删除，并持久保存；长期记忆可查看、添加、删除。
- 回答带 [n] 引用和引用列表，支持 Markdown 表格。

### 意图理解与智能路由
- 本地规则可识别书名《》、作者、ISBN、DOI、arXiv、软件名+版本、文件格式、年份，并判断查询类型（下载/研究/对比/教程/资讯）。
- AI 增强意图识别（快模型）：给出推荐分类、中英文改写和研究维度，并校验分类是否合法。
- 搜索栏新增“智能”开关：自动路由到分类与来源，并进行多语言检索；意图标签在状态栏显示。

### 深度研究升级
- 流程为：规划子问题 → 并行检索 → 按可信度和域名多样性选页阅读 → 逐页抽取事实 → 跨来源去重 → 反思找缺口 → 补缺检索，循环进行，最后输出结构化报告。
- 深度（轮数）和阅读预算可配置；每个来源都有可信度评分（政府/学术/媒体/参考/UGC、HTTPS、佐证数、时效）。
- 报告包含摘要、关键发现、对比表、分歧和建议；附去重事实列表（含置信度）和引用列表；可导出 Markdown 或 HTML，也可转到 Copilot 继续追问。

### AI 结果增强
- 每条结果提供一句话摘要、相关性解释、标签和 AI 相关度；新增质量与垃圾检测（规则 + AI）：疑似垃圾的结果沉底并变淡。
- 新增“AI 重排”排序，以及书籍/电子书/软件的“最佳推荐”（排除垃圾结果）。未配置 AI 时退化为规则质检与推荐。

### AI 来源维护
- 来源助手新增“为主题发现新来源”和“批量修复失效来源”。
- 来源失效时弹出“AI 修复”提示；在来源行上右键也可以一键修复。健康页新增“AI 批量修复”。
- 所有变更都先给出提案，经确认才应用；新增“搜索维度（场景）”提案类型。

### 模型层
- 适配器重写：OpenAI 兼容、Anthropic、Gemini 三种接口都支持原生函数调用（含流式）；对不支持工具调用的模型自动回退到 JSON 工具协议，并记住该模型的能力。
- 按任务路由模型：快模型负责意图识别、结果增强和事实抽取，强模型负责 Copilot、研究规划、反思和报告。
- 超时可配置；遇到 429、5xx 或网络错误时指数退避重试；JSON 输出不合法时自动修复一次。
- 相同请求的 AI 响应会缓存（TTL 可配置，可一键清空）。
- 统计 token 用量与费用（按模型、任务、天），各模型单价可配置。
- Ollama 支持读取本地模型列表（/api/tags），本地地址无需填写 Key。
- 提示词模板可在设置中编辑（共 10 个，可恢复默认）。

### 隐私与安全
- API Key 通过 Electron safeStorage（Windows 上为 DPAPI）加密存储，设置文件中不再有明文；备份导出不包含 Key，恢复时保留本机现有的 Key。
- 新增“查看发送给 AI 的内容”审计面板：显示每次请求的任务、模型、目标主机、字符数和 token 数，以及消息内容；只保存在内存中。

### 其他
- Markdown 渲染支持表格、有序列表、分隔线和删除线。
- 新增 `scripts/mock-llm.js`：模拟 OpenAI 兼容接口（支持函数调用和流式），用于联调。

## 2.2.0 (2026-10-15)

### 新功能
- **结果预览 / 阅读模式**：点卡片空白处、点眼睛图标或按 Space，侧栏会打开阅读模式。它会抽取正文、图片、作者、日期和阅读时长，也能处理正文由脚本注入的页面，比如央视网。侧栏里可以选浏览器打开、应用内打开（沙箱窗口，下载交给系统浏览器处理）、复制链接、收藏或复制正文。
- **下载 / 资源识别**：从页面中识别以下资源：
  - 电子书、安装包、压缩包、影音和文档；
  - 磁力链接；
  - 百度、阿里、蓝奏、夸克、123 等网盘，并自动带出提取码。
  - 同时识别文件大小，并把同名文件归为镜像组。
  - 安全提示分三级：可执行文件来自非知名域名、非 HTTPS、短链接、IP 直链、双扩展名伪装都会标出。
- **AI 深度搜索**（Ctrl+D）：
  - 先分析意图、规划多组查询，再多轮联合检索，按意图对结果重排，并自动追加查询补足信息缺口。
  - 然后阅读排名靠前页面的正文，生成带 [n] 引用的报告，报告可以复制或导出 Markdown。
  - 没有配置 AI 时，降级为单轮检索加正文要点。
- **搜索标签页**：Alt+Enter 或 Ctrl+T 打开新标签，Ctrl+W 关闭，Ctrl+1-9 或 Ctrl+Tab 切换。后台标签会继续接收流式结果。
- **搜索联想**：历史记录加上在线建议（中文查询用百度，英文用 Bing），可用 ↑↓ 选择。
- **键盘导航**：J/K 或 ↑↓ 选中结果，Enter 打开，Shift+Enter 在应用内打开，Space 预览，F 收藏，C 复制，g/G 跳到首条/末条。
- **按域名分组**排序：超过 6 条的分组会折叠。
- **窗口状态记忆**：记住大小、位置和最大化状态，并对多显示器做越界保护。
- **错误日志**：记录主进程异常、渲染进程错误和崩溃，可在“设置”里查看、复制、清空或打开日志文件。
- **备份与恢复**：可以导出或导入设置、自定义来源和收藏历史。恢复前会自动备份当前数据。
- **更新检查**：读取本地或内网的 `latest.json`（默认 `%USERPROFILE%\GrokBot-Apps\OmniSeek\latest.json`），启动时也会检查。
- **来源速度统计**：健康页新增最快和最慢来源排行，显示 P50/P95、成功率和检测次数。
- **新增原生来源**：央视网搜索（cctv-search）。

### 改进
- 深色主题改用靛蓝色调的配色，卡片悬停、滚动条和输入框也做了调整。
- `open` 只接受 http、https、magnet 和 mailto 链接。
- 消除了 AbortSignal 监听器数量的告警。

## 2.1.0 — polish
- UX: first-run onboarding, keyboard shortcuts help (`?` / Ctrl+/), clearer empty/error/loading states, AI empty-key CTAs
- Search quality: improved ranking (exact title, coverage, metadata boost, fallback penalty), smarter first-run defaults (disable dead + site: fallbacks; prefer key native sources), prefer-native filter, 429/503 retry with backoff
- Performance: AbortController cancel clears HostPool queue, deferred tray/hotkey for faster startup, parallel lib/AI refresh after sources
- AI: clearer unconfigured prompts; 来源助手 workflow tightened; strict validate before saving AI-generated sources/extensions
- Health: legend + hints; skip dead sources in search by default
- Settings: prefer-native, retry count, re-apply smart defaults
- Keep 2.0.1 brand icon (indigo magnifier + network nodes)

## 2.0.1
- Brand icon end-to-end (EXE / window / tray / NSIS)

## 2.0.0
- Type-aware cards, 720 sources, AI assistant, model presets, 扩展 gallery, PM features
