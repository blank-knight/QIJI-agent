# 品牌化脚本使用指南

## 快速开始

### 1. 从上游 fresh checkout 开始

```bash
git clone https://github.com/NousResearch/hermes-agent.git my-brand
cd my-brand
```

### 2. 创建品牌配置

```bash
cp scripts/brand/brands/template.json scripts/brand/brands/my-brand.json
# 编辑 my-brand.json，填入你的品牌信息
```

### 3. 预览（dry-run）

```bash
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/my-brand.json \
  --repo . \
  --dry-run
```

### 4. 执行品牌化

```bash
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/my-brand.json \
  --repo .
```

### 5. 验证

```bash
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/my-brand.json \
  --repo . \
  --verify
```

### 6. 手动处理脚本无法自动化的部分（见下方）

---

## 自动覆盖的 6 层

| 层 | 内容 | 自动化 |
|----|------|--------|
| 1 | package.json (productName, appId 等) | ✅ |
| 2 | 图标资源 (icon.ico, icon.png 等) | ❌ 手动 |
| 3 | i18n 国际化 (zh.ts, en.ts, zh-hant.ts, ja.ts) | ✅ |
| 4 | Python 后端 (web_server.py, setup.py) | ✅ |
| 5 | Portal URL (6个Python文件, 13处) | ✅ |
| 5.5 | 前端组件品牌名 | ✅ (部分) |
| 6 | install.ps1 品牌化 + vendor 强制覆盖 | ✅ |

---

## 需要手动处理的 3 件事

### 手动步骤 1：图标资源

替换以下文件为你的品牌图标：

```
apps/desktop/assets/icon.ico         # Windows exe 图标（多尺寸）
apps/desktop/assets/icon.icns        # macOS 图标
apps/desktop/public/icon.png         # 通用图标（512×512）
apps/desktop/public/apple-touch-icon.png  # favicon（180×180）
apps/desktop/public/{brand_logo}     # 品牌 Logo（256×256，配置文件中的 brand_logo）
```

删除旧品牌图标（如有）：
```bash
rm apps/desktop/public/hermes*.png
rm apps/desktop/public/nous*.jpg
```

### 手动步骤 2：OAuth → openExternal

如果品牌的订阅站没有实现 Nous 的 OAuth device code 接口，
需要拦截 `nous` provider 的点击行为，改为直接打开浏览器。

**文件 1：`apps/desktop/src/components/desktop-onboarding-overlay.tsx`**

在 `select` 函数中，当 `p.id === FEATURED_ID`（即 nous）时：
```typescript
// 替换 startProviderOAuth 调用为：
if (p.id === FEATURED_ID) {
  window.hermesDesktop?.openExternal?.('{portal_url}/')
  return
}
```

**文件 2：`apps/desktop/src/app/settings/providers-settings.tsx`**

同理，当 `p.id === 'nous'` 时：
```typescript
if (p.id === 'nous') {
  window.hermesDesktop?.openExternal?.('{portal_url}/')
  return
}
```

### 手动步骤 3：人格文件（可选）

如需预装人格，创建 SOUL.md 放到：
```
apps/desktop/build/preinstalled/
```

---

## 新增品牌流程

1. `cp scripts/brand/brands/template.json scripts/brand/brands/new-brand.json`
2. 编辑 `new-brand.json`
3. Fresh clone 上游
4. `python apply_brand.py --config brands/new-brand.json --repo .`
5. 手动处理图标 + OAuth
6. 编译

---

## 注意事项

- 脚本设计为在 **上游 fresh checkout** 上运行
- 如果在已品牌化的 fork 上重复运行，某些替换不会匹配（因为旧值已变）
- `--dry-run` 预览不会写入文件
- `--verify` 检查残留的旧品牌名，零命中才算成功
- i18n 替换使用 `\bHermes\b` 正则，不会触碰 camelCase 标识符（如 `startingHermesDesktop`）
- 代码标识符（HERMES_HOME, hermes_cli 等）**不会被替换**，这是正确的
