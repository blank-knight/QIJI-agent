# 奇计离线包编译速查

> 完整文档见 [offline-build-guide.md](offline-build-guide.md)

## 首次准备（只做一次）

```powershell
# 在 Windows PowerShell 里
robocopy \\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork C:\Users\84673\qiji-fork /E /XJ /XD ".git" "venv" "__pycache__" ".venv" "node_modules" "build" "release" "dist" /XF "*.pyc" "*.pyo" /NJH /NJS /NFL /NDL /NP /R:1 /W:1

cd C:\Users\84673\qiji-fork
npm install
```

## 每次编译（3步）

```powershell
# 1. 同步最新代码（如果 fork 有新 commit）
robocopy \\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork C:\Users\84673\qiji-fork /MIR /XJ /XD ".git" "venv" "__pycache__" ".venv" "node_modules" "build" "release" "dist" /XF "*.pyc" "*.pyo" /NJH /NJS /NFL /NDL /NP /R:1 /W:1

# 2. 生成 vendor（约5分钟，产物2.8GB）
cd C:\Users\84673\qiji-fork
.\scripts\prepare-offline.ps1 -HermesHome "C:\Users\84673\AppData\Local\hermes" -VendorDir "apps\desktop\build\vendor"

# 3. 编译（约15分钟，产物900MB）
cd apps\desktop
$env:GITHUB_SHA = (git -C "\\wsl.localhost\Ubuntu\home\zwt\clawd\qiji-fork" rev-parse HEAD)
npm run dist:win:nsis
```

产物在：`C:\Users\84673\qiji-fork\apps\desktop\release\Qiji-*.exe`

## 为什么不能直接在 WSL 仓库里编译？

编译的是 Windows exe，需要 Windows 原生工具链，而 WSL 是 Linux 文件系统：

1. **native 模块不兼容** — npm install 装的 node-pty 有 .node 二进制文件，WSL 上装的是 Linux 版，Windows electron 加载不了。必须在 NTFS 上用 Windows node 装一遍。
2. **electron-builder 要 Windows 版 electron** — electron/dist 里是 Windows 的 chrome.exe / electron.exe，WSL 文件系统上没有。
3. **跨文件系统 I/O 极慢** — 让 powershell.exe 通过 `\\wsl.localhost\` 访问 WSL 路径，52万文件的 node_modules 走 9P 协议慢到不可用。

如果编译 Linux 版（AppImage）则可以直接在 WSL 里搞，不用复制。

## 注意

- ps1 编码报错 → 修 BOM+CRLF（见完整文档）
- vendor 嵌套膨胀 → 确认 prepare-offline.ps1 有 /XJ
- git commit 报错 → 设 $env:GITHUB_SHA
