/**
 * 奇计离线安装器构建脚本
 * 
 * 用法（在 Windows PowerShell 中运行）：
 *   cd apps/desktop/installer
 *   node build-installer.js
 * 
 * 前置条件：
 *   1. apps/desktop/release/win-unpacked/ 已存在（npm run dist:win:dir 产物）
 *   2. apps/desktop/release/7zr.exe 已存在（从 https://www.7-zip.org/a/7zr.exe 下载）
 *
 * 一键编译：
 *   npm run dist:win:sfx
 * （= tsc+vite build → electron-builder --dir → build-installer.cjs）
 * 
 * 产物：
 *   apps/desktop/release/Qiji-0.17.0-Setup.exe（~649MB）
 * 
 * 架构：
 *   launcher3.exe（597KB，含 admin manifest + 内嵌 7zr.exe）
 *   + qiji-portable.7z（LZMA2 压缩的 win-unpacked）
 *   = 单文件安装器
 *   
 *   7z 原生支持在 exe 中查找嵌入的 .7z 签名，不需要 footer 或临时文件。
 *   admin manifest 使安装器启动时弹 UAC，获得权限后自动 Add-MpPreference 跳过 Defender 扫描。
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RELEASE = path.join(ROOT, 'release')
const INSTALLER = __dirname

// Config
const APP_NAME = 'Qiji'
const VERSION = '0.17.7'
const PRODUCT_NAME_ZH = '奇计'
// 品牌数据目录单一事实源 —— 与 electron/brand.cjs 同源。贴牌改名只改那里。
const brand = require(path.join(ROOT, 'electron', 'brand.cjs'))
const DATA_DIR_NAME = brand.dataDirName
const USER_DATA_DIR_NAME = brand.userDataDirName

// Paths
const winUnpacked = path.join(RELEASE, 'win-unpacked')
const sevenZip = path.join(RELEASE, '7zr.exe')
const payload = path.join(RELEASE, 'qiji-portable.7z')
const launcherSrc = path.join(INSTALLER, 'launcher3.cs')
const uninstallSrc = path.join(INSTALLER, 'uninstall.cs')
const manifest = path.join(INSTALLER, 'app.manifest')
const uninstallExe = path.join(RELEASE, 'uninstall.exe')
const launcherExe = path.join(RELEASE, 'launcher3.exe')
const output = path.join(RELEASE, `${APP_NAME}-${VERSION}-Setup.exe`)

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'

function step(n, msg) { console.log(`\n[${n}] ${msg}`) }

// ---- Pre-flight ----
step(1, 'Pre-flight checks')
if (!fs.existsSync(winUnpacked)) {
  console.error(`ERROR: ${winUnpacked} not found. Run "npm run dist:win:dir" first.`)
  process.exit(1)
}
if (!fs.existsSync(sevenZip)) {
  console.error(`ERROR: ${sevenZip} not found. Download from https://www.7-zip.org/a/7zr.exe`)
  process.exit(1)
}
console.log('  win-unpacked: OK')
console.log('  7zr.exe: OK')

// ---- Compress payload ----
step(2, 'Compressing win-unpacked to qiji-portable.7z ...')
if (fs.existsSync(payload)) fs.unlinkSync(payload)
execSync(`"${sevenZip}" a -t7z -mx=5 -mmt=on "${payload}" "${winUnpacked}\\*"`, { stdio: 'inherit' })
const payloadSize = (fs.statSync(payload).size / 1024 / 1024).toFixed(1)
console.log(`  Payload: ${payloadSize} MB`)

// ---- Compile uninstall.exe ----
step(3, 'Compiling uninstall.exe ...')
// 品牌注入：从 electron/brand.cjs 读取品牌目录名，直接写入源码副本的
// BrandInfo 兜底常量（UTF-8 BOM），再编译临时副本。不用 /d:+BrandInfo.cs
// 独立文件方案 —— 老 csc(v4.0.30319) 对 "/d: 定义 + 多源文件 + /t:winexe"
// 组合会报 CS5001(找不到入口点)/CS1577，源码注入则与历史可用命令形状一致。
// 贴牌（白标）改名只改 brand.cjs，安装器/卸载器/主进程自动对齐。
function injectBrandSrc(srcPath, outPath) {
  const src = fs.readFileSync(srcPath, 'utf8')
  const injected = src
    .replace(/public const string DataDir = "[^"]*";/, `public const string DataDir = ${JSON.stringify(DATA_DIR_NAME)};`)
    .replace(/public const string UserDataDir = "[^"]*";/, `public const string UserDataDir = ${JSON.stringify(USER_DATA_DIR_NAME)};`)
  // UTF-8 BOM：老 csc 无 BOM 时按系统 ANSI(GBK) 解码，中文注释/字符串有乱码风险
  fs.writeFileSync(outPath, '\ufeff' + injected, 'utf8')
  return outPath
}
const uninstallTmp = path.join(RELEASE, 'uninstall.brand.cs')
injectBrandSrc(uninstallSrc, uninstallTmp)
console.log(`  brand injected: dataDir=${DATA_DIR_NAME} userDataDir=${USER_DATA_DIR_NAME}`)

if (fs.existsSync(uninstallExe)) fs.unlinkSync(uninstallExe)
execSync(`"${CSC}" /nologo /optimize /target:exe /out:"${uninstallExe}" "${uninstallTmp}"`, { stdio: 'inherit' })
const uninstallSize = (fs.statSync(uninstallExe).size / 1024).toFixed(1)
console.log(`  uninstall.exe: ${uninstallSize} KB`)

// ---- Compile launcher3.exe ----
// /target:winexe = GUI subsystem (no console window by default).
// launcher3.cs calls AllocConsole() at startup to show install progress,
// then FreeConsole() + Environment.Exit(0) before launching Qiji so the
// console window closes immediately instead of lingering as a parent of Qiji.
// icon.ico embedded as Win32 icon resource + runtime resource for PictureBox loading
const iconIco = path.join(INSTALLER, 'icon.ico')

step(4, 'Compiling launcher3.exe (admin manifest + icon + embedded 7zr.exe + uninstall.exe) ...')
try {
  if (fs.existsSync(launcherExe)) fs.unlinkSync(launcherExe)
} catch (e) {
  console.error(`  WARNING: could not delete old launcher3.exe (${e.message}), continuing ...`)
}
try {
  // NOTE: the icon resource arg must stay UNQUOTED — csc treats a quoted
  // "file,id" as a single literal filename (comma included) and fails with
  // CS1566 "file not found". Paths here contain no spaces, so no quoting
  // is needed.
  const launcherTmp = injectBrandSrc(launcherSrc, path.join(RELEASE, 'launcher3.brand.cs'))
  execSync(`"${CSC}" /nologo /optimize /target:winexe /win32icon:"${iconIco}" /win32manifest:"${manifest}" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /resource:"${sevenZip}" /resource:"${uninstallExe}" /resource:${iconIco},icon.ico /out:"${launcherExe}" "${launcherTmp}"`, { stdio: 'inherit' })
} catch (e) {
  // csc may write progress to stderr even on success (exit 0);
  // only fail if the exe wasn't actually produced
  if (!fs.existsSync(launcherExe)) {
    console.error(e.message)
    process.exit(1)
  }
}
const launcherSize = (fs.statSync(launcherExe).size / 1024).toFixed(1)
console.log(`  launcher3.exe: ${launcherSize} KB`)

// ---- Concatenate ----
step(5, 'Concatenating launcher3.exe + qiji-portable.7z ...')
if (fs.existsSync(output)) fs.unlinkSync(output)
const launcherBuf = fs.readFileSync(launcherExe)
const payloadBuf = fs.readFileSync(payload)
const combined = Buffer.concat([launcherBuf, payloadBuf])
fs.writeFileSync(output, combined)
const outputSize = (fs.statSync(output).size / 1024 / 1024).toFixed(1)
console.log(`  Output: ${output}`)
console.log(`  Size: ${outputSize} MB`)

// ---- Verify ----
step(6, 'Verifying embedded 7z archive ...')
try {
  execSync(`"${sevenZip}" t "${output}"`, { stdio: 'inherit', timeout: 30000 })
  console.log('\n  Verification: PASSED')
} catch (e) {
  console.error('\n  Verification: FAILED - 7z could not find embedded archive')
  process.exit(1)
}

console.log(`\n============================================`)
console.log(`  Installer built successfully!`)
console.log(`  ${output}`)
console.log(`  ${outputSize} MB`)
console.log(`============================================`)
