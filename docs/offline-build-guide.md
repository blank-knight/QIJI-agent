# 奇计离线安装包编译指南

## 概述

离线安装包将所有运行时依赖（Python、Git、Node、Chromium、site-packages 等）
预打包进 NSIS 安装程序。客户双击 exe 即可安装，无需联网下载任何东西。

最终产物：`Qiji-{version}-win-x64.exe`（约 900 MB）

## 架构：隔离编译（重要）

编译在独立的 Windows 副本中进行，**不碰正在运行的 Hermes 实例**：

```
~/clawd/qiji-fork (WSL)                    ← 代码仓库，git/commit/改代码
C:\Users\{user}\qiji-fork (Windows)        ← 编译副本（自包含）
C:\Users\{user}\AppData\Local\hermes\      ← 正在运行的 Hermes（只读引用）
```

工作流：WSL fork 改代码 → 同步到 Windows 编译副本 → 在编译副本里编译出 exe

**为什么不在 AppData\Local\hermes 里编译？**
1. 编译会覆盖正在运行的 Hermes 代码，可能导致当前会话崩溃
2. 运行中的 Hermes 版本和 fork 版本不同步，混在一起无法区分
3. vendor 嵌套问题的部分原因就是 robocopy 把 fork 同步到了运行实例上

## 前置条件

- Windows 机器（WSL 或原生均可操作）
- Hermes 已安装且正常运行（`~/.hermes` 或 `AppData\Local\hermes`）
  — 仅作为 prepare-offline 的只读依赖来源
- C 盘至少 15 GB 可用空间
- Node.js + npm（编译需要）

## 编译流程（5 步）

### Step 0: 首次准备 — 建立 Windows 编译副本

只需执行一次。之后每次编译跳到 Step 1。

```powershell
# 从 WSL fork 同步源码到 Windows 编译副本
$wslFork = "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork"
$buildDir = "C:\Users\84673\qiji-fork"
robocopy $wslFork $buildDir /E /XJ `
    /XD ".git" "venv" "__pycache__" ".venv" "node_modules" "build" "release" "dist" `
    /XF "*.pyc" "*.pyo" `
    /NJH /NJS /NFL /NDL /NP /R:1 /W:1
# exit code < 8 = success

# 安装 node_modules（约 5-10 分钟）
cd $buildDir
npm install

# 修复 PowerShell 脚本编码（WSL 同步后是 LF + 无 BOM）
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = Join-Path $buildDir "scripts\$f"
    $content = [System.IO.File]::ReadAllText($path)
    $content = $content -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $content, $utf8bom)
}
```

### Step 1: 同步代码更新 → Windows 编译副本

每次 fork 有新 commit 后执行。

```powershell
$wslFork = "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork"
$buildDir = "C:\Users\84673\qiji-fork"
robocopy $wslFork $buildDir /MIR /XJ `
    /XD ".git" "venv" "__pycache__" ".venv" "node_modules" "build" "release" "dist" `
    /XF "*.pyc" "*.pyo" `
    /NJH /NJS /NFL/NDL /NP /R:1 /W:1

# 修复同步过来的 ps1 编码
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = Join-Path $buildDir "scripts\$f"
    $content = [System.IO.File]::ReadAllText($path)
    $content = $content -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $content, $utf8bom)
}
```

### Step 2: 生成 vendor 目录

```powershell
cd C:\Users\84673\qiji-fork

# 清理旧 vendor（如果存在）
if (Test-Path "apps\desktop\build\vendor") {
    Remove-Item "apps\desktop\build\vendor" -Recurse -Force
}

# HermesHome 指向正在运行的 Hermes（只读引用 Python/Git/site-packages）
.\scripts\prepare-offline.ps1 `
    -HermesHome "C:\Users\84673\AppData\Local\hermes" `
    -VendorDir "apps\desktop\build\vendor"
```

vendor 目录结构（约 2.8 GB）：

```
vendor/
├── bin/uv.exe              (70 MB)   — uv 包管理器
├── git/                     (386 MB)  — PortableGit
├── hermes-agent/            (110 MB)  — 源码（排除 venv/node_modules/build）
├── python/                  (71 MB)   — CPython 3.11.15
├── site-packages/           (246 MB)  — Python 依赖
├── venv-scripts/            (2 MB)    — venv Scripts（pip, uvicorn 等）
├── nm/                      (336 MB)  — node_modules（robocopy /XJ 不跟随 junction）
├── tools/                   (221 MB)  — ripgrep + ffmpeg
└── chromium/                (1368 MB) — Playwright Chromium
```

**编码注意：** `prepare-offline.ps1` 是 UTF-8 with BOM + CRLF 编码。
如果从 WSL 同步后编码变成 LF/无 BOM，PowerShell 会报语法错误。
转换方法（见 Step 0/1）。

### Step 3: electron-builder 打包

```powershell
cd C:\Users\84673\qiji-fork\apps\desktop

# 设置 GITHUB_SHA（robocopy 排除了 .git，编译脚本找不到 commit hash）
$env:GITHUB_SHA = git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD
# 或者直接写死:
# $env:GITHUB_SHA = "db4c753c2a43933188e817d54ead565c7ec103a3"

# 编译 + 打包（NSIS installer）
npm run dist:win:nsis
```

这一步包含：
1. `tsc -b` — TypeScript 编译
2. `vite build` — 前端打包
3. `stage-native-deps.cjs` — 复制 node-pty native 二进制
4. `electron-builder --win nsis` — 打成 NSIS 安装包

**耗时：** 约 10-15 分钟（fork 自带的 node_modules 比运行实例的更精简）

### Step 4: 验证 + 分发

```powershell
$buildDir = "C:\Users\84673\qiji-fork"

# 安装包路径
$exe = "$buildDir\apps\desktop\release\Qiji-{version}-win-x64.exe"

# 验证 exe 名称是 Qiji（不是 Hermes）
$exeFile = Get-ChildItem $exe
Write-Host "exe: $($exeFile.Name) ($([math]::Round($exeFile.Length/1MB)) MB)"

# 验证 vendor 在安装包内
$vendor = "$buildDir\apps\desktop\release\win-unpacked\resources\vendor"
Test-Path $vendor  # 应该返回 True

# 验证 unpacked exe 是 Qiji.exe
Test-Path "$buildDir\apps\desktop\release\win-unpacked\Qiji.exe"  # True
Test-Path "$buildDir\apps\desktop\release\win-unpacked\Hermes.exe"  # False

# 复制到桌面或分发
Copy-Item $exe "C:\Users\{user}\Desktop\" -Force
```

## install.ps1 的离线安装逻辑

安装程序运行时，`install.ps1` 通过 `-VendorDir` 参数接收 vendor 路径，
调用 `Stage-VendorFiles` 把 vendor 内容复制到目标安装目录：

1. `bin\uv.exe` → 管理的 uv
2. `git\` → PortableGit
3. `hermes-agent\` → 源码（替代 git clone）
4. `python\` + `site-packages\` + `venv-scripts\` → 预装 venv
5. `nm\` → backend node_modules

当 vendor 存在时，以下步骤被跳过：
- `Install-Venv` — 检测到 `venv\Scripts\python.exe` 已存在，跳过 `uv venv` 创建
- `Install-Dependencies` — 检测到 venv 已存在，跳过 `uv sync`，只重装 hermes-agent

## 踩坑记录

### 坑 1: vendor 无限嵌套（7-19 GB 膨胀）

**现象：** vendor 目录膨胀到 7-19+ GB，52万+文件，C 盘爆满。

**根因（已定位）：** `prepare-offline.ps1` 第7步用 `Copy-Item -Recurse`
复制 node_modules。但 `node_modules\hermes` 是一个 **Junction**（Windows
符号链接），指向 `apps\desktop`，而 `apps\desktop\build\vendor` 是 vendor
输出目录本身。

`Copy-Item -Recurse` 会跟随 Junction，把整个 desktop（包括 build/vendor）
复制进 `vendor\nm\hermes\`。如果 vendor 已有内容，形成无限递归：
`vendor\nm\hermes\build\vendor\nm\hermes\build\vendor\nm\...`

**修复（已提交 commit 6a81eff）：**
1. node_modules 复制改用 `robocopy /XJ`（/XJ = 不跟随 junction）
2. 额外排除 build/dist/release 目录
3. 源码复制也加上 /XJ

```powershell
# 修复后的代码
robocopy $nmPath $vendorNM /E /XJ /XD "build" "dist" "release" ".git" /NJH /NJS /NFL /NDL /NP
```

### 坑 2: PowerShell 编码错误（LF + 无 BOM）

**现象：** `prepare-offline.ps1` 报 `UnexpectedToken` 语法错误。

**原因：** 从 WSL 同步的 .ps1 文件是 LF 行尾 + 无 BOM。
PowerShell 对含 emoji（✅）的 LF 文件解析异常。

**修复：** 转换为 CRLF + UTF-8 with BOM（见 Step 2）。

### 坑 3: node-pty 缺失

**现象：** `stage-native-deps.cjs` 报
`source missing at node_modules\node-pty`。

**原因：** workspace root 的 `node_modules/node-pty` 缺失。
npm workspace 会把 node-pty hoist 到 root，但某些情况下不会自动安装。

**修复：** 在 `apps/desktop` 目录运行 `npm install --no-save`。

### 坑 5: GITHUB_SHA 缺失导致编译失败

**现象：** `write-build-stamp.cjs` 报 `could not determine git commit`。

**原因：** robocopy 同步时排除了 `.git` 目录，编译脚本找不到 git commit hash
来 pin install.ps1 版本。

**修复：** 编译前设置环境变量：
```powershell
$env:GITHUB_SHA = "db4c753c2a43933188e817d54ead565c7ec103a3"
```
或从 WSL fork 获取最新 hash：
```powershell
$env:GITHUB_SHA = git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD
```

### 坑 4: 7za LZMA 压缩极慢

**现象：** NSIS 打包阶段耗时 30+ 分钟。

**原因：** 3.1 GB 内容（大量小文件）经过 LZMA 压缩，CPU 密集型。

**不是错误，正常等待即可。**

## 清理编译产物

编译完成后可安全删除以回收空间：

```powershell
$buildDir = "C:\Users\84673\qiji-fork"

# vendor 临时目录（2.8 GB）
Remove-Item "$buildDir\apps\desktop\build\vendor" -Recurse -Force

# win-unpacked 解包目录（3.1 GB）
Remove-Item "$buildDir\apps\desktop\release\win-unpacked" -Recurse -Force

# 保留 release\Qiji-{version}-win-x64.exe（安装包本体）
```

回收约 5.8 GB。

---

## 未来规划：macOS 离线包

> 2026-06-28 分析记录。Windows 离线包已跑通，以下是 Mac 版的可行性评估。

### 现状：已有的基础

electron-builder 的 mac 配置已全部就位（非从零开始）：

- `package.json` 第193-232行：mac target（dmg + zip）、entitlements、
  hardenedRuntime、CFBundleDisplayName "奇计" 已配好
- `npm run dist:mac:dmg` 命令已存在
- `scripts/notarize.cjs` 签名公证脚本已写好（支持 APPLE_NOTARY_PROFILE
  和 APPLE_API_KEY 两种方式）
- `extraResources` 的 vendor 打包配置是跨平台的，Mac 包也会自动带上
  `resources/vendor/`
- `main.cjs` 第3015-3018行：vendorDir 解析逻辑已跨平台
  （只要 resources/vendor/ 存在就识别）

### 缺的部分（需要写的代码）

#### 1. prepare-offline 的 Mac 版本

当前只有 `prepare-offline.ps1`（PowerShell，Windows 专用）。
Mac 路径不同，需要写 `prepare-offline.sh`：

| 组件 | Windows 路径 | Mac 路径 |
|------|-------------|---------|
| Python | `%APPDATA%\uv\python\cpython-3.11-windows-x86_64-none` | `~/.local/share/uv/python/cpython-3.11-macos-*` |
| site-packages | `venv\Lib\site-packages` | `venv/lib/python3.11/site-packages` |
| venv Scripts | `venv\Scripts` | `venv/bin` |
| Chromium | `%LOCALAPPDATA%\ms-playwright` | `~/Library/Caches/ms-playwright` |
| Git | 需打包 PortableGit | Mac 自带，不需要打包（省一块） |

工作量：约半天。照着 .ps1 改路径即可。

#### 2. install.sh 加 vendor 支持（最大工作量）

当前 `install.sh`（2863行）完全没有 vendor/离线逻辑（grep "vendor" 零命中）。
而 `bootstrap-runner.cjs` 第550行明确排除了 posix：

```javascript
const vendorArgs = (!isPosix && vendorDir) ? ['-VendorDir', vendorDir] : []
```

需要：
- 给 install.sh 加 `--vendor-dir` 参数
- 让 prerequisites/venv/python-deps/node-deps 等 stage 优先从 vendor
  复制而非在线下载（对标 install.ps1 的 Stage-VendorFiles）
- 改动约 6-8 个函数，是主要工作量
- 放开 bootstrap-runner.cjs 的 posix vendor 传递

### 时间估计

| 方案 | 内容 | 耗时 |
|------|------|------|
| A（不签名，arm64单架构） | 能跑就行 | 2-3 个工作日 |
| B（签名+公证，正式分发） | A + Apple Developer($99/年) + x64 架构 | 4-5 个工作日 |

### 构建方式：GitHub Actions macOS runner

**不需要有 Mac 机器**。GitHub 提供云端 macOS 虚拟机（M1 芯片，macOS 14）。

**原理：** 在仓库 `.github/workflows/` 放一个 YAML 文件，描述构建步骤。
push 或手动触发后，GitHub 开一台 Mac 执行，跑完把 .dmg 产物上传到 Actions
页面下载。

**费用（2026-06 官方文档确认）：**

GitHub Actions 对 **public 仓库完全免费**（不限量，包括 macOS runner）。
private 仓库按计划扣额度，不同系统消耗倍率不同：

| 系统 | 每分钟费率 | 倍率 |
|------|-----------|------|
| Linux | $0.006 | 1x |
| Windows | $0.010 | ~1.7x |
| macOS | $0.062 | ~10x |

- GitHub Free：每月 2,000 分钟 + 500 MB artifact 存储
- 实际能跑 macOS 约 190-200 分钟（≈3小时）
- 编译一次约 30-40 分钟 → 扣 300-400 分钟 → 每月 5-6 次

**注意：** Free 的 artifact 存储只有 500 MB，.dmg 约 700 MB 超限。
解法：用 GitHub Releases 上传（走仓库存储），或把仓库设为 public。

**当前仓库状态：** `blank-knight/QIJI-agent` 是 private。
如果设为 public → macOS runner 完全免费不限量，但白标改动（品牌名/logo/配置）会公开。

### 待办清单

- [ ] 写 `prepare-offline.sh`（Mac 版 vendor 准备脚本）
- [ ] 给 `install.sh` 加 `--vendor-dir` 参数 + vendor 复制逻辑
- [ ] 放开 `bootstrap-runner.cjs` 第550行的 posix 排除
- [ ] 写 `.github/workflows/build-mac.yml`（GitHub Actions 流水线）
- [ ] 在 Mac 上（或 CI）验证编译 + 安装流程


---

## 未来规划：U盘便携版

> 2026-06-28 分析记录。客户提出"插U盘随插随用"的需求评估。

### 三个层次（难度差距巨大）

#### 层次一：U盘当安装介质（简单，1天）

Windows 和 Mac 离线包弄好后，用 exFAT 格式化U盘（唯一一个 Win+Mac
都能读写且支持大文件的格式），放两个文件夹：

```
/奇计Claw/
├── Windows/Qiji-0.17.0-win-x64.exe   (900MB)
└── Mac/Qiji-0.17.0-mac-arm64.dmg      (~700MB)
```

用户手动打开U盘，点对应安装包。本质是"装了两个安装包的U盘"。
**几乎零额外工作量**——离线包做好往U盘上一拷即可。

#### 层次二：双系统自动识别 + 引导界面（中等，3-5天）

插U盘后显示一个界面，检测操作系统，只显示对应入口。

**限制：** 现代操作系统出于安全考虑禁止U盘自动运行：
- Windows 10+ 禁用了 autorun.inf
- macOS 完全没有U盘自动运行机制
- 只能做到"用户打开U盘后看到一个直观的 index.html"

#### 层次三：真正的便携版——不安装直接从U盘运行（很难）

需要解决的硬骨头：

1. **Python 路径问题**
   venv 里 python.exe 和 shebang 行都是绝对路径，U盘盘符会变（E:/F:）。
   需要把所有硬编码路径改成相对路径，工作量大。

2. **Electron 用户数据重定向**
   默认写到系统目录（%APPDATA%\Qiji / ~/Library/Application Support/Qiji）。
   需改成写到U盘上的 data/ 目录，main.cjs 加几行即可。

3. **原生模块架构**
   node-pty 是编译好的二进制，Windows 版不能在 Mac 上跑。
   U盘里必须同时放两套原生模块，运行时按系统选择。

4. **Mac Gatekeeper**
   macOS 阻止从外部驱动器运行未签名 app，用户需右键→打开→确认。
   除非花 $99/年做 Apple 签名+公证，否则体验差。

5. **U盘目录结构**（总大小约 6-8 GB，需 16GB+ U盘）

   ```
   /奇计Claw/
   ├── launcher.exe           ← Windows 启动器
   ├── launcher.command       ← Mac 启动器
   ├── win/                   ← Windows 全套(~3GB)
   │   ├── electron/
   │   ├── python/
   │   ├── site-packages/
   │   └── chromium/
   ├── mac/                   ← Mac 全套(~3GB)
   │   ├── Qiji.app/
   │   ├── python/
   │   ├── site-packages/
   │   └── chromium/
   └── data/                  ← 共享用户数据(config/skills/memory)
   ```

   预估工作量：2-3 周。

### 建议

先做层次一（零额外成本）。层次三作为独立项目，等离线包都跑通后再搞。
