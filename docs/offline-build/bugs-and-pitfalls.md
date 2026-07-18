
---

## 坑17：Playwright JS 库未打包导致离线包触发在线下载（2026-07-13）

**严重度：★★★★☆（离线安装后 GEO skill 不可用，触发 689MB 在线下载）**

**现象：** 离线包安装后运行 GEO skill，`require('playwright')` 失败，触发 `npm install` + `npx playwright install chromium`，又下载了 689MB Chromium 到 `%LOCALAPPDATA%\ms-playwright\`。

**根因：** vendor/chromium/（420MB）打包了浏览器二进制，但 Playwright 的 JS 库（npm 包）没装进 skill 目录的 node_modules。skill 的 package.json 声明了 `"playwright": "^1.61.0"` 依赖，但 node_modules 不存在。

**修复：**

1. 编译时预装 `npm install` 到 `vendor/hermes-agent/skills/qiji-geo/node_modules/`
2. geo-cli.js 新增 `findBundledChromium()` 函数，优先查找打包的 Chromium

**教训：** 离线包里每个有 `package.json` 的 skill 都要检查 node_modules 是否预装。光打包二进制不够，JS 库也是必需的。

---

## 坑18：uninstall.bat 自杀导致卸载窗口闪退（2026-07-13）

**严重度：★★★☆☆（卸载窗口一闪而过，用户以为没卸载干净）**

**现象：** 控制面板点卸载，cmd 窗口闪一下就消失，安装目录没删干净。

**根因：** uninstall.bat 放在安装目录内，`rd /s /q "%APP_DIR%"` 删安装目录时把 bat 自身也删了。cmd 正在执行 bat 文件，文件被删后 cmd 立即中断，后续的清理注册表、删快捷方式等步骤全没执行。

**修复：** bat 启动时先 `copy` 自身到 `%TEMP%`，然后从 temp 重新启动（`start cmd /c`），安装路径通过 `%1` 参数传入。新进程在 temp 目录运行，安全删除安装目录不受影响。

```bat
if "%~1"=="" (
    copy /y "%~f0" "%TEMP%\qiji_uninstall.bat" >nul 2>&1
    start "卸载奇计" cmd /c "%TEMP%\qiji_uninstall.bat" "%~dp0"
    exit /b
)
set "APP_DIR=%~1"
```

**教训：** 不要让脚本删除自身所在的目录。自删除场景必须先重定位到临时目录。

---

## 坑19：build-installer.js 路径解析多上一层（2026-07-13）

**严重度：★★☆☆☆（打包脚本报 win-unpacked not found）**

**现象：** 运行 `node build-installer.js` 报 `ERROR: release\win-unpacked not found`。

**根因：** `ROOT = path.resolve(__dirname, '..', '..')` 多上了一层。installer/ 在 `apps/desktop/installer/`，ROOT 应该是 `apps/desktop/`（上一层），不是 `apps/`（上两层）。

**修复：** 改为 `ROOT = path.resolve(__dirname, '..')`。同时因为 package.json 有 `"type": "module"`，`require()` 在 .js 里不可用，需要用 .cjs 扩展名。

---

## 坑16：vendor 瘦身全局清理可靠性问题（NTFS 超时）

**严重度：★★★☆☆（installer 体积不降、文件数不减）**

**现象：** prepare-offline.ps1 末尾的 10 步全局清理（删 `.map`/`.md`/test 目录/`.ts` 源码/`.bin` 等）用 `Get-ChildItem -Recurse` 遍历 80K+ 文件，每步一次完整遍历。在 NTFS 上可能超时或不完整执行——2026-07-08 实测 vendor 仍有大量 `.map` 文件残留（devDeps 砍除和 headless_shell 砍除生效，但全局清理部分未完成）。

**根因：** 11 次完整遍历（10 步清理 + 1 次统计）在 NTFS 上，每个文件需要元数据查询和权限检查。当文件数 > 50K 时，单次遍历耗时 2-3 秒，11 次 = 20-30 秒。如果 Defender 在扫描或磁盘 I/O 瓶颈，遍历可能超时或被 PowerShell 中断。

**实测数据（2026-07-08）：**

| 指标 | 基线（99K 文件） | 优化前（devDeps+headless_shell 砍除后） | 目标（全局清理生效） |
|------|----------------|--------------------------------------|-------------------|
| 文件数 | 99,184 | 80,406 | ~65-70K |
| vendor 大小 | 2303.9 MB | 2034.4 MB | ~1950-2000 MB |
| exe 大小 | 760.6 MB | 775 MB | ~680-700 MB |

**问题定位：**

```bash
# vendor/nm 仍有大量 .map 文件残留
find /mnt/c/Users/84673/qiji-fork/apps/desktop/build/vendor/nm -name "*.map" -type f | wc -l
# 输出：379（应为 0）
```

说明 10 步清理中的 `.map` 删除步骤没执行完。

**修复（2026-07-09）：** 把清理逻辑**前移到 robocopy 复制时一次排除**，不需要后置清理。

**4 处改动（prepare-offline.ps1）：**

1. **PortableGit 复制（L41-47）**：从 `Copy-Item -Recurse` 改为 `robocopy`，加内联排除：
   ```powershell
   robocopy $managedGit $vendorGit /E /XJ /XD "doc" "man" "info" "gtk-doc" /XF "*.vim" "*.adoc" "*.md" "*.markdown" /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
   ```

2. **Node.js 复制（L49-54）**：从 `Copy-Item -Recurse` 改为 `robocopy`（可靠性修复）：
   ```powershell
   robocopy $managedNode $vendorNode /E /XJ /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
   ```

3. **node_modules 复制（L170-173）**：扩展 robocopy `/XD` 和 `/XF` 排除：
   ```powershell
   robocopy $nmPath $vendorNM /E /XJ `
       /XD "build" "dist" "release" ".git" "test" "tests" "__tests__" "spec" ".github" ".vscode" ".idea" ".circleci" `
       /XF "*.map" "*.md" "*.markdown" "CHANGELOG*" "changelog*" "*.ts" ".editorconfig" ".eslintrc*" ".prettierrc*" ".eslintignore" ".npmignore" ".mocharc*" `
       /NJH /NJS /NFL /NDL /NP /R:1 /W:1 | Out-Null
   ```

4. **后置清理全删（L247-259）**：原 10 步清理（244-308 行）替换为：
   ```powershell
   # .bin 包含 dev tool wrappers（vite、tsc、eslint）— 运行时不需要
   $nmBin = Join-Path $VendorDir "nm\.bin"
   if (Test-Path $nmBin) { Remove-Item $nmBin -Recurse -Force -EA SilentlyContinue }

   # 报告（一次遍历而非 11 次）
   $allFiles = Get-ChildItem $VendorDir -Recurse -File -EA SilentlyContinue
   $totalFiles = if ($allFiles) { $allFiles.Count } else { 0 }
   $totalSize = if ($allFiles) { [math]::Round(($allFiles | Measure-Object Length -Sum).Sum / 1MB) } else { 0 }
   Write-Host ("Total vendor: {0:N0} MB ({1:N0} files)" -f $totalSize, $totalFiles) -ForegroundColor Yellow
   ```

**预期收益：**

| 指标 | 改动前 | 改动后（预期） |
|------|--------|--------------|
| prepare-offline 总时间 | ~10min | ~4-5min |
| .map 文件数 | 379 | 0 |
| vendor 文件数 | 80,406 | ~65-70K |
| vendor 大小 | 2034.4 MB | ~1950-2000 MB |

**验证（编译后）：**

```bash
# .map 应为 0
find /mnt/c/Users/84673/qiji-fork/apps/desktop/build/vendor/nm -name "*.map" -type f | wc -l
```

如果仍 > 0，说明 vendor 是旧的（没删掉重新 prepare-offline）。

**风险与防御：**

- `*.ts` 全排除含 `*.d.ts`（类型声明文件）。Electron 生产模式只加载编译后 `.js/.cjs/.mjs`，理论上安全。如出问题 `git reset --hard ef7a4415a` 回退。
- robocopy 的 `/XF` 是文件名模式匹配，不是路径匹配。如果有某个 npm 包的运行时依赖 .ts 文件（极罕见），会出问题。但从观测看，所有 npm 包发布时都是编译后的 JS，TS 文件只是开发时的源码。

**同时排除 ffmpeg（217MB）：**

prepare-offline.ps1 第4步（L57-63）改为只拷 `rg.exe`：
```powershell
New-Item -ItemType Directory -Force -Path $vendorTools | Out-Null
$rgSrc = Join-Path $managedTools "rg.exe"
if (Test-Path $rgSrc) {
    Copy-Item $rgSrc $vendorTools -Force
    Write-Host "[4/8] Tools (rg.exe only, ffmpeg excluded) ✅" -ForegroundColor Cyan
}
```

**教训：**

1. **"先全量复制再删"的模式在 NTFS 大文件场景下不可靠。** 11 次遍历 = 11 倍 I/O，任何一次超时都导致清理不完整。
2. **robocopy 的 `/XF`/`/XD` 是内联排除，复制时就跳过。** 一次遍历完成复制+过滤，效率高且可靠。
3. **PortableGit、Node.js 这些 >50MB 的目录复制必须用 robocopy，不能用 Copy-Item。** 见坑1、坑9b、坑19 的教训。
4. **ffmpeg 被排除需要同步更新 install.ps1 的 staging 逻辑。** 已经更新：install.ps1 L207-220 添加注释说明 ffmpeg 是可选依赖（video_gen 技能需要时再下载），不会影响安装。install.ps1 的 ffmpeg 检查逻辑（L1568-1712）保持不变，用户如果需要 TTS 功能可以手动安装 ffmpeg（scoop/choco/winget）。

---
