# 离线包原理详解

> 面向想理解"为什么这么编译"的开发者。操作步骤见 [build-and-test.md](build-and-test.md)。

---

## 一、为什么 npm 命令必须在 apps/desktop 下执行？

### 短答案

`npm run dist:win:nsis` 是一个定义在 `apps/desktop/package.json` 里的脚本。npm 只认当前目录（及父目录）下的 `package.json`。

### 详细解释

项目目录结构：

```
qiji-fork/                      ← fork 根目录（Python 后端）
├── hermes_cli/                 ← Python 后端源码
├── gateway/                    ← Python 网关
├── scripts/
│   ├── prepare-offline.ps1     ← vendor 生成脚本
│   └── install.ps1             ← 安装时执行的分发脚本
├── apps/
│   └── desktop/                ← ★ Electron 桌面端（前端 + Electron 主进程）
│       ├── package.json        ← ★ npm 脚本定义在这里
│       ├── electron/           ← Electron 主进程（main.cjs）
│       ├── src/                ← React 前端源码（tsx/ts）
│       ├── assets/             ← 应用图标
│       ├── scripts/            ← 编译钩子脚本（before-pack, after-pack 等）
│       ├── build/
│       │   └── vendor/         ← ★ prepare-offline.ps1 生成的离线依赖
│       └── release/            ← ★ 编译产物输出目录
│           └── Qiji-0.17.0-win-x64.exe
└── docs/
```

`package.json` 定义了所有 npm 脚本（L13-45）：

```json
{
  "scripts": {
    "dev": "...",                          // 开发热刷新
    "build": "... && tsc -b && vite build", // 编译前端
    "dist:win:nsis": "npm run build && npm run builder -- --win nsis",
    ...
  }
}
```

npm 执行流程：`npm run dist:win:nsis` → npm 在**当前目录**找 `package.json` → 找到 `scripts.dist:win:nsis` → 执行 `npm run build && npm run builder -- --win nsis`。

如果你在 `qiji-fork/`（根目录）执行，npm 找的是根目录的 `package.json`——那是 Python 项目的，里面没有 `dist:win:nsis` 脚本，直接报错。

**所有 npm 命令都必须在 `apps/desktop/` 下执行。**

---

## 二、vendor 到底是什么？

### 一句话

vendor 是一个**预下载的离线依赖包**，包含了用户安装奇计时需要的**所有**二进制依赖。有了它，安装过程完全不需要联网。

### vendor 里有什么？

`prepare-offline.ps1` 从你**本地已安装的 Hermes** 中采集这些文件：

| vendor 子目录 | 内容 | 来源 | 大小 |
|---|---|---|---|
| `bin/uv.exe` | uv 包管理器 | `$HermesHome\bin\uv.exe` | ~15MB |
| `git/` | PortableGit（Git for Windows） | `$HermesHome\git\` | ~350MB |
| `node/` | Node.js 运行时 | `$HermesHome\node\` | ~100MB |
| `tools/` | ripgrep + ffmpeg | `$HermesHome\tools\` | ~150MB |
| `hermes-agent/` | ★ **完整 Python 后端源码** | **fork 源码**（已修复） | ~60MB |
| `python/` | CPython 3.11.15 解释器 | uv managed store | ~60MB |
| `site-packages/` | Python 第三方库（FastAPI、uvicorn 等） | `$HermesHome\hermes-agent\venv\Lib\site-packages` | ~500MB |
| `venv-scripts/` | venv 的 Scripts 目录（python.exe 等） | `$HermesHome\hermes-agent\venv\Scripts` | ~15MB |
| `nm/` | Node.js 依赖（node_modules） | `$HermesHome\hermes-agent\node_modules` | ~400MB |
| `chromium/` | Playwright 内置 Chromium 浏览器 | `%LOCALAPPDATA%\ms-playwright` | ~700MB |

**总计约 2.1GB。**

### 为什么不能联网下载？

可以，但离线包的目标是：
1. **内网/断网环境** — 有些用户机器无法访问 GitHub / PyPI / npm
2. **速度** — 2GB 解压比下载快得多（尤其国内网络环境）
3. **版本锁定** — 确保用户拿到的 Python/Git/Node 版本和开发测试时完全一致

---

## 三、离线包的完整架构

### 从源码到用户安装，经历了什么？

```
                        开发阶段
    ┌──────────────────────────────────────────────┐
    │                                              │
    │  1. WSL fork 源码（品牌化）                    │
    │     ├── React 前端 (src/*.tsx)               │
    │     ├── Electron 主进程 (electron/*.cjs)      │
    │     └── Python 后端 (hermes_cli/*.py)        │
    │                                              │
    │  2. robocopy 同步到 Windows 编译目录           │
    │                                              │
    │  3. prepare-offline.ps1                      │
    │     从本地已装 Hermes 采集 → vendor/          │
    │     从 fork 源码复制 → vendor/hermes-agent/   │
    │                                              │
    └──────────────────────┬───────────────────────┘
                           │
                    npm run dist:win:nsis
                           │
                           ▼
                        编译阶段
    ┌──────────────────────────────────────────────┐
    │                                              │
    │  4. tsc -b + vite build                      │
    │     React 源码 → dist/（压缩后的 JS/CSS）      │
    │                                              │
    │  5. electron-builder 打包                     │
    │     ├── dist/          → app.asar 内部       │
    │     ├── electron/      → app.asar 内部       │
    │     ├── vendor/        → extraResources      │
    │     └── install.ps1    → extraResources      │
    │                                              │
    │  6. NSIS 压缩                                │
    │     → Qiji-0.17.0-win-x64.exe (713MB)       │
    │                                              │
    └──────────────────────┬───────────────────────┘
                           │
                    用户双击 exe 安装
                           │
                           ▼
                        安装阶段
    ┌──────────────────────────────────────────────┐
    │                                              │
    │  7. NSIS 解压                                 │
    │     Electron 应用 → C:\...\Qiji\             │
    │     vendor/ → C:\...\Qiji\resources\vendor\  │
    │     install.ps1 → C:\...\Qiji\resources\     │
    │                                              │
    │  8. 首次启动 → Electron 主进程 (main.cjs)     │
    │     检测到没有 .hermes-bootstrap-complete     │
    │     → 调用 bootstrap-runner.cjs              │
    │     → 执行 install.ps1（PowerShell 子进程）   │
    │                                              │
    │  9. install.ps1 → Stage-VendorFiles()        │
    │     把 vendor/ 里的内容分发到用户目录：        │
    │     C:\Users\<用户>\AppData\Local\hermes\     │
    │     ├── hermes-agent/  ← Python 后端源码     │
    │     ├── venv/         ← Python 虚拟环境      │
    │     ├── python/       ← ★ Python 解释器      │
    │     ├── git/          ← PortableGit          │
    │     ├── node/         ← Node.js              │
    │     ├── bin/uv.exe    ← uv                   │
    │     └── tools/        ← ripgrep + ffmpeg     │
    │                                              │
    │ 10. 写入 .hermes-bootstrap-complete           │
    │     → 后续启动跳过 bootstrap，直接用          │
    │                                              │
    │ 11. Electron 启动 Python 后端                 │
    │     python -m hermes_cli.main                │
    │     PYTHONPATH 指向 hermes-agent/             │
    │     FastAPI + uvicorn 监听本地端口            │
    │                                              │
    │ 12. React 前端通过 HTTP 连接 Python 后端       │
    │     → 用户看到完整应用 ✅                     │
    │                                              │
    └──────────────────────────────────────────────┘
```

### 关键机制详解

#### ① extraResources — vendor 怎么进到 exe 里的

`package.json` L164-185 配置了 electron-builder 的 `extraResources`：

```json
"extraResources": [
  { "from": "build/install-stamp.json", "to": "install-stamp.json" },
  { "from": "build/native-deps",        "to": "native-deps" },
  { "from": "assets/icon.ico",          "to": "icon.ico" },
  { "from": "../../scripts/install.ps1","to": "install.ps1" },
  { "from": "build/vendor",             "to": "vendor" }      // ★ 2.1GB 离线依赖
]
```

electron-builder 会把这些目录原样复制到安装目录的 `resources/` 下。安装后：

```
C:\Users\<用户>\AppData\Local\Programs\Qiji\
├── Qiji.exe                              ← Electron 壳
└── resources\
    ├── app.asar                          ← 前端 + Electron 主进程（加密压缩包）
    └── vendor\                           ← ★ 离线依赖（未压缩）
        ├── hermes-agent\
        ├── python\
        ├── site-packages\
        ├── git\
        ├── node\
        └── ...
```

#### ② install.ps1 — 首次启动时做什么

Electron 首次启动时（main.cjs 检测 `.hermes-bootstrap-complete` 不存在），通过 `bootstrap-runner.cjs` 启动 PowerShell 执行 `install.ps1`。

install.ps1 的 `Stage-VendorFiles()` 函数（L106-241）把 vendor 内容分发到 `$HermesHome`：

```powershell
# 伪代码，简化自 install.ps1 L106-241

$HermesHome = "$env:LOCALAPPDATA\hermes"    # C:\Users\<用户>\AppData\Local\hermes
$VendorDir  = "$InstallDir\resources\vendor" # vendor 在安装目录里

# 1. uv → $HermesHome\bin\uv.exe
Copy-Item "$VendorDir\bin\uv.exe" "$HermesHome\bin\uv.exe"

# 2. PortableGit → $HermesHome\git\
Copy-Item "$VendorDir\git" "$HermesHome\git" -Recurse

# 3. Node.js → $HermesHome\node\
Copy-Item "$VendorDir\node" "$HermesHome\node" -Recurse

# 4. Python 源码 → $HermesHome\hermes-agent\
Copy-Item "$VendorDir\hermes-agent" "$HermesHome\hermes-agent" -Recurse

# 5. Python 解释器 → $HermesHome\python\（★ 新架构：放在 InstallDir 内，不进 uv store）
robocopy "$VendorDir\python" "$HermesHome\python" /E /NJH /NJS /NFL /NDL /NP

# 6. site-packages → venv\Lib\site-packages\
robocopy "$VendorDir\site-packages" "$HermesHome\hermes-agent\venv\Lib\site-packages" /E /NJH /NJS /NFL /NDL /NP

# 7. venv Scripts（hermes.exe 入口点）
robocopy "$VendorDir\venv-scripts" "$HermesHome\hermes-agent\venv\Scripts" /E /NJH /NJS /NFL /NDL /NP

# 8. pyvenv.cfg — home 指向 $HermesHome\python（不是 uv store）
Write-AllText "$venv\pyvenv.cfg" @"
home = $HermesHome\python
implementation = CPython
uv = 0.11.23
version_info = 3.11.15
include-system-site-packages = false
"@

# 9. node_modules → $HermesHome\hermes-agent\node_modules\
Copy-Item "$VendorDir\nm" "$HermesHome\hermes-agent\node_modules" -Recurse

# 10. Chromium → %LOCALAPPDATA%\ms-playwright\
Copy-Item "$VendorDir\chromium" "$env:LOCALAPPDATA\ms-playwright" -Recurse
```

> **架构变更（2026-07-04）：** Python 解释器原本复制到 `%APPDATA%\uv\python\cpython-3.11-...\`，
> 现在改为直接放在 `$HermesHome\python\`。好处：路径短、不依赖 uv store 命名约定、
> 不跨目录树复制（这是安装失败的头号原因）。详见 [bugs-and-pitfalls.md 坑14](bugs-and-pitfalls.md)。

每个步骤都是**幂等的**——如果目标已存在就跳过，所以重复运行不会出错。

#### ③ Electron 怎么找到并启动 Python 后端

`main.cjs` 的 `resolveHermesBackend()` 函数（L2833-2849）决定用哪个 Python 后端：

```
优先级（从高到低）：

1. HERMES_DESKTOP_HERMES_ROOT 环境变量
   → 开发者手动指定的源码路径（几乎不用）

2. SOURCE_REPO_ROOT（仅 dev 模式 !IS_PACKAGED）
   → npm run dev 时，直接用 fork 自己的 Python 源码
   → 这就是为什么 dev 模式品牌化生效

3. ACTIVE_HERMES_ROOT（安装模式）
   → $HermesHome\hermes-agent（install.ps1 分发出来的源码）
   → 离线包安装后走这条路径

4. PATH 上的 hermes 命令
   → CLI 安装的用户走这条路径（最后兜底）
```

找到后端路径后，Electron 用 `buildDesktopBackendEnv()` 构造环境变量：

```javascript
{
  command: venvPython,                              // venv\Scripts\python.exe
  args: ['-m', 'hermes_cli.main', ...dashboardArgs], // 启动 FastAPI 后端
  env: {
    PYTHONPATH: ACTIVE_HERMES_ROOT,                  // Python 导入路径
    PATH: venvBin + nodeBin + ...                    // 二进制查找路径
  }
}
```

Python 后端启动后，FastAPI + uvicorn 监听本地端口，React 前端通过 HTTP/WebSocket 连接。

---

## 四、用一句话串联全过程

**你改了 fork 里的 Python 后端代码 → robocopy 同步 → prepare-offline.ps1 把 fork 源码复制进 vendor → electron-builder 把 vendor 塞进 exe → 用户安装时 install.ps1 把 vendor 分发到用户目录 → Electron 启动用户目录里的 Python 后端 → 前端连接后端 → 用户看到 "Run QiJi"。**

中间任何一环断了（忘了同步、忘了重新生成 vendor、prepare-offline 从错误位置复制），用户看到的就还是 "Run Hermes"。

---

## 五、常见疑问

### Q: 为什么 vendor 里的 node_modules 叫 `nm` 不叫 `node_modules`？

electron-builder 打包时会自动忽略名为 `node_modules` 的目录（认为是构建产物）。所以 prepare-offline.ps1 把它重命名为 `nm`，install.ps1 分发时再改回 `node_modules`。

### Q: 为什么改了前端代码不需要重新生成 vendor？

前端（React/tsx/ts）由 Vite 编译成 `dist/` 目录，electron-builder 把 `dist/` 打包进 `app.asar`（package.json L155: `"files": ["dist/**", ...]`）。这个过程直接读编译目录的最新文件，不经过 vendor。只有 Python 后端源码走 vendor 通道。

### Q: 为什么 dev 模式测不出品牌化问题？

dev 模式的后端来自 fork 源码（优先级 2: SOURCE_REPO_ROOT），离线包的后端来自安装目录（优先级 3: ACTIVE_HERMES_ROOT）。两个来源不同，所以 dev 模式显示品牌化文案，离线包可能还是上游原版。详见 [bugs-and-pitfalls.md 坑11](bugs-and-pitfalls.md)。

### Q: vendor 2.1GB 但 exe 只有 713MB？

NSIS 用 LZMA 极限压缩。vendor 里大量文件（.pyc、.exe、Chrome 二进制）已经是压缩格式，所以压缩率约 34%。这也是 NSIS 耗时 10 分钟的原因——LZMA 对每个文件都做压缩尝试，即使收益很小。

### Q: 用户安装后，vendor 还留在安装目录里吗？

是的，`resources\vendor\` 会占用约 2.1GB 空间。这是离线安装的代价。install.ps1 把内容**复制**（不是移动）到 `$HermesHome`，所以两份都在。如果需要节省空间，可以在 install.ps1 里加一步删除 `resources\vendor\`（但会失去重新初始化的能力）。
