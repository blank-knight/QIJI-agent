# 奇计离线包优化状态

> 最后更新：2026-07-09  
> 当前版本：Qiji-0.17.0-win-x64.exe（776MB）

---

## ✅ 已实施的优化

### 1. Move-OrCopy-Dir 优化（vendor 分发提速）

**问题：** vendor 分发阶段 robocopy 复制 2.3GB 数据，耗时 3-5 分钟。

**优化：** install.ps1 的 `Move-OrCopy-Dir` 函数检测同卷移动，用 `Move-Item` 替代 robocopy。同卷移动是元数据操作（<1ms），不复制文件内容。

**效果：** vendor 分发时间从 3-5 分钟 → <1 秒。

**实施文件：** `scripts/install.ps1` L114-158

---

### 2. Stage-VendorFiles 预装优化（跳过下载）

**问题：** 首次安装需下载 2GB+ 工具链，耗时 2-5 分钟。

**优化：** vendor 目录预装所有依赖，install.ps1 检测到 vendor 后跳过下载。

**vendor 包含：**
- bin/ (71MB) - uv.exe（Python 包管理器）
- chromium/ (420MB) - Playwright 浏览器引擎
- git/ (401MB) - PortableGit
- hermes-agent/ (118MB) - 后端源码
- nm/ (node_modules) - 前端依赖
- node/ (80MB) - Node.js 运行时
- python/ (200MB) - Python 解释器
- site-packages/ (500MB) - Python 依赖库
- tools/ - ripgrep + ffmpeg
- venv-scripts/ (15MB) - venv 激活脚本

**效果：** 安装时全部跳过下载，安装时间从 5-8 分钟 → 48-95 秒。

**实施文件：** `scripts/install.ps1` L168-461

---

### 3. vendor 瘦身优化（减少体积）

**问题：** vendor 包含大量无用文件（文档、测试、源码 map），体积 2.3GB，NSIS 压缩后 776MB。

**优化：** prepare-offline.ps1 在复制时排除无用文件（robocopy 内联排除）。

**排除内容：**
- .map 文件（dev map，部署不需要）
- .md/.markdown 文件（文档）
- test/tests 目录（测试代码）
- .git/.vscode/.idea 目录（开发配置）
- PortableGit 的 doc/man/info 目录（Git 文档）
- Node.js 的 docs 目录（Node 文档）

**效果：**
- vendor 原始体积：2.3GB → ~2.0GB
- NSIS 压缩后：775MB → 776MB（变化不大，因为已压缩）
- 文件数：99,184 → ~65,000

**实施文件：** `scripts/prepare-offline.ps1` L41-47, L49-54, L170-173

---

### 4. Playwright Chromium 版本清理（去除旧版本残留）

**问题：** Playwright 升级后残留旧版本 Chromium，vendor 膨胀 2GB（从 2.1GB → 4.1GB）。

**优化：** prepare-offline.ps1 按 base name 分组，只拷版本号最高的一份。

**效果：** vendor 恢复正常大小 2.1GB，exe 从 1580MB 降到 775MB。

**实施文件：** `scripts/prepare-offline.ps1` L124-136

---

### 5. uv trampoline 硬编码路径修复（安装后可启动）

**问题：** uv 生成的 trampoline 二进制文件（python.exe、hermes.exe 等）把编译机的 Python 路径硬编码在二进制内部，导致用户机器上找不到 Python（entity not found）。

**优化：** install.ps1 在 `Stage-VendorFiles` 复制 venv-scripts 后，用真正的 Python 解释器覆盖 trampoline，并复制依赖的 DLL。

**效果：** 安装后可以正常启动，不再出现 "entity not found" 或 "STATUS_DLL_NOT_FOUND" 错误。

**实施文件：** `scripts/install.ps1` L396-453

---

### 6. 品牌化源码修复（prepare-offline 优先用 fork 源码）

**问题：** prepare-offline.ps1 从已安装的上游 Hermes 复制源码，导致 vendor 永远是原版品牌名（"Hermes" 而非 "奇计"）。

**优化：** prepare-offline.ps1 优先从 fork 源码复制，确保品牌化文案正确。

**效果：** 离线包安装后品牌化文案正确。

**实施文件：** `scripts/prepare-offline.ps1` L62-72

---

## 📊 优化效果对比

### 安装时间

| 阶段 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| NSIS 解压 | 30-60 秒 | 30-60 秒 | - |
| vendor 分发 | 3-5 分钟 | <1 秒 | ✅ ~4 分钟 |
| git clone | 30-60 秒 | 0 秒 | ✅ 30-60 秒 |
| uv venv | 10-20 秒 | 0 秒 | ✅ 10-20 秒 |
| uv pip install | 60-120 秒 | 0 秒 | ✅ 60-120 秒 |
| npm install | 10-30 秒 | 0 秒 | ✅ 10-30 秒 |
| **总计** | **5-8 分钟** | **0.8-1.6 分钟** | ✅ **4-6 分钟** |

### 体积

| 指标 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| vendor 原始 | 2.3GB | 2.0GB | -0.3GB |
| NSIS 压缩后 | 775MB | 776MB | +1MB（可忽略） |
| 文件数 | 99,184 | ~65,000 | -34,184 |

---

## ⏳ 未实施的优化方案

### 1. vendor.7z 单包直解（方案 C）

**问题：** NSIS 解压 80,000 个小文件，Defender 扫描 80,000 次，导致 30-60 秒解压时间。

**优化：** 编译时把 vendor 压成 8 个 .7z 包，NSIS 只解压 8 个文件（<10 秒），安装时 7z 多线程解压到最终目录（30-60 秒）。

**预期收益：** 安装时间从 48-95 秒 → 40-70 秒，Defender 扫描从 80,000 次降到 8 次。

**状态：** 已设计方案（`optimization-plan-7z-vendor.md`），待实施。

**工程量：** 中等（需改 prepare-offline.ps1 + install.ps1 + electron-builder 配置）

---

### 2. 去掉 vendor/git

**问题：** vendor/git 占 401MB，NSIS 压缩后 200MB，安装时解压+复制耗时 8 秒。

**优化：** 移除 vendor/git，通过完整离线包更新（而非 git pull）。

**预期收益：**
- 体积：776MB → 576MB（省 200MB）
- 安装时间：48-95 秒 → 34-75 秒（省 14 秒）

**影响：**
- 失去 Hermes 自更新（hermes update）
- 失去 GitHub 相关技能（PR、Issues、代码审查）
- 失去 AI 编程助手（Codex、Claude Code、Opencode）
- 失去 terminal 工具集的 git 命令

**状态：** 已记录到 `TODOS.md` 作为备选项，适合纯最终用户场景。

---

## 🎯 结论

**当前离线包除了 Git 以外，已经做到了极致。**

主要瓶颈现在在 **NSIS 解压 80,000 个小文件**，这是 NSIS 本身的限制，不是配置问题。

要进一步优化只能：
1. 改用 vendor.7z 方案（工程量大）
2. 改用便携版分发（失去单文件便利性）
3. 去掉 Git（失去开发者功能）

**当前方案已是最优平衡点：776MB + 1-2 分钟安装 + 完整功能。**

---

## 📚 相关文档

- [BUILD-GUIDE.md](BUILD-GUIDE.md) - 离线包构建指南
- [how-it-works.md](how-it-works.md) - 离线包原理详解
- [bugs-and-pitfalls.md](bugs-and-pitfalls.md) - 踩坑记录
- [optimization-plan-7z-vendor.md](optimization-plan-7z-vendor.md) - vendor.7z 方案设计
- [brand-customization.md](brand-customization.md) - 品牌化指南
- [ui-customization-guide.md](ui-customization-guide.md) - UI 自定义指南