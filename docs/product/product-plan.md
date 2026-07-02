# 奇计 Agent — Windows 桌面应用产品化方案

> 2026-06-18 | v2.0
> 基于 Hermes Agent (MIT License) 二次开发，打包成奇计品牌的 Windows 桌面应用

---

## 一、产品定位

**产品名称：** 奇计 GEO 助手（暂定，可调）

**一句话描述：** Windows 桌面 AI 助手，通过自然语言一键操作奇计 GEO 平台。

**目标用户：** 中小企业、个体商户（不会写代码的小白用户）

**核心价值：** 不用学后台操作，直接跟 AI 说"帮我诊断华为手机的品牌可见度"，AI 自动执行。

**与奇计现有产品的关系：**
- 奇计 GEO 平台（geo.heikexia.cc）= 后台 SaaS，功能已有
- 奇计 Agent = 前端入口，用户通过对话操作后台
- 不重复造轮子，Agent 只是"操作员"

---

## 二、技术架构

### 2.1 整体架构

```
┌─────────────────────────────────────────┐
│  奇计 Agent 桌面应用 (Windows .exe)      │
│  ┌─────────────────────────────────┐    │
│  │  Electron 前端 (React + Vite)    │    │
│  │  奇计品牌皮肤 + 预装配置         │    │
│  └──────────┬──────────────────────┘    │
│             │ IPC                        │
│  ┌──────────▼──────────────────────┐    │
│  │  Hermes Agent 内核 (Python)      │    │
│  │  LLM 对话 + Skill 调度 + 记忆    │    │
│  └──────────┬──────────────────────┘    │
│             │ terminal 执行              │
│  ┌──────────▼──────────────────────┐    │
│  │  qiji-geo Skill (Playwright)     │    │
│  │  8个操作命令，自动登录+操作      │    │
│  └──────────┬──────────────────────┘    │
│             │ HTTPS                      │
│  ┌──────────▼──────────────────────┐    │
│  │  奇计 GEO 平台                   │    │
│  │  geo.heikexia.cc                 │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 2.2 与 Hermes 原版的关系

| 组件 | Hermes 原版 | 奇计 Agent |
|------|-------------|-----------|
| Agent 内核 | Python，不变 | 直接复用 |
| 桌面前端 | Electron，面向开发者 | 换皮简化，面向小白 |
| 品牌名称 | Hermes | 奇计 GEO 助手 |
| 图标 | Nous Research logo | 奇计 logo |
| 配色 | Nous 蓝色系 | 奇计品牌色 |
| 预装 Skill | 通用开发者 Skill | 只装 qiji-geo |
| LLM 配置 | 用户自己配 | 预配奇计账号/或用户填 Key |
| 更新通道 | Hermes 官方 | 奇计自己的更新服务器（可选） |

### 2.3 LLM 方案

**方案 A（推荐前期）：** 奇计统一提供 LLM API
- 奇计在后端部署一个 API 代理（已有 geo.heikexia.cc）
- 用户安装后不用配 API Key，自动连接奇计后端
- 奇计统一向 LLM 供应商付费，用户按点数消耗

**方案 B（后期）：** 用户自带 Key
- 用户在设置页填自己的 API Key（OpenRouter / 智谱 / DeepSeek）
- 更灵活，但小白用户不友好

---

## 三、品牌定制清单

### 3.1 必改文件（5个）

| 文件 | 改什么 | 难度 |
|------|--------|------|
| `apps/desktop/package.json` | `productName`→奇计GEO助手, `appId`, `legalTrademarks`, `shortcutName` | 简单 |
| `apps/desktop/assets/icon.ico` | 替换为奇计 logo（.ico + .icns + .png） | 需要 logo 素材 |
| `apps/desktop/index.html` | `<title>` 改成奇计GEO助手 | 一行 |
| `apps/desktop/electron/main.cjs` | `APP_NAME` 常量改成奇计GEO助手 | 一行 |
| `apps/desktop/src/themes/presets.ts` | 添加奇计品牌主题色 | 中等 |

### 3.2 主题配色方案

```typescript
// 奇计品牌主题（添加到 presets.ts）
const QIJI_BLUE = '#1890FF'  // 或奇计官方品牌色，需确认

export const qijiTheme: DesktopTheme = {
  name: 'qiji',
  label: '奇计',
  description: '奇计GEO品牌主题',
  colors: {
    background: '#F0F2F5',
    foreground: '#1F1F1F',
    card: '#FFFFFF',
    primary: QIJI_BLUE,
    // ... 其他颜色跟随品牌色调整
  }
}
```

### 3.3 预装内容

| 内容 | 位置 | 说明 |
|------|------|------|
| qiji-geo Skill | `skills/qiji-geo/` | 已完成，8个操作命令 |
| 默认配置 | `config.yaml` 预设 | LLM provider 指向奇计后端 |
| Playwright | 安装包自动安装 | 首次启动时自动下载 Chromium |
| 默认 SOUL.md | 奇计 Agent 人格 | 定义为"GEO优化助手"而非"Hermes" |
| 凭证模板 | `.env` 模板 | GEO_USERNAME/GEO_PASSWORD 占位 |

### 3.4 安装包配置

```jsonc
// package.json build 段（奇计定制版）
{
  "productName": "奇计GEO助手",
  "appId": "com.qiji.geo-agent",
  "executableName": "QijiGEO",
  "icon": "assets/icon",
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "shortcutName": "奇计GEO助手",
    "uninstallDisplayName": "奇计GEO助手",
    "installerIcon": "assets/icon.ico",
    "uninstallerIcon": "assets/icon.ico"
  }
}
```

---

## 四、开发路线图

### 第一阶段：品牌换皮 + 打包（1周）

**目标：** 生成一个能装在 Windows 上、显示奇计品牌的 .exe 安装包

1. Fork Hermes 仓库到奇计组织
2. 改 `package.json` 品牌（productName, appId 等）
3. 替换 `assets/icon.*`（需要奇计 logo）
4. 改 `index.html` 标题
5. 改 `main.cjs` APP_NAME
6. 添加奇计主题色到 `presets.ts`
7. 预装 qiji-geo Skill
8. 预配 SOUL.md（GEO 助手人格）
9. 在 Windows 上编译 NSIS 安装包
10. 测试：安装 → 首次启动 → 对话 → 触发 GEO Skill

**交付物：** `奇计GEO助手-Setup-1.0.0.exe`

### 第二阶段：小白优化（1-2周）

**目标：** 小白用户能不用看文档就用起来

1. 首次启动向导（输入奇计账号密码 → 自动配置）
2. 简化界面（隐藏开发者功能：worktree、terminal、code execution）
3. 预置常用对话模板（"诊断品牌"、"查权益"、"看报告"）
4. 中文界面 100% 覆盖
5. 自动检测 Playwright 是否安装，未安装自动安装
6. 错误提示中文化（网络超时、登录失败等）

**交付物：** 面向小白的 `奇计GEO助手-Setup-1.1.0.exe`

### 第三阶段：功能扩展（2-3周）

**目标：** 覆盖奇计平台全部功能

1. 补全 qiji-geo Skill 所有操作（写作任务、发布、批量操作）
2. 企业知识库 Skill（通过 MCP 接入向量 DB 或简单文件检索）
3. AI 写作 Skill（接奇计后端写作 API）
4. 定时任务（自动定时诊断、自动发布）
5. 多账号管理（服务商/企业子账号）

**交付物：** 功能完整的 `奇计GEO助手-Setup-2.0.0.exe`

### 第四阶段：商业化（持续）

1. 更新服务器（奇计自建，不依赖 Hermes 官方更新）
2. OEM 贴牌支持（给服务商定制子品牌）
3. License 管理（绑定奇计账号体系）
4. 数据统计（用量、活跃度，对接奇计后台）
5. 微信/钉钉/飞书接入（gateway 配置）

---

## 五、许可证合规

### Hermes MIT License 要求

```
MIT License — 允许：商用、修改、闭源分发、换品牌
唯一要求：保留原始 LICENSE 文件和版权声明
```

### 合规做法

1. 安装包内保留 `LICENSE` 文件（Hermes 原始 MIT License）
2. 关于页面注明 "Powered by Hermes Agent (MIT License)"
3. 不需要公开我们的修改代码
4. 不需要注明使用了 Hermes（但保留 LICENSE 文件即可）

### 不能做的

- 删除或篡改原始 LICENSE 文件 ❌
- 声称 Hermes Agent 是我们的原创 ❌
- 用奇计的名义发布修改后的 Hermes 源码却不注明来源 ❌

---

## 六、关键技术风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Playwright 在用户机器安装失败 | Agent 无法操作平台 | 安装包内置 Playwright + Chromium，首次启动自动安装 |
| LLM API 稳定性 | Agent 无法思考 | 多 Provider 降级链（GLM → DeepSeek → 本地模型） |
| Hermes 升级后不兼容 | 需要重新适配 | 锁定版本，奇计维护自己的 fork |
| 用户 Windows 环境差异 | 安装/运行失败 | 充分测试 Win10/Win11，提供安装排障指南 |
| 奇计平台改版 | CSS 选择器失效 | Skill 内置容错（多选择器策略），定期更新 |
| 小白用户不会配 API Key | 卡在首启 | 方案A：奇计统一提供 LLM API，用户只输入奇计账号 |

---

## 七、成本估算

### 开发成本

| 项目 | 人天 | 说明 |
|------|------|------|
| 品牌换皮 + 打包 | 3天 | 改配置 + 编译安装包 |
| 小白优化 | 5天 | 向导 + 界面简化 + 中文 |
| Skill 功能补全 | 5天 | 覆盖全部奇计平台操作 |
| 测试 + 修 Bug | 5天 | Win10/Win11 全量测试 |
| **第一阶段合计** | **~18天** | |

### 运营成本

| 项目 | 月费用 | 说明 |
|------|--------|------|
| LLM API | 按用量 | GLM-4-Flash ~0.001元/千token |
| 更新服务器 | ~50元/月 | 静态文件托管 |
| 域名 | 已有 | geo.heikexia.cc 可用 |
| 签名证书 | ~300元/年 | 可选，EV 代码签名更贵 |

---

## 八、竞品对比

| 维度 | 奇计 Agent | 奇计原版后台 | 竞品(小龙虾类) |
|------|-----------|-------------|---------------|
| 使用方式 | 自然语言对话 | 手动点菜单 | 取决于产品 |
| 小白友好 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 功能覆盖 | 平台全部功能 | 平台全部功能 | 取决于产品 |
| 自动化 | AI 决策+自动执行 | 手动操作 | 取决于产品 |
| Windows 安装 | 一键安装 | 需要浏览器 | 取决于产品 |
| 品牌独立性 | 奇计自有品牌 | 奇计自有 | 取决于产品 |

---

## 九、下一步行动

- [ ] 确认奇计 logo 素材（ico + png）
- [ ] 确认奇计品牌色（主色调）
- [ ] 确认 LLM 方案（方案A 还是 B）
- [ ] 确认是否 Fork Hermes 仓库
- [ ] 开始第一阶段开发
