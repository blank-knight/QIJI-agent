# 奇计GEO平台 CSS 选择器速查表

> 2026-06-17，基于 geo.heikexia.cc 实际页面结构

## 核心架构

```
主页面 (geo.heikexia.cc)
├── aside (左侧导航栏)
│   └── a:has-text("菜单名") → 点击切换内容
├── 右侧内容区
│   └── iframe[src*="addtabs=1"]  ← 所有功能页内容都在这里
│       ├── Bootstrap Table 表格
│       ├── layui 弹窗（爆文复刻等）
│       │   └── iframe[src*="/user/xxx/add"]  ← 弹窗内还有一层iframe
│       └── confirm() 弹窗（删除/提交确认）
└── 多标签页（每次点菜单会在新tab加载）
```

## 通用选择器

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 内容 iframe | `page.frames().find(f => f.url().includes('addtabs=1'))` | **核心**，所有操作都要先获取 |
| 侧边栏菜单 | `aside a:has-text("菜单名")` | 先点父菜单展开，再点子菜单 |
| 首页按钮 | `aside a:has-text("首页")` | 重置状态用 |

## 登录页

| 元素 | 选择器 |
|------|--------|
| 账号输入框 | `page.getByPlaceholder(/账号\|手机/)` |
| 密码输入框 | `page.getByPlaceholder(/密码/)` |
| 登录按钮 | `page.getByRole('button', { name: /登.*录/i })` |

## AI可见度诊断

| 元素 | 选择器 | 备注 |
|------|--------|------|
| 品牌输入框 | `.key > input` | React风格输入，需用 setter 触发 input 事件 |
| AI模型项 | `.zhenduan-border` | 选中态加 class `.select-border-bar` |
| 行业关键词输入框 | `.brand > input` | 输入后按 Enter 生成 span 标签 |
| 关键词标签 | `.brand > span` | 已添加的关键词 |
| 提交按钮 | `.query-button` | 点击后弹 confirm |

### 填写品牌的特殊方式

奇计用了 React/Vue 双向绑定，直接 `.fill()` 不生效，需要用 setter：

```javascript
await frame.evaluate((brand) => {
  const input = document.querySelector('.key > input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, brand);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, brand);
```

## 表格解析

奇计用 Bootstrap Table，有两种解析策略：

### 策略1：标准 DOM 解析（优先）

```javascript
const rows = await frame.evaluate(() => {
  const trs = document.querySelectorAll('table tbody tr, .fixed-table-body tbody tr');
  return Array.from(trs).map(tr => {
    const tds = tr.querySelectorAll('td');
    return { col1: tds[0]?.textContent.trim(), /* ... */ };
  });
});
```

### ⚠️ Bootstrap Table 列偏移 Bug（已修）

Bootstrap Table 的第一列是自动生成的序号列（1, 2, 3...）或 checkbox 列，
不是数据列。直接按 `tds[0]=id, tds[1]=keyword` 映射会导致**所有列错位**。

症状：keyword 字段显示"1"，questionCount 显示"培训机构"（关键词跑到了下一列）。

正确做法（已在 geo-cli.js 中使用）：
```javascript
let tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
// 去掉序号列（第一列如果是纯数字）
if (tds.length > 0 && /^\d+$/.test(tds[0])) tds = tds.slice(1);
// 映射剩下的列
if (tds.length >= 2) return { keyword: tds[0], questionCount: tds[1] };
// 过滤空行：keyword 不能是纯数字（排除空数据行）
.filter(r => r && r.keyword && !/^\d+$/.test(r.keyword));
```

同时需要注意：某些页面有两个 `<tbody>`（如文章列表），会返回重复数据。
如有重复，取 `rows[0..rows.length/2]` 或用 Set 去重。

### 策略2：innerText 回退

```javascript
const text = await frame.locator('body').innerText();
// 数据行用 \t 分隔
const parts = line.split('\t').map(p => p.trim());
```

## 爆文复刻弹窗

爆文复刻使用 layui iframe 嵌套：

| 元素 | 选择器 | 所在 frame |
|------|--------|-----------|
| 添加按钮 | `a.btn-add` | 主内容frame |
| 链接输入框 | `input[name="row[weixin_url]"]` | 弹窗iframe |
| 图库选择 | `select[name="row[image_type_id]"]` | 弹窗iframe |
| 改写指令 | `select[name="row[user_zhiling_id]"]` | 弹窗iframe |
| 提交按钮 | `button:has-text("归类文章")` | 主内容frame（layui-layer内）|

弹窗 iframe URL 包含 `/user/weixin_baowen/add`。

## 已知坑

1. **React/Vue 输入框**：品牌输入框不能用 `.fill()`，必须用原生 setter + `dispatchEvent`
2. **AI模型选择**：不是 checkbox，是通过加/移除 CSS class 来表示选中
3. **confirm 弹窗**：提交/删除操作会弹 `confirm()`，需要在提交前覆盖：
   ```javascript
   await frame.evaluate(() => { window.confirm = () => true; });
   ```
4. **多标签页**：每次点菜单会新开 tab，但当前实现用同一个 iframe，所以需要先 `goHome()` 重置
5. **等待时间**：iframe 加载不触发主页面事件，必须用 `waitForTimeout` 而非 `waitForLoadState`
6. **表格分页**：Bootstrap Table 默认只显示第一页（通常10-15条），翻页需要额外处理
