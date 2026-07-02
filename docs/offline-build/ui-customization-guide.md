# UI 改动对照表

> 改代码哪个位置 → 界面上对应什么效果。便于手动微调 UI。
>
> 品牌整体替换（名称/图标/链接/Portal URL）见 [`brand-customization.md`](./brand-customization.md)。

---

## 新建会话首页

### "奇计"标题

**界面位置：** 新建会话时，页面中央的大标题

| 文件 | 行号 | 代码 | 改什么 |
|------|------|------|--------|
| `src/components/chat/intro.tsx` | 170 | `style={{ '--fit-min': '2.75rem' }}` | 字号，`2.75rem`≈44px → `2rem`≈32px |
| `src/components/chat/intro.tsx` | 145 | `const WORDMARK = '奇计'` | 标题文字 |
| `src/components/chat/intro.tsx` | 169 | `className="... font-bold ..."` | 粗细，`font-bold`→`font-semibold`（细一点） |

### 欢迎语（标题下方副标题）

**界面位置：** 标题下方一行说明（如"发个问题或任务，我会理解你的意图并开始工作。"）

| 文件 | 说明 |
|------|------|
| `src/components/chat/intro-copy.jsonl` | 随机欢迎语，按人格分组，改内容直接生效 |
| `src/components/chat/intro.tsx` L21-42 | `FALLBACK_COPY` 兜底数组（jsonl 解析失败时用） |

---

## 任务栏 / 窗口图标

**界面位置：** Windows 任务栏、Alt+Tab、窗口图标

三个文件必须**同时替换**，只换一个会不一致：

| 文件 | 用途 |
|------|------|
| `public/apple-touch-icon.png` | dev 模式任务栏图标、favicon、关于页头像（`main.cjs` L385-389） |
| `public/icon.png` | 打包后 exe 图标 |
| `public/qiji-brand.png` | BrandMark 组件、推荐 provider 行 |

> 完整图标替换流程（含 .ico/.icns）见 [`brand-customization.md`](./brand-customization.md) 第2层。

---

## 提供方页面 — 奇计云链接

**界面位置：** 设置→提供方→点击奇计云的跳转链接

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/app/settings/constants.ts` | 45 | `docsUrl` — "了解更多"链接 |
| `src/components/desktop-onboarding-overlay.tsx` | 556 | 图标 `qiji-brand.png` |

> ⚠️ 点击"连接"按钮的 OAuth 跳转链接在 **Python 后端**（13处），详见 [`brand-customization.md`](./brand-customization.md) 第5层。

---

## （后续改动持续追加到这里）
