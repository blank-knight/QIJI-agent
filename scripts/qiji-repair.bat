<# :
@echo off
:: ============================================================================
:: Qiji Repair — double-click to run
:: ============================================================================
:: Customers double-click this file. The PowerShell code below is embedded.
:: No separate .ps1 needed.
:: ============================================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((Get-Content -Raw '%~f0') -replace '(?s)^<# .* #>','')"
echo.
echo Repair finished. Press any key to close.
pause >nul
exit /b
#>

# ============================================================================
# Qiji Diagnose & Repair
# ============================================================================

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$HermesHome = "$env:LOCALAPPDATA\hermes"
$InstallDir = "$HermesHome\hermes-agent"

# ============================================================================
# Find vendor directory — search registry first, then filesystem
# ============================================================================
$VendorDir = $null
$AppDir = $null

# Method 1: Windows Registry (NSIS writes install location here)
$regRoots = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
)
$found = $false
foreach ($root in $regRoots) {
    if ($found) { break }
    $keys = Get-ChildItem $root -ErrorAction SilentlyContinue
    foreach ($key in $keys) {
        $props = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
        $name = "$($props.DisplayName)"
        $icon = "$($props.DisplayIcon)"
        $loc = "$($props.InstallLocation)"
        if ($name -like "*Qiji*" -or $icon -like "*Qiji*") {
            $candidate = if ($loc -and (Test-Path $loc)) { $loc }
                         elseif ($icon) { Split-Path $icon }
            if ($candidate -and (Test-Path "$candidate\resources\vendor")) {
                $AppDir = $candidate
                $VendorDir = "$candidate\resources\vendor"
                $found = $true
                break
            }
        }
    }
}

# Method 2: Filesystem scan — check all fixed drives' common dirs
if (-not $VendorDir) {
    $searchDirs = @("$env:LOCALAPPDATA\Programs", "C:\Program Files", "C:\Program Files (x86)")
    # Also add all drive roots
    $drives = Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue
    foreach ($drv in $drives) {
        $searchDirs += "$($drv.Root)"
    }
    foreach ($base in $searchDirs) {
        if (-not (Test-Path $base)) { continue }
        $dirs = Get-ChildItem $base -Directory -Depth 2 -ErrorAction SilentlyContinue |
            Where-Object { Test-Path "$($_.FullName)\Qiji.exe" -ErrorAction SilentlyContinue }
        foreach ($d in $dirs) {
            if (Test-Path "$($d.FullName)\resources\vendor") {
                $AppDir = $d.FullName
                $VendorDir = "$($d.FullName)\resources\vendor"
                break
            }
        }
        if ($VendorDir) { break }
    }
}

if (-not $VendorDir) {
    Write-Host ""
    Write-Host "[ERROR] Cannot find Qiji installation." -ForegroundColor Red
    Write-Host "        Searched: Windows Registry + all drives." -ForegroundColor Gray
    Write-Host ""
    Write-Host "        Please contact support with your Qiji.exe location." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Qiji Diagnose & Repair ===" -ForegroundColor Cyan
Write-Host "App dir:    $AppDir"
Write-Host "Vendor dir: $VendorDir"
Write-Host "HermesHome: $HermesHome"
Write-Host ""

# ============================================================================
# Check + repair function
# ============================================================================
function Check-And-Repair {
    param(
        [string]$Label,
        [string]$Source,
        [string]$Target,
        [string]$CriticalFile,
        [switch]$IsDir
    )
    $checkPath = if ($CriticalFile) { Join-Path $Target $CriticalFile } else { $Target }
    if (Test-Path $checkPath) {
        Write-Host "[OK]      $Label" -ForegroundColor Green
        return $true
    }
    Write-Host "[BROKEN]   $Label" -ForegroundColor Red
    Write-Host "          Missing: $checkPath" -ForegroundColor Gray
    if (-not (Test-Path $Source)) {
        Write-Host "[SKIP]    Source not in vendor: $Source" -ForegroundColor Yellow
        return $false
    }
    Write-Host "[REPAIR]  Re-copying from vendor..." -ForegroundColor Cyan
    if ($IsDir) {
        if (Test-Path $Target) { Remove-Item $Target -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path $Target -ErrorAction SilentlyContinue | Out-Null
        & robocopy $Source $Target /E /NJH /NJS /NFL /NDL /NP /R:5 /W:3 2>$null | Out-Null
    } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $Target) -ErrorAction SilentlyContinue | Out-Null
        Copy-Item $Source $Target -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $checkPath) {
        Write-Host "[FIXED]   $Label" -ForegroundColor Green
        return $true
    } else {
        Write-Host "[FAILED]  $Label — Defender may be locking files" -ForegroundColor Red
        Write-Host "          Try: disable Defender real-time protection, then re-run." -ForegroundColor Yellow
        return $false
    }
}

# ============================================================================
# Run all checks
# ============================================================================

$allOk = $true

# 1. Python interpreter — check ALL three critical files
#    uv trampoline needs pythonw.exe; missing it = "os error 2"
$pythonDir = Join-Path $InstallDir "python"
$pythonOk = $true
foreach ($exe in @("python.exe", "pythonw.exe", "python311.dll")) {
    if (Test-Path (Join-Path $pythonDir $exe)) {
        Write-Host "[OK]      python\$exe" -ForegroundColor Green
    } else {
        Write-Host "[BROKEN]   python\$exe" -ForegroundColor Red
        $pythonOk = $false
    }
}
if (-not $pythonOk) {
    $src = Join-Path $VendorDir "python"
    if (Test-Path $src) {
        Write-Host "[REPAIR]  Re-copying Python from vendor..." -ForegroundColor Cyan
        if (Test-Path $pythonDir) { Remove-Item $pythonDir -Recurse -Force -ErrorAction SilentlyContinue }
        New-Item -ItemType Directory -Force -Path $pythonDir -ErrorAction SilentlyContinue | Out-Null
        & robocopy $src $pythonDir /E /NJH /NJS /NFL /NDL /NP /R:5 /W:3 2>$null | Out-Null
        $allFixed = $true
        foreach ($exe in @("python.exe", "pythonw.exe", "python311.dll")) {
            if (-not (Test-Path (Join-Path $pythonDir $exe))) {
                Write-Host "[FAILED]  python\$exe" -ForegroundColor Red
                $allFixed = $false
            }
        }
        if ($allFixed) { Write-Host "[FIXED]   Python (all files)" -ForegroundColor Green }
        else { $allOk = $false }
    } else {
        Write-Host "[FAILED]  No Python in vendor" -ForegroundColor Red
        $allOk = $false
    }
}

# 2. Backend source
$ok = Check-And-Repair -Label "Backend source" -Source (Join-Path $VendorDir "hermes-agent") -Target $InstallDir -CriticalFile "hermes_cli\__init__.py" -IsDir
if (-not $ok) { $allOk = $false }

# 3. site-packages
$ok = Check-And-Repair -Label "Python packages" -Source (Join-Path $VendorDir "site-packages") -Target (Join-Path $InstallDir "venv\Lib\site-packages") -CriticalFile "httpx\__init__.py" -IsDir
if (-not $ok) { $allOk = $false }

# 4. venv Scripts
$ok = Check-And-Repair -Label "Venv Scripts" -Source (Join-Path $VendorDir "venv-scripts") -Target (Join-Path $InstallDir "venv\Scripts") -CriticalFile "python.exe" -IsDir
if (-not $ok) { $allOk = $false }

# 5. Git
$ok = Check-And-Repair -Label "Git" -Source (Join-Path $VendorDir "git") -Target (Join-Path $HermesHome "git") -CriticalFile "bin\bash.exe" -IsDir
if (-not $ok) { $allOk = $false }

# 6. Node.js
$ok = Check-And-Repair -Label "Node.js" -Source (Join-Path $VendorDir "node") -Target (Join-Path $HermesHome "node") -CriticalFile "node.exe" -IsDir
if (-not $ok) { $allOk = $false }

# 7. node_modules
$ok = Check-And-Repair -Label "Node modules" -Source (Join-Path $VendorDir "nm") -Target (Join-Path $InstallDir "node_modules") -CriticalFile ".bin\node.cmd" -IsDir
if (-not $ok) { $allOk = $false }

# 8. uv.exe
$uvTarget = Join-Path $HermesHome "bin\uv.exe"
if (Test-Path $uvTarget) {
    Write-Host "[OK]      uv.exe" -ForegroundColor Green
} else {
    Write-Host "[BROKEN]   uv.exe" -ForegroundColor Red
    $src = Join-Path $VendorDir "bin\uv.exe"
    if (Test-Path $src) {
        New-Item -ItemType Directory -Force -Path (Split-Path $uvTarget) | Out-Null
        Copy-Item $src $uvTarget -Force
        if (Test-Path $uvTarget) { Write-Host "[FIXED]   uv.exe" -ForegroundColor Green }
        else { $allOk = $false }
    } else { $allOk = $false }
}

# 9. ripgrep
$rgPath = Join-Path $HermesHome "tools\rg.exe"
if (Test-Path $rgPath) {
    Write-Host "[OK]      ripgrep" -ForegroundColor Green
} else {
    Write-Host "[BROKEN]   ripgrep" -ForegroundColor Red
    $src = Join-Path $VendorDir "tools\rg.exe"
    if (Test-Path $src) {
        New-Item -ItemType Directory -Force -Path (Split-Path $rgPath) | Out-Null
        Copy-Item $src $rgPath -Force
        if (Test-Path $rgPath) { Write-Host "[FIXED]   ripgrep" -ForegroundColor Green }
    }
}

# 10. Playwright Chromium
$pwCache = Join-Path $env:LOCALAPPDATA "ms-playwright"
$chromeFound = Get-ChildItem "$pwCache\*\chrome-win\chrome.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($chromeFound) {
    Write-Host "[OK]      Chromium" -ForegroundColor Green
} else {
    Write-Host "[BROKEN]   Chromium" -ForegroundColor Red
    $vendorChromium = Join-Path $VendorDir "chromium"
    if (Test-Path $vendorChromium) {
        Write-Host "[REPAIR]  Re-copying Chromium..." -ForegroundColor Cyan
        & robocopy $vendorChromium $pwCache /E /NJH /NJS /NFL /NDL /NP /R:5 /W:3 2>$null | Out-Null
        $chromeFound = Get-ChildItem "$pwCache\*\chrome-win\chrome.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($chromeFound) { Write-Host "[FIXED]   Chromium" -ForegroundColor Green }
        else { $allOk = $false }
    } else { $allOk = $false }
}

# 11. pyvenv.cfg
$pyvenvCfg = Join-Path $InstallDir "venv\pyvenv.cfg"
if (Test-Path $pyvenvCfg) {
    $cfgContent = Get-Content $pyvenvCfg -Raw -ErrorAction SilentlyContinue
    if ($cfgContent -match "home\s*=\s*(.+)") {
        $cfgHome = $matches[1].Trim()
        if (-not (Test-Path (Join-Path $cfgHome "pythonw.exe"))) {
            Write-Host "[BROKEN]   pyvenv.cfg → pythonw.exe missing at $cfgHome" -ForegroundColor Red
            if (Test-Path (Join-Path $pythonDir "pythonw.exe")) {
                $newCfg = @"
home = $pythonDir
implementation = CPython
uv = 0.11.23
version_info = 3.11.15
include-system-site-packages = false
"@
                [System.IO.File]::WriteAllText($pyvenvCfg, $newCfg)
                Write-Host "[FIXED]   pyvenv.cfg → $pythonDir" -ForegroundColor Green
            } else {
                Write-Host "[FAILED]  pyvenv.cfg — pythonw.exe not found" -ForegroundColor Red
                $allOk = $false
            }
        } else {
            Write-Host "[OK]      pyvenv.cfg" -ForegroundColor Green
        }
    } else {
        Write-Host "[BROKEN]   pyvenv.cfg malformed" -ForegroundColor Red
        $allOk = $false
    }
} else {
    Write-Host "[BROKEN]   pyvenv.cfg missing" -ForegroundColor Red
    $allOk = $false
}

# ============================================================================
# Summary
# ============================================================================
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "All checks passed. Please restart Qiji." -ForegroundColor Green
} else {
    Write-Host "Some components could not be repaired." -ForegroundColor Red
    Write-Host ""
    Write-Host "Try:" -ForegroundColor Yellow
    Write-Host "  1. Disable Windows Defender real-time protection" -ForegroundColor Yellow
    Write-Host "  2. Re-run this repair script" -ForegroundColor Yellow
    Write-Host "  3. Send this screenshot to support" -ForegroundColor Yellow
}
$installLog = Join-Path $HermesHome "logs\install.log"
if (Test-Path $installLog) {
    Write-Host ""
    Write-Host "Install log: $installLog" -ForegroundColor Cyan
}
