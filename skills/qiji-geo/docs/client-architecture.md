# Auth Helper 桌面客户端架构

> 从 `D:\GEO cli\auth helper\resources\app.asar` 逆向分析。
> 完整 API 端点表见 `references/auth-helper-client.md`。

## 基本信息

- 名称：auth-helper v2.11.10
- 路径：`D:\GEO cli\auth helper\auth helper.exe`
- 技术栈：Electron + Vue 2 + Element UI + Flask (Python/PyInstaller)
- 进程结构：auth helper.exe (Electron壳) → spawn main.exe (Flask后端)

## 三层架构

```
auth helper.exe (Electron 主进程)
├── electron/main.js          ← Electron 主进程入口
├── vue-dist/                 ← Vue 2 前端编译产物 (index.html)
│   └── static/js/app.fd1c1ddf.js  ← Vue 业务逻辑（编译后）
├── src/api/                  ← 前端 API 调用层（未编译源码）
│   ├── index.js              ← 账号管理 API
│   ├── center.js             ← 表单 API
│   ├── plateform.js          ← 平台 API
│   ├── push.js               ← 推送/发布 API（核心）
│   ├── login.js              ← 登录 API
│   ├── aiAuth/               ← 8 个 AI 平台认证模块
│   └── script/               ← 16 个社媒平台自动化脚本
├── resources/main/main.exe   ← Flask 后端 (PyInstaller 打包, 7.3MB)
└── node_modules/             ← playwright-core, axios 等
```

## 双 API 架构（关键）

客户端有两套后端：

### 1. 本地 Flask (0.0.0.0:5000) — 浏览器自动化

Flask 只负责浏览器自动化操作（社媒发布、AI认证）。

- 绑定 `0.0.0.0:5000`
- **WSL 无法直接访问**（防火墙拦截跨网段请求）
- 必须通过 PowerShell 代理调用（`geo-client.py` 已内置）

### 2. 远程服务器 (8.138.58.181) — 管理类操作

axios baseURL = `http://8.138.58.181`，负责所有管理类 API：
- 账号列表、平台列表、表单、诊断统计、登录验证
- **WSL 可直接访问**（公网地址）

### 如何区分

看 `src/api/` 中代码：
- 用 `/api/xxx` 相对路径的 → 走本地 Flask
- 用 `http://8.138.58.181/xxx` 绝对路径的 → 走远程服务器

测试方法：POST `{}` 到端点：
- **500** = 路由存在（bad body）→ 本地 Flask
- **404** = 路由不存在，可能走远程服务器

## CDP 被安全软件拦截

360/火绒/Defender 会拦截 Electron 的 CDP HTTP 端点：

| 阶段 | 状态 |
|------|------|
| `--remote-debugging-port=9222` 开端口 | TCP 握手成功 |
| HTTP `/json/version` | 超时（安全软件在 HTTP 层掐断） |
| WebSocket 连接 | 能连上（日志显示 `<ws connected>`） |
| Playwright `firstWindow()` | 超时 |
| Playwright `app.windows()` | 超时 |

**结论：必须走 PowerShell 代理 + Flask API，无法通过 CDP 控制 Electron 客户端。**

## 控制方式可行性

| 方式 | 可行性 | 说明 |
|------|--------|------|
| PowerShell 代理 → Flask API | ✅ 推荐 | 100% 可靠 |
| WSL 直连 Flask | ❌ | localhost forwarding 被 360/火绒拦截 |
| Playwright CDP | ❌ | HTTP 端点超时 |
| Playwright Electron launch | ❌ | firstWindow 超时 |

## 与知识库 Skill 联动

用户通过 `knowledge-base-articles` skill 创建品牌资料卡（模板：`knowledge-vault/_Templates/brand-card.md`），GEO skill 从知识库读取品牌数据用于：
- AI 可见度诊断的品牌名和关键词
- 爆文复刻的内容参考
- 文章生成的基础素材
- 社媒分发时的账号信息
