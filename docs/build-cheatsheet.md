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

## 注意

- ps1 编码报错 → 修 BOM+CRLF（见完整文档）
- vendor 嵌套膨胀 → 确认 prepare-offline.ps1 有 /XJ
- git commit 报错 → 设 $env:GITHUB_SHA
