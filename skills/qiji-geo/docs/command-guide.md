# 命令指南

> 所有命令的完整用法、参数、示例和注意事项。

---

## 环境准备

```bash
# 安装 Playwright
cd ~/.hermes/skills/qiji-geo && npm install
```

环境变量（~/.hermes/.env）：
```
GEO_USERNAME=4000761588
GEO_PASSWORD=4000761588
GEO_UDID=授权码        # 桌面客户端用，从客户端登录界面获取
GEO_UID=用户ID         # 远程 API 登录后返回
```

---

## 浏览器模式

所有 `geo-cli.js` 命令通用：
- **默认可视化** — 显示浏览器窗口，用户可观看操作过程
- **--headless** — 无头模式，后台运行，速度更快
- **GEO_HEADLESS=true** — 环境变量也能切换无头模式

```bash
# 可视化（默认）
node scripts/geo-cli.js login

# 无头
node scripts/geo-cli.js login --headless
```

用户说"后台运行"/"不用看"/"无头模式"时加 `--headless`。

---

## 网页端命令（geo-cli.js）

### 1. 登录测试

```bash
node scripts/geo-cli.js login
```
返回：`{ success: true/false, url: string }`

### 2. 查看账号权益

```bash
node scripts/geo-cli.js rights
```
返回：已收录数、账号有效期、剩余点数、余额等。
**免费，可直接执行。**

### 3. 创建AI诊断

```bash
# 仅填写表单（不提交，不扣费）
node scripts/geo-cli.js diagnose --brand 华为 --keywords 手机,Mate70

# 提交（扣费13元，需用户确认）
node scripts/geo-cli.js diagnose --brand 华为 --keywords 手机,Mate70 --submit

# 含优化建议（扣费16元）
node scripts/geo-cli.js diagnose --brand 华为 --keywords 手机,Mate70 --submit --suggestion
```

| 参数 | 说明 | 必填 |
|------|------|------|
| `--brand` | 品牌名称 | 是 |
| `--keywords` | 行业关键词，逗号分隔 | 是 |
| `--platforms` | AI平台ID，逗号分隔，空则全选 | 否 |
| `--suggestion` | 生成优化建议（16元） | 否 |
| `--submit` | 实际提交（不加则只填表单） | 否 |

### 4. 查看诊断报告

```bash
node scripts/geo-cli.js report
```
**免费。** 注意：无实际诊断数据时返回空列表，表格解析逻辑未经实数据验证。

### 5. 查看关键词列表

```bash
node scripts/geo-cli.js keywords
```
**免费。** 注意 Bootstrap Table 列偏移问题（见 bugs-and-pitfalls.md 坑1）。

### 6. 爆文复刻

```bash
# 仅填写，不提交
node scripts/geo-cli.js fuken --url https://mp.weixin.qq.com/xxx

# 提交（消耗点数，需用户确认）
node scripts/geo-cli.js fuken --url https://mp.weixin.qq.com/xxx --submit
```

⚠️ **不支持小红书链接。**

### 7. 查看文章列表

```bash
node scripts/geo-cli.js articles
```
**免费。** 注意：Bootstrap Table 可能有重复 tbody 导致数据翻倍（坑1）。

### 8. 全功能测试

```bash
node scripts/geo-cli.js test
```
遍历所有菜单页面，返回加载状态。

---

## 桌面客户端命令（geo-client.py）

桌面客户端路径：`D:\GEO cli\auth helper\auth helper.exe`

所有命令通过 PowerShell 代理访问本地 Flask:5000（WSL 直连被拦截）。

### 客户端状态

```bash
python3 scripts/geo-client.py status    # 检查 Flask 是否在线
python3 scripts/geo-client.py start     # 启动客户端
```

### 社媒发布（push）

```bash
python3 scripts/geo-client.py push      # 启动社媒发布
python3 scripts/geo-client.py stop      # 停止
python3 scripts/geo-client.py logs <id> # 查看日志
```

### AI 发布（ai-push）

```bash
python3 scripts/geo-client.py ai-push   # 启动 AI 发布
python3 scripts/geo-client.py ai-stop   # 停止
```

⚠️ ai_push 需要完整请求体（9个字段），不能只传 `{udid, uid}`。

### 账号管理

```bash
python3 scripts/geo-client.py accounts  # 社媒账号列表（需 GEO_UDID）
python3 scripts/geo-client.py platforms # 支持的平台
```

### 16 个社媒平台

B站、百家号、CSDN、抖音、简书、快手、企鹅号、搜狐号、视频号、头条号、微博、微信公众号、网易号、小红书、什么值得买、知乎

### 8 个 AI 认证

deepseek、豆包、kimi、nami、通义千问、文心一言、元宝、智谱

---

## 费用一览

| 操作 | 费用 | 确认要求 |
|------|------|----------|
| AI诊断（仅诊断） | 13元/次 | 需用户确认 |
| AI诊断（含建议报告） | 16元/次 | 需用户确认 |
| AI写作 | 消耗点数 | 需用户确认 |
| 文章发布 | 消耗点数 | 需用户确认 |
| 爆文复刻 | 消耗点数 | 需用户确认 |
| 查看报告/关键词/权益/文章 | 免费 | 可直接执行 |

---

## 命令路由规则（Agent 自动判断）

| 用户说什么 | 执行什么 |
|-----------|---------|
| "查权益/余额/额度" | `rights` |
| "诊断/测一下 XXX 品牌" | 解析品牌+关键词 → `diagnose`（不加 --submit）→ 展示 → 询问是否提交 |
| "看诊断报告" | `report` |
| "看关键词" | `keywords` |
| "复刻这篇文章" | 验证URL → `fuken`（不加 --submit）→ 询问是否提交 |
| "看文章列表" | `articles` |
| 涉及费用 | 先告知金额 → 获得确认 → 加 `--submit` |
