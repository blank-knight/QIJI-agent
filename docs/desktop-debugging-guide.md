# 奇计桌面版 代码阅读与调试指南

> 本文档整理了奇计（Hermes Agent 白标）桌面版的完整架构分析、代码阅读路线、调试方法。
> 适用于 Electron/Node.js 新手，按需查阅。

---

## 目录

1. [仓库说明](#1-仓库说明)
2. [桌面版代码结构](#2-桌面版代码结构)
3. [三层架构总览](#3-三层架构总览)
4. [启动流程详解](#4-启动流程详解)
5. [消息流转全链路](#5-消息流转全链路)
6. [main.cjs 阅读指南](#6-maincjs-阅读指南)
7. [后端代码结构](#7-后端代码结构)
8. [调试方法](#8-调试方法)
9. [关键文件与行号速查表](#9-关键文件与行号速查表)
10. [常见问题](#10-常见问题)

---

## 1. 仓库说明

有两个奇计相关目录，分工不同：

| 目录 | 用途 | 内容 |
|------|------|------|
| `~/clawd/qiji-fork` | **代码本体** | 完整 Hermes Agent fork（5471+文件），所有 Python 源码、Electron 桌面版、CLI |
| `~/clawd/qiji-agent` | **文档 + 打包产物** | 开发笔记（CLAUDE.md、memory-bank/）、桌面打包成品（AppImage 等） |

日常开发、改代码、调试都在 `qiji-fork`。`qiji-agent` 只是笔记本和成品货架。

GitHub 远程：
- qiji-fork → `github.com/blank-knight/QIJI-agent`（+ Gitee 镜像）
- qiji-agent → `github.com/blank-knight/qiji-agent-docs`

### 奇计定制改动（7条commit）

```
378b34559  白标 branding（改名/图标/配色）
2775f075c  清理 Hermes 残留文本
e701c8971  预装 qiji-knowledge-base + qiji-geo 两个 skill
33307e04f  翻译表补充
9bbc55df1  知识库批量导入功能
825114728  离线包 vendor + install.ps1
d446842b3  切换更新源到 Gitee + 修复 git init 静默失败
1d3f4583b  git.exe 被安全软件拦截时的 HTTP API fallback
```

---

## 2. 桌面版代码结构

```
~/clawd/qiji-fork/
├── apps/
│   ├── desktop/                    ← 桌面版主目录
│   │   ├── electron/               ← Electron 主进程（Node.js / .cjs）
│   │   │   ├── main.cjs            ← 总入口（7091行）：窗口、IPC、后端管理
│   │   │   ├── preload.cjs         ← 注入渲染进程的安全桥
│   │   │   ├── update-remote.cjs   ← 更新源 URL（GitHub → Gitee）
│   │   │   ├── update-http-fallback.cjs ← git.exe 被杀软拦截时的 HTTP API
│   │   │   ├── bootstrap-runner.cjs← 离线包安装 / 首次安装引导
│   │   │   └── hardening.cjs       ← 安全加固
│   │   │
│   │   ├── src/                    ← React 前端（渲染进程 / TypeScript）
│   │   │   ├── main.tsx            ← React 入口
│   │   │   ├── app/                ← 聊天界面、设置页
│   │   │   │   └── session/hooks/
│   │   │   │       └── use-prompt-actions.ts  ← 消息发送逻辑
│   │   │   ├── hermes.ts           ← HermesGateway 类（WebSocket 连接管理）
│   │   │   └── store/              ← 状态管理
│   │   │
│   │   ├── package.json            ← 脚本和依赖
│   │   ├── vite.config.ts          ← Vite 构建配置
│   │   └── .vscode/
│   │       ├── launch.json         ← VS Code 调试配置
│   │       └── tasks.json          ← 构建任务
│   │
│   └── shared/                     ← 前后端共享代码
│       └── src/
│           ├── json-rpc-gateway.ts ← WebSocket JSON-RPC 客户端基类
│           └── index.ts
│
├── hermes_cli/                     ← Python CLI + Web 服务器
│   ├── main.py                     ← CLI 主入口（13000+行），含 cmd_dashboard()
│   ├── web_server.py               ← FastAPI 后端（13000+行）
│   └── subcommands/
│       └── dashboard.py            ← dashboard 子命令参数定义
│
├── tui_gateway/                    ← WebSocket ↔ Agent 桥接层
│   ├── ws.py                       ← WebSocket 消息循环
│   ├── server.py                   ← JSON-RPC 路由分发（100个method）
│   ├── transport.py                ← 传输抽象
│   └── render.py                   ← 终端渲染
│
├── agent/                          ← Agent 核心大脑
│   ├── conversation_loop.py        ← 对话循环（核心）
│   ├── turn_context.py             ← 每轮上下文准备
│   ├── context_compressor.py       ← 上下文压缩
│   └── agent_init.py               ← Agent 初始化
│
└── gateway/                        ← Telegram/Discord/Slack 等（桌面版不走这里）
    └── run.py
```

### .cjs 是什么

.cjs = CommonJS 格式的 JavaScript。

Node.js 有两种模块语法：
- CommonJS（用 `require()` / `module.exports`）→ 后缀 `.cjs`
- ES Modules（用 `import` / `export`）→ 后缀 `.mjs`，或 package.json 设 `"type": "module"` 时的 `.js`

项目的 package.json 设了 `"type": "module"`，但 Electron 主进程代码大量使用 `require()`，所以用 `.cjs` 后缀强制走 CommonJS。内容还是 JavaScript。

---

## 3. 三层架构总览

桌面版运行时实际跑着三个独立进程：

```
┌─────────────────────────────────────────────────────────┐
│  进程1: Vite Dev Server (Node.js)                        │
│  作用: 前端热更新服务器（开发模式，端口 5174）             │
│  调试: 不需要                                            │
├─────────────────────────────────────────────────────────┤
│  进程2: Electron (Node.js)                               │
│  作用: 窗口管理 + spawn Python 后端 + IPC                 │
│  代码: electron/*.cjs                                    │
│  调试: VS Code F5 打断点                                  │
├─────────────────────────────────────────────────────────┤
│  进程3: Python (hermes_cli)                              │
│  作用: 真正的 AI Agent 大脑（FastAPI + WebSocket）        │
│  代码: hermes_cli/ + tui_gateway/ + agent/               │
│  调试: 终端 python3 cli.py + VS Code Python debugger     │
└─────────────────────────────────────────────────────────┘
```

React 前端跑在 Electron 的渲染进程里，不是独立进程。

main.cjs（Electron 主进程）的角色是"启动器"——拉起 Python 后端后就基本退出了消息链路，不参与用户消息收发。

---

## 4. 启动流程详解

### main.cjs 与 bootstrap 的关系

main.cjs 是 Electron 壳，bootstrap 是首次安装的引导程序。

启动时 main.cjs 问一个问题："这台机器上有没有装好奇计（Hermes Python）？"
- 有 → 直接拉起来用
- 没有 → 跑 bootstrap 帮你装好，再拉起来

判断依据：标记文件 `~/.hermes/hermes-agent/.hermes-bootstrap-complete`，存在就是装过了。

### 完整启动流程

```
用户双击奇计.exe / npm run dev
        │
        ▼
app.whenReady() (main.cjs:7003)
  │  ← 注意：whenReady 之前 7000 行是"准备工作"：
  │    require() 加载依赖、const 声明、function 定义
  │    这些代码在文件加载时立刻执行
  │    whenReady 只是注册一个回调，等 Electron 就绪后才触发
  │
  ├── createWindow() (main.cjs:5555)
  │     创建 BrowserWindow，加载 React 前端
  │
  ├── 前端显示加载动画
  │
  ▼  前端触发 IPC: hermes:connection (main.cjs:5678)
  │
  ensureBackend() (main.cjs:4866)
  │
  └── startHermes() (main.cjs:5123)
       │
       ▼
       resolveHermesBackend() (main.cjs:2595)
       按优先级找 Python 后端：
       ① 环境变量 HERMES_DESKTOP_HERMES_ROOT 指定了源码？ → 开发模式走这里
       ② 当前目录是 Hermes 源码？ → 开发模式
       ③ 标记文件 .hermes-bootstrap-complete 存在？ → 直接用已安装的
       ④ PATH 上有 hermes 命令？ → smoke test 后用
       ⑤ 系统 Python 能 import hermes_cli？ → 用 python -m
       ⑥ 以上全没有 → 返回 { bootstrap: true }，需要首次安装
       │
       │  如果需要 bootstrap：
       │  → runBootstrap() (bootstrap-runner.cjs:628)
       │    1. 找到 install.ps1
       │    2. 跑 install.ps1 -Manifest 获取安装阶段
       │    3. 逐个阶段执行（下载Python→创建venv→pip install）
       │    4. 写标记文件 .hermes-bootstrap-complete
       │    5. 重新走分支③
       │
       ▼
  spawn Python 后端 (main.cjs:5190)
  实际命令类似：
    python3 -m hermes_cli.main dashboard --no-open --host 127.0.0.1 --port 0
  │
  │  Python 后端启动 → 输出端口号到 stdout
  │  → waitForDashboardPort() 等端口就绪
  │
  ▼
  返回 { baseUrl, token, mode: 'local' } 给前端
  │
  ▼
  前端 WebSocket 连接 ws://127.0.0.1:<端口>/api/ws?token=xxx
  │
  ▼
  用户开始聊天
```

### 关于 app.whenReady() 前面的代码

Node.js 加载 .cjs 文件时从头到尾逐行执行：

1. 所有 `require()` 和 `const` 声明先跑（加载依赖、定义常量）
2. 所有 `function xxx() {}` 注册（只定义，不执行内部代码）
3. `app.commandLine.appendSwitch()` 等立刻执行的语句
4. `app.whenReady().then(callback)` 注册回调，不立刻执行

Electron 完成内部初始化后，才触发 whenReady 的 callback，这时候才创建窗口。

---

## 5. 消息流转全链路

### 前端：用户输入到 WebSocket 发出

```
用户在输入框打字，按回车
    │
    ▼
① 聊天输入框组件
   src/app/session/hooks/use-prompt-actions.ts:553
   submitPromptText(message)
    │
    ▼
② 发送 JSON-RPC 请求
   use-prompt-actions.ts:713
   requestGateway('prompt.submit', { session_id, text })
    │
    ▼
③ requestGateway 调用 gateway.request()
   gateway 是 HermesGateway 实例（定义在 src/hermes.ts:115）
   HermesGateway 继承自 JsonRpcGatewayClient
    │
    ▼
④ JsonRpcGatewayClient.request()
   apps/shared/src/json-rpc-gateway.ts:220
   做三件事：
   1. 生成请求 ID（r1, r2, r3...）
   2. 存到 pending 字典（等着匹配回复）
   3. 通过 WebSocket 发出去
    │
    ▼
⑤ socket.send(JSON.stringify({
     "jsonrpc": "2.0",
     "id": "r1",
     "method": "prompt.submit",
     "params": {"session_id": "xxx", "text": "你好"}
   }))                               (json-rpc-gateway.ts:246)
    │
    ▼
   WebSocket → Python 后端
```

### 后端：WebSocket 接收到 Agent 回复

```
┌─ ① FastAPI 收到 WebSocket 连接 ─────────────────────────┐
│  hermes_cli/web_server.py:11645                          │
│  @app.websocket("/api/ws")                               │
│  async def gateway_ws(ws):                               │
│      → handle_ws(ws)                                     │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌─ ② WebSocket 消息循环 ──────────────────────────────────┐
│  tui_gateway/ws.py:173                                   │
│  async def handle_ws(ws):                                │
│      ws.accept()              ← 建立连接                 │
│      while True:                                         │
│          raw = ws.receive_text()   ← 收到前端的消息       │
│          req = json.loads(raw)     ← 解析 JSON-RPC       │
│          resp = server.dispatch(req, transport)          │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌─ ③ JSON-RPC 路由分发 ───────────────────────────────────┐
│  tui_gateway/server.py:998                               │
│  def dispatch(req, transport):                           │
│      method = req["method"]    ← "prompt.submit"         │
│      fn = _methods[method]     ← 查注册表找到对应函数     │
│      fn(rid, params)           ← 调用                     │
│                                                          │
│  100个method通过 @method("xxx") 装饰器注册                │
│  prompt.submit 在 server.py:6826 注册                    │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌─ ④ prompt.submit 处理函数 ──────────────────────────────┐
│  tui_gateway/server.py:6826                              │
│  @method("prompt.submit")                                │
│  def _(rid, params):                                     │
│      session["running"] = True                           │
│      _start_agent_build(sid, session)  ← 懒加载 Agent    │
│      Thread → _run_prompt_submit()                      │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌─ ⑤ 实际调用 Agent 大脑 ─────────────────────────────────┐
│  tui_gateway/server.py:7237                              │
│  result = agent.run_conversation(run_message, ...)       │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌─ ⑥ Agent 对话循环 ──────────────────────────────────────┐
│  agent/conversation_loop.py:495                          │
│  def run_conversation(agent, user_message, ...):         │
│      while 循环:                                         │
│          1. build_turn_context()  准备上下文             │
│          2. 构建 api_messages                           │
│             · system prompt 放最前                      │
│             · 注入 memory/plugin                        │
│             · 修复 role 交替违规                        │
│             · 应用 prompt caching                       │
│          3. 调 LLM API（带重试/fallback）                │
│          4. 解析返回：                                   │
│             · 有 tool_calls → 验证 → 执行 → continue    │
│             · 无 tool_calls → 最终回复 → break          │
│      返回 {final_response, messages, api_calls}         │
└──────────────────────────────────────────────────────────┘
    │
    ▼
   ⑦ 结果原路返回
   run_conversation 返回 result dict
       ↓
   _stream(delta) 回调实时推送 emit("message.delta", ...)
       ↓
   WebSocket → 前端收到流式输出
       ↓
   用户看到回复
```

### 关键设计点

- **system prompt 整个会话只构建一次**（缓存在 `_cached_system_prompt`），后续每轮原样发送。这是为了让 Anthropic prompt cache 保持热度——改一个字缓存就失效了。
- **Agent 是懒加载的**——用户第一次发消息时才构建 AIAgent 实例（`_start_agent_build`），不是启动时立刻创建。
- **消息通过 WebSocket 双向通信**——前端发出请求，后端流式推送 delta（token-by-token）。
- **main.cjs 不在消息链路上**——它负责启动，启动完了用户消息直接通过 WebSocket 在前端和 Python 之间传递。

### 前端层次关系

```
use-prompt-actions.ts    ← UI 逻辑层：监听回车、处理文本
       │
       ▼
hermes.ts                ← 封装层：HermesGateway 类
                            负责连接管理（连/断/重连）
       │
       ▼
json-rpc-gateway.ts      ← 传输层：JsonRpcGatewayClient
                            负责 socket.send() 实际发送
                            负责 Promise 回调匹配（request/response）
                            负责消息收发
```

---

## 6. main.cjs 阅读指南

main.cjs 有 7091 行、约 150 个函数。不需要从头读到尾，按主题查找。

### 核心架构（先看这4个）

| 函数 | 行号 | 作用 |
|------|------|------|
| `app.whenReady()` | 7003 | 应用启动入口 |
| `createWindow()` | 5555 | 创建主窗口 |
| `startHermes()` | 5123 | 启动 Python 后端 |
| `ensureBackend()` | 4866 | 后端连接管理 |

### 奇计相关改动（重点看）

| 函数 | 行号 | 作用 |
|------|------|------|
| `resolveHermesBackend()` | 2595 | 找到 Hermes Python 可执行文件 |
| `resolveHermesHome()` | 260 | 确定 HERMES_HOME 目录 |
| `resolveUpdateRoot()` | 1529 | 更新仓库在哪 |
| `checkUpdates()` | 1609 | 检查更新（调 git/HTTP） |
| `applyUpdates()` | 1897 | 应用更新 |

加上单独文件：
- `electron/update-remote.cjs` — 更新源 URL（GitHub → Gitee）
- `electron/update-http-fallback.cjs` — git.exe 被杀软拦截时的 HTTP fallback
- `electron/bootstrap-runner.cjs` — 离线包 vendor + install.ps1

### 不需要看的（占90%行数）

窗口UI控制、主题/字体、媒体/权限、终端管理、OAuth登录、多窗口管理、卸载逻辑、日志轮转、链接预览、Deep Link。

### 建议阅读路线

```
第一步：理解"启动一条线"
  app.whenReady (7003)
    → createWindow (5555)      // 建窗口
    → ensureBackend (4866)      // 前端IPC触发
    → startHermes (5123)        // spawn Python
    → waitForDashboardPort      // 等就绪

第二步：理解"更新一条线"
  checkUpdates (1609)
    → update-http-fallback.cjs
    → applyUpdates (1897)

第三步：理解"离线包安装一条线"
  bootstrap-runner.cjs → install.ps1
```

### VS Code 导航技巧

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Shift+O` | 输入函数名直接跳转（如输入 `startHermes`） |
| `Ctrl+G` | 输入行号直接跳（如 `5123`） |
| `F12` 或右键 → Go to Definition | 跳到函数定义处 |
| `Shift+F12` | 查看所有引用 |

---

## 7. 后端代码结构

### 后端核心目录

```
~/clawd/qiji-fork/
├── hermes_cli/
│   ├── main.py              ← CLI 入口，cmd_dashboard() 在 line 11234
│   │                           启动流程：检查依赖 → 构建 Web UI → start_server()
│   └── web_server.py        ← FastAPI 服务器（13000+行）
│                               app = FastAPI() 在 line 235
│                               WebSocket 路由：/api/ws, /api/pty, /api/pub, /api/events
│                               start_server() 在 line 12921
│
├── tui_gateway/              ← WebSocket ↔ Agent 桥接层
│   ├── ws.py                ← handle_ws() 在 line 173，WebSocket 消息循环
│   ├── server.py            ← JSON-RPC 路由（11781行）
│   │                           dispatch() 在 line 998
│   │                           handle_request() 在 line 986
│   │                           @method() 装饰器注册 handler（共100个method）
│   │                           prompt.submit handler 在 line 6826
│   │                           _run_prompt_submit() 在 line 7091
│   └── transport.py         ← 传输抽象层
│
├── agent/                    ← Agent 核心大脑
│   ├── conversation_loop.py ← run_conversation() 在 line 495
│   │                           while 循环：调LLM → 解析 → 执行工具 / 返回
│   │                           API 调用在 line 946-1005（重试/fallback）
│   │                           工具执行在 line 3812-3992
│   ├── turn_context.py      ← 每轮上下文准备
│   ├── context_compressor.py← 上下文压缩
│   └── agent_init.py        ← Agent 初始化
│
└── gateway/                  ← Telegram/Discord/Slack 等（桌面版不走这里）
    └── run.py               ← GatewayRunner.start() 在 line 5315
```

### JSON-RPC 方法列表（部分）

通过 `@method("xxx")` 装饰器注册到 `_methods` 字典，共100个：

| Method | 行号 | 作用 |
|--------|------|------|
| `session.create` | 4408 | 创建新会话 |
| `session.list` | 4552 | 列出会话 |
| `session.resume` | 4660 | 恢复会话 |
| `prompt.submit` | 6826 | **发送消息（最核心）** |
| `prompt.background` | 8129 | 后台发送 |
| `session.status` | 6201 | 查询状态 |
| `llm.oneshot` | 5338 | 单次LLM调用 |
| `pet.*` | 5597+ | 桌面宠物相关 |

---

## 8. 调试方法

### 前提：安装依赖（第一次必须做）

```bash
cd ~/clawd/qiji-fork
npm install          # workspace 会自动带上 desktop
```

### 环境确认

```bash
# WSLg 是否可用（决定 Electron 窗口能否显示）
echo $DISPLAY       # 应输出 :0
ls /tmp/.X11-unix/  # 应有 X0

# Python 后端是否可用
python3 --version   # 需要 3.12+
python3 -c "import hermes_cli; print('OK')"
which hermes
```

### 调试 Electron 主进程（.cjs 文件）

**方式1：VS Code F5（推荐）**

1. VS Code 打开 `~/clawd/qiji-fork/apps/desktop/`
2. 打开一个 .cjs 文件（如 `electron/main.cjs`）
3. 在代码行号左边点一下，打红点断点
4. 按 `F5`，选 "Electron Main + Vite (断点调试)"

VS Code 自动启动 Vite + Electron，代码执行到断点会停住。

| 快捷键 | 作用 |
|--------|------|
| F5 | 继续运行到下一个断点 |
| F10 | 逐行执行（不进入函数） |
| F11 | 进入函数内部 |
| Shift+F5 | 停止调试 |
| Ctrl+Shift+F5 | 重启调试 |

**方式2：Attach 模式**

```bash
cd ~/clawd/qiji-fork/apps/desktop
npm run profile:main    # 带 --inspect=9229 启动
```
然后 VS Code 调试面板选 "Attach to Electron Main (9229)"，按 F5 连接。

或用 Chrome：访问 `chrome://inspect` → "Open dedicated DevTools for Node"

### 调试 React 前端（.ts/.tsx 文件）

1. 先 `npm run dev` 启动（或 VS Code F5）
2. Electron 窗口出来后，按 `Ctrl+Shift+I` 打开 DevTools
3. Sources 面板里找到文件，打断点
4. React DevTools 浏览器扩展也能用

关键断点位置：
- `src/app/session/hooks/use-prompt-actions.ts:553` — submitPromptText
- `src/app/session/hooks/use-prompt-actions.ts:713` — requestGateway 调用
- `apps/shared/src/json-rpc-gateway.ts:246` — socket.send() 实际发送

### 调试 Python 后端

**重要**：桌面版启动时 Python 是 Electron spawn 的子进程，VS Code 不能直接对它打断点。

**方式1：纯命令行模式（推荐调试后端逻辑）**

```bash
cd ~/clawd/qiji-fork
python3 cli.py
```

这是纯命令行版的奇计，没有窗口界面，但后端逻辑完全一样。可以在任何 .py 文件里加 `breakpoint()`（Python 3.7+内置），或在 VS Code 里用 Python debugger。

**方式2：走桌面版 + Python 日志**

`npm run dev` 启动桌面版，Python 后端会被自动拉起为子进程。在 Python 代码里加 `print()` 或 `logging.info()`，输出会在启动 dev 的终端里看到。

### 三层调试对照表

| 想调什么 | 代码在哪 | 怎么调试 |
|----------|---------|---------|
| Electron 主进程 | `electron/*.cjs` | VS Code F5 打断点 |
| React 前端 | `src/*.tsx` | 窗口里 Ctrl+Shift+I |
| Python 后端 | `hermes_cli/`, `tui_gateway/`, `agent/` | 终端 `python3 cli.py` |

### 跑 Electron 单元测试

```bash
cd ~/clawd/qiji-fork/apps/desktop
npm run test:platforms
```

### 打包成品

```bash
cd ~/clawd/qiji-fork/apps/desktop
npm run dist:linux    # WSL 里打包 Linux 版
# Windows 打包需要在 Windows 环境跑 npm run dist:win
```

---

## 9. 关键文件与行号速查表

### Electron（main.cjs）

| 函数 | 行号 | 作用 |
|------|------|------|
| `app.whenReady()` | 7003 | 应用启动入口 |
| `createWindow()` | 5555 | 创建主窗口 |
| `ensureBackend()` | 4866 | 后端连接管理 |
| `startHermes()` | 5123 | 启动 Python 后端 |
| `spawn()` | 5190 | 实际 spawn Python 进程 |
| `resolveHermesBackend()` | 2595 | 找到 Python 后端（6个优先级分支） |
| `resolveHermesHome()` | 260 | 确定 HERMES_HOME |
| `resolveUpdateRoot()` | 1529 | 更新仓库位置 |
| `checkUpdates()` | 1609 | 检查更新 |
| `applyUpdates()` | 1897 | 应用更新 |
| IPC `hermes:connection` | 5678 | 前端触发后端连接 |

### 前端（TypeScript）

| 文件 | 行号 | 作用 |
|------|------|------|
| `src/app/session/hooks/use-prompt-actions.ts` | 553 | submitPromptText 定义 |
| `src/app/session/hooks/use-prompt-actions.ts` | 713 | requestGateway('prompt.submit') |
| `src/hermes.ts` | 115 | HermesGateway 类定义 |
| `apps/shared/src/json-rpc-gateway.ts` | 67 | JsonRpcGatewayClient 类 |
| `apps/shared/src/json-rpc-gateway.ts` | 220 | request() 方法 |
| `apps/shared/src/json-rpc-gateway.ts` | 246 | socket.send() 实际发送 |

### 后端（Python）

| 文件 | 行号 | 作用 |
|------|------|------|
| `hermes_cli/main.py` | 11234 | cmd_dashboard()，启动 web server |
| `hermes_cli/web_server.py` | 235 | FastAPI app 创建 |
| `hermes_cli/web_server.py` | 11645 | @app.websocket("/api/ws") |
| `hermes_cli/web_server.py` | 12921 | start_server() |
| `tui_gateway/ws.py` | 173 | handle_ws()，WebSocket 消息循环 |
| `tui_gateway/server.py` | 998 | dispatch()，JSON-RPC 路由 |
| `tui_gateway/server.py` | 986 | handle_request() |
| `tui_gateway/server.py` | 6826 | prompt.submit handler |
| `tui_gateway/server.py` | 7091 | _run_prompt_submit() |
| `tui_gateway/server.py` | 7237 | agent.run_conversation() 调用 |
| `agent/conversation_loop.py` | 495 | run_conversation()，Agent 大脑 |
| `agent/conversation_loop.py` | 589 | while 循环入口 |
| `agent/conversation_loop.py` | 946-1005 | LLM API 调用（重试/fallback） |
| `agent/conversation_loop.py` | 3812-3992 | 工具执行 |

### bootstrap-runner.cjs

| 函数 | 行号 | 作用 |
|------|------|------|
| `runBootstrap()` | 628 | 首次安装引导 |

---

## 10. 常见问题

### Q: 为什么有两个目录 qiji-fork 和 qiji-agent？
qiji-fork 是完整代码仓库（改代码、调试都在这里），qiji-agent 是文档和打包产物仓库。

### Q: main.cjs 有 7000 行怎么读？
不需要从头读。用 Ctrl+Shift+O 跳函数名，或 Ctrl+G 跳行号。按"启动→更新→离线包"三条线读，每条线只有3-4个函数。

### Q: main.cjs 和 Python 后端是什么关系？
main.cjs 是启动器。它找到 Python、spawn 进程、拿到端口和 token、告诉前端。之后就退出了消息链路。用户消息通过 WebSocket 直接在前端和 Python 之间传递，main.cjs 不参与。

### Q: app.whenReady() 前面 7000 行是干什么的？
准备工作：加载依赖（require）、定义常量（const）、注册函数（function定义）。whenReady 只注册一个回调，等 Electron 就绪后才触发。

### Q: .cjs 和 .js 有什么区别？
.cjs 强制用 CommonJS 语法（require/module.exports）。因为项目 package.json 设了 "type": "module"，.js 会默认走 ES Modules，而 Electron 主进程需要 CommonJS。

### Q: 桌面版启动后能直接对 Python 断点调试吗？
不能。Python 是 Electron spawn 的子进程，VS Code 断点管不到。调后端最简单的方式是终端直接跑 `python3 cli.py`。

### Q: 前端代码在哪打断点？
桌面版窗口出来后按 Ctrl+Shift+I，在 Sources 面板里打断点，和调试普通网页一样。

### Q: Bootstrap 是什么？
首次安装引导程序。最终用户第一次双击奇计时，机器上没有 Python，bootstrap 会自动下载安装。开发模式下（npm run dev）不会触发 bootstrap，因为源码目录本身就是 Hermes 源码。

---

## 附：VS Code 调试配置

`.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron Main + Vite (断点调试)",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "args": ["."],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Attach to Electron Main (9229)",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

`.vscode/tasks.json`：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "vite-dev",
      "type": "shell",
      "command": "npx vite --host 127.0.0.1 --port 5174",
      "isBackground": true,
      "problemMatcher": {
        "pattern": { "regexp": "." },
        "background": {
          "activeOnStart": true,
          "beginsPattern": "VITE",
          "endsPattern": "ready in"
        }
      }
    }
  ]
}
```

---

*文档生成时间：2026-06-26*
*基于 Hermes Agent qiji-fork 仓库分析*
