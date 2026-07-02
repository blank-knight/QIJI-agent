# 奇计 Agent 架构设计

> 2026-06-18 | v2.0（Skill 已完成，进入产品化阶段）

## 项目状态

- ✅ Demo 验证通过（Playwright 操作奇计平台）
- ✅ Hermes Skill 已完成（qiji-geo，8个操作，Hermes 自动发现）
- 📋 产品化方案已写（见 product-plan.md）
- 🔲 Windows 安装包打包
- 🔲 品牌定制

## 技术选型

- **底座：** Hermes Agent v0.16.0 (MIT License)
- **桌面框架：** Hermes Desktop (Electron 40 + React + Vite)
- **浏览器自动化：** Playwright (Node.js)
- **LLM：** GLM 系列（智谱 API），支持多 Provider 降级
- **平台：** 奇计 GEO 平台 (geo.heikexia.cc)

## 完整架构

```
奇计GEO助手 (Windows .exe)
├── Electron 桌面前端
│   ├── 奇计品牌皮肤（logo, 配色, 标题）
│   ├── 首次启动向导（输入奇计账号）
│   └── 简化界面（隐藏开发者功能）
├── Hermes Agent 内核
│   ├── LLM 对话引擎
│   ├── Skill 调度系统
│   ├── 记忆系统
│   └── 多 Provider 降级链
├── qiji-geo Skill（已完成 ✅）
│   ├── login — 登录奇计平台
│   ├── rights — 查看账号权益
│   ├── diagnose — AI可见度诊断
│   ├── report — 查看诊断报告
│   ├── keywords — 关键词管理
│   ├── fuken — 爆文复刻
│   ├── articles — 文章列表
│   └── test — 全功能测试
└── Playwright 浏览器自动化层
    └── Chromium (headless)
```

## 文件结构

### Skill（已完成）

```
~/.hermes/skills/qiji-geo/
├── SKILL.md                         # 操作手册（触发条件、命令清单、费用警告）
├── package.json                     # playwright 依赖
├── scripts/
│   └── geo-cli.js                   # 统一CLI入口（8个操作，自启动浏览器）
└── references/
    └── platform-selectors.md        # CSS选择器速查表
```

### 项目管理

```
~/clawd/qiji-agent/
├── CLAUDE.md                        # 项目规则
├── memory-bank/
│   ├── progress.md                  # 当前进度
│   ├── tech-stack-comparison.md     # 四方案对比（Hermes vs Nuwax vs OpenClaw vs 从零）
│   ├── product-plan.md              # 产品化方案（品牌定制、打包、商业化）
│   ├── architecture.md              # 本文件
│   └── demo-issues.md              # Demo 开发问题记录
└── scripts/                         # 早期 demo 脚本（已归档）
    ├── demo.js
    ├── geo-api.js
    └── examples.js
```

## 测试结果（2026-06-18）

| 命令 | 状态 | 真实数据 |
|------|------|---------|
| login | ✅ | 登录成功 |
| rights | ✅ | 已收录58、有效期2036、点数-11062、余额0 |
| keywords | ✅ | 10个关键词（培训机构、GEO、深圳黄金回收等） |
| diagnose | ✅ | 华为+手机+Mate70，10个AI模型全选（未提交） |
| report | ✅ | 空（账号暂无报告） |
| articles | ⚠️ | 列偏移，后续修 |

## Windows 打包要点

Hermes Desktop 已有完整 Windows 安装包打包系统：
- `apps/desktop/package.json` → `build` 配置段
- 支持 NSIS（.exe）和 MSI 两种安装包格式
- 品牌定制：改 `productName`, `appId`, `icon`, `shortcutName`
- 主题定制：`src/themes/presets.ts` 添加品牌主题
- 预装 Skill：打包时把 `qiji-geo/` 放进 `skills/` 目录

详细方案见 `product-plan.md`。

## 多平台扩展（后续）

Hermes Gateway 已支持的平台，配置即用：
- 微信 / 企业微信 / 钉钉 / 飞书（国内）
- Telegram / WhatsApp / Discord / Slack（海外）
- Email / SMS / iMessage / Signal / Matrix

同一套 qiji-geo Skill，换个 gateway 配置就能接入新平台，不需要改代码。
