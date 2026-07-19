# build.ps1 — 奇计离线包一键编译
# 用法: 在仓库根目录运行 .\build.ps1
# 可选参数: -SkipVendor（跳过 vendor 生成，仅改了前端时用）
#           -SkipBuild（只生成 vendor，不编译，调试用）

param(
    [switch]$SkipVendor,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot
$hermesHome = "$env:LOCALAPPDATA\hermes"

Write-Host "`n=== 奇计离线包编译 ===" -ForegroundColor Green
Write-Host "Repo: $repoRoot"
Write-Host "HermesHome: $hermesHome`n"

# 第0步：验证 Hermes CLI 工具链
Write-Host "[0/5] 验证工具链..." -ForegroundColor Cyan
$toolchainChecks = @(
    @{ Name="hermes-agent venv"; Path="$hermesHome\hermes-agent\venv\Scripts\python.exe" },
    @{ Name="uv.exe";           Path="$hermesHome\bin\uv.exe" },
    @{ Name="git.exe";          Path="$hermesHome\git\cmd\git.exe" },
    @{ Name="node.exe";         Path="$hermesHome\node\node.exe" },
    @{ Name="rg.exe";           Path="$hermesHome\tools\rg.exe" }
)
$missing = @()
foreach ($c in $toolchainChecks) {
    if (Test-Path $c.Path) {
        Write-Host "  ✅ $($c.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($c.Name) — $($_.Path)" -ForegroundColor Red
        $missing += $c.Name
    }
}
if ($missing.Count -gt 0) {
    Write-Host "`n工具链缺失，无法编译。请先安装 Hermes CLI：" -ForegroundColor Red
    Write-Host "  iex (irm https://www.aicps.vip/install.ps1)" -ForegroundColor Yellow
    exit 1
}

# 第1步：修复 PowerShell 脚本编码（LF → CRLF + UTF8 BOM）
Write-Host "`n[1/5] 修复 PowerShell 脚本编码..." -ForegroundColor Cyan
foreach ($f in @("prepare-offline.ps1","install.ps1")) {
    $path = Join-Path $repoRoot "scripts\$f"
    if (Test-Path $path) {
        $raw = [System.IO.File]::ReadAllText($path)
        $crlf = $raw -replace "`r`n", "`n" -replace "`n", "`r`n"
        $utf8bom = New-Object System.Text.UTF8Encoding($true)
        [System.IO.File]::WriteAllText($path, $crlf, $utf8bom)
        Write-Host "  ✅ $f" -ForegroundColor Green
    }
}

# 第2步：生成 vendor（从仓库根目录拷贝源码 + 从 HermesHome 收割工具链）
if (-not $SkipVendor) {
    Write-Host "`n[2/5] 生成 vendor（约 5 分钟）..." -ForegroundColor Cyan
    $vendorDir = Join-Path $repoRoot "apps\desktop\build\vendor"
    if (Test-Path $vendorDir) { Remove-Item -Recurse -Force $vendorDir -ErrorAction SilentlyContinue }
    # If stale vendor remains (e.g. a 'nul' device-reserved file blocks deletion),
    # rename it aside and start fresh. prepare-offline.ps1 recreates the dir.
    if (Test-Path $vendorDir) {
        $stamp = Get-Date -Format 'yyyyMMddHHmmss'
        $quarantine = "${vendorDir}.old.${stamp}"
        Write-Host "  无法删除旧 vendor，隔离到 $quarantine" -ForegroundColor Yellow
        Move-Item $vendorDir $quarantine -ErrorAction SilentlyContinue
    }
    & (Join-Path $repoRoot "scripts\prepare-offline.ps1") `
        -HermesHome $hermesHome `
        -VendorDir $vendorDir
    # prepare-offline.ps1 内部用了 robocopy（成功码 0 或 1）和 npm（可能返回非 0），
    # $LASTEXITCODE 不可靠。改为检查 vendor 目录是否真的生成了关键组件。
    $hermesAgentDir = Join-Path $vendorDir "hermes-agent"
    if (-not (Test-Path $hermesAgentDir)) {
        Write-Host "`n❌ vendor 生成失败（hermes-agent 目录缺失）" -ForegroundColor Red
        exit 1
    }

    # 验证 vendor 品牌化（应为 Run QiJi，不是 Run Hermes）
    Write-Host "`n[2.1] 验证 vendor 品牌化..." -ForegroundColor Cyan
    $vendorServerPy = Join-Path $vendorDir "hermes-agent\hermes_cli\web_server.py"
    if (Test-Path $vendorServerPy) {
        $branding = Select-String "Run Hermes|Run QiJi" $vendorServerPy -ErrorAction SilentlyContinue
        if ($branding) {
            foreach ($m in $branding) { Write-Host "  $($m.Line.Trim())" }
        }
    }

    # 验证 vendor 完整性
    Write-Host "`n[2.2] 验证 vendor 完整性..." -ForegroundColor Cyan
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
    $allOk = $true
    foreach ($c in $checks) {
        $full = Join-Path $vendorDir $c.Path
        if (Test-Path $full) {
            Write-Host "  ✅ $($c.Name)" -ForegroundColor Green
        } else {
            Write-Host "  ❌ $($c.Name) — 缺失!" -ForegroundColor Red
            $allOk = $false
        }
    }
    if (-not $allOk) {
        Write-Host "`n❌ vendor 不完整，放弃编译" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n[2/5] 跳过 vendor 生成（-SkipVendor）" -ForegroundColor Yellow
}

if ($SkipBuild) {
    Write-Host "`n=== vendor 生成完成（-SkipBuild，跳过编译）===" -ForegroundColor Green
    exit 0
}

# 第3步：清 Vite 缓存 + 设置 commit hash
Write-Host "`n[3/5] 清缓存 + 设置 commit hash..." -ForegroundColor Cyan
$desktopDir = Join-Path $repoRoot "apps\desktop"
$viteCache = Join-Path $desktopDir "node_modules\.vite"
if (Test-Path $viteCache) {
    Remove-Item -Recurse -Force $viteCache
    Write-Host "  ✅ 清除 Vite 缓存" -ForegroundColor Green
}
# 尝试多种方式获取 commit hash
$commitSha = $null
if (Test-Path "$repoRoot\.git") {
    try {
        $commitSha = (git -C $repoRoot rev-parse HEAD 2>$null).Trim()
    } catch {}
}
if (-not $commitSha -and (Test-Path "$repoRoot\.git\HEAD")) {
    $headContent = (Get-Content "$repoRoot\.git\HEAD" -ErrorAction SilentlyContinue).Trim()
    if ($headContent -match '^ref:') {
        $refPath = $headContent -replace '^ref:\s*', ''
        $fullPath = Join-Path "$repoRoot\.git" $refPath
        if (Test-Path $fullPath) {
            $commitSha = (Get-Content $fullPath -ErrorAction SilentlyContinue).Trim()
        }
    } else {
        $commitSha = $headContent
    }
}
if ($commitSha) {
    $env:GITHUB_SHA = $commitSha
    Write-Host "  GITHUB_SHA: $env:GITHUB_SHA" -ForegroundColor Green
} else {
    $env:GITHUB_SHA = "offline-build"
    Write-Host "  GITHUB_SHA: $env:GITHUB_SHA (无法获取，用兜底值)" -ForegroundColor Yellow
}

# 第4步：编译前端 + 打包 win-unpacked（跳过 NSIS）
# 7z SFX 方案不需要 NSIS——build-installer.cjs 直接压缩 win-unpacked。
# 用 --dir 跳过 NSIS LZMA 压缩（省 10-15 分钟），最终产物由第 5 步生成。
Write-Host "`n[4/5] 编译前端 + 打包 win-unpacked（约 5 分钟）..." -ForegroundColor Cyan
Push-Location $desktopDir
try {
    # build = tsc + vite build + postbuild；builder --dir = electron-builder 只打 unpacked
    npm run build
    $buildExit = $LASTEXITCODE
    if ($buildExit -eq 0) {
        npm run builder -- --dir
        $exitCode = $LASTEXITCODE
    } else {
        $exitCode = $buildExit
    }
} finally {
    Pop-Location
}

if ($exitCode -ne 0) {
    Write-Host "`n❌ 编译失败（exit code: $exitCode）" -ForegroundColor Red
    exit $exitCode
}

# 验证 win-unpacked 生成了
$winUnpackedExe = Join-Path $desktopDir "release\win-unpacked\Qiji.exe"
if (-not (Test-Path $winUnpackedExe)) {
    Write-Host "`n❌ win-unpacked\Qiji.exe 未生成" -ForegroundColor Red
    exit 1
}
Write-Host "  ✅ win-unpacked 生成完成" -ForegroundColor Green

# 第5步：7z SFX 打包（launcher3.exe + qiji-portable.7z）
Write-Host "`n[5/5] 7z SFX 打包（约 3-5 分钟）..." -ForegroundColor Cyan
$installerDir = Join-Path $desktopDir "installer"
Push-Location $installerDir
try {
    node "build-installer.cjs"
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($exitCode -eq 0) {
    Write-Host "`n✅ 编译完成！" -ForegroundColor Green
    $exe = Get-ChildItem (Join-Path $desktopDir "release\Qiji-*-Setup.exe") -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        $sizeMB = "{0:N0}" -f ($exe.Length / 1MB)
        Write-Host "   产物: $($exe.Name) ($sizeMB MB)" -ForegroundColor Cyan
        Write-Host "   路径: $($exe.FullName)" -ForegroundColor Cyan
    }
} else {
    Write-Host "`n❌ 7z SFX 打包失败（exit code: $exitCode）" -ForegroundColor Red
    exit $exitCode
}
