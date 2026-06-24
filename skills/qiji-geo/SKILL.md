---
name: qiji-geo
description: "奇计GEO平台自动化。用自然语言操作 geo.heikexia.cc：AI可见度诊断、诊断报告、关键词管理、爆文复刻、文章列表、账号权益查询。当用户提到奇计、GEO诊断、AI可见度、品牌诊断、geo.heikexia 时加载。"
version: 1.0.0
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

在 `~/.hermes/.env` 中设置（或使用默认测试账号）：

```
GEO_USERNAME=4000761588
GEO_PASSWORD=4000761588
```

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

## 已知限制（2026-06-18）

1. **articles 列偏移**：Bootstrap Table 的分类列(category)和标题列(title)顺序可能与预期不符，且数据重复（页面有两个 tbody）。需 dump 实际 DOM 确认列顺序后修。
2. **rights 部分字段未匹配**：已收录数/有效期/点数/余额 ✅，但主关键词额度/写作问题额度/AI写作数量/文章发布额度 ❌（正则未命中实际页面文字）。
3. **report 解析**：无实际诊断数据可测，空列表返回正确但表格解析逻辑未经实数据验证。
4. **表格分页**：Bootstrap Table 默认只返回第一页（通常10条），翻页未处理。

## Bootstrap Table 解析模式（核心技巧）

奇计平台所有表格用 Bootstrap Table，不是原生 `<table>`。直接按 `tds[0]=id, tds[1]=col1` 映射会错位，因为第一列通常是复选框或序号。

正确模式（已在 geo-cli.js 中使用）：
```javascript
let tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
// 去掉序号列
if (tds.length > 0 && /^\d+$/.test(tds[0])) tds = tds.slice(1);
// 过滤掉无效行
.filter(r => r && r.fieldName && !/^\d+$/.test(r.fieldName));
```

回退策略：innerText + tab 分隔解析（当 DOM 解析返回空时）。

## 故障排查

| 问题 | 解决 |
|------|------|
| 登录失败 | 检查 GEO_USERNAME/GEO_PASSWORD 环境变量 |
| iframe 未加载 | 增加 `--timeout` 参数 |
| Playwright 未安装 | `cd ~/.hermes/skills/qiji-geo && npm install && npx playwright install chromium` |
| 网络超时 | 确认能访问 geo.heikexia.cc，可能需要代理 |
| 表格解析错位 | 第一列可能是序号或checkbox，用 `/^\d+$/` 检测并 slice |
