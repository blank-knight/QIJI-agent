<#
.SYNOPSIS
  Prepare offline vendor directory for white-label builds.

.DESCRIPTION
  Downloads all prerequisites (uv, git, node, python, site-packages,
  node_modules, Playwright Chromium) into a vendor/ directory that
  gets bundled into the installer via electron-builder extraResources.
  This enables true offline installation with zero network downloads.

.PARAMETER VendorDir
  Output directory for vendor files. Default: apps/desktop/build/vendor

.PARAMETER HermesHome
  Existing Hermes installation to harvest pre-built venv from.
  Default: $env:USERPROFILE\.hermes
#>
param(
    [string]$VendorDir = "apps\desktop\build\vendor",
    [string]$HermesHome = "$env:USERPROFILE\.hermes"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Preparing offline vendor directory ===" -ForegroundColor Green
Write-Host "VendorDir: $VendorDir"
Write-Host "HermesHome: $HermesHome`n"

# 1. uv.exe
$managedUv = Join-Path $HermesHome "bin\uv.exe"
$vendorUv = Join-Path $VendorDir "bin\uv.exe"
if (Test-Path $managedUv) {
    New-Item -ItemType Directory -Force -Path (Split-Path $vendorUv) | Out-Null
    Copy-Item $managedUv $vendorUv -Force
    Write-Host "[1/8] uv.exe ✅" -ForegroundColor Cyan
}

# 2. PortableGit
$managedGit = Join-Path $HermesHome "git"
$vendorGit = Join-Path $VendorDir "git"
if (Test-Path $managedGit) {
    Copy-Item $managedGit $vendorGit -Recurse -Force
    Write-Host "[2/8] PortableGit ✅" -ForegroundColor Cyan
}

# 3. Node.js
$managedNode = Join-Path $HermesHome "node"
$vendorNode = Join-Path $VendorDir "node"
if (Test-Path $managedNode) {
    Copy-Item $managedNode $vendorNode -Recurse -Force
    Write-Host "[3/8] Node.js ✅" -ForegroundColor Cyan
}

# 4. Tools (ripgrep + ffmpeg)
$managedTools = Join-Path $HermesHome "tools"
$vendorTools = Join-Path $VendorDir "tools"
if (Test-Path $managedTools) {
    Copy-Item $managedTools $vendorTools -Recurse -Force
    Write-Host "[4/8] Tools (rg + ffmpeg) ✅" -ForegroundColor Cyan
}

# 5. Repository source
$installDir = Join-Path $HermesHome "hermes-agent"
$vendorRepo = Join-Path $VendorDir "hermes-agent"
if (Test-Path $installDir) {
    # Copy everything except .git and venv and node_modules
    New-Item -ItemType Directory -Force -Path $vendorRepo | Out-Null
    # Exclude build/dist/release to avoid recursive vendor nesting and bloat.
    # node_modules at any level is excluded by name match.
    robocopy $installDir $vendorRepo /E /XD ".git" "venv" "node_modules" "__pycache__" "build" "dist" "release" ".venv" /NJH /NJS /NFL /NDL /NP | Out-Null
    Write-Host "[5/8] Repository source ✅" -ForegroundColor Cyan
}

# 6. Python interpreter + site-packages
$venvPath = Join-Path $installDir "venv"
if (Test-Path (Join-Path $venvPath "Scripts\python.exe")) {
    # Python from uv managed store
    $pythonStore = Join-Path $env:APPDATA "uv\python\cpython-3.11-windows-x86_64-none"
    if (Test-Path $pythonStore) {
        $vendorPython = Join-Path $VendorDir "python"
        Copy-Item $pythonStore $vendorPython -Recurse -Force
        Write-Host "[6a/8] Python interpreter ✅" -ForegroundColor Cyan
    }

    # Site-packages
    $sitePackages = Join-Path $venvPath "Lib\site-packages"
    if (Test-Path $sitePackages) {
        $vendorSP = Join-Path $VendorDir "site-packages"
        Copy-Item $sitePackages $vendorSP -Recurse -Force
        Write-Host "[6b/8] Site-packages ✅" -ForegroundColor Cyan
    }

    # venv Scripts
    $venvScripts = Join-Path $venvPath "Scripts"
    if (Test-Path $venvScripts) {
        $vendorVS = Join-Path $VendorDir "venv-scripts"
        Copy-Item $venvScripts $vendorVS -Recurse -Force
        Write-Host "[6c/8] Venv Scripts ✅" -ForegroundColor Cyan
    }
}

# 7. node_modules (named "nm" because electron-builder strips "node_modules")
$nmPath = Join-Path $installDir "node_modules"
if (Test-Path $nmPath) {
    $vendorNM = Join-Path $VendorDir "nm"
    Copy-Item $nmPath $vendorNM -Recurse -Force
    Write-Host "[7/8] node_modules ✅" -ForegroundColor Cyan
}

# 8. Playwright Chromium
$pwCache = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (Test-Path $pwCache) {
    $vendorChromium = Join-Path $VendorDir "chromium"
    Copy-Item $pwCache $vendorChromium -Recurse -Force
    Write-Host "[8/8] Playwright Chromium ✅" -ForegroundColor Cyan
}

Write-Host "`n=== Vendor directory ready ===" -ForegroundColor Green

# Calculate size
$size = (Get-ChildItem $VendorDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("Total size: {0:N0} MB" -f $size) -ForegroundColor Yellow
Write-Host "`nNext: run the build to bundle this into the installer." -ForegroundColor Green
