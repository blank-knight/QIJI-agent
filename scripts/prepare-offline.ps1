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
    # Default to LOCALAPPDATA\hermes (matches install.ps1's default).
    # The old default $env:USERPROFILE\.hermes was wrong — install.ps1
    # installs to LOCALAPPDATA, so the venv harvest always missed.
    [string]$HermesHome = $(if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "hermes" } else { Join-Path $env:USERPROFILE ".hermes" })
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

# 2. PortableGit (robocopy + inline exclusions — folds old cleanup steps 3/7 into copy)
$managedGit = Join-Path $HermesHome "git"
$vendorGit = Join-Path $VendorDir "git"
if (Test-Path $managedGit) {
    robocopy $managedGit $vendorGit /E /XJ /XD "doc" "man" "info" "gtk-doc" /XF "*.vim" "*.adoc" "*.md" "*.markdown" /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
    Write-Host "[2/8] PortableGit ✅ (docs/man/vim excluded)" -ForegroundColor Cyan
}

# 3. Node.js (robocopy — Copy-Item -Recurse unreliable for >50MB dirs, see 坑1/19)
$managedNode = Join-Path $HermesHome "node"
$vendorNode = Join-Path $VendorDir "node"
if (Test-Path $managedNode) {
    robocopy $managedNode $vendorNode /E /XJ /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
    Write-Host "[3/8] Node.js ✅" -ForegroundColor Cyan
}

# 4. Tools (ripgrep only — ffmpeg 217MB excluded to slim down installer)
$managedTools = Join-Path $HermesHome "tools"
$vendorTools = Join-Path $VendorDir "tools"
if (Test-Path $managedTools) {
    New-Item -ItemType Directory -Force -Path $vendorTools | Out-Null
    $rgSrc = Join-Path $managedTools "rg.exe"
    if (Test-Path $rgSrc) {
        Copy-Item $rgSrc $vendorTools -Force
        Write-Host "[4/8] Tools (rg.exe only, ffmpeg excluded) ✅" -ForegroundColor Cyan
    } else {
        Write-Host "[4/8] Tools: rg.exe not found in HermesHome — skipping" -ForegroundColor Yellow
    }
}

# 5. Repository source
# Use the fork's own source (brand-customized), NOT the installed Hermes Agent.
# $PSScriptRoot = scripts/, so parent = fork root.
$repoSource = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installDir = Join-Path $HermesHome "hermes-agent"
$vendorRepo = Join-Path $VendorDir "hermes-agent"
if (Test-Path $repoSource) {
    # Copy everything except .git and venv and node_modules
    New-Item -ItemType Directory -Force -Path $vendorRepo | Out-Null
    # Exclude build/dist/release to avoid recursive vendor nesting and bloat.
    # node_modules at any level is excluded by name match.
    robocopy $repoSource $vendorRepo /E /XJ /XD ".git" "venv" "node_modules" "__pycache__" "build" "dist" "release" ".venv" /NJH /NJS /NFL /NDL /NP | Out-Null

    # Pre-install npm dependencies for skills that have their own package.json.
    # Without this, skills like qiji-geo will try to `npm install` at runtime
    # (requiring network access), defeating the purpose of the offline package.
    $managedNode = Join-Path $HermesHome "node\node.exe"
    $managedNpm = Join-Path $HermesHome "node\npx.cmd"
    if (-not (Test-Path $managedNode)) { $managedNode = "node" }
    if (-not (Test-Path $managedNpm)) { $managedNpm = "npx" }

    Get-ChildItem (Join-Path $vendorRepo "skills") -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $skillPkg = Join-Path $_.FullName "package.json"
        $skillNm  = Join-Path $_.FullName "node_modules"
        if ((Test-Path $skillPkg) -and -not (Test-Path $skillNm)) {
            Write-Host "  Pre-installing npm deps for skill: $($_.Name) ..." -ForegroundColor DarkGray
            Push-Location $_.FullName
            try {
                & $managedNode (Join-Path $HermesHome "node\node_modules\npm\bin\npm-cli.js") install --omit=dev 2>&1 | Out-Host
            } catch {
                Write-Host "  WARNING: npm install failed for $($_.Name)" -ForegroundColor Yellow
            }
            Pop-Location
        }
    }

    Write-Host "[5/8] Repository source (from fork) ✅" -ForegroundColor Cyan
} elseif (Test-Path $installDir) {
    # Fallback: use installed Hermes Agent source
    New-Item -ItemType Directory -Force -Path $vendorRepo | Out-Null
    robocopy $installDir $vendorRepo /E /XJ /XD ".git" "venv" "node_modules" "__pycache__" "build" "dist" "release" ".venv" /NJH /NJS /NFL /NDL /NP | Out-Null
    Write-Host "[5/8] Repository source (from installed Hermes, WARNING: not branded) ✅" -ForegroundColor Yellow
}

# 6. Python interpreter + site-packages
$venvPath = Join-Path $installDir "venv"
if (Test-Path (Join-Path $venvPath "Scripts\python.exe")) {
    # Python from uv managed store — dynamically find the directory.
    # uv names it cpython-{version}-{platform}-{arch}-none, but the version
    # component can be short (3.11) or full (3.11.15) depending on the uv
    # version that installed it.  The old code hardcoded one specific name
    # which broke when the installed version didn't match.  Glob instead.
    $uvPythonRoots = @(
        (Join-Path $env:APPDATA "uv\python"),
        (Join-Path $env:LOCALAPPDATA "uv\python")
    )
    $pythonStore = $null
    foreach ($root in $uvPythonRoots) {
        if (Test-Path $root) {
            # Prefer the longest version match (3.11.15 over 3.11)
            $match = Get-ChildItem $root -Directory -Filter "cpython-3.11*windows*x86_64*" -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending | Select-Object -First 1
            if ($match) {
                $pythonStore = $match.FullName
                Write-Host "  Found uv Python at: $pythonStore" -ForegroundColor DarkGray
                break
            }
        }
    }

    if ($pythonStore -and (Test-Path $pythonStore)) {
        $vendorPython = Join-Path $VendorDir "python"
        Copy-Item $pythonStore $vendorPython -Recurse -Force
        Write-Host "[6a/8] Python interpreter ✅" -ForegroundColor Cyan
    } else {
        Write-Host "[6a/8] Python interpreter ❌ — uv Python store not found!" -ForegroundColor Red
        Write-Host "       Searched: $($uvPythonRoots -join ', ')" -ForegroundColor Yellow
        Write-Host "       The offline package will NOT work without the Python interpreter." -ForegroundColor Yellow
        Write-Host "       Install Python 3.11 via 'uv python install 3.11' and re-run this script." -ForegroundColor Yellow
        throw "Python interpreter not found in uv managed store. Cannot build offline package."
    }

    # Site-packages
    $sitePackages = Join-Path $venvPath "Lib\site-packages"
    if (Test-Path $sitePackages) {
        $vendorSP = Join-Path $VendorDir "site-packages"
        Copy-Item $sitePackages $vendorSP -Recurse -Force

        # Strip __pycache__ directories and .pyc files — Python generates them
        # automatically on first run. This saves ~30-50 MB and thousands of files.
        Get-ChildItem $vendorSP -Recurse -Directory -Filter "__pycache__" -EA SilentlyContinue |
            ForEach-Object { Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue }
        Get-ChildItem $vendorSP -Recurse -Filter "*.pyc" -EA SilentlyContinue |
            ForEach-Object { Remove-Item $_.FullName -Force -EA SilentlyContinue }

        $spFiles = (Get-ChildItem $vendorSP -Recurse -File -EA SilentlyContinue).Count
        $spSize = [math]::Round((Get-ChildItem $vendorSP -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB)
        Write-Host "[6b/8] Site-packages: $spSize MB, $spFiles files (pycache stripped)" -ForegroundColor Cyan
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
# IMPORTANT: Use robocopy /XJ to NOT follow junctions/symlinks.
# node_modules/hermes is a junction -> apps/desktop, which contains build/vendor.
# Copy-Item -Recurse follows junctions, causing infinite nesting.
# robocopy /XJ skips junction points, copying only real files.
$nmPath = Join-Path $installDir "node_modules"
if (Test-Path $nmPath) {
    $vendorNM = Join-Path $VendorDir "nm"
    if (Test-Path $vendorNM) { Remove-Item $vendorNM -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $vendorNM | Out-Null

    # Robocopy with inline file/dir exclusions — folds old 10-step global cleanup
    # into a single pass. Each /XF and /XD here replaces a separate recursive
    # Get-ChildItem traversal that was timing out on NTFS with 75K+ files.
    robocopy $nmPath $vendorNM /E /XJ `
        /XD "build" "dist" "release" ".git" "test" "tests" "__tests__" "spec" ".github" ".vscode" ".idea" ".circleci" `
        /XF "*.map" "*.md" "*.markdown" "CHANGELOG*" "changelog*" "*.ts" ".editorconfig" ".eslintrc*" ".prettierrc*" ".eslintignore" ".npmignore" ".mocharc*" `
        /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null

    # Then delete build-time-only packages that customers never need.
    # The Electron app ships pre-built (vite build → dist/), so dev tooling
    # (compilers, linters, test runners, electron-builder itself) is dead weight.
    $devPkgs = @(
        "typescript", "prettier", "eslint",
        "jsdom", "vitest",
        "electron-winstaller", "app-builder-lib", "electron-builder",
        "rcedit", "wait-on", "concurrently", "cross-env"
    )
    $devScoped = @(
        "@rolldown", "@esbuild", "@babel",
        "@typescript-eslint", "@testing-library",
        "@vitejs", "@vitest", "@eslint", "@types"
    )
    foreach ($pkg in $devPkgs) {
        $p = Join-Path $vendorNM $pkg
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -EA SilentlyContinue }
    }
    foreach ($scope in $devScoped) {
        $p = Join-Path $vendorNM $scope
        if (Test-Path $p) { Remove-Item $p -Recurse -Force -EA SilentlyContinue }
    }
    # Remove eslint-plugin-* individually (wildcards don't work with Remove-Item on dirs)
    Get-ChildItem $vendorNM -Directory -Filter "eslint-plugin-*" -EA SilentlyContinue |
        ForEach-Object { Remove-Item $_.FullName -Recurse -Force -EA SilentlyContinue }
    # vite is needed for its client runtime (import.meta.hot, etc.) — but
    # the vite package itself (CLI + deps) is build-only. The runtime needs
    # at most vite/dist/client. We keep vite but strip its node_modules deps.
    # Same for @vitejs/plugin-react — already excluded above.

    $nmFiles = (Get-ChildItem $vendorNM -Recurse -File -ErrorAction SilentlyContinue).Count
    $nmSize = [math]::Round((Get-ChildItem $vendorNM -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum / 1MB)
    Write-Host "[7/8] node_modules: $nmSize MB, $nmFiles files (devDeps stripped)" -ForegroundColor Cyan
}

# 8. Playwright Chromium — copy only the latest version of each browser
# to avoid bloating the installer with stale Playwright cache entries.
$pwCache = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (Test-Path $pwCache) {
    $vendorChromium = Join-Path $VendorDir "chromium"
    New-Item -ItemType Directory -Path $vendorChromium -Force | Out-Null

    # Group subdirs by base name (e.g. "chromium-1228" -> base "chromium"),
    # keep only the highest-numbered version of each.
    $groups = @{}
    Get-ChildItem $pwCache -Directory | ForEach-Object {
        if ($_.Name -match '^(.+)-(\d+)$') {
            $base = $Matches[1]
            $ver = [int]$Matches[2]
            if (-not $groups[$base] -or $ver -gt $groups[$base].Version) {
                $groups[$base] = @{ Version = $ver; Path = $_.FullName }
            }
        } else {
            # No version suffix — copy as-is (e.g. ffmpeg-1011 already unique)
            $groups[$_.Name] = @{ Version = 0; Path = $_.FullName }
        }
    }

    foreach ($entry in $groups.Values) {
        $dirName = Split-Path $entry.Path -Leaf
        # Skip chromium_headless_shell — the full chromium already supports
        # headless mode (--headless).  This saves ~270 MB in the installer.
        if ($dirName -match 'chromium_headless_shell') {
            Write-Host ("  {0} (SKIPPED — redundant, full chromium suffices)" -f $dirName) -ForegroundColor DarkYellow
            continue
        }
        Copy-Item $entry.Path $vendorChromium -Recurse -Force
        Write-Host ("  {0} (latest)" -f $dirName) -ForegroundColor DarkGray
    }
    Write-Host "[8/8] Playwright Chromium ✅" -ForegroundColor Cyan
}

Write-Host "`n=== Vendor directory ready ===" -ForegroundColor Green

# .bin contains dev tool wrappers (vite, tsc, eslint) — not needed at runtime.
# Single targeted deletion (not a recursive search).
$nmBin = Join-Path $VendorDir "nm\.bin"
if (Test-Path $nmBin) { Remove-Item $nmBin -Recurse -Force -EA SilentlyContinue }

# Report (one traversal instead of 11)
$allFiles = Get-ChildItem $VendorDir -Recurse -File -EA SilentlyContinue
$totalFiles = if ($allFiles) { $allFiles.Count } else { 0 }
$totalSize = if ($allFiles) { [math]::Round(($allFiles | Measure-Object Length -Sum).Sum / 1MB) } else { 0 }
Write-Host ("Total vendor: {0:N0} MB ({1:N0} files)" -f $totalSize, $totalFiles) -ForegroundColor Yellow
Write-Host "`nNext: run the build to bundle this into the installer." -ForegroundColor Green
