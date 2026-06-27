---
name: qiji-geo
description: "奇计GEO平台自动化（网页端 + 桌面客户端）。网页端操作 geo.heikexia.cc：AI可见度诊断、诊断报告、关键词管理、爆文复刻、文章列表、账号权益查询。桌面客户端（auth helper.exe）操作16个社媒平台分发 + 8个AI认证。当用户提到奇计、GEO诊断、AI可见度、品牌诊断、geo.heikexia、auth helper、社媒分发 时加载。"
version: 1.3.1
---

# 奇计GEO平台自动化 Skill

通过 Playwright 自动化操作奇计GEO平台 (geo.heikexia.cc)。

## ⚠️ 费用警告

以下操作会消耗真实费用，执行前**必须**向用户确认：

| 操作 | 费用 |
|------|------|
| 创建AI诊断任务 | 13元/次 |
| 创建AI诊断（含建议报告） | 16元/次 |
| AI写作 | 消耗点数 |
| 文章发布 | 消耗点数 |
| 爆文复刻 | 消耗点数 |

**查询类操作（查看报告、关键词、权益、文章列表）免费，可直接执行。**

## 环境要求

- Node.js >= 18
- Playwright（`npm install playwright` 或在 skill 目录 `npm install`）
- 网络可访问 geo.heikexia.cc

## 凭证配置

### 网页端（geo.heikexia.cc）

在 `~/.hermes/.env` 中设置（或使用默认测试账号）：

```
GEO_USERNAME=4000761588
GEO_PASSWORD=4000761588
```

### 桌面客户端（auth helper）

```bash
export GEO_UDID="授权码"          # 必需，从客户端登录界面获取
export GEO_USERNAME="4000761588"  # 默认
```

设置 `GEO_UDID` 后，脚本自动完成：
1. 调 `POST /api/zhushou/login` 获取 `uid`
2. 调 `POST /api/zhushou/index` 获取 `api_url` 等运行参数

无需手动设置 `GEO_UID`。⚠️ udid 无法自动提取（LevelDB block 压缩问题，见已知限制 #5），需用户手动提供。

## 可用命令

所有命令通过 `scripts/geo-cli.js` 执行。工作目录为 skill 根目录。

### 1. 登录测试

```bash
node scripts/geo-cli.js login
```

输出 JSON：`{ success: true/false, url: string }`

### 2. 查看账号权益

```bash
node scripts/geo-cli.js rights
```

返回：已收录数、账号有效期、剩余点数、余额等。

### 3. 创建AI诊断

```bash
# 仅填写表单（不提交，不扣费）
node scripts/geo-cli.js diagnose --brand 华为 --keywords 手机,Mate70

# 提交（扣费13元，需用户确认）
node scripts/geo-cli.js diagnose --brand 华为 --keywords 手机,Mate70 --submit
```

参数：
- `--brand`：品牌名称（必填）
- `--keywords`：行业关键词，逗号分隔（必填）
- `--platforms`：AI平台ID，逗号分隔，空则全选
- `--suggestion`：生成优化建议（扣费16元）
- `--submit`：实际提交（不加则只填表单）

### 4. 查看诊断报告

```bash
node scripts/geo-cli.js report
```

### 5. 查看关键词列表

```bash
node scripts/geo-cli.js keywords
```

### 6. 爆文复刻

```bash
# 仅填写，不提交
node scripts/geo-cli.js fuken --url https://mp.weixin.qq.com/xxx

# 提交（消耗点数，需用户确认）
node scripts/geo-cli.js fuken --url https://mp.weixin.qq.com/xxx --submit
```

⚠️ 不支持小红书链接。

### 7. 查看文章列表

```bash
node scripts/geo-cli.js articles
```

### 8. 全功能测试

```bash
node scripts/geo-cli.js test
```

遍历所有菜单页面，返回加载状态。

## Agent 使用规则

**⚠️ 用户偏好：浏览器操作必须可视化**
- **网页端 (Playwright)**：`scripts/geo-cli.js` 已配置 `headless: false`，浏览器窗口会可见
- **桌面客户端 (auth helper)**：`scripts/geo-client.py` 的 `push` 和 `ai-push` 命令已设置 `"my_headless": True`（注意：True=可见，参数名是反的），操作时浏览器窗口可见
- 如果用户反馈看不到浏览器操作，立即检查 `my_headless` 是否为 `True`（不是 False！）

**标准流程**：

1. **用户说"查权益/余额/额度"** → 执行 `rights`
2. **用户说"诊断/测一下 XXX 品牌"** → 解析品牌和关键词 → 执行 `diagnose`（不加 `--submit`）→ 展示填写结果 → 询问是否提交
3. **用户说"看诊断报告"** → 执行 `report`
4. **用户说"看关键词"** → 执行 `keywords`
5. **用户说"复刻这篇文章 URL"** → 验证URL → 执行 `fuken`（不加 `--submit`）→ 询问是否提交
6. **用户说"看文章列表"** → 执行 `articles`
7. **费用操作** → 先告知费用金额 → 获得用户明确确认 → 加 `--submit`

## 平台技术细节

详细的选择器映射和注意事项见 `references/platform-selectors.md`。

核心要点：
- 内容区在 `addtabs=1` 的 iframe 中
- 表格用 Bootstrap Table（不是原生 table）
- 删除/提交操作会弹 confirm 弹窗，脚本内已自动确认
- 每个操作独立启动浏览器，执行完关闭（无状态保持）

## 桌面客户端（Auth Helper）

除网页端外，GEO 还有桌面客户端 `D:\GEO cli\auth helper\auth helper.exe`，用于社媒分发和 AI 认证。

### 控制方式选择

| 方式 | 可行性 | 说明 |
|------|--------|------|
| PowerShell 代理 → Flask API | ✅ 推荐 | 100% 可靠，见 `scripts/geo-client.py` |
| WSL 直连 Flask | ❌ 被防火墙拦截 | localhost forwarding 被 360/火绒拦截 |
| Playwright CDP | ❌ 被安全软件拦截 | HTTP 端点超时，见下方 |
| Playwright Electron launch | ❌ firstWindow 超时 | 同上 |

### 客户端控制命令（geo-client.py）

```bash
# 检查客户端状态
python3 scripts/geo-client.py status

# 启动客户端
python3 scripts/geo-client.py start

# 社媒发布
python3 scripts/geo-client.py push       # 启动
python3 scripts/geo-client.py stop       # 停止
python3 scripts/geo-client.py logs <id>  # 查看日志

# AI 发布
python3 scripts/geo-client.py ai-push    # 启动
python3 scripts/geo-client.py ai-stop    # 停止

# 账号管理（需 GEO_UDID 环境变量）
python3 scripts/geo-client.py accounts   # 社媒账号列表
python3 scripts/geo-client.py platforms  # 支持的平台
```

环境变量配置：
```bash
export GEO_UDID="授权码"          # 必需
export GEO_USERNAME="4000761588"  # 默认
# GEO_UID 和 api_url 等会自动从远程 API 获取
```

### 双 API 架构（关键）

客户端有**两套后端**：
1. **本地 Flask (127.0.0.1:5000)** — 浏览器自动化（发布、认证）。WSL 必须通过 PowerShell 代理访问。
2. **远程服务器 (8.138.58.181)** — 管理类 API（账号列表、平台列表、登录验证）。WSL 可直接访问。

### CDP 被安全软件拦截（已知坑）

360/火绒/Defender 会拦截 Electron 的 CDP HTTP 端点：
- `--remote-debugging-port=9222` 能开端口，TCP 握手成功
- 但 HTTP `/json/version` 请求全部超时——安全软件在 HTTP 层面掐断响应
- WebSocket 能连上（日志显示 `<ws connected>`），但 Playwright 的 `firstWindow()` 和 `app.windows()` 超时
- **结论：这台机器上无法通过 CDP 控制 Electron 客户端，必须走 PowerShell 代理 + Flask API**

### 客户端能力（16 个社媒平台 + 8 个 AI 认证）

- **社媒分发**: B站、百家号、CSDN、抖音、简书、快手、企鹅号、搜狐号、视频号、头条号、微博、微信公众号、网易号、小红书、什么值得买、知乎
- **AI 认证**: deepseek、豆包、kimi、nami、通义千问、文心一言、元宝、智谱
- 客户端自带 playwright-core 做浏览器自动化

### 客户端 API 文档

完整的 Flask API 端点表（实测验证）、远程服务器端点表、push 请求体格式，见 `references/auth-helper-client.md`。

### 与知识库 Skill 联动

用户通过 `knowledge-base-articles` skill 创建品牌资料卡（模板：`knowledge-vault/_Templates/brand-card.md`），GEO skill 从知识库读取品牌数据用于：
- AI 可见度诊断的品牌名和关键词
- 爆文复刻的内容参考
- 文章生成的基础素材
- 社媒分发时的账号信息

## 已知限制（2026-06-27）

1. **可视化必须启用（用户硬性要求）**：
   - 用户明确反馈"为什么看不到浏览器操作？不应该默认是可视化的吗"
   - **网页端**：`scripts/geo-cli.js` 已设置 `headless: false`（第27行）
   - **桌面客户端**：`scripts/geo-client.py` 的 `push` 和 `ai_push` 已设置 `"my_headless": true`
   - **⚠️ `my_headless` 参数名是反的！** `True` = 显示浏览器窗口，`False` = 无头模式（不可见）
     - 原因：main.exe 的 `run_browser_script` 函数逻辑为 `if self.my_headless: _headless = False`（即 `my_headless=True` → `_headless=False` → 可见）
     - 验证方法：检查 Chrome 进程的 `MainWindowHandle != 0`（0 = 无窗口，>0 = 有窗口可见）
   - **修复步骤**：如果用户看不到浏览器，检查 `geo-client.py` 中 `my_headless` 是否为 `True`

2. **桌面客户端 push/ai-push 必须传完整参数**（2026-06-27 验证）：
   - 只传 `udid` 不够，远程 API 返回"网络异常"
   - **正确流程**：先调 `POST /api/zhushou/login`（username+password+udid）→ 拿到 `uid`，再调 `POST /api/zhushou/index` → 拿到 `api_url`
   - **push/ai_push 请求体必须包含** `uid`、`api_url`（来自 index 接口）
   - `agent_ip_url` 和 `agent_ip_username` 设为空字符串（国内 AI 平台不需要代理）
   - **已实现**：`geo-client.py` 的 `_resolve_credentials()` 函数自动完成此流程，设 `GEO_UDID` 即可
   - 验证成功的完整日志链：`【有需要查询的关键词】→ 正在打开主页 → 输入关键词 → ai输出文本中 → 点击深度思考 → 点击互联网搜索`
2. **articles 列偏移**：Bootstrap Table 的分类列(category)和标题列(title)顺序可能与预期不符，且数据重复（页面有两个 tbody）。需 dump 实际 DOM 确认列顺序后修。
2. **rights iframe 偶发未加载**：已修复。`getFrame()` 改为 async + 重试（15次，500ms间隔），等待 iframe 出现且内容非空后才返回。
3. **report 解析**：无实际诊断数据可测，空列表返回正确但表格解析逻辑未经实数据验证。
4. **表格分页**：Bootstrap Table 默认只返回第一页（通常10条），翻页未处理。
5. **udid/uid 无法自动提取**：Chromium localStorage 存在 LevelDB 中，SSTable block 压缩会把 JSON 值打碎（实测 `savedLoginData` 被截断为 `{"username":"4000761588","password":` + 二进制碎片）。**不要浪费时间手动解析 LevelDB**——直接问用户要授权码。

## Bootstrap Table 解析策略

奇计平台用 Bootstrap Table（不是原生 `<table>`），表格数据解析有两种策略，**必须先试 A 再回退 B**：

### 策略 A：DOM 解析（优先）

```javascript
let rows = await frame.evaluate(() => {
  const trs = document.querySelectorAll('table tbody tr, .fixed-table-body tbody tr');
  return Array.from(trs).map(tr => {
    let tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
    // 关键：Bootstrap Table 第一列是序号或checkbox，需要去掉
    if (tds.length > 0 && /^\d+$/.test(tds[0])) tds = tds.slice(1);
    return { col1: tds[0], col2: tds[1] };
  }).filter(r => r.col1 && !/^\d+$/.test(r.col1));  // 过滤掉序号行
});
```

### 策略 B：innerText 回退（A 失败时）

```javascript
const text = await frame.locator('body').innerText();
for (const line of text.split('\n')) {
  const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
    rows.push({ col1: parts[1], col2: parts[2] });  // 跳过 parts[0]（序号）
  }
}
```

### 常见坑

1. **列偏移**：Bootstrap Table 默认有 checkbox/序号列，直接 `tds[0]` 拿到的是序号不是数据。必须先检测并去掉序号列。
2. **重复数据**：`table` 和 `.fixed-table-body` 可能匹配到同一个 tbody，导致数据翻倍。用 `filter(r => r.keyword)` 去重。
3. **诊断报告页**：该页面的表格结构可能跟其他页面不同，innerText 回退法可能也返回空。需要实际有数据时再验证。

## 故障排查

| 问题 | 解决 |
|------|------|
| **看不到浏览器窗口（用户反馈）** | 先区分两种情况：① 网页端（geo-cli.js）检查第27行 `headless: false`；② 桌面客户端（geo-client.py）检查 `push`(~225行) 和 `ai_push`(~313行) 的 `"my_headless": false`。**桌面客户端额外注意**：即使配置正确，如果没有 `GEO_UDID`，`push`/`ai_push` 虽返回 task_id 且 status=running，但 Playwright 浏览器**不会弹出**——因为客户端无法从远程服务器(8.138.58.181)拉取发布数据。日志会显示"暂无发布数据"或"网络异常"。这不是可视化配置问题，是缺授权码。 |
| **geo-client.py 全命令崩溃 UnicodeDecodeError** | 中文 Windows 的 PowerShell 输出是 GBK(cp936) 编码。`subprocess.run(..., text=True)` 默认 UTF-8 解码会在中文字符处抛 `UnicodeDecodeError: 'utf-8' codec can't decode byte 0xce`，导致 `status`/`start`/`push` 等所有命令崩溃。**修复**：所有调用 powershell.exe 的 subprocess.run 改为 `capture_output=True`（去掉 `text=True`），再手动 `result.stdout.decode("gbk", errors="replace")`。文件中有多处（_ps_request + cmd_status 的两处 Get-Process），全部要改。 |
| 登录失败 | 检查 GEO_USERNAME/GEO_PASSWORD 环境变量 |
| `page.waitForTimeout: Target page...has been closed` | 页面导航时 waitForTimeout 崩溃。goHome/clickMenu 内已加 try-catch 兜底，若新代码也遇到，同样用 `try { await page.waitForTimeout(N); } catch {}` 包裹 |
| iframe 未加载 | 增加 `--timeout` 参数；rights 偶发"iframe未加载"是菜单选择器变动，检查 `references/platform-selectors.md` |
| Playwright 未安装 | `cd ~/.hermes/skills/qiji-geo && npm install` |
| 网络超时 | 确认能访问 geo.heikexia.cc，可能需要代理 |
| 表格解析全 undefined | Bootstrap Table 序号列偏移，见上方策略 A |
| 关键词列对调 | 第一列是序号不是关键词，用 `tds.slice(1)` 跳过 |
| 表格解析错位 | 第一列可能是序号或checkbox，用 `/^\d+$/` 检测并 slice |
| Flask API 全 404 | 端点可能走远程服务器(8.138.58.181)而非本地 Flask。POST `{}` 测：500=路由存在(bad body)，404=路由不存在。详见 `references/auth-helper-client.md` |
| udid/uid 获取 | ⚠️ **不要尝试从 Chromium LevelDB 提取**——SSTable block 压缩会打碎 JSON 值，提取不可靠。直接问用户要授权码，或读 `localStorage` via app UI |
| WSL 连不上 Flask:5000 | localhost forwarding 被安全软件拦截。必须用 PowerShell 代理（`geo-client.py` 已内置 `_ps_request()`） |
