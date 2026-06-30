# 测试版问题记录

> 记录 Demo 测试版开发中遇到的所有问题，含根因分析和解决方案

---

## 编译阶段

### 问题1: bat 脚本中文乱码 ✅ 已修

- **现象：** 双击 build-windows.bat 闪退，PowerShell 报 `'/b' 不是内部或外部命令` 等乱码错误
- **根因：** bat 文件用 UTF-8 编码，Windows cmd 用 GBK 解码，中文全部乱码变成无效命令
- **解决：** bat 文件全部改成纯英文，零中文
- **教训：** Windows bat 脚本永远用英文，中文必乱码（已知坑，MEMORY 里有记录）

### 问题2: tar 解压散落在根目录 ✅ 已修

- **现象：** `tar xzf hermes-src.tar.gz` 在 Windows 上解压后文件散落在当前目录，没进 hermes-src/ 子目录
- **根因：** tar 默认解压到 cwd，bat 脚本检查的是 hermes-src/ 子目录
- **解决：** bat 脚本改为先 `mkdir hermes-src && cd hermes-src && tar xzf ..\hermes-src.tar.gz`

### 问题3: write-build-stamp.cjs 报错找不到 git commit ✅ 已修

- **现象：** `npm run build` 报 `could not determine git commit. git rev-parse HEAD failed`
- **根因：** Hermes 编译流程要求 git 仓库（用 commit hash 生成 install-stamp.json），但我们只是 tar 解压的源码，没有 git 历史
- **解决：** bat 脚本加 `git init && git add -A && git commit -m "qiji-geo build"`
- **影响：** 生成的 commit hash 是本地的，GitHub 上不存在——导致了问题5

### 问题4: 品牌文件没替换上（第一次编译出 Hermes.exe）✅ 已修

- **现象：** 第一次编译成功但产物是 `Hermes-0.15.1-win-x64.exe`，品牌文件没生效
- **根因：** bat 的 `copy /Y "desktop\xxx"` 路径不对——qiji-desktop-build 目录下还有一层 desktop/ 子目录
- **解决：** 从 WSL 直接 cp 品牌文件到 Windows 的 hermes-src/apps/desktop/ 目录，绕过 bat

### 问题5: 首启 bootstrap 失败（404 下载 install.ps1）🔴 未修

- **现象：** 双击安装好的 QijiGEO.exe，启动失败。日志：
  ```
  [bootstrap] fetching install.ps1 for dd3e4867a208 from GitHub
  [bootstrap] Failed to download install.ps1: HTTP 404
  ```
- **根因：** Hermes Desktop 首次启动时，会用 install-stamp.json 里的 commit hash 去 GitHub 下载 `install.ps1`（Hermes Python 后端安装脚本）。我们的 commit hash 是本地 git init 生成的（dd3e4867a208），GitHub 上不存在 → 404
- **这是核心架构问题：** Hermes Desktop 不是独立应用，它需要 Python 后端（Hermes Agent CLI）。首启流程是从 GitHub 下载 Python 后端安装脚本。本地编译的版本绕不过这个流程。
- **临时解决方案：** 在 Windows 上先手动安装 Hermes CLI，桌面版就能找到后端：
  ```
  irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex
  ```
- **彻底解决方案：** 见下方"小白一键安装问题"

---

## 编译成功记录

### Linux AppImage ✅
- 产物：`QijiGEO-1.0.0-linux-x86_64.AppImage`（133MB）
- 品牌定制全部生效

### Windows NSIS ✅
- 产物：`QijiGEO-1.0.0-win-x64.exe`（111MB）
- 品牌定制全部生效
- 安装成功，快捷方式显示"奇计GEO助手"
- 图标正确（靛蓝青绿放大镜）
- 首启失败（问题5）

---

## 小白一键安装问题（核心难题）

### 问题本质

Hermes Desktop 是一个 Electron 前端，它依赖：
1. **Python 3.11+** — 运行 Hermes Agent CLI 后端
2. **Hermes Agent CLI** — pip 安装的 Python 包
3. **LLM API Key** — 用户需要配置大模型 API
4. **Playwright + Chromium** — 浏览器自动化（我们的 GEO Skill 需要）

当前安装流程（对小白不友好）：
```
下载 .exe → 安装 → 首启失败 → 手动装 Python → 手动装 Hermes CLI → 
手动配 API Key → 手动装 Playwright → 手动装 Chromium → 才能用
```

小白用户在第3步就卡死了。

### 解决方案对比

#### 方案A：打包便携 Python（推荐）

把 Python + Hermes CLI + 所有依赖打包进安装包。

```
QijiGEO-Setup.exe（~400MB）
├── Electron 前端（~111MB，已有）
├── 内嵌 Python 3.11 运行时（~50MB）
├── Hermes Agent CLI + 依赖（~200MB）
├── Playwright + Chromium（~300MB）
└── 预配置文件（SOUL.md, config.yaml, qiji-geo skill）
```

实现方式：
- 用 PyInstaller 把 Hermes CLI 打包成单文件 exe
- NSIS 安装脚本把 pyinstaller 产物 + Electron 打包在一起
- 首启时桌面版直接调用内嵌的 hermes.exe，不走 GitHub 下载

**优点：** 真正一键安装，小白双击就行
**缺点：** 安装包大（400-500MB），编译复杂
**工作量：** 约1周

#### 方案B：云端后端（最佳长期方案）

不在用户电脑上跑 Python 后端，改成连奇计的服务器。

```
用户电脑
├── QijiGEO.exe（只有前端，~111MB）
└── 连接 → 奇计云端 Hermes 实例
                ├── Python 后端
                ├── LLM API
                └── qiji-geo Skill
```

实现方式：
- 奇计在服务器部署 Hermes Agent（已有 geo.heikexia.cc 基础设施）
- 桌面版改成连接远程后端（修改 electron/main.cjs 的后端发现逻辑）
- 用户只需登录奇计账号

**优点：** 安装包小（111MB），零配置，更新不依赖用户
**缺点：** 需要服务器运维，网络延迟，离线不能用
**工作量：** 约2周

#### 方案C：NSIS 捆绑安装（折中方案）

用 NSIS 的静默安装功能，一个安装包自动装所有东西。

```
QijiGEO-Setup.exe
├── Step 1: 安装 Electron 桌面端
├── Step 2: 静默安装 Python 3.11（如未检测到）
├── Step 3: pip install hermes-agent（静默）
├── Step 4: npx playwright install chromium（静默）
├── Step 5: 写入预配置文件
└── 完成
```

实现方式：
- 写自定义 NSIS 脚本（.nsi），捆绑 Python 安装包和依赖
- 安装过程中静默执行 pip install 等
- 首启直接找到已安装的后端

**优点：** 安装包适中（~200MB），全自动
**缺点：** NSIS 脚本复杂，Windows 环境差异可能导致静默安装失败
**工作量：** 约1.5周

### 推荐

| 阶段 | 方案 | 理由 |
|------|------|------|
| 测试版（现在） | 手动装 Hermes CLI | 快速验证功能 |
| 内测版 | 方案A（便携Python） | 完整体验，不依赖网络 |
| 正式版 | 方案B（云端后端） | 小白友好，运维集中 |

---

## 技术细节记录

### Hermes Desktop 后端发现逻辑

electron/main.cjs 的启动流程：
1. 检查系统 Python 能否 `import hermes_cli`
2. 如果不能 → 检查 HERMES_HOME 下有没有已安装的 hermes-agent
3. 如果没有 → 走 bootstrap 流程，用 install-stamp.json 的 commit hash 从 GitHub 下载 install.ps1
4. install.ps1 会克隆 Hermes 源码 + 创建 venv + 安装依赖

### install-stamp.json 的作用

记录编译时的 git commit hash，首启时用这个 hash 去 GitHub 下载对应版本的 install.ps1。
这是为官方发布设计的——官方 CI 编译时 commit hash 真实存在。
我们本地编译的 hash 是假的，所以 404。

### 绕过 bootstrap 的方法

如果用户电脑上已经装好了 Hermes CLI（Python 能 import hermes_cli），桌面版会跳过 bootstrap 直接启动。
这就是为什么"先装 Hermes CLI 再开桌面版"能work。

---

## 2026-06-19 品牌去Hermes化（完成）

### 问题6: UI 到处都是 Hermes 字样 ✅ 已修

- **现象：** 用户安装后打开 Qiji.exe，发现界面到处显示 "Hermes"（窗口标题、启动提示、错误消息、关于页面等）
- **范围：** 67个源文件包含 "Hermes" 引用
- **解决：**
  - 4个语言文件（zh/en/zh-hant/ja）：所有用户可见字符串中的 Hermes → 奇计
  - Electron 后端 8个 .cjs 文件：启动消息、窗口标题、gateway 提示、错误提示
  - About 页面：GitHub release URL 换成 qiji.ai/changelog
  - User-Agent：Hermes-Desktop → Qiji-Desktop
- **原则：** 代码标识符（class名、import名、环境变量名 HERMES_HOME、文件路径 ~/.hermes/）不改——这些是系统内部逻辑，改了会坏。只改用户能看到的文字。
- **Logo 也换了：** nous-girl.jpg（Nous Research 品牌）→ 奇计自定义图标（放大镜+"奇"字）

### 问题7: 编译报错 could not determine git commit ✅ 已修

- **现象：** npm run build 报 `could not determine git commit. git rev-parse HEAD failed`
- **根因：** write-build-stamp.cjs 要求 git 仓库用 commit hash 生成 install-stamp.json
- **解决：** 手动创建 build/install-stamp.json + 修补 write-build-stamp.cjs 在 stamp 已存在时跳过

### 问题8: 产物名从 QijiGEO.exe 改为 Qiji.exe ✅ 已修

- 用户明确要求品牌名是"奇计"不是"奇计GEO"
- productName: 奇计，executableName: Qiji，appId: com.qiji.assistant

---

## 下一步 TODO

### 紧急（验证功能）

1. [x] Windows 上装 Hermes CLI（已装，桌面版能启动）
2. [ ] 桌面版启动后配置 LLM（GLM API Key），验证能对话
3. [ ] 对话中触发 qiji-geo Skill，验证 GEO 操作能用
4. [x] 截图记录桌面版界面效果（已截图，用户确认无 Hermes 残留）

### 本周要做

5. [ ] 研究方案A（便携 Python）的可行性
6. [ ] 研究如何修改 bootstrap 流程，跳过 GitHub 下载
7. [ ] 补全 qiji-geo Skill 的 articles 列偏移 bug
8. [ ] 考虑首启配置向导（输入奇计账号 → 自动配置）

### 正式版前必须解决

9. [ ] 小白一键安装方案落地（方案A 或 B）
10. [ ] Playwright + Chromium 自动安装
11. [ ] LLM API 预配置（方案A：奇计统一API / 方案B：用户填Key）
12. [ ] 中文界面（当前部分中文，需要全汉化）
13. [ ] 错误提示中文化
