# 方案 C：vendor.7z 单包直解 — 彻底消除 NSIS 小文件 I/O

**状态**: 📋 设计阶段（待实施）
**创建日期**: 2026-07-08
**优先级**: 高（安装速度终极优化方向）

---

## 问题回顾

当前离线安装的 I/O 流程（即使已应用 Move-OrCopy-Dir 优化）：

```
NSIS 安装包 (775MB, ~80000 文件)
    │
    ├── [Step 1] NSIS 解压 → resources/vendor/          ← 80000 文件逐个创建+Defender扫描 (2-3 min)
    │
    ├── [Step 2] Move-OrCopy-Dir → 各最终目录             ← NTFS move <1ms (已优化 ✅)
    │
    └── [Step 3] 删除 vendor/ 残余                         ← 秒级
```

**瓶颈在 Step 1**：NSIS 把 80000 个小文件逐个解压到磁盘。每个文件：创建 → 写数据 → 关闭句柄 → Defender 实时扫描。这是无法通过 robocopy 优化解决的——瓶颈在 NSIS 解压本身。

Move-OrCopy-Dir 已经把 Step 2 从 3-5 分钟砍到 <1ms，但 Step 1 的 2-3 分钟仍占安装时间的绝大部分。

---

## 方案 C：vendor 打成单个 .7z，安装时直解到最终位置

### 核心思路

编译时把整个 vendor 目录压成一个 `vendor.7z`（或分目录压成 8 个 .7z），NSIS 只负责打包这个单文件 + app 本身的 ~100 个文件。安装时 install.ps1 用 7z.exe 多线程解压到各自最终目录。

### 优化后流程

```
NSIS 安装包 (~500MB, ~100 文件 + vendor.7z)
    │
    ├── [Step 1] NSIS 解压 → resources/vendor.7z         ← 1 个文件 (秒级)
    │
    ├── [Step 2] 7z 多线程解压 → 各最终目录                ← 多线程 + 大块 I/O (30-60s)
    │
    └── [Step 3] 删除 vendor.7z                            ← 秒级
```

### 预期效果

| 指标 | 当前（NSIS 80000 文件） | 方案 C（7z 单包） | 改善 |
|------|------------------------|-------------------|------|
| NSIS 解压文件数 | ~80000 | ~100 | 800x |
| NSIS 解压时间 | 2-3 min | <10s | ~20x |
| vendor 分发时间 | <1ms (move) 或 3-5 min (robocopy) | 30-60s (7z MT) | - |
| Defender 扫描次数 | ~80000 | ~100 (NSIS) + 7z 解压流式 | 大幅减少 |
| 安装总时间（估） | 2-4 min (已优化) | 1-1.5 min | ~2x |

**关键洞察**：7z 解压是顺序大块写入，Defender 扫描整体而非逐文件，比 NSIS 的 80000 次 create/close/scan 高效得多。

---

## 实施方案

### 方案 C-1：单 .7z 包（简单）

编译时：
1. prepare-offline.ps1 末尾：`7z a -t7z -mx=9 -mmt=on vendor.7z vendor/`
2. electron-builder 的 extraResources 改为只包含 `vendor.7z`（不含 vendor/ 目录）
3. vendor.7z 内保持 `vendor/git/`、`vendor/python/` 等目录结构

安装时（install.ps1）：
1. NSIS 解压后得到 `resources/vendor.7z`（1 个文件，秒级）
2. install.ps1 调用内置 7z.exe 解压到临时目录，然后 Move-OrCopy-Dir 分发
3. 或者：7z 直接用 `-o` 参数解压到各最终目录（需要 8 次 7z 调用，或先解压再 move）

**优点**：改动最小，一个 7z 文件搞定
**缺点**：还是要 Move-OrCopy-Dir 分发（7z 不能一次解压到 8 个不同目录）

### 方案 C-2：分目录 .7z 包（推荐）

编译时：8 个子目录各压一个 .7z
1. `git.7z`（386MB → ~150MB）
2. `python.7z`（~200MB → ~80MB）
3. `site-packages.7z`（429MB → ~170MB）
4. `nm.7z`（288MB → ~100MB）
5. `chromium.7z`（~500MB → ~200MB）
6. `node.7z`（~80MB → ~35MB）
7. `venv-scripts.7z`（~20MB → ~8MB）
8. `hermes-agent.7z`（~50MB → ~15MB）

安装时：每个 .7z 直接 7z x -o目标目录，零中间 I/O

**优点**：
- 安装时每个 .7z 直解到最终目录，不需要 Move-OrCopy-Dir
- 可以并行解压多个小包（7z 支持多线程）
- 单包失败不影响其他包

**缺点**：改动量稍大，需要改 prepare-offline + electron-builder 配置 + install.ps1

### 方案 C-3：混合（最灵活）

静态大目录（git/python/chromium/site-packages/nm）各压 .7z，小目录（hermes-agent/venv-scripts/node）直接文件。

安装时大目录走 7z 直解，小目录走原来的 Move-OrCopy-Dir。

---

## 需要改动的文件

### 1. prepare-offline.ps1（编译时）

末尾新增：根据选定方案打包 vendor 子目录为 .7z

```powershell
# 伪代码（方案 C-2）
$sevenZip = Join-Path $VendorDir "bin\7z.exe"  # 或用系统自带的
$archiveDir = Join-Path $VendorDir "..\archives"
New-Item -ItemType Directory -Force -Path $archiveDir

foreach ($sub in @("git", "python", "site-packages", "nm", "chromium", "node", "venv-scripts")) {
    $src = Join-Path $VendorDir $sub
    if (Test-Path $src) {
        & $sevenZip a -t7z -mx=9 -mmt=on "$archiveDir\$sub.7z" "$src\*" 
        # 删除原始目录，只保留 .7z
        Remove-Item $src -Recurse -Force
    }
}
```

### 2. electron-builder 配置（package.json 的 build.extraResources）

```jsonc
// 从：
"extraResources": [{ "from": "build/vendor", "to": "vendor" }]

// 改为：
"extraResources": [{ "from": "build/archives", "to": "archives" }]
```

### 3. install.ps1（安装时）

```powershell
# 伪代码（方案 C-2）
$archiveDir = Join-Path $ResourcesDir "archives"
$sevenZip = Join-Path $InstallDir "bin\7z.exe"  # 需要内置 7z.exe

# 各 .7z 直解到最终目录
$destMap = @{
    "git.7z"            = Join-Path $HermesHome "git"
    "python.7z"         = Join-Path $InstallDir "python"
    "site-packages.7z"  = Join-Path $InstallDir "venv\Lib\site-packages"
    "nm.7z"             = Join-Path $InstallDir "node_modules"
    "chromium.7z"       = Join-Path $env:LOCALAPPDATA "ms-playwright"
    "node.7z"           = Join-Path $HermesHome "node"
    "venv-scripts.7z"   = Join-Path $InstallDir "venv\Scripts"
    "hermes-agent.7z"   = $InstallDir
}

foreach ($archive in $destMap.Keys) {
    $archivePath = Join-Path $archiveDir $archive
    $destPath = $destMap[$archive]
    if (Test-Path $archivePath) {
        New-Item -ItemType Directory -Force -Path $destPath | Out-Null
        & $sevenZip x $archivePath -o"$destPath" -y -mmt=8
    }
}
```

### 4. 7z.exe 来源

需要在 vendor/bin/ 里内置 7za.exe（standalone 版，~1.5MB）：
- 下载：https://www.7-zip.org/a/7zr.exe（1.5MB）或 7za.exe（2MB）
- 放入 vendor/bin/7z.exe
- prepare-offline.ps1 采集时一并打包

### 5. Stage-VendorFiles 重构

当前的 Stage-VendorFiles 函数（~200 行 robocopy + Move-OrCopy-Dir 逻辑）需要改为：
- 检测 archives/ 目录是否存在
- 存在 → 走 7z 解压路径
- 不存在 → 走原有 vendor/ 目录路径（向后兼容旧安装包）

---

## 风险与注意事项

### 1. 7z.exe 依赖
安装时需要 7z.exe 可用。如果从 vendor.7z 里拿 7z.exe 本身，就是鸡生蛋问题。
**解法**：7z.exe 单独放在 NSIS 直接解压的路径（不在 .7z 包内），或者 NSIS 脚本内嵌 7z 解压插件。

### 2. Defender 扫描 .7z 内容
7z 解压时 Defender 仍会扫描解压出的文件，但因为是大块连续写入而非逐文件 create/close，扫描开销更低。

### 3. 增量更新
hermes update 机制依赖 git fetch + checkout。改为 .7z 后，更新仍走 git 路径，不受影响——.7z 只管首次安装的分发。

### 4. 压缩率 vs 解压速度
- `-mx=9`：最大压缩，包最小但编译时间长
- `-mx=5`：平衡，包稍大但编译快
- 建议编译用 mx=5，因为 NSIS 还会再压一层

### 5. 向后兼容
旧安装包（vendor/ 目录形式）必须仍能正常安装。install.ps1 需要同时支持两种模式。

### 6. NSIS 双重压缩
NSIS 自己用 LZMA2 压缩，7z 也压缩。vendor.7z 已经是压缩数据，NSIS 再压效果微乎其微但浪费时间。
**解法**：electron-builder 配置里对 .7z 文件设置 `compression: store`（不压缩），只对 app 文件用 LZMA2。
但 electron-builder 不支持 per-file compression，可能需要自定义 NSIS 脚本。

---

## 实施优先级建议

1. **先做 C-2（分目录 .7z）**——效果最好，改动可控
2. 先在 prepare-offline.ps1 加打包逻辑，编译验证包大小和压缩时间
3. 再改 install.ps1 解压逻辑，在干净 Windows 上测安装时间
4. 最后改 electron-builder 配置

## 验证指标

- [ ] vendor.7z 各包大小和总大小
- [ ] 7z 压缩时间（编译侧）
- [ ] 7z 解压时间（安装侧，干净 Windows）
- [ ] NSIS 打包时间变化
- [ ] 安装总时间对比（当前 vs 方案 C）
- [ ] 安装后功能验证（hermes 启动、git、python、浏览器工具全部正常）
