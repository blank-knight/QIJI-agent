# 品牌替换指南

> 本文档记录白标 Hermes Agent 桌面版需要修改的所有位置。
> "奇计" 是第一次试验，未来可替换为 "黑客claw"、"魔方agent" 等。

## 总览

品牌替换分 **6 层**，按修改顺序排列。每层独立验证后再进入下一层。

---

## 第1层：构建配置（package.json）

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

## 第2层：图标资源

### 必须替换的图标

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

## 第3层：前端界面（i18n 国际化）

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

## 第4层：Python 后端（消息平台描述）

**重大坑点：消息平台的描述文字来自 Python 后端 API，不是前端 i18n！**

### 文件：`hermes_cli/web_server.py`

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

### 文件：`hermes_cli/setup.py`

CLI setup 向导中的提示文字：
```python
print_info("Connect Qiji to messaging apps to chat from anywhere.")  # L3313
```

### docs_url（平台帮助链接）

web_server.py 中部分平台的 `docs_url` 指向 `hermes-agent.nousresearch.com`。
这些是用户点"打开文档"时的跳转地址，应替换为自己的文档站。

涉及行（约 L4454, L4521, L4552, L4565）：
```python
"docs_url": "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/",
```
→ 替换为自有文档站 URL。

### 环境变量描述（容易被遗漏）

web_server.py 中 `OPTIONAL_ENV_VARS` 的 `description` 字段也有品牌名残留：

| 行号 | 内容 |
|------|------|
| L4692 | `WEIXIN_ACCOUNT_ID` → "iLink Bot account ID obtained through QR login in hermes gateway setup" |
| L4696 | `WEIXIN_TOKEN` → "iLink Bot token obtained through QR login in hermes gateway setup" |

这些在消息平台页面配置环境变量时用户可见。

### 主题名称（L11888-L11891）

web_server.py 中 `_BUILTIN_DASHBOARD_THEMES` 的主题标签和描述：

| 行号 | 原值 | 改为 |
|------|------|------|
| L11890 | `"label": "Hermes Teal"` | `"label": "奇计青"` |
| L11890 | `"description": "...the canonical Hermes look"` | `"...the canonical 奇计 look"` |
| L11891 | `"label": "Hermes Teal (Large)"` | `"label": "奇计青 (Large)"` |
| L11891 | `"description": "Hermes Teal with..."` | `"奇计青 with..."` |

用户在主题选择列表里能看到这些名称。

### ⚠️ 完整搜索命令

光搜 `Connect|Use|Talk to` 动词开头会漏掉 Telegram 那种 `Run Hermes from...` 句式。
改品牌时必须用更宽的搜索：

```bash
# 搜所有 description 字段里的 Hermes
grep -n "description.*[Hh]ermes" hermes_cli/web_server.py
```

---

## 第5层：提供方/订阅配置

### 文件：`apps/desktop/src/components/desktop-onboarding-overlay.tsx`

推荐订阅栏的品牌化：

```typescript
// 显示名
nous: { order: 0, title: '奇计云' },  // ← 改为自己的中转站名

// 图标
<img src={assetPath('qiji-brand.png')} />  // ← 改为自己的品牌图片

// 订阅链接（点击跳转）
docsUrl: 'https://www.aicps.vip/',  // ← 改为自己的中转站
```

### 文件：`apps/desktop/src/app/settings/constants.ts`

```typescript
PROVIDER_GROUPS 中的 docsUrl 字段 → 中转站 URL
```

### ⚠️ 关键坑：Portal URL 在 Python 后端（不只是前端 docsUrl）

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

### ⚠️ 关键坑：OAuth 流程改为直接跳转外链（2026-07-02）

**现象：** 上一步把 Portal URL 从 `portal.nousresearch.com` 改成 `www.aicps.vip` 后，点击奇计云报错 404：`https://www.aicps.vip/api/oauth/device/code`。因为 aicps.vip 没有（也不需要）实现 Nous 的 OAuth device code 接口。

**决策：** 跳过 OAuth 流程，点击奇计云直接用浏览器打开网站，用户自己去网站注册拿 API key。

**改了 2 个前端文件（各 1 处）：**

| 文件 | 行号 | 改动 |
|------|------|------|
| `src/components/desktop-onboarding-overlay.tsx` | L466 | `select` 函数：当 `p.id === FEATURED_ID`（即 nous）时调用 `window.hermesDesktop?.openExternal?.('https://www.aicps.vip/')` 直接打开浏览器，不走 `startProviderOAuth` |
| `src/app/settings/providers-settings.tsx` | L143 | 同理：当 `p.id === 'nous'` 时 `openExternal` 打开网站，不走 `startManualProviderOAuth` |

**原理：** `startProviderOAuth` → 后端请求 `/api/oauth/device/code` → 404。改成 `openExternal` 后直接用系统浏览器打开网址，不碰后端 OAuth。其他 provider（OpenAI、Anthropic 等）行为不变。

---

## 第6层：人格文件（可选）

### SOUL.md

路径：`docker/SOUL.md`（默认模板）

如果桌面端预装人格，需要创建品牌化的人格文件放到：
```
apps/desktop/build/preinstalled/
```

包含：角色名、身份描述、语气风格等。

---

## 品牌替换检查清单

每次换品牌时，按此清单逐项检查：

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
- [ ] hermes_cli/web_server.py — 平台描述文字（见第4层）
- [ ] hermes_cli/web_server.py — 主题名称（L11888-L11891，见第4层）
- [ ] hermes_cli/web_server.py — 环境变量描述（L4692, L4696，见第4层）
- [ ] hermes_cli/web_server.py — FastAPI title（L235，见下方"遗漏清单"）
- [ ] hermes_cli/setup.py — CLI 提示文字（见下方"遗漏清单"）
- [ ] desktop-onboarding-overlay.tsx — 订阅栏名称、图标、链接
- [ ] providers-settings.tsx — 点击奇计云行为（OAuth→openExternal，见第5层）
- [ ] constants.ts — PROVIDER_GROUPS docsUrl
- [ ] ⚠️ Python 后端 Portal URL ×13 处（见第5层表格）
- [ ] web_server.py docs_url — 平台帮助链接
- [ ] SOUL.md — 人格文件（如预装）
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
