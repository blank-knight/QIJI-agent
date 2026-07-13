# 编译测试手册

> 完整踩坑记录见 [bugs-and-pitfalls.md](bugs-and-pitfalls.md)

## 为什么必须在 Windows 编译

编译的是 Windows exe，需要 Windows 原生工具链：

1. **native 模块不兼容** — node-pty 的 .node 二进制在 WSL (Linux ext4) 上装的是 Linux 版，Windows electron 加载不了
2. **electron-builder 要 Windows 版 electron** — electron/dist 里是 Windows 的 chrome.exe
3. **跨文件系统 I/O 极慢** — powershell.exe 通过 `\\wsl.localhost\` 访问 WSL 路径，走 9P 协议，52万文件的 node_modules 不可用

结论：WSL 里改代码，robocopy 同步到 Windows NTFS，在 Windows 编译。

---

## 核心概念：vendor 与离线安装

### 什么是 vendor？

奇计的安装包号称"离线安装"——用户双击安装后不需要联网下载任何东西。这靠的是 **vendor 目录**：一个提前打包好的工具链快照。

普通用户的电脑上大概率没装 Python、Node.js、Git、ripgrep 这些开发工具。正常安装流程得从网上一个个下载。vendor 就是**提前把这些东西全部下载好，塞进安装包里**，安装时直接拷到用户电脑上，零网络下载。

vendor 目录结构（9 个子目录）：

```
vendor\
├── bin\           ← uv.exe（Python 包管理器）
├── chromium\      ← 内嵌浏览器引擎（Playwright）
├── git\           ← PortableGit（git + bash + coreutils）
├── hermes-agent\  ← 后端 Python 源码（含品牌化改动）
├── nm\            ← node_modules（前端依赖，812 个包）
├── node\          ← Node.js 运行时
├── python\        ← Python 解释器
├── site-packages\ ← Python 依赖库（240 个包）
├── tools\         ← ripgrep + ffmpeg
└── venv-scripts\  ← venv 激活脚本
```

安装包 708MB 里绝大部分（~650MB）就是 vendor。编译时 electron-builder 通过 `extraResources` 配置把整个 vendor 目录打包进 exe。

### 第3步 prepare-offline.ps1 干了什么？

vendor 不是手动维护的——它是 `prepare-offline.ps1` 脚本**从开发机上自动收割**的快照。

```
开发机工具链目录                    vendor 目录
AppData\Local\hermes\               apps\desktop\build\vendor\
  bin\uv.exe          ──收割──►      bin\uv.exe
  git\                ──收割──►      git\
  node\               ──收割──►      node\
  tools\              ──收割──►      tools\
  hermes-agent\venv\  ──收割──►      python\ + site-packages\ + venv-scripts\
  hermes-agent\       ──收割──►      hermes-agent\
  hermes-agent\       ──收割──►      nm\
                     prepare-offline.ps1
```

**数据流向：**

```
[开发机] AppData\Local\hermes\（工具链）
    │
    │  prepare-offline.ps1 -HermesHome ... -VendorDir ...
    │  （约 5 分钟，从工具链拷贝到 vendor）
    ▼
[编译目录] apps\desktop\build\vendor\（打包前的快照）
    │
    │  npm run dist:win:nsis
    │  （electron-builder 打包，约 15 分钟）
    ▼
[安装包] Qiji-0.17.0-win-x64.exe（708MB）
    │
    │  用户安装时 install.ps1 -VendorDir ...
    │  （从 vendor 拷贝到用户电脑，零下载）
    ▼
[用户电脑] AppData\Local\hermes\（全新工具链）
    ├── hermes-agent\    ← 后端源码 + venv
    ├── python\          ← ★ Python 解释器（新架构：不进 uv store）
    ├── git\, node\, ...
    └── bin\uv.exe
```

**因此第3步是否需要跑，取决于工具链有没有变：**

| 改动类型 | 需要跑第3步？ | 原因 |
|----------|-------------|------|
| 改了 Python 后端代码 / 品牌化文案 | ✅ | vendor 里的 hermes-agent\ 源码是旧的 |
| 升级了 Python / Node / 依赖版本 | ✅ | vendor 里的运行时是旧版 |
| 只改了前端代码（tsx/ts） | ⏭️ 跳过 | 前端不经 vendor，由 Vite 直接打包 |
| 工具链没变，只是重新编译 | ⏭️ 跳过 | vendor 复用上次的快照即可 |

> ⚠️ **如果跳过了第3步，必须确保现有 vendor 完整**（9 个子目录都有内容）。
> 如果 vendor 缺了某个目录（比如 node\），安装时就会去网上下载——离线安装就失败了。
> 验证方法：`Test-Path "apps\desktop\build\vendor\node\node.exe"` 应返回 True。

### -HermesHome 目录是什么？

`C:\Users\84673\AppData\Local\hermes\` 是 **hermes CLI 的工具链目录**，不是桌面 app 的安装目录。

它是 `prepare-offline.ps1` 的数据源——脚本从这里收割 uv、git、node、python、site-packages 等工具。

**这个目录不要随意删除。** 如果误删了：
- vendor 无法重新生成（第3步会失败或产出不完整）
- 但不影响已有 vendor 目录（在编译目录 `apps\desktop\build\vendor\` 下）
- 恢复方法：重装 hermes CLI
  ```powershell
  iex (irm https://hermes-agent.nousresearch.com/install.ps1)
  ```

---

## 前置条件（首次只做一次）

```powershell
# 1. 同步 WSL fork 到 Windows 编译副本
robocopy "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" "C:\Users\84673\qiji-fork" /MIR /XJ /XD ".git" "venv" "__pycache__" "node_modules" ".venv" "release" "dist" "build" /XF "*.pyc" "*.pyo" /NJH /NJS /NFL /NDL /NP /R:1 /W:1

# 2. 安装依赖
cd C:\Users\84673\qiji-fork
pip install -e .
cd apps\desktop && npm install
```

之后每次编译只需要走下面的标准流程。

---

## 编译离线包完整流程（每次）

> ⚠️ 下面 5 步必须按顺序执行，缺任何一步都可能产出无效安装包。

### 第1步：同步代码

```powershell
robocopy "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" "C:\Users\84673\qiji-fork" /MIR /XJ /XD ".git" "venv" "__pycache__" "node_modules" ".venv" "release" "dist" "build" /XF "*.pyc" "*.pyo" /NJH /NJS /NFL /NDL /NP /R:1 /W:1
```

### 第2步：修复 ps1 编码（★坑1）

robocopy 会把 ps1 文件变成 LF 编码，PowerShell 5.1 无法解析。**每次同步后必须执行：**

```powershell
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = "C:\Users\84673\qiji-fork\scripts\$f"
    $raw = [System.IO.File]::ReadAllText($path)
    $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
}
```

### 第3步：重新生成 vendor（★坑11、坑16）

> 原理见上方 [核心概念：vendor 与离线安装](#核心概念vendor-与离线安装)。

**何时需要跑这步：**

| 场景 | 需要跑？ | 原因 |
|------|---------|------|
| **首次编译** | ✅ | vendor 不存在 |
| **改了 Python 后端 / 品牌化文案** | ✅ | vendor 里的 hermes-agent\ 源码是旧的 |
| **升级了工具链（Python/Node/依赖版本）** | ✅ | vendor 里的运行时是旧版 |
| **只改前端代码 / 工具链没变** | ⏭️ 跳过 | 前端不经 vendor；vendor 复用上次快照 |

```powershell
# 删旧 vendor
Remove-Item -Recurse -Force "C:\Users\84673\qiji-fork\apps\desktop\build\vendor"

# 重新生成（约5分钟）
cd C:\Users\84673\qiji-fork
.\scripts\prepare-offline.ps1 -HermesHome "C:\Users\84673\AppData\Local\hermes" -VendorDir "apps\desktop\build\vendor"
```

**验证 vendor 源码是品牌化的（不是上游原版）：**

```powershell
Select-String "Run Hermes|Run QiJi" "C:\Users\84673\qiji-fork\apps\desktop\build\vendor\hermes-agent\hermes_cli\web_server.py"
```
输出应为 "Run QiJi"。如果输出 "Run Hermes"，说明 vendor 源码是上游原版——检查 prepare-offline.ps1 是否从 fork 复制（看输出行 `[5/8] Repository source (from fork)`）。

**验证 vendor 瘦身全局清理生效（★坑16）：**

```bash
# 从 WSL 验证 .map 文件已被排除
find /mnt/c/Users/84673/qiji-fork/apps/desktop/build/vendor/nm -name "*.map" -type f | wc -l
# 应输出 0
```

如果输出 > 0，说明 vendor 是旧的（未使用 2026-07-09 修复后的 prepare-offline.ps1），需要删掉 vendor 重新生成。

**验证 ffmpeg 已被排除（2026-07-09）：**

```bash
# ffmpeg.exe 不应在 vendor 中
ls /mnt/c/Users/84673/qiji-fork/apps/desktop/build/vendor/tools/ffmpeg.exe 2>/dev/null || echo "ffmpeg correctly excluded"
```

应输出 "ffmpeg correctly excluded"。如果 ffmpeg.exe 存在，说明 vendor 是旧的。
### 第4步：清 Vite 缓存 + 设置 commit hash

```powershell
cd C:\Users\84673\qiji-fork\apps\desktop

# 清 Vite 缓存（改过前端源码后必须，否则编译产物是旧的）
if (Test-Path "node_modules\.vite") { Remove-Item -Recurse -Force "node_modules\.vite" }

# 设置 commit hash（write-build-stamp 需要）
$env:GITHUB_SHA = git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD
```

### 第5步：关闭 Defender + 编译

**⚠️ 关闭 Windows Defender 实时保护**（否则 NSIS 压缩慢 3 倍）。

```powershell
npm run dist:win:nsis
```

产物：`release\Qiji-0.17.0-win-x64.exe`（约 713MB，耗时 ~10-15 分钟）

---

## 一键脚本（复制即用）

上面 5 步合并成一个脚本块，直接粘贴到 PowerShell 执行：

```powershell
# === 奇计离线包编译完整流程 ===

# 第1步：同步
robocopy "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" "C:\Users\84673\qiji-fork" /MIR /XJ /XD ".git" "venv" "__pycache__" "node_modules" ".venv" "release" "dist" "build" /XF "*.pyc" "*.pyo" /NJH /NJS /NFL /NDL /NP /R:1 /W:1

# 第2步：修复 ps1 编码
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = "C:\Users\84673\qiji-fork\scripts\$f"
    $raw = [System.IO.File]::ReadAllText($path)
    $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
}

# 第3步：重新生成 vendor（仅在改了 Python 后端 / 首次编译 / 工具链升级时需要）
# 如果只改了前端代码或工具链没变，用注释符号跳过这步
Remove-Item -Recurse -Force "C:\Users\84673\qiji-fork\apps\desktop\build\vendor" -ErrorAction SilentlyContinue
cd C:\Users\84673\qiji-fork
.\scripts\prepare-offline.ps1 -HermesHome "C:\Users\84673\AppData\Local\hermes" -VendorDir "apps\desktop\build\vendor"

# 第4步：清缓存 + 设 SHA
cd apps\desktop
if (Test-Path "node_modules\.vite") { Remove-Item -Recurse -Force "node_modules\.vite" }
$env:GITHUB_SHA = git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD

# 第5步：编译（确认已关闭 Defender 实时保护）
npm run dist:win:nsis
```

---

## 三种测试方式（从快到慢）

不是每次都需要跑完整 NSIS 打包。根据需要选择：

### 方式1：npm run dev（开发热刷新）— 秒级

改前端代码后自动热刷新，适合调试 UI。

```powershell
cd C:\Users\84673\qiji-fork\apps\desktop
npm run dev
```

- 修改 .tsx/.ts → Ctrl+S → 界面毫秒级更新
- 不需要重新编译
- 只测前端逻辑，不打包

**注意：** dev 模式的 Python 后端来自 fork 源码（SOURCE_REPO_ROOT），离线包的后端来自安装目录（ACTIVE_HERMES_ROOT）。dev 测不出品牌化后端问题，必须以离线包安装后的实际表现为准。

### 方式2：win-unpacked（编译后免打包）— ~75秒

编译前端代码 + Electron 打包，但跳过 NSIS 压缩。

```powershell
cd C:\Users\84673\qiji-fork\apps\desktop
npm run builder -- --dir
```

产物：`release\win-unpacked\Qiji.exe`，双击即可运行，体验与安装版完全一致。

### 方式3：完整 NSIS 打包 — ~10分钟

生成可分发的单个 .exe 安装包。用上面的「完整流程」或「一键脚本」。

---

## 检查清单

编译前自查，避免产出无效安装包：

- [ ] 代码已从 WSL robocopy 同步到 Windows 编译目录
- [ ] ps1 脚本已修复编码（CRLF + UTF-8 BOM）— install.ps1、prepare-offline.ps1
- [ ] **如果改了 Python 后端**：vendor 已重新生成（改了品牌文案也属于此类）
- [ ] **如果工具链没变**：可跳过第3步，沿用现有 vendor
- [ ] vendor 源码验证通过（"Run QiJi" 而非 "Run Hermes"）
- [ ] Vite 缓存已清除
- [ ] `$env:GITHUB_SHA` 已设置
- [ ] Windows Defender 实时保护已关闭

---

## 客户安装失败：诊断与修复流程

当客户报"安装后无法启动"时，按以下步骤处理：

### 修复策略

```
Level 1: 运行 qiji-repair.bat（从本地 vendor 重新拷贝，秒级）
  ↓ 如果还是 [FAILED]
Level 2: 关掉 Defender 实时防护后重跑修复脚本
  ↓ 如果还是不行
Level 3: 重装
```

### 1. 让客户运行修复脚本

把安装目录里的 `qiji-repair.bat` 发给客户（安装后在 `resources\qiji-repair.bat`），让他们：

1. 双击 `qiji-repair.bat`
2. 等它跑完，把窗口截图发回来

脚本会自动：
- 找到 vendor 目录（安装后留在 app 目录里的完整源文件）
- 逐个检查 11 个关键组件
- 发现缺文件的 → 从 vendor 用 robocopy 重新拷一份
- 发现 pyvenv.cfg 指向不对的 → 自动重写
- 输出每一步的 [OK] / [BROKEN] / [FIXED] / [FAILED] 状态

### 2. 常见问题对照表

| 客户报的现象 | 大概率原因 | 处理 |
|-------------|-----------|------|
| 全部 [FIXED] | Defender 锁文件导致首次安装不完整 | 修好了，重启即可 |
| 某些 [FAILED] | Defender 持续锁定 | 让客户关 Defender 实时防护后重跑修复脚本 |
| vendor 目录找不到 | 安装路径不标准 | 让客户报 Qiji.exe 的完整路径 |
| pyvenv.cfg [FIXED] | Python 解释器路径不对 | 修好了，重启即可 |

### 3. 获取安装日志

如果修复脚本没解决问题，让客户发这个文件：

```
%LOCALAPPDATA%\hermes\logs\install.log      ← 安装过程完整日志
```

### 4. 最后手段：重装

如果以上都不行：
1. 让客户卸载 Qiji
2. **关闭 Windows Defender 实时保护**
3. 重新安装

---

## 编译各阶段耗时参考

| 阶段 | 耗时 | 说明 |
|------|------|------|
| robocopy 同步 | ~1分钟 | 只同步改动文件 |
| ps1 编码修复 | ~10秒 | 每次同步后 |
| prepare-offline | ~5分钟 | 删旧 vendor 重新生成 |
| Vite 缓存清理 | ~5秒 | |
| tsc -b | ~30秒 | TypeScript 增量编译 |
| vite build | ~45秒 | 前端打包 |
| electron-builder 打包 | ~1分钟 | 不含 NSIS |
| NSIS 压缩 | ~10分钟 | LZMA 极限压缩，瓶颈所在 |

**总计约 18-20 分钟。** NSIS 是瓶颈，无法增量。vendor 里全是已压缩二进制，LZMA 再压收益很小但耗时巨大。

---

## 清理（C盘空间紧张时）

```powershell
# 删除编译产物
Remove-Item -Recurse -Force C:\Users\84673\qiji-fork\apps\desktop\release
# 删除 vendor（下次编译重新生成）
Remove-Item -Recurse -Force C:\Users\84673\qiji-fork\apps\desktop\build\vendor
# 清理 NSIS 临时文件
Remove-Item $env:TEMP\nsb*.tmp -ErrorAction SilentlyContinue
```

---

## 优化建议（待实施）

electron-builder 默认 compression 为 "maximum"（LZMA ultra）。可改为 "normal"：

```json
// package.json build 段
"compression": "normal"
```

预期效果：NSIS 从 ~10分钟降到 ~3-5分钟，exe 体积增加 50-100MB。

---

## 远程编译（通过 Hermes 启动）

从 WSL 的 Hermes 里启动 Windows 编译：

```bash
# 写一个 ps1 脚本，用 setsid 脱离进程树（扛 Hermes 重启）
setsid bash -c 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File /tmp/build.ps1 > /tmp/build.log 2>&1' &

# 监控进度
tail -f /tmp/build.log
```

注意：用 `setsid` 确保编译进程脱离 Hermes 进程树，Hermes 重启不会杀编译。
