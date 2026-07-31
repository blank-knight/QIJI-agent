# 品牌化脚本使用指南

> 两个脚本：
> - **`generate_brand.py`** — 贴牌商什么都不提供时，一键生成全套品牌资产（起名 + Logo + 图标 + 配置）。
> - **`apply_brand.py`** — 把品牌配置应用到上游代码（7层替换）。
>
> **第二层：主题与 UI 定制**（颜色/字体/布局组合）通过模板素材库拼装，见下方"第二层"小节。
> 完整定制体系说明见 [`docs/offline-build/brand-customization.md`](../../docs/offline-build/brand-customization.md)。

---

## 零输入一键生成（generate_brand.py）

当贴牌商不提供任何素材时，用这个脚本自动生成。

### 用法

```bash
# 完全自动：起名 + AI 生成 Logo + 生成配置
python scripts/brand/generate_brand.py

# 指定品牌名（跳过起名）
python scripts/brand/generate_brand.py --name 黑镜

# 指定品牌名 + 英文名 + 配色
python scripts/brand/generate_brand.py --name 黑镜 --name-en HeiMirror --palette midnight

# 从本地图片导入 Logo（跳过 AI 生成，适合外部工具/Midjourney 生成的图）
python scripts/brand/generate_brand.py --name 黑镜 --logo-source ./my-logo.png

# 只看名字候选
python scripts/brand/generate_brand.py --name-only
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--name` | 品牌名（不填则自动起名） | — |
| `--name-en` | 英文名（不填则从拼音推断，需 pypinyin） | — |
| `--palette` | 配色模板 | `teal` |
| `--logo-source` | 本地 Logo 图片路径（跳过 AI 生成） | — |
| `--logo-count` | AI 生成 Logo 候选数量 | 4 |
| `--portal-url` | 中转站 URL | `https://www.aicps.vip` |
| `--no-interactive` | 非交互模式（自动选第一个候选） | false |

### 输出

```
scripts/brand/brands/{brand-id}.json     — 品牌配置（直接喂给 apply_brand.py）
scripts/brand/assets/{brand-id}/         — 全套图标
  ├── icon.ico          (Windows, 多尺寸)
  ├── icon.icns         (macOS)
  ├── icon.png          (512×512)
  ├── apple-touch-icon.png (180×180)
  └── {brand-id}-logo.png (256×256)
```

### Logo 生成方式

1. **AI 生成（默认）**：调 image_gen provider（FAL/xAI/OpenAI）生成 N 个候选，交互式筛选。需要先配好 `hermes tools` → Image Generation。
2. **本地导入**：`--logo-source` 指定图片，适合用 Midjourney/外部工具生成的 Logo。

### 依赖

- **Pillow**（核心依赖，已内置）— 图标裁剪
- **pypinyin**（可选）— 从中文名推断英文名。没装时用 `--name-en` 手动指定，或 `pip install pypinyin`

---

## 应用品牌到代码（apply_brand.py）

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

### 4. 执行品牌化（第一层）

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

### 7. （可选）执行第二层：主题与 UI 定制

见下方"第二层：主题与 UI 定制"小节。

---

## 二次品牌化（从已品牌化仓库出发）

如果仓库已经品牌化过（如奇计），想换成另一个品牌（如黑镜），用 `--source-brand`：

```bash
# 从奇计仓库 → 黑镜
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/heimirror.json \
  --repo . \
  --source-brand qiji

# 从上游 Hermes → 黑镜（默认，不需要 --source-brand）
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/heimirror.json \
  --repo .
```

`--source-brand` 会先执行 **第0层：通用品牌名替换**，把源品牌名（奇计/Qiji）替换为目标品牌名（黑镜/HeiMirror），覆盖 apps/desktop/src、hermes_cli、skills 下所有文件。然后再执行常规的 1-7 层。

支持的源品牌：`qiji`（奇计）、`hermes`（上游 Hermes）。

---

## 随机主题生成

每次品牌化时随机生成一套主题（配色 + 字体 + 布局 + 明暗模式任意组合）：

```bash
# apply_brand.py 随机主题
python scripts/brand/apply_brand.py \
  --config scripts/brand/brands/heimirror.json \
  --repo . \
  --random-theme

# generate_brand.py 随机主题
python scripts/brand/generate_brand.py --name 黑镜 --name-en HeiMirror --random-theme
```

随机组合维度：

| 维度 | 可选值 |
|------|--------|
| 配色 | teal / midnight / ember / mono / cyberpunk / rose / nous-blue / slate |
| 字体 | system / serif / rounded |
| 明暗模式 | light / dark / auto |
| 布局密度 | normal / compact / large |

每次运行结果不同，共 8×3×3×3 = 216 种组合。

---

## 第一层自动覆盖的 6 个子层

| 子层 | 内容 | 自动化 |
|----|------|--------|
| 0 | 通用品牌名替换（二次品牌化，`--source-brand`） | ✅ |
| 1.1 | package.json (productName, appId 等) | ✅ |
| 1.2 | 图标资源 (icon.ico, icon.png 等) | ❌ 手动 |
| 1.3 | i18n 国际化 (zh.ts, en.ts, zh-hant.ts, ja.ts) | ✅ |
| 1.4 | Python 后端 (web_server.py, setup.py) | ✅ |
| 1.5 | Portal URL (6个Python文件, 13处) | ✅ |
| 1.5b | 前端组件品牌名 | ✅ (部分) |
| 1.6 | install.ps1 品牌化 + vendor 强制覆盖 | ✅ |
| 1.7 | skills/ 品牌名文案（qiji-geo 等） | ✅ |
| 2 | 主题 YAML 生成（配色+字体+布局） | ✅ |

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

## 第二层：主题与 UI 定制（可选）

第一层只换品牌身份。如果贴牌商还需要差异化的视觉风格（颜色/字体/明暗/密度），走第二层。

### 工作流

1. 贴牌商从模板素材库选四个维度（见品牌配置的 `theme` 字段）：
   - **配色（palette）：** `teal` / `nous-blue` / `midnight` / `ember` / `mono` / `cyberpunk` / `rose`
   - **字体（typography）：** `system`（默认）或 `custom`（需提供 `fontUrl`）
   - **明暗模式（mode）：** `light` / `dark` / `auto`
   - **布局密度（density）：** `normal` / `large`
2. 在品牌配置 JSON 的 `theme` 字段填入选择（见 `template.json`）。
3. 运行 `apply_brand.py`，脚本会从模板库拼装出一份 YAML 主题文件。
4. 脚本自动写入 `~/.hermes/dashboard-themes/{brand-id}.yaml`，并设为活动主题。
5. 桌面端下次启动即应用，**无需重新编译**。

### 配置示例

```json
{
  "name_cn": "黑镜",
  "theme": {
    "palette": "midnight",
    "typography": "system",
    "mode": "auto",
    "density": "normal"
  }
}
```

### 模板素材库位置

配色模板来自桌面端内置主题（`apps/desktop/src/themes/presets.ts`），每份都已校验对比度和暗色回归。**不开放裸 CSS 编辑**——贴牌商只能从预置模板里选，避免拼接出不可读的配色。

> 详细维度说明、主题系统架构见 [`docs/offline-build/brand-customization.md`](../../docs/offline-build/brand-customization.md) "第二层"章节。

---

## 新增品牌流程

1. `cp scripts/brand/brands/template.json scripts/brand/brands/new-brand.json`
2. 编辑 `new-brand.json`（含第一层品牌信息 + 可选的第二层 `theme` 字段）
3. Fresh clone 上游
4. `python apply_brand.py --config brands/new-brand.json --repo .`
5. 手动处理图标 + OAuth
6. （可选）确认第二层主题 YAML 已生成到 `~/.hermes/dashboard-themes/`
7. 编译

---

## 注意事项

- 脚本设计为在 **上游 fresh checkout** 上运行
- 如果在已品牌化的 fork 上重复运行，某些替换不会匹配（因为旧值已变）
- `--dry-run` 预览不会写入文件
- `--verify` 检查残留的旧品牌名，零命中才算成功
- i18n 替换使用 `\bHermes\b` 正则，不会触碰 camelCase 标识符（如 `startingHermesDesktop`）
- 代码标识符（HERMES_HOME, hermes_cli 等）**不会被替换**，这是正确的
