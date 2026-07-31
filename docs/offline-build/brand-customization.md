# 品牌定制指南（分层架构）

> 本文档记录白标 Hermes Agent 桌面版的**分层定制体系**。
> 当前版本：**2026-07-31**（迭代到双层定制架构）。
> 历史案例："奇计"（Qiji）→ 后续可扩展 "黑镜"、"魔方agent" 等。

## 定制分层总览

客户端定制分为 **两个独立层级**，按依赖顺序执行。第一层是所有贴牌商的强制项，第二层是可选的差异化项。两层完成后即可产出一份独立的安装包。

| 层级 | 名称 | 目标 | 谁来定 | 自动化 |
|------|------|------|--------|--------|
| **第一层** | 品牌身份（Brand Identity） | 换品牌名 + Logo + 安装包身份 | 贴牌商提供素材 | ✅ 脚本一键 |
| **第二层** | 主题与 UI（Theme & UI） | 颜色/字体/布局可任意组合 | 我方预置模板库，贴牌商挑选组合 | ✅ 模板拼接 |

> **设计原则：** 第二层依赖第一层（主题里的品牌色需要先确定品牌身份），但第一层不依赖第二层（仅换品牌也能跑）。两层解耦，可独立迭代。

### 推荐工作流（给贴牌商）

**场景 A：贴牌商提供素材**

1. 贴牌商提供：品牌名（中/英/日/繁）、Logo 素材包、订阅站 URL。
2. 我方执行第一层：运行 `apply_brand.py` 注入品牌身份 + 替换图标。
3. 贴牌商从主题模板库（见第二层）挑选配色 / 字体 / 布局组合。
4. 我方执行第二层：从模板库拼装出该贴牌商的专属主题包。
5. 编译 → 交付独立安装包。

**场景 B：贴牌商什么都不提供（零输入一键生成）**

1. 运行 `generate_brand.py`（见 [scripts/brand/README.md](../../scripts/brand/README.md)）：自动起名 + AI 生成 Logo 候选 → 筛选 → 裁剪全套图标 → 生成品牌配置 JSON。
2. 运行 `apply_brand.py` 应用品牌到代码。
3. 编译 → 交付独立安装包。

---

## 第一层：品牌身份（必须）

**目标：** 把 "奇计" 换成任意贴牌商品牌（如 "黑镜"）。不仅客户端 UI 显示要换，**安装包的身份也要换**（appId、exe 图标、快捷方式名、安装向导标题等），让最终用户感知不到上游。

第一层内部按修改顺序分为 7 个子层（原"6 层"已收敛为第一层下的子步骤，1.7 为后加的 skills 品牌）。每个子层独立验证后再进入下一个。

### 1.1 构建配置（package.json）

文件：`apps/desktop/package.json`

```json
"productName": "Qiji",           // ← 英文名
"appId": "com.qiji.desktop",     // ← 应用唯一ID
"productName": "Qiji",           // build 段内
"legalTrademarks": "奇计",       // Windows 商标
"shortcutName": "奇计",          // Windows 快捷方式名
"CFBundleName": "奇计",          // macOS 应用名
"NSAudioCaptureUsageDescription": "奇计使用音频捕获进行语音对话。",
"NSMicrophoneUsageDescription": "奇计使用麦克风进行语音输入和语音对话。",
"maintainer": "Qiji",            // Linux maintainer
"synopsis": "奇计 — AI智能助手桌面版",  // Linux 简介
```

同时检查 NSIS 段：
```json
"nsis": {
    "shortcutName": "奇计",
    "uninstallDisplayName": "奇计"
}
```

DMG 段（macOS）：
```json
"dmg": {
    "title": "安装奇计"
}
```

---

### 1.2 图标资源

#### 必须替换的图标

| 文件 | 用途 | 尺寸要求 |
|------|------|----------|
| `apps/desktop/assets/icon.ico` | Windows exe 图标 | 多尺寸 .ico (16/32/48/64/128/256) |
| `apps/desktop/assets/icon.icns` | macOS 图标 | .icns |
| `apps/desktop/public/icon.png` | 通用图标 | 512×512 PNG |
| `apps/desktop/public/apple-touch-icon.png` | favicon + PWA | 180×180 PNG |
| `apps/desktop/public/qiji-brand.png` | 品牌Logo（设置页/推荐栏）| 256×256 PNG |

### 打包后 exe 图标替换

exe 图标通过 `scripts/set-exe-identity.cjs` 在打包后注入：
```javascript
// electron-builder 配置
"signAndEditExecutable": false   // 跳过自动签名，用自定义脚本注入图标
```
脚本路径在 `apps/desktop/scripts/set-exe-identity.cjs`，读取 `assets/icon.ico`。

### 需要删除的旧图标（如有）

Hermes 原始图标文件（已删除）：
- `public/hermes.png`
- `public/hermes-sprite.png`
- `public/hermes-frames/` (8帧)

---

### 1.3 前端界面（i18n 国际化）

**这是用户可见文字的主要来源。** 涉及 4 个语言文件：

| 文件 | 语言 |
|------|------|
| `src/i18n/zh.ts` | 简体中文 |
| `src/i18n/zh-hant.ts` | 繁体中文 |
| `src/i18n/en.ts` | 英文 |
| `src/i18n/ja.ts` | 日文 |

### 需要替换的关键位置

在 i18n 文件中搜索品牌名（如 "Hermes"）和 "Nous Portal"，替换为：
- 品牌中文名（如"奇计"）
- 品牌英文名（如"Qiji"）
- 订阅中转站 URL（如 "https://www.aicps.vip/"）
- 订阅中转站显示名（如"奇计云"）

### 重点字段（以 zh.ts 为例）

```
hermesActiveSessions → 品牌名
connectedTo → "已连接到 ... · 奇计 版本号"
messaging.platformIntro.* → 各平台介绍中的品牌名
placeholderReconnecting → "正在重新连接 奇计…"
gateway.nousIncluded → "包含在奇计云订阅中"
gateway.featuredPitch → "通过 aicps.vip 运行 奇计"
```

**搜索命令：**
```bash
# 搜索所有语言文件中的旧品牌名
grep -rn "Hermes\|Nous Portal" apps/desktop/src/i18n/
# 搜索所有用户可见的旧品牌名（排除代码标识符）
grep -rn "[Hh]ermes" apps/desktop/src/ --include="*.tsx" --include="*.ts" | grep -v "test\|\.d\.ts\|import\|from\|http\|HERMES_"
```

---

### 1.4 Python 后端（消息平台描述）

**重大坑点：消息平台的描述文字来自 Python 后端 API，不是前端 i18n！**

#### 文件：`hermes_cli/web_server.py`

位置约 L4380-L4560，`MESSAGING_PLATFORM_CATALOG` 字典中每个平台的 `description` 字段：

```python
"discord": {
    "description": "Connect Qiji to Discord DMs, channels, and threads.",  # ← 改品牌名
},
"slack": {
    "description": "Use Qiji from Slack via Socket Mode.",                  # ← 改品牌名
},
# ... 所有平台同理
```

搜索命令：
```bash
grep -n "(Connect|Use|Talk to|Expose|Control) Hermes" hermes_cli/web_server.py
```

#### 文件：`hermes_cli/setup.py`

CLI setup 向导中的提示文字：
```python
print_info("Connect Qiji to messaging apps to chat from anywhere.")  # L3313
```

#### docs_url（平台帮助链接）

web_server.py 中部分平台的 `docs_url` 指向 `hermes-agent.nousresearch.com`。
这些是用户点"打开文档"时的跳转地址，应替换为自己的文档站。

涉及行（约 L4454, L4521, L4552, L4565）：
```python
"docs_url": "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/",
```
→ 替换为自有文档站 URL。

#### 环境变量描述（容易被遗漏）

web_server.py 中 `OPTIONAL_ENV_VARS` 的 `description` 字段也有品牌名残留：

| 行号 | 内容 |
|------|------|
| L4692 | `WEIXIN_ACCOUNT_ID` → "iLink Bot account ID obtained through QR login in hermes gateway setup" |
| L4696 | `WEIXIN_TOKEN` → "iLink Bot token obtained through QR login in hermes gateway setup" |

这些在消息平台页面配置环境变量时用户可见。

#### 主题名称（L11888-L11891）

web_server.py 中 `_BUILTIN_DASHBOARD_THEMES` 的主题标签和描述：

| 行号 | 原值 | 改为 |
|------|------|------|
| L11890 | `"label": "Hermes Teal"` | `"label": "奇计青"` |
| L11890 | `"description": "...the canonical Hermes look"` | `"...the canonical 奇计 look"` |
| L11891 | `"label": "Hermes Teal (Large)"` | `"label": "奇计青 (Large)"` |
| L11891 | `"description": "Hermes Teal with..."` | `"奇计青 with..."` |

用户在主题选择列表里能看到这些名称。

#### ⚠️ 完整搜索命令

光搜 `Connect|Use|Talk to` 动词开头会漏掉 Telegram 那种 `Run Hermes from...` 句式。
改品牌时必须用更宽的搜索：

```bash
# 搜所有 description 字段里的 Hermes
grep -n "description.*[Hh]ermes" hermes_cli/web_server.py
```

---

### 1.5 提供方/订阅配置

#### 文件：`apps/desktop/src/components/desktop-onboarding-overlay.tsx`

推荐订阅栏的品牌化：

```typescript
// 显示名
nous: { order: 0, title: '奇计云' },  // ← 改为自己的中转站名

// 图标
<img src={assetPath('qiji-brand.png')} />  // ← 改为自己的品牌图片

// 订阅链接（点击跳转）
docsUrl: 'https://www.aicps.vip/',  // ← 改为自己的中转站
```

#### 文件：`apps/desktop/src/app/settings/constants.ts`

```typescript
PROVIDER_GROUPS 中的 docsUrl 字段 → 中转站 URL
```

#### ⚠️ 关键坑：Portal URL 在 Python 后端（不只是前端 docsUrl）

**现象：** 前端 `constants.ts` 和 `desktop-onboarding-overlay.tsx` 的 `docsUrl` 已改为 `aicps.vip`，但用户点击"奇计云"连接按钮仍跳转 `portal.nousresearch.com`。

**根因：** 点击连接触发的是 **OAuth device flow**，跳转 URL 来自 Python 后端的 Portal URL 常量，与前端 `docsUrl` 完全无关。

**必须改的 6 个文件（共 13 处）：**

| 文件 | 行号 | 变量/字段 | 说明 |
|------|------|-----------|------|
| `hermes_cli/portal_cli.py` | L29 | `DEFAULT_PORTAL_URL` | Portal 主 URL |
| `hermes_cli/portal_cli.py` | L30 | `SUBSCRIPTION_URL` | 订阅页 URL |
| `hermes_cli/auth.py` | L70 | `DEFAULT_NOUS_PORTAL_URL` | OAuth 默认 Portal URL |
| `hermes_cli/nous_account.py` | L135 | fallback `DEFAULT_NOUS_PORTAL_URL` | import 失败时的兜底 |
| `hermes_cli/nous_account.py` | L567 | `_fetch_nous_account_info` base | 账户信息 API base URL |
| `hermes_cli/models.py` | L866 | `_fetch_nous_recommended` base | 推荐模型 API base URL |
| `hermes_cli/models.py` | L917 | fallback Portal URL | import 失败时的兜底 |
| `hermes_cli/dashboard_register.py` | L90 | fallback Portal URL | 兜底 |
| `hermes_cli/dashboard_register.py` | L355 | `default_portal` | 注册时默认 Portal |
| `hermes_cli/web_server.py` | L2217 | `subscription_url` | 前端 API 返回的订阅链接 |
| `hermes_cli/web_server.py` | L5701 | `docs_url` | 前端 API 返回的文档链接 |
| `hermes_cli/nous_billing.py` | L35 | `DEFAULT_PORTAL_BASE_URL` | 计费 API base URL |
| `hermes_cli/config.py` | L2357 | `portal_url` | Chronos cron 插件配置 |
| `hermes_cli/setup.py` | L2635, L2935 | Sign up 提示文字 ×2 | CLI 向导显示的注册链接 |

**验证命令（零命中才安全）：**
```bash
grep -rn "portal.nousresearch.com" hermes_cli/ | grep -v "^.*:#"
```
排除注释后应零命中（L5786 的注释保留无害）。

**经验教训：** 前端 `docsUrl` 只是"了解更多"链接。实际 OAuth 跳转走的是后端 `portal_cli.py` → `auth.py` 的 device flow，URL 在 Python 后端定义。品牌替换时如果只改前端不改后端，用户点击连接仍跳到旧的 Nous Portal。

#### ⚠️ 关键坑：OAuth 流程改为直接跳转外链（2026-07-02）

**现象：** 上一步把 Portal URL 从 `portal.nousresearch.com` 改成 `www.aicps.vip` 后，点击奇计云报错 404：`https://www.aicps.vip/api/oauth/device/code`。因为 aicps.vip 没有（也不需要）实现 Nous 的 OAuth device code 接口。

**决策：** 跳过 OAuth 流程，点击奇计云直接用浏览器打开网站，用户自己去网站注册拿 API key。

**改了 2 个前端文件（各 1 处）：**

| 文件 | 行号 | 改动 |
|------|------|------|
| `src/components/desktop-onboarding-overlay.tsx` | L466 | `select` 函数：当 `p.id === FEATURED_ID`（即 nous）时调用 `window.hermesDesktop?.openExternal?.('https://www.aicps.vip/')` 直接打开浏览器，不走 `startProviderOAuth` |
| `src/app/settings/providers-settings.tsx` | L143 | 同理：当 `p.id === 'nous'` 时 `openExternal` 打开网站，不走 `startManualProviderOAuth` |

**原理：** `startProviderOAuth` → 后端请求 `/api/oauth/device/code` → 404。改成 `openExternal` 后直接用系统浏览器打开网址，不碰后端 OAuth。其他 provider（OpenAI、Anthropic 等）行为不变。

---

### 1.6 人格文件（可选）

#### SOUL.md

路径：`docker/SOUL.md`（默认模板）

如果桌面端预装人格，需要创建品牌化的人格文件放到：
```
apps/desktop/build/preinstalled/
```

包含：角色名、身份描述、语气风格等。

---

### 1.7 内置 Skills 品牌名（qiji-geo 等）

**目标：** skills/ 目录下的内置 skill（如 qiji-geo、qiji-knowledge-base）里有大量"奇计"品牌名文案，贴牌后必须一起换，否则用户在黑镜客户端里用 GEO 功能时还会看到"奇计"。

**范围：** 自动扫描 `skills/*/` 下所有 `.md` / `.py` / `.js` / `.json` / `.yaml` 文件（排除 `node_modules`、`package-lock.json`），替换用户可见的品牌名文字。

**自动化的部分（✅）：**

| skill | 涉及文件 | 说明 |
|-------|---------|------|
| `skills/qiji-geo/` | SKILL.md, docs/, references/, scripts/ | description 触发词、提示语、print 输出、文档正文里的"奇计" |
| `skills/qiji-knowledge-base/` | SKILL.md, scripts/ | 同上 |

脚本用宽匹配 + 上下文感知替换（先替换"奇计GEO平台"等长串，再替换独立"奇计"），避免误伤。

**不替换的部分（❌ 对用户隐藏，改了风险高）：**

| 项 | 为什么不改 |
|----|-----------|
| 目录名 `skills/qiji-geo/` | 用户看不到，改了要同步改所有路径引用 |
| `package.json` 的 `"name": "qiji-geo-skill"` | npm 内部依赖名，用户看不到 |
| `package-lock.json` | 生成文件 |
| 文件系统路径引用（如 `~/clawd/qiji-fork/`） | 开发排障用，终端用户/贴牌商不会碰 |

**关键点：GEO 服务端域名是运行时获取的，不写死。** skill 首次执行时会引导用户输入自己的 GEO 服务端网址（`GEO_URL` 环境变量），所以黑镜贴牌后不需要改域名代码。详见 [skills/qiji-geo/SKILL.md](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/skills/qiji-geo/SKILL.md) "凭证配置"章节。

---

## 第二层：主题与 UI 定制（可选，任意组合）

**目标：** 在第一层确定的品牌身份之上，让不同贴牌商/代理拥有差异化的视觉风格。颜色、字体、明暗模式、布局密度可以**任意组合**（多样性），但为了避免贴牌商手调出错，**采用"我方预置模板素材库 → 拼接生成 → 交付"的流程**，不开放裸 CSS 编辑。

### 设计原则

1. **组合优先，自由编辑其次。** 贴牌商从预置库挑选模块（配色 × 字体 × 模式 × 密度），由我方拼装成完整主题包，而不是让贴牌商直接改 CSS 变量。
2. **模板素材库由我方维护。** 每个模板都经过视觉校验、对比度检查、暗色模式回归，确保拼接后不会出现不可读/错位。
3. **主题与品牌身份解耦。** 主题里不写死品牌名/Logo（那是第一层的事），只定义颜色/字体/布局。换主题不影响品牌，换品牌不需要重做主题。

### 主题系统的三层架构（已存在，直接复用）

桌面端已有完整的主题系统，第二层只是在此基础上做"模板库 + 拼装"，不需要新造轮子：

| 层 | 位置 | 作用 | 谁改 |
|----|------|------|------|
| CSS 变量 | [apps/desktop/src/styles.css](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/styles.css) L123-L152 | 定义 `--theme-primary` 等设计 token | 我方维护模板库 |
| 内置主题 | [apps/desktop/src/themes/presets.ts](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/themes/presets.ts) | TypeScript 形式的完整主题定义 | 我方维护模板库 |
| 主题类型 | [apps/desktop/src/themes/types.ts](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/themes/types.ts) | `DesktopTheme` 接口（colors / darkColors / typography / terminal） | 不改 |
| 后端主题目录 | [hermes_cli/web_server.py](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/hermes_cli/web_server.py) `_BUILTIN_DASHBOARD_THEMES` (L11900) | 主题选择列表的 name/label/description | 拼装时自动注入 |
| 用户主题目录 | `~/.hermes/dashboard-themes/*.yaml` | 运行时用户/贴牌商自定义主题 | 拼装产物落到这里 |

### 第二层的四个可组合维度

贴牌商从以下四个维度各选一项，拼成一份专属主题。所有可选项都来自我方预置模板素材库。

#### 维度 A：配色（Palette）

预置配色模板（每份都已校验对比度 + 暗色回归）：

| 模板名 | 主色 | 风格 | 暗色模式 |
|--------|------|------|----------|
| `teal` | 青绿 | 奇计默认（canonical） | ✅ 手调 |
| `nous-blue` | 亮蓝 | Nous 经典 | ✅ 手调 |
| `midnight` | 深蓝紫 | 冷色调 | ✅ |
| `ember` | 红铜 | 暖色/锻造感 | ✅ |
| `mono` | 灰阶 | 极简专注 | ✅ |
| `cyberpunk` | 霓虹绿 | 赛博朋风 | ✅ |
| `rose` | 粉色 | 柔和护眼 | ✅ |

> 贴牌商可以指定一个主色 HEX，我方在模板库里找到最近的预设，而不是裸改 CSS（避免对比度事故）。

#### 维度 B：字体（Typography）

| 模板名 | sans | mono | 说明 |
|--------|------|------|------|
| `system` | Segoe UI / SF Pro | Cascadia Code / JetBrains Mono | 默认，跨平台兼容 |
| `custom` | 贴牌商提供字体名 | 贴牌商提供字体名 | 需提供 `fontUrl`（Google Fonts / 自托管） |

字体加载通过 `DesktopThemeTypography.fontUrl` 字段（[types.ts](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/themes/types.ts) L43-L47），支持 Google/Bunny/自托管字体样式表 URL。

#### 维度 C：明暗模式（Mode）

| 模板名 | 行为 |
|--------|------|
| `light` | 仅浅色 |
| `dark` | 仅深色 |
| `auto` | 跟随系统（默认） |

> 内置主题通过 `darkColors` 字段提供手调暗色（见 [presets.ts](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/themes/presets.ts) `nousTheme.darkColors`）。如果某配色模板没提供 `darkColors`，系统会自动合成（但质量不如手调）。

#### 维度 D：布局密度（Density）

| 模板名 | 字号 | 间距 | 对应内置主题 |
|--------|------|------|--------------|
| `normal` | 标准 | 标准 | `default` |
| `large` | 加大 | 更宽松 | `default-large` |

### 拼装产物：YAML 主题文件

四个维度选定后，拼装出一份 YAML 主题文件，放到用户主题目录：

路径：`~/.hermes/dashboard-themes/{brand-id}.yaml`

```yaml
# 由品牌定制工具自动生成 — 请勿手改
name: heimirror-default
label: 黑镜
description: 黑镜专属主题 — 深蓝紫配色 · 系统字体 · 跟随系统明暗 · 标准密度
colors:
  background: "#0D2F86"
  foreground: "#FFE6CB"
  primary: "#1540B1"
  # ... 完整字段见 types.ts DesktopThemeColors
darkColors:
  # ... 手调暗色
typography:
  fontSans: '"Segoe UI", system-ui, sans-serif'
  fontMono: '"Cascadia Code", monospace'
```

后端 `_discover_user_themes()`（[web_server.py](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/hermes_cli/web_server.py) L12127）会自动扫描这个目录，前端 `GET /api/dashboard/themes` 拿到完整定义后即可应用，**无需重新编译**。

### 第二层执行流程（给贴牌商）

1. 贴牌商从模板库选：配色 × 字体 × 模式 × 密度（四个维度各选一项）。
2. 我方运行主题拼装工具（见 [scripts/brand/](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/scripts/brand/) README）。
3. 工具从四个维度的模板拼接出一份 YAML，写入 `~/.hermes/dashboard-themes/{brand-id}.yaml`。
4. 工具调用 `PUT /api/dashboard/theme` 设为活动主题（或写入 `config.yaml` 的 `dashboard.theme`）。
5. 桌面端下次启动（或刷新主题列表）即应用新主题。

### 主题名称的品牌化（与第一层 1.4 衔接）

主题选择列表里的 label/description 来自后端 `_BUILTIN_DASHBOARD_THEMES`（[web_server.py](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/hermes_cli/web_server.py) L11900-L11909）。品牌化时把含品牌名的条目改成品牌名：

| name | 默认 label | 品牌化后（以"奇计"为例） |
|------|-----------|--------------------------|
| `default` | `Hermes Teal` | `奇计青` |
| `default-large` | `Hermes Teal (Large)` | `奇计青 (Large)` |

其余主题（`midnight` / `ember` / `mono` / `cyberpunk` / `rose`）的 label 不含品牌名，无需改。

> 贴牌商专属主题（第二层拼装产物）的 label/description 在 YAML 里自定义，不经过 `_BUILTIN_DASHBOARD_THEMES`。

---

## 第一层检查清单

每次换品牌（第一层）时，按此清单逐项检查：

- [ ] package.json: productName, appId, legalTrademarks, shortcutName, CFBundleName, DMG title
- [ ] assets/icon.ico — Windows 图标
- [ ] assets/icon.icns — macOS 图标
- [ ] public/icon.png — 通用图标
- [ ] public/apple-touch-icon.png — favicon + 任务栏图标
- [ ] public/qiji-brand.png → 改名为新品牌名.png
- [ ] public/ 旧品牌图片删除（如 hermes*.png, nous-girl.jpg）
- [ ] i18n/zh.ts — 中文界面文字
- [ ] i18n/zh-hant.ts — 繁体中文界面文字
- [ ] i18n/en.ts — 英文界面文字
- [ ] i18n/ja.ts — 日文界面文字
- [ ] hermes_cli/web_server.py — 平台描述文字（见 1.4）
- [ ] hermes_cli/web_server.py — 主题名称（L11888-L11891，见 1.4；主题 UI 定制见第二层）
- [ ] hermes_cli/web_server.py — 环境变量描述（L4692, L4696，见 1.4）
- [ ] hermes_cli/web_server.py — FastAPI title（L235，见下方"遗漏清单"）
- [ ] hermes_cli/setup.py — CLI 提示文字（见下方"遗漏清单"）
- [ ] desktop-onboarding-overlay.tsx — 订阅栏名称、图标、链接
- [ ] providers-settings.tsx — 点击奇计云行为（OAuth→openExternal，见 1.5）
- [ ] constants.ts — PROVIDER_GROUPS docsUrl
- [ ] ⚠️ Python 后端 Portal URL ×13 处（见 1.5 表格）
- [ ] web_server.py docs_url — 平台帮助链接
- [ ] SOUL.md — 人格文件（如预装）
- [ ] skills/ — 内置 skill 品牌名（qiji-geo、qiji-knowledge-base，见 1.7）
- [ ] 全局搜索确认无残留（见下方"验证命令"）

## 已知遗漏清单（2026-07-02 审计）

以下位置已确认含 "Hermes" 但**尚未替换**，按优先级排列：

### 🔴 高优先级（用户在桌面端可见）

> **已全部替换（2026-07-02）。**

| 文件 | 行号 | 原内容 | 现内容 |
|------|------|--------|--------|
| `hermes_cli/web_server.py` | L235 | `FastAPI(title="Hermes Agent")` | `FastAPI(title="奇计")` |
| `hermes_cli/web_server.py` | L5602 | `source_label: "Hermes PKCE"` | `source_label: "奇计 PKCE"` |

### 🟡 中优先级（CLI 向导可见）

> **已全部替换（2026-07-02）。** `hermes_cli/setup.py` 中 14 处描述文字的 "Hermes" → "奇计"。剩余的 `hermes setup` / `hermes config` 等是 CLI 命令名，不能改。

### 🟢 低优先级（代码注释/测试文件，用户完全看不到）

| 文件 | 数量 | 说明 |
|------|------|------|
| `src/themes/context.tsx` | 8处 | localStorage key 名（`hermes-desktop-theme-v2` 等），改了会导致已保存的主题丢失 |
| `src/types/hermes.ts` | 6处 | 类型定义，代码标识符 |
| `*.test.ts` / `*.test.tsx` | ~50处 | 测试文件，不影响运行 |
| `src/store/*.ts` | ~15处 | 内部函数/变量名 |

> 这些**不要改**，属于代码标识符，改了风险高收益零。

## 验证命令

替换完成后，跑以下命令确认无残留（排除代码标识符和测试）：

```bash
# Python 后端 — 用户可见的 description/label/title
grep -n "description.*[Hh]ermes\|label.*[Hh]ermes\|title.*[Hh]ermes" hermes_cli/web_server.py

# Python setup.py — 用户可见的 print 描述
grep -n 'print.*[Hh]ermes[^_]' hermes_cli/setup.py | grep -v "hermes setup\|hermes config\|hermes gateway\|hermes model\|hermes doctor\|hermes portal\|hermes claw"

# 前端 i18n
grep -rn "[Hh]ermes" apps/desktop/src/i18n/ | grep -v test

# Portal URL（应零命中）
grep -rn "portal.nousresearch.com" hermes_cli/ | grep -v "^.*:#"
```

## 不需要改的（代码标识符）

以下含 "Hermes" 的内容是代码标识符，**不要改**（改了会编译失败）：

- `HermesConfigRecord`, `HermesGateway`, `HermesApiRequest` 等 TypeScript 类型
- `hermes_cli/` 目录名（Python 包名）
- `HERMES_HOME` 等环境变量名
- `@/hermes` 导入路径
- `hermesHome`, `resolveHermesBackend` 等内部函数名
- Electron preload 中的 `HermesConnection` 等 IPC 接口
- `checkHermesUpdate`, `updateHermes` 等更新检查函数

这些是内部实现，用户看不到。改了需要同步改所有引用，风险极高收益为零。
