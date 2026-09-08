# qiji-asar-hotswap.ps1 — asar 快车道热替换脚本 v1
# 用法: 把本脚本和新 app.asar 放同一文件夹, 右键"使用 PowerShell 运行"
# 流程: 找安装目录 → 杀 Qiji 进程 → 备份旧 asar → 换新 asar → 报告版本

$ErrorActionPreference = 'Stop'
Write-Host '=== Qiji asar 热替换 ===' -ForegroundColor Cyan

# 1. 定位脚本所在目录的新 asar
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$newAsar = Join-Path $scriptDir 'app.asar'
if (-not (Test-Path $newAsar)) { Write-Host "[X] 未找到 app.asar (应与本脚本同目录)" -ForegroundColor Red; Read-Host '回车退出'; exit 1 }
Write-Host "[1/5] 新 asar: $newAsar ($([math]::Round((Get-Item $newAsar).Length/1MB,1)) MB)"

# 2. 找安装目录(默认+注册表兜底)
$installDir = "$env:LOCALAPPDATA\Programs\Qiji"
if (-not (Test-Path (Join-Path $installDir 'resources\app.asar'))) {
    $reg = Get-ItemProperty 'HKCU:\Software\Qiji' -ErrorAction SilentlyContinue
    if ($reg -and $reg.InstallDir -and (Test-Path (Join-Path $reg.InstallDir 'resources\app.asar'))) {
        $installDir = $reg.InstallDir
    } else {
        # 全盘常见位置兜底
        foreach ($p in @("$env:LOCALAPPDATA\Programs\qiji", "D:\Qiji", "C:\Qiji")) {
            if (Test-Path (Join-Path $p 'resources\app.asar')) { $installDir = $p; break }
        }
    }
}
$targetAsar = Join-Path $installDir 'resources\app.asar'
if (-not (Test-Path $targetAsar)) { Write-Host "[X] 未找到 Qiji 安装目录(找过 Programs\Qiji/注册表/常见位置)" -ForegroundColor Red; Read-Host '回车退出'; exit 1 }
Write-Host "[2/5] 安装目录: $installDir"

# 3. 杀 Qiji 进程(旧版运行中会锁 asar)
$killed = Get-Process -Name 'Qiji' -ErrorAction SilentlyContinue
if ($killed) { $killed | Stop-Process -Force; Start-Sleep -Seconds 2; Write-Host "[3/5] 已结束 $($killed.Count) 个 Qiji 进程" } else { Write-Host '[3/5] Qiji 未在运行' }

# 4. 备份+替换
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backup = "$targetAsar.bak_$stamp"
Copy-Item $targetAsar $backup -Force
Copy-Item $newAsar $targetAsar -Force
Write-Host "[4/5] 已备份旧版: $(Split-Path -Leaf $backup)"

# 5. 验证 + 完成
$newHash = (Get-FileHash $newAsar -Algorithm MD5).Hash
$targetHash = (Get-FileHash $targetAsar -Algorithm MD5).Hash
if ($newHash -eq $targetHash) {
    Write-Host "[5/5] 替换成功, MD5 一致" -ForegroundColor Green
    Write-Host ''
    Write-Host '现在启动 Qiji 测试。有问题把 xxx.bak_时间戳 改回 app.asar 即回滚。' -ForegroundColor Yellow
} else {
    Write-Host "[!] MD5 不一致, 可能替换失败, 请把备份改回 app.asar" -ForegroundColor Red
}
Read-Host '回车退出'
