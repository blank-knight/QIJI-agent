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
    │
    │  npm run dist:win:nsis（约 15 分钟）
    │  electron-builder 打包
    ▼
[安装包] Qiji-0.17.0-win-x64.exe（约 710 MB）
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

**⚠️ 关闭 Windows Defender 实时保护**（否则 NSIS 压缩慢 3 倍）。

设置 → 隐私和安全 → Windows 安全中心 → 病毒和威胁防护 → 管理设置 → 关闭"实时保护"。

```powershell
npm run dist:win:nsis
```

编译约需 10-15 分钟。产物：

```
apps\desktop\release\Qiji-0.17.0-win-x64.exe   （约 710 MB）
```

编译完成后**记得重新打开 Defender 实时保护**。

---

## 5. 快速测试（不打包）

不是每次都需要跑完整 NSIS 打包。根据需要选择：

### 方式 1：开发热刷新（秒级）

改前端代码后自动热刷新，适合调试 UI：

```powershell
cd apps\desktop
npm run dev
```

### 方式 2：win-unpacked（约 75 秒）

编译前端 + Electron 打包，但跳过 NSIS 压缩：

```powershell
cd apps\desktop
npm run builder -- --dir
```

产物在 `release\win-unpacked\Qiji.exe`，双击即可运行，体验与安装版一致。

### 方式 3：完整 NSIS 打包（约 10 分钟）

见上方第 4 步完整流程。

---

## 6. 验证安装包质量

编译完成后，做以下检查：

### 6.1 文件大小

```powershell
$exe = Get-Item "release\Qiji-*-win-x64.exe"
"{0:N0} MB" -f ($exe.Length / 1MB)
# 应在 650-750 MB 之间
```

如果小于 600 MB，很可能 vendor 不完整——安装后用户会缺组件。

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

### Q: NSIS 压缩非常慢（超过 20 分钟）

**A:** 确认已关闭 Windows Defender 实时保护。Defender 会扫描 NSIS 写入的每个临时文件，导致压缩慢 3 倍。

### Q: 安装后用户无法启动

**A:** 让用户运行安装目录里的 `qiji-repair.bat`（安装后在 `resources\qiji-repair.bat`）。详见 [build-and-test.md](build-and-test.md) 的「客户安装失败：诊断与修复流程」。

### Q: 只改了前端代码（tsx/ts），需要重新生成 vendor 吗

**A:** 不需要。前端代码由 Vite 直接打包，不经 vendor。只需清 Vite 缓存后重新编译：

```powershell
cd apps\desktop
if (Test-Path "node_modules\.vite") { Remove-Item -Recurse -Force "node_modules\.vite" }
npm run dist:win:nsis
```

### Q: 改了 Python 后端代码 / 品牌文案，需要重新生成 vendor 吗

**A:** 需要。vendor 里的 `hermes-agent\` 源码是旧的，必须重新生成：

```powershell
Remove-Item -Recurse -Force "apps\desktop\build\vendor"
.\scripts\prepare-offline.ps1 -HermesHome "$env:LOCALAPPDATA\hermes" -VendorDir "apps\desktop\build\vendor"
```

---

## 8. 清理磁盘空间

编译会占用大量空间。C 盘紧张时清理：

```powershell
# 删除编译产物（不影响下次编译，只是要重新打包）
Remove-Item -Recurse -Force apps\desktop\release -ErrorAction SilentlyContinue

# 删除 vendor（下次编译重新生成）
Remove-Item -Recurse -Force apps\desktop\build\vendor -ErrorAction SilentlyContinue

# 清理 NSIS 临时文件
Remove-Item $env:TEMP\nsb*.tmp -ErrorAction SilentlyContinue
```

---

## 附：各阶段耗时参考

| 阶段 | 耗时 | 说明 |
|------|------|------|
| npm install | ~3-5 分钟 | 首次，约 800 个包 |
| prepare-offline | ~5 分钟 | 生成 vendor |
| tsc -b | ~30 秒 | TypeScript 编译 |
| vite build | ~45 秒 | 前端打包 |
| electron-builder | ~1 分钟 | 不含 NSIS |
| NSIS 压缩 | ~10 分钟 | LZMA 极限压缩，瓶颈 |

**完整编译约 18-20 分钟。** NSIS 是瓶颈，无法增量——vendor 里全是已压缩二进制，LZMA 再压收益很小但耗时巨大。

---

## 附：一键编译脚本

把完整流程合并成一个脚本，保存为 `build.ps1` 直接运行：

```powershell
# build.ps1 — 奇计离线包一键编译
# 用法: 在仓库根目录运行 .\build.ps1
# 可选参数: -SkipVendor（跳过 vendor 生成，仅改了前端时用）

param(
    [switch]$SkipVendor
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$hermesHome = "$env:LOCALAPPDATA\hermes"

Write-Host "`n=== 奇计离线包编译 ===" -ForegroundColor Green

# 第1步：修复 ps1 编码
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

# 第2步：生成 vendor
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

# 第3步：清缓存 + 设 SHA
Write-Host "`n[3/4] 清缓存 + 设置 commit hash..." -ForegroundColor Cyan
$desktopDir = Join-Path $repoRoot "apps\desktop"
$viteCache = Join-Path $desktopDir "node_modules\.vite"
if (Test-Path $viteCache) { Remove-Item -Recurse -Force $viteCache }
$env:GITHUB_SHA = git -C $repoRoot rev-parse HEAD

# 第4步：编译
Write-Host "`n[4/4] 编译（NSIS 打包）..." -ForegroundColor Cyan
Write-Host "⚠️  请确认已关闭 Windows Defender 实时保护！" -ForegroundColor Yellow
Push-Location $desktopDir
npm run dist:win:nsis
$exitCode = $LASTEXITCODE
Pop-Location

if ($exitCode -eq 0) {
    Write-Host "`n✅ 编译完成！" -ForegroundColor Green
    $exe = Get-ChildItem (Join-Path $desktopDir "release\Qiji-*-win-x64.exe") -ErrorAction SilentlyContinue | Select-Object -First 1
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
