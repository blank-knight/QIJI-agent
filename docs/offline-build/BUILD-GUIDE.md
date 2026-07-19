# 奇计离线安装包构建指南

> **面向对象：** 拿到本仓库代码、需要编译出可分发离线安装包的任何人。
>
> **前置技能：** 会用 PowerShell、Git 基本操作。
>
> **预计耗时：** 首次约 1-2 小时（含环境准备），之后每次编译约 20 分钟。

---

## 目录

1. [你需要什么](#1-你需要什么)
2. [理解离线安装包的原理](#2-理解离线安装包的原理)
3. [环境准备（首次只做一次）](#3-环境准备首次只做一次)
4. [编译离线安装包（完整流程）](#4-编译离线安装包完整流程)
5. [快速测试（不打包）](#5-快速测试不打包)
6. [验证安装包质量](#6-验证安装包质量)
7. [常见问题](#7-常见问题)
8. [清理磁盘空间](#8-清理磁盘空间)

---

## 1. 你需要什么

### 硬件

| 项目 | 最低要求 | 推荐 |
|------|---------|------|
| 操作系统 | Windows 10 64 位 | Windows 11 64 位 |
| 磁盘空间 | 5 GB 可用 | 10 GB 可用 |
| 内存 | 4 GB | 8 GB+ |

> ⚠️ **必须在 Windows 上编译。** 不能用 WSL（Linux）、macOS 或虚拟机。
> 原因：编译产物是 Windows exe + native 模块（node-pty），需要在原生 Windows 工具链下构建。
> 详见 [build-and-test.md](build-and-test.md) 的「为什么必须在 Windows 编译」。

### 软件

| 软件 | 用途 | 安装方式 |
|------|------|---------|
| **Git for Windows** | 克隆仓库 | [git-scm.com](https://git-scm.com/download/win) |
| **Hermes CLI** | 提供工具链（Python/Node/uv/git） | 见下方第 3 步 |
| **Windows PowerShell 5.1+** | 执行编译脚本 | Windows 自带 |

> 不需要单独安装 Python、Node.js、npm——Hermes CLI 会自动安装它们。

---

## 2. 理解离线安装包的原理

### 什么是 vendor？

奇计安装包号称"离线安装"——用户双击安装后**不需要联网下载任何东西**。这靠的是 **vendor 目录**：一个提前打包好的工具链快照。

普通用户电脑上没有 Python、Node.js、Git、ripgrep。正常安装流程得从网上下载。vendor 就是**提前把这些全部下载好塞进安装包里**，安装时直接拷到用户电脑，零网络。

```
vendor\（约 650 MB）
├── bin\           ← uv.exe（Python 包管理器）
├── chromium\      ← 内嵌浏览器引擎（Playwright）
├── git\           ← PortableGit（git + bash + coreutils）
├── hermes-agent\  ← 后端 Python 源码（含品牌化改动）
├── nm\            ← node_modules（前端依赖）
├── node\          ← Node.js 运行时
├── python\        ← Python 解释器
├── site-packages\ ← Python 依赖库
├── tools\         ← ripgrep + ffmpeg
└── venv-scripts\  ← venv 激活脚本
```

vendor **不在 git 仓库里**（太大，且是平台相关二进制）。它是编译时由 `prepare-offline.ps1` 脚本从 Hermes CLI 的安装目录自动"收割"生成的。

### 数据流向

```
[Hermes CLI 安装目录] %LOCALAPPDATA%\hermes\
    │
    │  prepare-offline.ps1（约 5 分钟）
    │  从工具链拷贝到 vendor
    ▼
[编译目录] apps\desktop\build\vendor\
    ↓
    │ npm run dist:win:sfx（约 10 分钟）
    │ electron-builder --dir + 7z 压缩 + launcher3 拼接
    ↓
[安装包] Qiji-0.17.0-Setup.exe（约 542 MB）
    │
    │  用户安装时 install.ps1
    │  从 vendor 拷贝到用户电脑，零下载
    ▼
[用户电脑] %LOCALAPPDATA%\hermes\（全新工具链）
```

**关键结论：vendor 的质量决定安装包的质量。** 如果 vendor 不完整或包含错误版本，安装包就是废的。

---

## 3. 环境准备（首次只做一次）

### 3.1 克隆仓库

```powershell
git clone https://gitee.com/wintao-storm/QIJI-agent.git C:\qiji-fork
cd C:\qiji-fork
```

> 如果用 Gitee 太慢，也可以从 GitHub fork 克隆（如果有权限）。

### 3.2 安装 Hermes CLI

Hermes CLI 是 vendor 的数据源。它会在 `%LOCALAPPDATA%\hermes\` 下自动安装一套完整的工具链（Python、Node、git、uv、site-packages）。

```powershell
# 以管理员权限运行 PowerShell
iex (irm https://www.aicps.vip/install.ps1)
```

安装完成后验证：

```powershell
# 检查工具链目录
Test-Path "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\python.exe"
# 应返回 True

# 检查各个组件
Test-Path "$env:LOCALAPPDATA\hermes\bin\uv.exe"          # uv
Test-Path "$env:LOCALAPPDATA\hermes\git\cmd\git.exe"     # git
Test-Path "$env:LOCALAPPDATA\hermes\node\node.exe"       # Node.js
Test-Path "$env:LOCALAPPDATA\hermes\tools\rg.exe"        # ripgrep
# 全部应返回 True
```

> ⚠️ 如果上面任何一个返回 False，说明 Hermes CLI 安装不完整。
> 运行 `hermes` 命令让它自动补全依赖，或重新运行安装脚本。

### 3.3 安装项目依赖

```powershell
cd C:\qiji-fork

# 安装 Python 后端依赖（到 Hermes venv）
& "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\pip.exe" install -e .

# 安装前端依赖
cd apps\desktop
npm install
cd ..\..
```

> `npm install` 约需 3-5 分钟，会下载约 800 个包。

### 3.4 验证环境

```powershell
# 确认在仓库根目录
cd C:\qiji-fork

# 确认 Git 状态干净
git status

# 确认前端依赖已装
Test-Path "apps\desktop\node_modules\.package-lock.json"
# 应返回 True
```

环境准备完成。之后每次编译只需要走第 4 步。

---

## 4. 编译离线安装包（完整流程）

> 下面 5 步必须按顺序执行。

### 第 1 步：修复 PowerShell 脚本编码

Git 克隆的 `.ps1` 文件是 LF 编码，Windows PowerShell 5.1 可能无法解析。每次克隆后执行一次：

```powershell
cd C:\qiji-fork
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = "scripts\$f"
    $raw = [System.IO.File]::ReadAllText($path)
    $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
    Write-Host "  Fixed: $f" -ForegroundColor Green
}
```

### 第 2 步：生成 vendor

```powershell
cd C:\qiji-fork

# 清理旧 vendor（如果存在）
if (Test-Path "apps\desktop\build\vendor") {
    Remove-Item -Recurse -Force "apps\desktop\build\vendor"
}

# 生成 vendor（约 5 分钟）
.\scripts\prepare-offline.ps1 `
    -HermesHome "$env:LOCALAPPDATA\hermes" `
    -VendorDir "apps\desktop\build\vendor"
```

脚本会输出 8 个步骤的进度：

```
[1/8] uv.exe ✅
[2/8] PortableGit ✅
[3/8] Node.js ✅
[4/8] Tools (rg + ffmpeg) ✅
[5/8] Repository source (from fork) ✅
[6a/8] Python interpreter ✅
[6b/8] Site-packages ✅
[6c/8] Venv Scripts ✅
[7/8] node_modules (robocopy /XJ, no junctions) OK
[8/8] Playwright Chromium ✅

=== Vendor directory ready ===
Total size: ~650 MB
```

> ⚠️ 如果某一步没显示 ✅，说明对应的工具链组件缺失。回到第 3.2 步检查 Hermes CLI 安装。

### 第 3 步：验证 vendor 品牌化

```powershell
# 应输出 "Run QiJi"（品牌化后的）
# 不应输出 "Run Hermes"（上游原版）
Select-String "Run Hermes|Run QiJi" "apps\desktop\build\vendor\hermes-agent\hermes_cli\web_server.py"
```

如果输出 "Run Hermes"，说明 vendor 里的后端源码是上游原版而非 fork——检查 `prepare-offline.ps1` 是否从仓库根目录复制（看输出行 `[5/8] Repository source (from fork)`）。

### 第 4 步：设置 commit hash + 清缓存

```powershell
cd apps\desktop

# 清 Vite 缓存
if (Test-Path "node_modules\.vite") {
    Remove-Item -Recurse -Force "node_modules\.vite"
}

# 设置 commit hash（编译脚本需要）
$env:GITHUB_SHA = git rev-parse HEAD
Write-Host "GITHUB_SHA: $env:GITHUB_SHA" -ForegroundColor Cyan
```

### 第 5 步：编译
### 第 5 步：编译（7z SFX 方案）

> **2026-07-19 起改用 7z SFX 替代 NSIS**。原因：NSIS 压缩 2.2GB 要 15-30 分钟，且 Defender 扫描 8 万文件。7z SFX 压缩同样数据只需 5-8 分钟，产物更小（542MB vs 710MB），安装时 launcher3 自动给安装目录加 Defender 排除。

**⚠️ 编译前必须检查工作区**（见下方"编译前检查清单"），避免打出功能缺失的包。

```powershell
npm run dist:win:sfx
```

这条命令内部做了三件事：
1. `tsc -b && vite build` — 编译前端（~1 分钟）
2. `electron-builder --win --config.win.target=dir` — 只生成 win-unpacked 目录，跳过 NSIS/MSI（~2 分钟）
3. `node build-installer.cjs` — 7z 压缩 win-unpacked + 编译 launcher3.exe + 拼接（~5-8 分钟）

编译约需 8-12 分钟。产物：

```
apps\desktop\release\Qiji-0.17.0-Setup.exe   （约 542 MB）
```

> **如果只改了前端代码**（.tsx/.ts），vendor 没变，win-unpacked 已存在，可以跳过 electron-builder 直接跑 7z 压缩（见下方"快速重打包"）。

#### 编译前检查清单（每次必做）

```powershell
# 1. 检查工作区是否干净（没有意外回退的文件）
cd C:\qiji-fork
git status --short

# 如果有 D（deleted）文件或大量 M（modified）文件，
# 用 git diff HEAD -- <file> 查看回退了什么：
git diff HEAD -- apps/desktop/src/

# 不确定时，恢复到 HEAD：
git checkout HEAD -- apps/desktop/src/
```

> **为什么必须检查**：2026-07-19 实战教训——工作区曾因 git stash/checkout 意外回退了 7 个文件（skill-picker 被删、平台汉化被移除、中转站选项丢失等），编译用的始终是**工作区**版本而非 HEAD，导致打出的包功能缺失。详见 `bugs-and-pitfalls.md` pitfall #99。

---

## 5. 快速测试与重打包

### 方式 1：开发热刷新（秒级）

改前端代码后自动热刷新，适合调试 UI。

```powershell
cd apps\desktop
npm run dev
```

### 方式 2：win-unpacked（约 1 分钟）

编译前端 + Electron 打包，但跳过压缩。产物可直接运行，体验与安装版一致。

```powershell
cd apps\desktop
npm run dist:win:dir
# 产物：release\win-unpacked\Qiji.exe
```

### 方式 3：快速重打包（只改前端，跳过 electron-builder，约 5 分钟）

当 vendor 没变、win-unpacked 已存在，只改了 .tsx/.ts 前端源码时，可以跳过 electron-builder 的 blockmap hashing（省 15-20 分钟），只重跑 7z 压缩：

```powershell
# 1. 从 WSL：重新编译前端
cd /mnt/c/Users/84673/qiji-fork/apps/desktop
npx tsc -b && npx vite build

# 2. 从 WSL：用新 dist 覆盖 win-unpacked 里的 app.asar
npx asar pack dist release/win-unpacked/resources/app.asar

# 3. 从 PowerShell（不能从 WSL bash！）：只跑 7z 压缩 + launcher3 拼接
powershell.exe -NoProfile -Command `
  "Set-Location 'C:\Users\84673\qiji-fork\apps\desktop\installer'; `
   Remove-Item '..\release\qiji-portable.7z' -Force -EA SilentlyContinue; `
   node build-installer.cjs"
```

> ⚠️ `build-installer.cjs` 必须从 PowerShell 运行，不能从 WSL bash。WSL 的 `/mnt/c/` 路径前缀传给 Windows 的 7zr.exe 会报"系统找不到指定的路径"（详见 bugs-and-pitfalls.md pitfall #108）。

#### 编译后验证（用 grep，不要用 PowerShell Select-String）

```bash
# 从 WSL：验证新功能确实编译进了 dist
cd /mnt/c/Users/84673/qiji-fork/apps/desktop/dist/assets
grep -l "skill-picker\|SkillPicker\|onSelectSkill" *.js   # 应列出 index-*.js
grep -l "qiji-relay\|aicps" *.js                            # 应列出 index-*.js
grep -l "中转站" *.js                                       # 应列出 index-*.js
```

> ⚠️ 不要用 PowerShell 的 `Select-String -Pattern "a\|b"` 做 OR 匹配——PowerShell 的 `\|` 是字面管道符，不是正则 OR，会产生假阴性。用 WSL 的 grep 或传数组 `-Pattern "a","b"`（详见 bugs-and-pitfalls.md pitfall #107）。

### 方式 4：完整 7z SFX 打包（约 8-12 分钟）

见上方第 4 步完整流程。

---

## 6. 验证安装包质量

编译完成后，做以下检查：

### 6.1 文件大小

```powershell
$exe = Get-Item "release\Qiji-*-Setup.exe"
"{0:N0} MB" -f ($exe.Length / 1MB)
# 应在 540-560 MB 之间（7z SFX 方案）
```

如果小于 500 MB，很可能 vendor 不完整——安装后用户会缺组件。

### 6.2 干净机器安装测试

在一台**没装过 Hermes / 奇计**的机器上（或虚拟机）安装，验证：

- [ ] 安装过程无报错
- [ ] 安装完成后桌面有「奇计」快捷方式
- [ ] 双击启动后能看到主界面
- [ ] 能正常对话（后端 Python 已正确启动）
- [ ] 设置页面品牌名称显示为「奇计」（非「Hermes」）

### 6.3 vendor 完整性检查

```powershell
$vendor = "apps\desktop\build\vendor"
$checks = @(
    @{ Name="uv.exe";          Path="bin\uv.exe" },
    @{ Name="git.exe";         Path="git\cmd\git.exe" },
    @{ Name="node.exe";        Path="node\node.exe" },
    @{ Name="python.exe";      Path="python\python.exe" },
    @{ Name="site-packages";   Path="site-packages" },
    @{ Name="node_modules";    Path="nm" },
    @{ Name="hermes-agent";    Path="hermes-agent" },
    @{ Name="tools (rg)";      Path="tools\rg.exe" },
    @{ Name="venv-scripts";    Path="venv-scripts" },
    @{ Name="chromium";        Path="chromium" }
)

Write-Host "`nVendor 完整性检查:" -ForegroundColor Cyan
$allOk = $true
foreach ($c in $checks) {
    $full = Join-Path $vendor $c.Path
    if (Test-Path $full) {
        Write-Host "  ✅ $($c.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($c.Name) — 缺失!" -ForegroundColor Red
        $allOk = $false
    }
}
if ($allOk) { Write-Host "`n  全部通过 ✅" -ForegroundColor Green }
else        { Write-Host "`n  有缺失，请重新生成 vendor" -ForegroundColor Red }
```

---

## 7. 常见问题

### Q: prepare-offline.ps1 报错 "路径不存在"

**A:** `-HermesHome` 路径不对。确认 Hermes CLI 已安装：

```powershell
Test-Path "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts\python.exe"
```

如果返回 False，重新安装 Hermes CLI（第 3.2 步）。

### Q: npm install 报错 / 很慢

**A:** 使用国内镜像：

```powershell
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: 编译时报 "GITHUB_SHA is not set"

**A:** 在仓库目录（有 .git 的地方）执行 `git rev-parse HEAD`，然后：

```powershell
$env:GITHUB_SHA = git rev-parse HEAD
```

### Q: NSIS 压缩非常慢（超过 20 分钟）？

**A:** 2026-07-19 起已弃用 NSIS，改用 7z SFX 方案。新方案不需要关闭 Defender——launcher3.exe 安装时自动给安装目录添加 Defender 排除项。如果你还在跑 NSIS，说明用的是旧命令 `npm run dist:win:nsis`，请改用 `npm run dist:win:sfx`。

### Q: 安装后用户无法启动？

**A:** 让用户运行安装目录里的 `qiji-repair.bat`（安装后在 `resources\qiji-repair.bat`）。详见 [build-and-test.md](build-and-test.md) 的「客户安装失败：诊断与修复流程」。

### Q: 只改了前端代码（tsx/ts），需要重新生成 vendor 吗？

**A:** 不需要。前端代码由 Vite 直接打包，不进 vendor。用快速重打包路径（见第 5 节方式 3），约 5 分钟出包。

### Q: 改了 Python 后端代码 / 品牌文案，需要重新生成 vendor 吗？

**A:** 需要。vendor 里的 `hermes-agent\` 源码是构建时快照，必须重新生成。
```powershell
Remove-Item -Recurse -Force "apps\desktop\build\vendor"
.\scripts\prepare-offline.ps1 -HermesHome "$env:LOCALAPPDATA\hermes" -VendorDir "apps\desktop\build\vendor"
```

### Q: electron-builder --dir 卡住超过 10 分钟？

**A:** electron-builder 在大型 vendor 包（2.2GB）上跑 blockmap hashing 很慢，尤其 Defender 实时扫描开启时。两种解法：
1. **快速重打包**：如果只改了前端、win-unpacked 已存在，跳过 electron-builder，直接跑 7z 压缩（见第 5 节方式 3，约 5 分钟）。
2. **关 Defender 后再编译**：`electron-builder --dir` 的 blockmap 对每个文件做 hash，Defender 扫描会让它慢 3-5 倍。
```

---

## 8. 清理磁盘空间

编译会占用大量空间。C 盘紧张时清理：

```powershell
# 删除编译产物（不影响下次编译，只是要重新打包）
Remove-Item -Recurse -Force apps\desktop\release -ErrorAction SilentlyContinue

# 删除 vendor（下次编译重新生成）
Remove-Item -Recurse -Force apps\desktop\build\vendor -ErrorAction SilentlyContinue

# 清理 electron-builder 缓存
Remove-Item $env:TEMP\electron-builder-* -ErrorAction SilentlyContinue
Remove-Item $env:TEMP\*.blockmap -ErrorAction SilentlyContinue
```

---

## 附：各阶段耗时参考（2026-07-19 实测，7z SFX 方案）

| 阶段 | 耗时 | 说明 |
|------|------|------|
| npm install | ~3-5 分钟 | 首次，约 800 个包 |
| prepare-offline | ~5 分钟 | 生成 vendor |
| tsc -b + vite build | ~1.5 分钟 | TypeScript 编译 + 前端打包 |
| electron-builder --dir | ~2-3 分钟 | 只生成 win-unpacked，跳过压缩 |
| 7z 压缩 + launcher3 拼接 | ~5-8 分钟 | LZMA2 压缩 2.2GB win-unpacked |
| **完整编译总计** | **~10-12 分钟** | 7z SFX 方案 |

> 对比旧的 NSIS 方案：NSIS LZMA 压缩 2.2GB 要 15-30 分钟，且安装时 Defender 扫 8 万文件需 30-60 分钟。7z SFX 压缩只需 5-8 分钟，安装时 launcher3 自动排除 Defender。

---

## 附：一键编译脚本

把完整流程合并成一个脚本，保存为 `build.ps1` 直接运行。
```powershell
# build.ps1 — 奇计离线包一键编译（7z SFX 方案）
# 用法: 在仓库根目录运行 .\build.ps1
# 可选参数: -SkipVendor（跳过 vendor 生成，仅改了前端时用）

param(
    [switch]$SkipVendor
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$hermesHome = "$env:LOCALAPPDATA\hermes"

Write-Host "`n=== 奇计离线包编译（7z SFX）===" -ForegroundColor Green

# 第 1 步：修复 ps1 编码
Write-Host "`n[1/4] 修复 PowerShell 脚本编码..." -ForegroundColor Cyan
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = Join-Path $repoRoot "scripts\$f"
    if (Test-Path $path) {
        $raw = [System.IO.File]::ReadAllText($path)
        $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
        $utf8bom = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
    }
}

# 第 2 步：生成 vendor
if (-not $SkipVendor) {
    Write-Host "`n[2/4] 生成 vendor..." -ForegroundColor Cyan
    $vendorDir = Join-Path $repoRoot "apps\desktop\build\vendor"
    if (Test-Path $vendorDir) { Remove-Item -Recurse -Force $vendorDir }
    & (Join-Path $repoRoot "scripts\prepare-offline.ps1") `
        -HermesHome $hermesHome `
        -VendorDir $vendorDir
} else {
    Write-Host "`n[2/4] 跳过 vendor 生成（-SkipVendor）" -ForegroundColor Yellow
}

# 第 3 步：清缓存 + 设 SHA
Write-Host "`n[3/4] 清缓存 + 设置 commit hash..." -ForegroundColor Cyan
$desktopDir = Join-Path $repoRoot "apps\desktop"
$viteCache = Join-Path $desktopDir "node_modules\.vite"
if (Test-Path $viteCache) { Remove-Item -Recurse -Force $viteCache }
$env:GITHUB_SHA = git -C $repoRoot rev-parse HEAD

# 第 4 步：编译（7z SFX）
Write-Host "`n[4/4] 编译（7z SFX 打包）..." -ForegroundColor Cyan
Push-Location $desktopDir
npm run dist:win:sfx
$exitCode = $LASTEXITCODE
Pop-Location

if ($exitCode -eq 0) {
    Write-Host "`n✅ 编译完成！" -ForegroundColor Green
    $exe = Get-ChildItem (Join-Path $desktopDir "release\Qiji-*-Setup.exe") -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        Write-Host ("   产物: {0} ({1:N0} MB)" -f $exe.Name, ($exe.Length / 1MB)) -ForegroundColor Cyan
    }
} else {
    Write-Host "`n❌ 编译失败（exit code: $exitCode）" -ForegroundColor Red
}
```

**用法：**

```powershell
# 完整编译（含 vendor 生成）
.\build.ps1

# 只改了前端，跳过 vendor
.\build.ps1 -SkipVendor
```
