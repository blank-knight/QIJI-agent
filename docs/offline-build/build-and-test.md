# 编译测试手册

> 完整踩坑记录见 [bugs-and-pitfalls.md](bugs-and-pitfalls.md)

## 为什么必须在 Windows 编译

编译的是 Windows exe，需要 Windows 原生工具链：

1. **native 模块不兼容** — node-pty 的 .node 二进制在 WSL (Linux ext4) 上装的是 Linux 版，Windows electron 加载不了
2. **electron-builder 要 Windows 版 electron** — electron/dist 里是 Windows 的 chrome.exe
3. **跨文件系统 I/O 极慢** — powershell.exe 通过 `\\wsl.localhost\` 访问 WSL 路径，走 9P 协议，52万文件的 node_modules 不可用

结论：WSL 里改代码，robocopy 同步到 Windows NTFS，在 Windows 编译。

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

### 第3步：重新生成 vendor（★坑11）

vendor 是 prepare-offline.ps1 从 fork 源码复制的**快照**，不是实时映射。改了任何 Python 后端代码（web_server.py、setup.py 等），必须删掉旧 vendor 重新生成，否则安装包里的 Python 代码是旧的。

```powershell
# 删旧 vendor
Remove-Item -Recurse -Force "C:\Users\84673\qiji-fork\apps\desktop\build\vendor"

# 重新生成（从 fork 源码复制，约5分钟）
cd C:\Users\84673\qiji-fork
.\scripts\prepare-offline.ps1 -HermesHome "C:\Users\84673\AppData\Local\hermes" -VendorDir "apps\desktop\build\vendor"
```

**验证 vendor 源码是品牌化的（不是上游原版）：**
```powershell
Select-String "Run Hermes|Run QiJi" "C:\Users\84673\qiji-fork\apps\desktop\build\vendor\hermes-agent\hermes_cli\web_server.py"
```
输出应为 "Run QiJi"。如果输出 "Run Hermes"，说明 vendor 源码是上游原版——检查 prepare-offline.ps1 是否从 fork 复制（看输出行 `[5/8] Repository source (from fork)`）。

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

# 第3步：重新生成 vendor
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
- [ ] ps1 脚本已修复编码（CRLF + UTF-8 BOM）
- [ ] vendor 已重新生成（改了 Python 后端时必须）
- [ ] vendor 源码验证通过（"Run QiJi" 而非 "Run Hermes"）
- [ ] Vite 缓存已清除
- [ ] `$env:GITHUB_SHA` 已设置
- [ ] Windows Defender 实时保护已关闭

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
