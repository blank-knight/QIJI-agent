/**
 * 技能与工具集中文翻译表
 *
 * 技能描述来自后端 SKILL.md（英文），工具集描述来自 toolsets.py（英文）。
 * 此文件在前端做翻译层：中文 locale 下自动替换显示。
 * 未覆盖的技能/工具集会 fallback 到原始英文。
 */

// ──────────────────────────────────────────────
// 技能翻译（key = 技能目录名）
// ──────────────────────────────────────────────
export const SKILL_ZH: Record<string, { name: string; description: string }> = {
  // autonomous-ai-agents
  'claude-code': { name: 'Claude Code', description: '委派编码任务给 Claude Code（Anthropic CLI 智能体）。用于开发功能、重构、PR 审查和迭代编码。' },
  'codex': { name: 'Codex', description: '委派编码给 OpenAI Codex CLI（功能开发、PR）。' },
  'hermes-agent': { name: '奇计 Agent 配置', description: '配置、扩展或贡献奇计 Agent。' },
  'opencode': { name: 'OpenCode', description: '委派编码给 OpenCode CLI（功能开发、PR 审查）。' },

  // creative
  'architecture-diagram': { name: '架构图', description: '暗色主题 SVG 架构图/云架构/基础设施图，输出为 HTML。' },
  'ascii-art': { name: 'ASCII 艺术', description: 'ASCII 艺术：pyfiglet、cowsay、boxes、图片转 ASCII。' },
  'ascii-video': { name: 'ASCII 视频', description: 'ASCII 视频：将视频/音频转换为彩色 ASCII MP4/GIF。' },
  'baoyu-comic': { name: '知识漫画', description: '知识漫画：教育、传记、教程类漫画生成。' },
  'baoyu-infographic': { name: '信息图', description: '信息图：21 种布局 × 21 种风格。' },
  'claude-design': { name: 'Claude 设计', description: '设计一次性 HTML 产物（落地页、演示文稿、原型）。' },
  'comfyui': { name: 'ComfyUI', description: '用 ComfyUI 生成图片、视频和音频 — 安装、启动、管理节点/模型、运行工作流。' },
  'design-md': { name: 'Design.md 规范', description: '编写/验证/导出 Google DESIGN.md 设计令牌规范文件。' },
  'excalidraw': { name: 'Excalidraw', description: '手绘风格 Excalidraw JSON 图表（架构图、流程图、时序图）。' },
  'humanizer': { name: '文本人性化', description: '人性化文本：去除 AI 腔调，增加真实语气。' },
  'manim-video': { name: 'Manim 动画', description: 'Manim CE 动画：3Blue1Brown 风格数学/算法视频。' },
  'p5js': { name: 'p5.js', description: 'p5.js 草图：生成艺术、着色器、交互、3D。' },
  'pixel-art': { name: '像素画', description: '像素画，复古调色板（NES、Game Boy、PICO-8）。' },
  'pretext': { name: 'Pretext', description: '使用 @chenglou/pretext 构建创意浏览器 Demo — 纯文本布局。' },
  'sketch': { name: '草图', description: '一次性 HTML 原型：2-3 个设计变体供对比。' },
  'songwriting-and-ai-music': { name: 'AI 音乐创作', description: '歌曲创作技巧和 Suno AI 音乐提示词。' },
  'touchdesigner-mcp': { name: 'TouchDesigner', description: '通过 twozero MCP 控制运行中的 TouchDesigner 实例。' },
  'creative-ideation': { name: '创意点子', description: '通过创意约束生成项目点子。' },

  // data-science
  'jupyter-live-kernel': { name: 'Jupyter 实时内核', description: '通过实时 Jupyter 内核进行交互式 Python 编程。' },

  // devops
  'agent-platform-migration': { name: '智能体平台迁移', description: '在不同 AI 智能体平台之间迁移人格、记忆和上下文。' },
  'cex-arbitrage-scanner': { name: 'CEX 套利扫描', description: '扫描 CEX 资金费率、基差和跨交易所价差，寻找套利机会。' },
  'hermes-desktop-whitelabel': { name: '桌面端白标', description: '将奇计桌面端重新品牌化为商业产品。涵盖文件修改、主题创建、安装包打包。' },
  'hermes-gateway-troubleshooting': { name: '网关故障排查', description: '诊断和修复消息网关问题 — 崩溃、API 限流、多档智能体无响应。' },
  'multi-agent-telegram-setup': { name: '多智能体 Telegram 配置', description: '在同一台机器上设置多个独立的奇计智能体实例。' },
  'webhook-subscriptions': { name: 'Webhook 订阅', description: 'Webhook 订阅：事件驱动的智能体运行。' },
  'kanban-orchestrator': { name: '看板编排者', description: '编排者档位的分解手册和规则，通过看板路由工作。' },
  'kanban-worker': { name: '看板工作者', description: '奇计看板工作者的注意事项、示例和边缘情况。' },

  // dogfood
  'dogfood': { name: '探索性 QA', description: 'Web 应用探索性 QA：发现 Bug、收集证据、生成报告。' },

  // email
  'himalaya': { name: 'Himalaya 邮件', description: 'Himalaya CLI：终端内收发邮件（IMAP/SMTP）。' },

  // gaming
  'minecraft-modpack-server': { name: 'Minecraft 模组服', description: '搭建 Minecraft 模组服务器（CurseForge、Modrinth）。' },
  'pokemon-player': { name: '宝可梦玩家', description: '通过无头模拟器 + 内存读取玩宝可梦。' },

  // github
  'codebase-inspection': { name: '代码库检查', description: '用 pygount 检查代码库：代码行数、语言比例。' },
  'github-auth': { name: 'GitHub 认证', description: 'GitHub 认证设置：HTTPS Token、SSH 密钥、gh CLI 登录。' },
  'github-code-review': { name: 'GitHub 代码审查', description: '审查 PR：diff、行内评论，通过 gh 或 REST API。' },
  'github-issues': { name: 'GitHub Issues', description: '通过 gh 或 REST 创建、分类、标记、分配 GitHub Issues。' },
  'github-pr-workflow': { name: 'GitHub PR 工作流', description: 'GitHub PR 全生命周期：分支、提交、开启、CI、合并。' },
  'github-repo-management': { name: 'GitHub 仓库管理', description: '克隆/创建/Fork 仓库；管理远程仓库和 Releases。' },

  // leisure
  'find-nearby': { name: '附近搜索', description: '使用 OpenStreetMap 查找附近地点（餐厅、咖啡厅、酒吧、药店等）。' },

  // mcp
  'mcporter': { name: 'MCP 工具桥', description: '使用 mcporter CLI 直接列出、配置、认证和调用 MCP 服务器/工具。' },
  'native-mcp': { name: '原生 MCP 客户端', description: 'MCP 客户端：连接服务器、注册工具（stdio/HTTP）。' },

  // media
  'gif-search': { name: 'GIF 搜索', description: '通过 Tenor 搜索/下载 GIF（curl + jq）。' },
  'heartmula': { name: 'HeartMuLa 音乐', description: 'HeartMuLa：类 Suno 的歌词+标签生成音乐。' },
  'songsee': { name: '音频分析', description: '音频频谱/特征分析（mel、chroma、MFCC）。' },
  'spotify': { name: 'Spotify', description: 'Spotify：播放、搜索、队列管理、管理播放列表和设备。' },
  'youtube-content': { name: 'YouTube 内容', description: 'YouTube 字幕转摘要、推文串、博客。' },

  // mlops (key ones)
  'huggingface-hub': { name: 'HuggingFace Hub', description: 'HuggingFace hf CLI：搜索/下载/上传模型和数据集。' },
  'whisper': { name: 'Whisper 语音', description: 'OpenAI 通用语音识别模型，支持多语言转录。' },
  'clip': { name: 'CLIP', description: 'OpenAI 连接视觉和语言的模型，实现零样本图像分类。' },
  'segment-anything-model': { name: 'SAM 分割', description: 'SAM：通过点、框、掩码进行零样本图像分割。' },
  'stable-diffusion-image-generation': { name: 'Stable Diffusion', description: 'Stable Diffusion 文生图，最新图像生成技术。' },

  // note-taking
  'obsidian': { name: 'Obsidian 笔记', description: '读取、搜索、创建和编辑 Obsidian 知识库中的笔记。' },

  // productivity
  'airtable': { name: 'Airtable', description: '通过 REST API 操作 Airtable：记录增删改查、过滤、Upsert。' },
  'google-workspace': { name: 'Google Workspace', description: 'Gmail、日历、Drive、Docs、Sheets，通过 gws CLI 或 Python。' },
  'job-hunting': { name: '求职工具', description: '高效求职方法论：AI 辅助简历定制、批量投递、公司调研。' },
  'knowledge-base-articles': { name: '知识库管理', description: '管理统一的知识库（Obsidian Knowledge Vault）。' },
  'linear': { name: 'Linear', description: 'Linear：通过 GraphQL + curl 管理 Issues、项目、团队。' },
  'maps': { name: '地图服务', description: '通过 OpenStreetMap/OSRM 进行地理编码、POI、路线、时区查询。' },
  'nano-pdf': { name: 'PDF 编辑', description: '通过 nano-pdf CLI 编辑 PDF 文字/标题（自然语言）。' },
  'notion': { name: 'Notion', description: 'Notion API + ntn CLI：页面、数据库、Markdown、Workers。' },
  'ocr-and-documents': { name: 'OCR 文档', description: '从 PDF/扫描件提取文字（pymupdf、marker-pdf）。' },
  'powerpoint': { name: 'PowerPoint', description: '创建、读取、编辑 .pptx 演示文稿、幻灯片、备注。' },
  'teams-meeting-pipeline': { name: 'Teams 会议', description: '通过奇计 CLI 操作 Teams 会议摘要流水线。' },

  // product
  'autonomous-transformer': { name: 'Java 代码转换', description: 'Java 代码转换工具 — 注入无害注解、日志、死代码和结构扩展。' },
  'clawx-administration': { name: 'ClawX 管理', description: '安装、配置、排查和更新 ClawX 桌面端。' },
  'fund-radar': { name: 'FundRadar 基金信号', description: 'FundRadar 基金信号 SaaS — 持仓管理、LLM 分析、博主评分、新闻情绪。' },
  'geo-service': { name: 'GEO 优化服务', description: 'GEO（生成引擎优化）— 监控品牌在 AI 搜索引擎中的可见度。' },
  'hermes-desktop-rebranding': { name: '桌面端品牌化', description: '将奇计桌面端打包成自有品牌商业产品的完整流程。' },
  'hermes-desktop-white-label': { name: '桌面端白标', description: '重新品牌化和打包奇计桌面端为商业白标产品。' },
  'videoflow': { name: 'VideoFlow 视频营销', description: 'AI 视频营销工作流引擎 — 商品图片+文案 → 成品短视频。' },

  // research
  'arxiv': { name: 'arXiv 论文', description: '按关键词、作者、类别或 ID 搜索 arXiv 论文。' },
  'blogwatcher': { name: '博客监控', description: '通过 blogwatcher-cli 监控博客和 RSS/Atom 订阅源。' },
  'llm-wiki': { name: 'LLM Wiki', description: 'Karpathy 的 LLM Wiki：构建/查询互链 Markdown 知识库。' },
  'polymarket': { name: 'Polymarket', description: '查询 Polymarket：市场、价格、订单簿、历史。' },
  'research-paper-writing': { name: '论文写作', description: '撰写 ML 论文（NeurIPS/ICML/ICLR）：从设计到投稿。' },

  // red-teaming
  'godmode': { name: 'GODMODE 越狱', description: 'LLM 越狱：Parseltongue、GODMODE、ULTRAPLINIAN。' },

  // smart-home
  'openhue': { name: 'Hue 智能灯', description: '通过 OpenHue CLI 控制飞利浦 Hue 灯光、场景、房间。' },

  // social-media
  'xitter': { name: 'X/Twitter (x-cli)', description: '通过 x-cli 终端客户端操作 X/Twitter，使用官方 API。' },
  'xurl': { name: 'X/Twitter (xurl)', description: '通过 xurl CLI 操作 X/Twitter：发帖、搜索、私信、媒体、v2 API。' },

  // software-development
  'ai-coding-governance': { name: 'AI 编码治理', description: '跨项目、跨 AI 工具的代码规则执行体系。' },
  'ai-coding-memory-bank-sdd-workflow': { name: 'Memory Bank 工作流', description: 'AI 编码项目的工作流：Memory Bank + SDD 审查 + G/O/M 提示词演化。' },
  'astro-seo-site': { name: 'Astro SEO 站点', description: '搭建 SEO 优化的静态站点（Astro 5 + Tailwind）。' },
  'debugging-hermes-tui-commands': { name: 'TUI 命令调试', description: '调试奇计 TUI 斜杠命令：Python、网关、Ink UI。' },
  'hermes-agent-skill-authoring': { name: '技能编写指南', description: '编写 SKILL.md：frontmatter、验证器、文件结构。' },
  'node-inspect-debugger': { name: 'Node.js 调试', description: '通过 --inspect + Chrome DevTools Protocol CLI 调试 Node.js。' },
  'plan': { name: '计划模式', description: '计划模式：编写可执行的 Markdown 计划，不执行代码。' },
  'python-debugpy': { name: 'Python 调试', description: 'Python 调试：pdb REPL + debugpy 远程调试（DAP）。' },
  'python-import-scope-pitfall': { name: 'Python 导入陷阱', description: '修复 import as 在条件块中导致的 UnboundLocalError。' },
  'requesting-code-review': { name: '提交前审查', description: '提交前审查：安全扫描、质量门禁、自动修复。' },
  'responsive-web-frontend': { name: '响应式前端', description: 'React/Vite 移动优先响应式模式。' },
  'simplify-code': { name: '代码精简', description: '并行 3 智能体清理最近的代码变更。' },
  'spike': { name: '快速验证', description: '一次性实验，在正式开发前验证想法。' },
  'subagent-driven-development': { name: '子智能体驱动开发', description: '通过 delegate_task 子智能体执行计划（两阶段审查）。' },
  'systematic-debugging': { name: '系统化调试', description: '四阶段根因调试：先理解 Bug 再修复。' },
  'test-driven-development': { name: 'TDD 测试驱动', description: 'TDD：强制 RED-GREEN-REFACTOR，先写测试再写代码。' },
  'writing-plans': { name: '编写计划', description: '编写实施计划：小任务、精确路径、完整代码。' },

  // yuanbao
  'yuanbao': { name: '元宝', description: '元宝群：@提及用户、查询信息/成员。' },

  // frontend-real-data-first
  'frontend-real-data-first': { name: '真实数据优先', description: '强制所有代码路径使用真实数据，禁止 Mock/Stub/Demo 数据。' },

  // openclaw-imports
  'memos-memory-guide': { name: 'MemOS 记忆系统', description: '使用 MemOS 本地记忆系统搜索和使用用户的历史对话。' },

  // 奇计预装技能
  'qiji-geo': { name: 'GEO 平台自动化', description: '用自然语言操作奇计GEO平台：AI可见度诊断、报告查看、关键词管理、爆文复刻。' },
  'qiji-knowledge-base': { name: '奇计知识库', description: '自动收集品牌资料、产品信息、行业知识。越用越聪明，为GEO诊断和AI写作提供素材。' },
}

// ──────────────────────────────────────────────
// 工具集翻译（key = toolset name）
// ──────────────────────────────────────────────
export const TOOLSET_ZH: Record<string, { label: string; description: string }> = {
  'web': { label: '🌐 网络研究', description: '网络搜索和网页内容提取工具' },
  'search': { label: '🔍 网络搜索', description: '仅网络搜索（不含内容提取/爬虫）' },
  'x_search': { label: '🐦 X 搜索', description: '通过 xAI 内置工具搜索 X（Twitter）帖子和推文串' },
  'vision': { label: '👁️ 图像分析', description: '图像分析和视觉工具' },
  'video': { label: '🎬 视频分析', description: '视频分析和理解工具（可选，不在默认工具集中）' },
  'image_gen': { label: '🎨 图片生成', description: '创意生成工具（图片）' },
  'video_gen': { label: '🎥 视频生成', description: '视频生成工具（文生视频、图生视频）' },
  'computer_use': { label: '🖥️ 桌面控制', description: '后台桌面控制 — 截图、鼠标、键盘、滚动、拖拽' },
  'terminal': { label: '⬛ 终端', description: '终端命令执行和进程管理工具' },
  'moa': { label: '🧠 高级推理', description: '高级推理和问题求解工具（混合智能体）' },
  'skills': { label: '📚 技能', description: '访问、创建、编辑和管理技能文档' },
  'browser': { label: '🌍 浏览器', description: '浏览器自动化 — 导航、点击、输入、滚动，配合网络搜索' },
  'cronjob': { label: '⏰ 定时任务', description: '定时任务管理 — 创建、列出、更新、暂停、恢复、触发' },
  'send_message': { label: '💬 消息发送', description: '跨平台消息：发送到 Telegram、Discord、Slack、短信等' },
  'file': { label: '📄 文件', description: '文件操作工具：读取、写入、补丁（模糊匹配）、搜索' },
  'tts': { label: '🔊 语音合成', description: '文字转语音：Edge TTS（免费）、ElevenLabs、OpenAI、xAI' },
  'todo': { label: '✅ 任务清单', description: '多步骤工作的任务规划和跟踪' },
  'memory': { label: '🧠 记忆', description: '跨会话持久记忆（个人笔记 + 用户档案）' },
  'context_engine': { label: '⚙️ 上下文引擎', description: '活跃上下文引擎暴露的运行时工具' },
  'session_search': { label: '🔍 会话搜索', description: '搜索和回忆过去的对话（带摘要）' },
  'clarify': { label: '❓ 用户提问', description: '向用户提问（多选或开放式）' },
  'execute_code': { label: '🐍 代码执行', description: '运行可编程调用工具的 Python 脚本（减少 LLM 轮次）' },
  'delegate_task': { label: '🔀 任务委派', description: '生成隔离上下文的子智能体处理复杂子任务' },
  'homeassistant': { label: '🏠 智能家居', description: 'Home Assistant 智能家居控制和监控' },
  'discord': { label: '🎮 Discord', description: 'Discord 读取和参与工具（获取消息、搜索成员、创建话题）' },
  'discord_admin': { label: '⚙️ Discord 管理', description: 'Discord 服务器管理（列出频道/角色、置顶消息、分配角色）' },
  'yuanbao': { label: '💎 元宝', description: '元宝平台工具 — 群信息、成员查询、私信、表情' },
  'feishu_doc': { label: '📝 飞书文档', description: '读取飞书/Lark 文档内容' },
  'feishu_drive': { label: '📁 飞书云盘', description: '飞书/Lark 文档评论操作（列出、回复、添加）' },
  'spotify': { label: '🎵 Spotify', description: '原生 Spotify 播放、搜索、播放列表、专辑和库工具' },
  'debugging': { label: '🐛 调试工具', description: '调试和故障排除工具包' },
  'safe': { label: '🛡️ 安全工具集', description: '无终端访问的安全工具集' },
  'coding': { label: '💻 编程工具集', description: '编程专用：文件、终端、搜索、文档、技能、委派等' },
  'editor': { label: '📝 编辑器集成', description: '编辑器集成（VS Code、Zed、JetBrains）' },
  'api': { label: '🔌 API 服务器', description: 'OpenAI 兼容的 API 服务器 — 通过 HTTP 访问全部工具' },
  'hermes-cli': { label: '💻 奇计 CLI', description: '完整交互式 CLI 工具集 — 所有默认工具加定时任务' },
  'hermes-cron': { label: '⏰ 定时任务集', description: '默认定时任务工具集' },
  'telegram': { label: '✈️ Telegram 机器人', description: 'Telegram 机器人工具集 — 完整权限（终端有安全检查）' },
  'discord-bot': { label: '🎮 Discord 机器人', description: 'Discord 机器人工具集 — 完整权限（终端有安全检查）' },
  'whatsapp': { label: '💬 WhatsApp 机器人', description: 'WhatsApp 机器人工具集' },
  'slack': { label: '💼 Slack 机器人', description: 'Slack 机器人工具集（终端有安全检查）' },
  'signal': { label: '🔒 Signal 机器人', description: 'Signal 机器人工具集 — 加密消息平台' },
  'imessage': { label: '💬 iMessage 机器人', description: 'BlueBubbles iMessage 机器人工具集' },
  'homeassistant-bot': { label: '🏠 HA 机器人', description: 'Home Assistant 机器人工具集 — 智能家居事件监控' },
  'email': { label: '📧 邮件机器人', description: '邮件机器人工具集 — 通过邮件与奇计交互（IMAP/SMTP）' },
  'mattermost': { label: '💬 Mattermost 机器人', description: 'Mattermost 机器人工具集 — 自托管团队消息' },
  'matrix': { label: '🔐 Matrix 机器人', description: 'Matrix 机器人工具集 — 去中心化加密消息' },
  'dingtalk': { label: '🔔 钉钉机器人', description: '钉钉机器人工具集 — 企业消息平台' },
}

// ──────────────────────────────────────────────
// 分类翻译
// ──────────────────────────────────────────────
export const CATEGORY_ZH: Record<string, string> = {
  'general': '通用',
  'autonomous-ai-agents': 'AI 智能体',
  'creative': '创意',
  'data-science': '数据科学',
  'devops': '运维',
  'dogfood': 'QA 测试',
  'email': '邮件',
  'gaming': '游戏',
  'github': 'GitHub',
  'leisure': '生活',
  'mcp': 'MCP 协议',
  'media': '媒体',
  'mlops': '机器学习',
  'note-taking': '笔记',
  'product': '产品',
  'productivity': '效率',
  'red-teaming': '红队测试',
  'research': '研究',
  'smart-home': '智能家居',
  'social-media': '社交媒体',
  'software-development': '软件开发',
  'yuanbao': '元宝',
  'openclaw-imports': '导入技能',
}

/**
 * 翻译技能信息
 * @param name 技能名（目录名）
 * @param field 要翻译的字段
 * @param fallback 原始英文值
 * @returns 翻译后的值，没有翻译则返回原始值
 */
export function translateSkillField(
  name: string,
  field: 'name' | 'description',
  fallback: string
): string {
  const t = SKILL_ZH[name]
  if (!t) return fallback
  return t[field] || fallback
}

/**
 * 翻译工具集信息
 */
export function translateToolsetField(
  name: string,
  field: 'label' | 'description',
  fallback: string
): string {
  const t = TOOLSET_ZH[name]
  if (!t) return fallback
  return t[field] || fallback
}

/**
 * 翻译分类名
 */
export function translateCategory(category: string): string {
  return CATEGORY_ZH[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
