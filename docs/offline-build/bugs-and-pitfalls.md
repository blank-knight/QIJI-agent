# 踩坑记录

> 每次遇到问题都更新此文档。反复犯的错误用 **【高频】** 标注。

---

## 【高频】坑1：PS1 脚本编码错误（LF → CRLF+BOM）

**严重度：★★★★★（每次同步后必犯）**

**现象：** prepare-offline.ps1 执行报错，解析失败。

**根因：** WSL 文件系统是 LF 换行。robocopy 同步到 Windows 后保持 LF，PowerShell 5.1 解析 LF 编码的 ps1 会出错。

**修复：** 每次同步后执行编码修复：
```powershell
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = "C:\Users\84673\qiji-fork\scripts\$f"
    $raw = [System.IO.File]::ReadAllText($path)
    $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
    $utf8bom = New-Object System.Text.UTF8Encoding($true)
    [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
}
```

**教训：** 这是反复犯的错误。已纳入 build-cheatsheet.md 的"每次同步后必做"。**永远不要跳过这步。**

---

## 坑2：GITHUB_SHA 环境变量缺失

**严重度：★★★☆☆**

**现象：** electron-builder 打包时 build-stamp 写入失败，或打包出的 exe 无版本信息。

**根因：** electron-builder 的 `write-build-stamp.cjs` 需要读取 `$env:GITHUB_SHA` 环境变量。本地编译时未设置。

**修复：** 编译前设置：
```powershell
$env:GITHUB_SHA = git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD
```

---

## 坑3：vendor 嵌套目录（robocopy /XJ 问题）

**严重度：★★★☆☆**

**现象：** vendor 目录里出现嵌套的重复目录，体积翻倍。

**根因：** robocopy 不加 `/XJ` 参数会跟随符号链接（junction points），导致 node_modules 嵌套拷贝。

**修复：** robocopy 命令必须包含 `/XJ`（排除 junction points）。

---

## 【高频】坑4：Playwright Chromium 版本重复（exe 膨胀 2GB）

**严重度：★★★★☆**

**现象：** vendor 目录 5.1GB（正常 2.1GB），exe 从 713MB 涨到 1580MB。

**根因：** `prepare-offline.ps1` 第8步用 `Copy-Item -Recurse` 直接拷整个 `%LOCALAPPDATA%\ms-playwright` 目录。Playwright 升级后会残留旧版本：
```
chromium-1223  (412 MB, 旧版残留)
chromium-1228  (415 MB, 当前版本)
chromium_headless_shell-1223  (267 MB, 旧版残留)
chromium_headless_shell-1228  (269 MB, 当前版本)
ms-playwright  (1368 MB, 嵌套重复)
```
脚本全部拷进来，多了约 2GB 垃圾。

**修复：** prepare-offline.ps1 按 base name 分组，只拷版本号最高的一份：
```powershell
$groups = @{}
Get-ChildItem $pwCache -Directory | ForEach-Object {
    if ($_.Name -match '^(.+)-(\d+)$') {
        $base = $Matches[1]
        $ver = [int]$Matches[2]
        if (-not $groups[$base] -or $ver -gt $groups[$base].Version) {
            $groups[$base] = @{ Version = $ver; Path = $_.FullName }
        }
    }
}
foreach ($entry in $groups.Values) {
    Copy-Item $entry.Path $vendorChromium -Recurse -Force
}
```

修复后：vendor 2.1GB，exe 713MB。

**教训：** prepare-offline 脚本对 HermesHome 缓存做了"信任拷贝"假设——缓存里有什么就拷什么。实际缓存可能残留历史版本。以后凡是从外部目录拷文件，都要检查是否有版本重复。

---

## 【高频】坑5：只改前端 i18n，漏了 Python 后端

**严重度：★★★★★**

**现象：** 消息平台页面显示 "Connect Hermes to Discord..."，但前端 i18n 文件早已改成"奇计"。

**根因：** 消息平台的描述文字不是前端 i18n，而是 Python 后端 API 动态返回的：
```
桌面端 → HTTP API → hermes_cli/web_server.py MESSAGING_PLATFORM_CATALOG → description 字段
```

前端只是展示后端返回的 text，光改前端 i18n 完全没用。

**修复：** 同时修改两处：
1. 前端 i18n（zh.ts / en.ts / zh-hant.ts / ja.ts）— 界面 UI 文字
2. Python 后端（hermes_cli/web_server.py L4380-L4560）— 平台描述
3. Python CLI（hermes_cli/setup.py L3313）— setup 向导提示

**教训：** 品牌替换必须区分"文字来源"。桌面端的文字来自三个独立通道：
- 前端 i18n（大多数 UI 文字）
- 后端 API 返回（消息平台描述、提供方信息等动态内容）
- CLI 输出（setup 向导、命令行提示）

**改品牌时三处都要改，缺一个就会出现残留。** 详见 brand-customization.md。

---

## 坑6：NSIS LZMA 压缩极慢

**严重度：★★★☆☆**

**现象：** NSIS 打包阶段耗时 ~10分钟，占总编译时间 80%+。

**根因：** electron-builder 默认 compression="maximum"（LZMA ultra）。vendor 里 2GB+ 文件全部用极限压缩。但 vendor 内容多为已压缩二进制（.pyc、.exe、Chrome），LZMA 再压收益很小。

**修复（待实施）：** 将 package.json build 段加入 `"compression": "normal"`，预期 NSIS 从 ~10分钟降到 ~3-5分钟。

**教训：** 安装包的压缩级别应根据内容类型调整。全是二进制的 vendor 不需要极限压缩。

---

## 坑7：在运行中的 Hermes 实例上编译

**严重度：★★★★☆**

**现象：** 编译覆盖了正在运行的 Hermes 代码，导致运行实例崩溃或行为异常。

**根因：** 早期做法是直接在 WSL 的 Hermes 目录里编译。编译产物（node_modules、build、release）覆盖运行代码。

**修复：** 隔离编译。维护独立的 Windows 编译副本 `C:\Users\84673\qiji-fork`，与运行中的 Hermes 完全隔离。运行实例只作为 prepare-offline 的只读依赖源（Python、Git、site-packages）。

**教训：** 永远在独立副本编译，绝不碰运行实例。

---

## 【高频】坑8：Apple-touch-icon 未替换（关于页头像）

**严重度：★★★☆☆**

**现象：** 关于页面头像还是 Hermes 的女生图标。

**根因：** 只替换了 `icon.png` 和 `qiji-brand.png`，漏了 `apple-touch-icon.png`。关于页/窗口图标/浏览器 favicon 用的是 apple-touch-icon.png。

**修复：** 用奇计品牌图标覆盖 `public/apple-touch-icon.png`。

**教训：** 品牌图标有多个文件，不同位置引用不同的图标文件。必须全部替换，不能只换一个。详见 brand-customization.md 第2层。

---

## 坑9：Dev 模式后端缺 python-multipart

**严重度：★★★☆☆**

**现象：** `npm run dev` 启动后，窗口弹出但卡在启动报错页：
```
RuntimeError: Form data requires "python-multipart"
```

**根因：** Dev 模式用系统 Python（`C:\Users\84673\AppData\Local\Programs\Python\Python313\`）启动后端，但该环境缺 python-multipart 包。注意系统有多个 Python 环境（如 `c:\veighna_studio\`），裸 `pip install` 会装到错误环境。

**修复：** 必须用完整路径的 python.exe：
```powershell
& "C:\Users\84673\AppData\Local\Programs\Python\Python313\python.exe" -m pip install python-multipart
```

---

## 坑10：Dev 模式后端 uvicorn 版本过旧

**严重度：★★★☆☆**

**现象：** 修复 python-multipart 后，后端仍崩溃：
```
AttributeError: 'Server' object has no attribute 'capture_signals'
```

**根因：** 系统 Python 3.13 的 uvicorn 版本太旧，`Server.capture_signals()` 是较新版本才有的方法。`web_server.py` L13061 用了这个 API。

**修复：** 升级 uvicorn：
```powershell
& "C:\Users\84673\AppData\Local\Programs\Python\Python313\python.exe" -m pip install --upgrade uvicorn
```

---

## 【高频】坑11：prepare-offline.ps1 从错误位置复制 Python 源码 → 离线包后端是上游原版

**严重度：★★★★★（品牌化彻底失败）**

**现象：** fork 里 web\_server.py 已改成 "Run QiJi from Telegram DMs..."，同步到编译目录，跑 prepare-offline + NSIS 编译出 exe，安装后消息平台页面仍显示 "Run Hermes from Telegram DMs..."。

**根因（源码验证）：**

prepare-offline.ps1 原版 L62-72，Python 源码从这里复制：
```powershell
$installDir = Join-Path $HermesHome "hermes-agent"   # = 已安装的上游 Hermes
```

它从**本地已安装的 Hermes Agent**（上游原版）复制源码到 vendor，而不是从 fork 自己的源码复制。所以不管 fork 里改了多少品牌文案，vendor 里永远是上游原版。

**为什么 npm run dev 没有这个问题？**

dev 模式和离线包的后端来源完全不同（main.cjs `resolveHermesBackend()` L2833-2849）：

| 模式 | 后端 Python 来源 | 机制 |
|------|-----------------|------|
| `npm run dev` | **fork 源码**（SOURCE\_REPO\_ROOT）| L2846: `!IS_PACKAGED && isHermesSourceRoot(SOURCE_REPO_ROOT)` → 直接用 fork 的 web\_server.py |
| 离线包（packaged） | **安装目录**（ACTIVE\_HERMES\_ROOT）| L2857: `isBootstrapComplete()` → 用 `$HermesHome\hermes-agent`（上游原版）|

dev 模式跳过安装目录，直接用 fork 源码跑后端 → 显示 "Run QiJi" ✅。离线包用安装目录的源码 → 显示 "Run Hermes" ❌。这就是为什么热更新测不出这个问题。

**修复（已实施）：** prepare-offline.ps1 L62-72 改为优先从 fork 源码复制：
```powershell
# 5. Repository source
# Use the fork's own source (brand-customized), NOT the installed Hermes Agent.
$repoSource = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installDir = Join-Path $HermesHome "hermes-agent"
$vendorRepo = Join-Path $VendorDir "hermes-agent"
if (Test-Path $repoSource) {
    New-Item -ItemType Directory -Force -Path $vendorRepo | Out-Null
    robocopy $repoSource $vendorRepo /E /XJ /XD ".git" "venv" "node_modules" "__pycache__" "build" "dist" "release" ".venv" /NJH /NJS /NFL /NDL /NP | Out-Null
    Write-Host "[5/8] Repository source (from fork) ✅" -ForegroundColor Cyan
} elseif (Test-Path $installDir) {
    # Fallback: use installed Hermes Agent source
    New-Item -ItemType Directory -Force -Path $vendorRepo | Out-Null
    robocopy $installDir $vendorRepo /E /XJ /XD ".git" "venv" "node_modules" "__pycache__" "build" "dist" "release" ".venv" /NJH /NJS /NFL /NDL /NP | Out-Null
    Write-Host "[5/8] Repository source (from installed Hermes, WARNING: not branded) ✅" -ForegroundColor Yellow
}
```

**验证：** 重新生成 vendor 后检查：
```powershell
Select-String "Run Hermes|Run QiJi" "C:\Users\84673\qiji-fork\apps\desktop\build\vendor\hermes-agent\hermes_cli\web_server.py"
```
输出应为 "Run QiJi"。如果输出 "Run Hermes"，vendor 源码还是旧的。

**教训：**
1. **vendor 是快照，不是实时映射。** 每次改了 Python 后端，必须删掉 vendor 重新 `prepare-offline.ps1`。只改前端（tsx/ts）不受影响——前端是 Vite 从编译目录直接打包的。
2. **dev 模式不能替代离线包验证。** dev 模式的后端来自 fork 源码（SOURCE\_REPO\_ROOT），离线包的后端来自安装目录（ACTIVE\_HERMES\_ROOT）。品牌文案验证必须以离线包安装后的实际表现为准。
3. **改动涉及品牌化的 Python 文件清单：** web\_server.py、setup.py、tips.py 等——只要改了任意一个，就必须重新生成 vendor。

---

## 坑12：install.ps1 升级时跳过 vendor 拷贝（品牌化残留）

**严重度：★★★★☆**

**现象：** 已装过奇计/Hermes 的用户，装新版离线包后，消息平台描述仍显示旧品牌名（"Run Hermes" 而非 "Run QiJi"）。全新安装的用户没有这个问题。

**根因（源码验证）：** install.ps1 原版 L158：
```powershell
if ((Test-Path $vendorRepo) -and -not (Test-Path (Join-Path $InstallDir "cli.py"))) {
    Copy-Item $vendorRepo $InstallDir -Recurse -Force
}
```
条件 `-not (Test-Path "cli.py")` 意味着：**只有安装目录没有 cli.py 时才拷 vendor 仓库**。已装过的用户安装目录里 cli.py 存在 → vendor 拷贝被跳过 → 旧的品牌化代码原封不动。

三种场景对比：

| 场景 | cli.py 存在？ | vendor 拷贝？ | 结果 |
|------|-------------|-------------|------|
| 全新电脑（没装过） | ❌ | ✅ | 品牌化生效 |
| 之前装过，覆盖安装 | ✅ | ⏭️ 跳过 | ❌ 旧代码残留 |
| 卸载后重装（卸载不删后端目录） | ✅ | ⏭️ 跳过 | ❌ 旧代码残留 |

**修复（已实施）：** install.ps1 L158 去掉 cli.py 检查条件，强制覆盖：
```powershell
if (Test-Path $vendorRepo) {
    Copy-Item $vendorRepo $InstallDir -Recurse -Force
}
```

**教训：** vendor 覆盖逻辑不能依赖"是否已安装"判断。升级场景和全新安装场景应该走相同的 vendor 拷贝流程。

---

## 坑13：误删 AppData\Local\hermes 工具链目录

**严重度：★★★★☆**

**现象：** 清理卸载残留时，误删了 `C:\Users\<user>\AppData\Local\hermes\`，导致 prepare-offline.ps1 无法收割工具链（uv/git/node/python/site-packages），第3步报错或产物不完整。

**根因：** 这个目录有双重身份：
1. **旧后端源码残留**位置（`hermes-agent\hermes_cli\` 下的品牌化代码）
2. **hermes CLI 工具链**目录（uv/git/node/python/venv/site-packages/node_modules）

prepare-offline.ps1 需要从这里收割工具链打包进 vendor。删了这个目录 = 删了工具链。

**修复：** 如果误删了，重装 hermes CLI 恢复：
```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

**教训：** 清理卸载残留时，只删以下目录：
- `D:\奇计Claw\` 或 `D:\奇计Agent\`（桌面 app 安装目录）
- `C:\Users\<user>\AppData\Roaming\Qiji\`（用户数据）
- `C:\Users\<user>\AppData\Roaming\奇计\`（用户数据）
- 开始菜单快捷方式 .lnk
- 注册表卸载条目

**不要删** `C:\Users\<user>\AppData\Local\hermes\`，那是工具链目录。

---

## 坑14：Python 解释器复制到 uv store 失败（uv trampoline entity not found）

**严重度：★★★★★（安装完成后无法启动，用户看到"couldn't start"白屏）**

**现象：** 离线包安装完成后，app 启动报错：
```
uv trampoline failed to spawn Python child process
Caused by: entity not found (os error 2)
奇计 backend exited before it became ready (1)
```

**根因（源码验证）：**

venv 里的 `Scripts\python.exe` 是 uv 的 trampoline（跳板程序），它启动时读 `venv\pyvenv.cfg` 的 `home` 路径，然后去那个路径找真正的 Python 解释器。

旧架构：pyvenv.cfg 的 home 指向 `%APPDATA%\uv\python\cpython-3.11-windows-x86_64-none\`，安装时用 `Copy-Item -Recurse` 从 vendor 复制到这个路径。`Copy-Item` 有两个致命问题：
1. **长路径静默失败**：Windows MAX_PATH=260，site-packages 里深层路径可能超限，Copy-Item 不报错直接跳过
2. **Defender 拦截**：实时扫描可能在复制过程中锁文件，导致部分文件丢失

**修复（2026-07-06 终极修复 — uv trampoline 硬编码路径）：**

之前 2026-07-04 的修复（改 pyvenv.cfg 的 home + robocopy）是**无效的**。

**真正根因：** uv 生成的 trampoline 二进制文件（`python.exe`、`hermes.exe` 等）把编译机的 Python 路径**硬编码在二进制内部**：
```
C:\Users\84673\AppData\Roaming\uv\python\cpython-3.11-windows-x86_64-none\python.exe
```
Trampoline 启动时从内嵌资源读取路径，**不读 pyvenv.cfg**。所以改 pyvenv.cfg 没有任何效果。

**终极修复（2026-07-06）：** 在 `Stage-VendorFiles` 复制 venv-scripts 之后：
1. **python.exe**：用 `InstallDir\python\python.exe`（真正的 Python 解释器）覆盖 `venv\Scripts\python.exe`（trampoline）。真正的 Python 会通过 pyvenv.cfg 检测 venv 环境。
2. **entry-point exe**（hermes.exe 等）：删除 trampoline，用 batch wrapper 替代：
   ```batch
   @echo off
   "InstallDir\python\python.exe" -m hermes_cli.main %*
   ```

验证方法：
```powershell
# python.exe 不应包含 build machine 的路径
strings venv\Scripts\python.exe | findstr "84673"
# 应返回空
```

**旧版离线包（未重构）的目标机器快速修复：**
```powershell
# 检查 Python 是否到位
Test-Path "$env:APPDATA\uv\python\cpython-3.11-windows-x86_64-none\python.exe"
# 如果 False，从安装目录手动复制
$src = "D:\qijclaw\Qiji\resources\vendor\python"
$dst = "$env:APPDATA\uv\python\cpython-3.11-windows-x86_64-none"
New-Item -ItemType Directory -Force -Path (Split-Path $dst) | Out-Null
robocopy $src $dst /E /NJH /NJS /NFL /NDL /NP
```
复制完后重启奇计。

---

## 坑15：python.exe 缺 DLL → STATUS_DLL_NOT_FOUND (exit 3221225781)

**严重度：★★★★★（坑14 的遗留 bug — 安装后后端无限崩溃白屏）**

**现象：** 离线包安装成功（15 阶段全绿），但 app 启动后 backend 反复崩溃，desktop.log 循环输出：
```
奇计 backend exited (3221225781)
奇计 backend exited before it became ready (3221225781).
```

**退出码解读：** `3221225781` = `0xC0000135` = `STATUS_DLL_NOT_FOUND`。进程在 OS 加载器阶段就死了，一行 Python 代码都没跑到。

**根因（2026-07-08 objdump PE 导入表分析验证）：**

坑14 的修复把 `python.exe` 从 `InstallDir\python\` 复制到 `venv\Scripts\`，**但没复制它依赖的 DLL**。原注释声称"python.exe 通过 pyvenv.cfg 的 home key 找 DLL"——**这是错误的**。

```
objdump -p python.exe 导入表:
  DLL Name: python311.dll         ← 静态导入（非 delay-load！）
  DLL Name: VCRUNTIME140.dll
  DLL Name: api-ms-win-crt-*.dll  ← Win10+ 系统自带
Delay Import Directory: 00000000 00000000  ← 空 = 全是静态导入
```

**关键机制：** `python311.dll` 是**静态导入**。Windows OS 加载器在进程创建时就要解析它——**早于**任何 Python 代码运行。pyvenv.cfg 解析发生在 Python 解释器初始化阶段（`Py_Initialize`），那时 DLL 早已被 OS 加载器处理完毕。"通过 pyvenv.cfg home key 找 DLL"在机制上不可能成立。

**install.ps1 修复（2026-07-08）：** 坑14 的 d.2 步骤现在额外复制 4 个 DLL 到 `venv\Scripts\`：
```powershell
$requiredDlls = @('python311.dll', 'python3.dll', 'VCRUNTIME140.dll', 'vcruntime140_1.dll')
foreach ($dll in $requiredDlls) {
    $srcDll = Join-Path $managedPython $dll
    if (Test-Path $srcDll) {
        Copy-Item $srcDll (Join-Path $managedVenv "Scripts\$dll") -Force
    }
}
```

**已装机热修（不重编译）：** 在目标机器 PowerShell 跑：
```powershell
$python = "$env:LOCALAPPDATA\hermes\hermes-agent\python"
$venv = "$env:LOCALAPPDATA\hermes\hermes-agent\venv\Scripts"
Copy-Item "$python\python311.dll","$python\python3.dll","$python\VCRUNTIME140.dll","$python\vcruntime140_1.dll" $venv -Force
```

**重装机注意：** install.ps1 的 vendor staging 有 `if (-not (Test-Path venv\Scripts\python.exe))` 条件。已有安装不会重新触发 staging。重装前必须先删 `%LOCALAPPDATA%\hermes`。

**诊断技术（PE 导入表分析）：**
```bash
# 从 WSL 检查 PE 文件的导入表
objdump -p "/mnt/c/.../python.exe" | grep "DLL Name"
# Delay Import Directory 全零 = 静态导入 = DLL 必须在 exe 同目录或 PATH
```

**Meta 教训：** 坑14 在 2026-07-06 被"修复"了（替换 trampoline），但修复本身又遗漏了 DLL。**修复一个 bug 时，必须验证修复本身的前置条件是否满足**（python.exe 能跑吗？不只是文件存在不存在）。注释里声称的机制未经 PE 分析验证就写进去了。
