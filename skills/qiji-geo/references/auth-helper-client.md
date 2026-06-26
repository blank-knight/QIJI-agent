# Auth Helper 桌面客户端架构（逆向分析）

> 2026-06-27 更新：完整 API 文档 + Flask/远程服务器双 API 架构
> 2026-06-26 初版：从 `D:\GEO cli\auth helper\resources\app.asar` 提取分析

## 基本信息

- **名称**: auth-helper v2.11.10
- **路径**: `D:\GEO cli\auth helper\auth helper.exe`
- **技术栈**: Electron + Vue 2 + Element UI + Flask (Python/PyInstaller)
- **进程结构**: auth helper.exe (Electron壳) → spawn main.exe (Flask后端)

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
│   ├── push.js               ← 推送/发布 API（核心！）
│   ├── login.js              ← 登录 API
│   ├── aiAuth/               ← 8 个 AI 平台认证模块
│   └── script/               ← 16 个社媒平台自动化脚本
├── resources/main/main.exe   ← Flask 后端 (PyInstaller 打包, 7.3MB)
└── node_modules/             ← playwright-core, axios 等
```

## ⚠️ 双 API 架构（关键发现）

客户端有**两套 API 后端**：

### 1. 本地 Flask（端口 5000）— 浏览器自动化

Flask 只负责**浏览器自动化操作**（社媒发布、AI 认证）。

绑定 `0.0.0.0:5000`，但 **WSL 无法直接访问**（Windows 防火墙拦截跨网段请求）。
必须通过 **PowerShell 代理**调用（见 `scripts/geo-client.py`）。

### 2. 远程服务器（8.138.58.181）— 管理类操作

axios baseURL = `http://8.138.58.181`，负责所有**管理类 API**：
账号列表、平台列表、表单、诊断统计、登录验证等。

### 如何区分

看 `src/api/` 中代码：
- 用 `request(...)` → 远程服务器（8.138.58.181）
- 用 `axios.post('http://127.0.0.1:${port}/api/...')` → 本地 Flask

## 本地 Flask API 完整端点（实测验证 ✅）

以下端点全部实测（2026-06-27），返回真实响应：

### 社媒发布

| 端点 | 方法 | 请求体 | 响应 | 状态 |
|------|------|--------|------|------|
| `/api/push` | POST | `{uid, udid, my_headless, publish_interval, google_path, api_url, agent_ip_url, agent_ip_username}` | `{code:1, msg:"成功", task_id:"xxx"}` | ✅ |
| `/api/stop` | POST | `{}` | `{code:1, msg:"中止任务"}` | ✅ |
| `/api/logs/{task_id}` | GET | `?last_version=N` | 日志列表 | ✅ (需有效 task_id) |

### AI 发布

| 端点 | 方法 | 请求体 | 响应 | 状态 |
|------|------|--------|------|------|
| `/api/ai_push` | POST | `{udid, uid}` | `{code:1, msg:"成功", task_id:"xxx"}` | ✅ |
| `/api/ai_stop` | POST | `{}` | `{code:1, msg:"中止AI任务"}` | ✅ |
| `/api/ai_logs/{task_id}` | GET | `?last_version=N` | AI 日志列表 | ✅ (需有效 task_id) |

### 授权登录

| 端点 | 方法 | 请求体 | 响应 | 状态 |
|------|------|--------|------|------|
| `/api/media/login` | POST | `{udid, ...}` | `{code:0, msg:"授权失败: 'udid'"}` (需正确参数) | ✅ |
| `/api/deepseek/login` | POST | `{udid, ...}` | `{code:0, msg:"授权失败,请联系管理员: 'udid'"}` | ✅ |
| `/api/kimi/login` | POST | `{udid, ...}` | `{code:0, msg:"授权失败: 'udid'"}` | ✅ |

### 其他已知端点（从源码提取，未全部测试）

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/push/config` | GET/PUT | 发布配置 |
| `/api/push/status` | GET | 发布状态 |
| `/api/push/stats` | GET | 发布统计 |
| `/api/push/logs` | GET | 发布日志 |
| `/api/push/stop` | POST | 停止发布（同 /api/stop）|

### push 请求体详解

从 `vue-dist` 编译后的 `handlePublish()` 方法提取：

```javascript
{
  uid: this.uid,                    // 用户 ID（从 userInfo 获取）
  udid: this.udid,                  // 授权码（登录时输入）
  my_headless: this.config.autoOpenBrowser,  // bool, 是否无头模式
  publish_interval: this.config.publishInterval,  // 发布间隔（秒）
  google_path: this.config.googlePath,  // Chrome 路径
  api_url: localStorage.getItem("api_url"),  // API URL（从远程获取）
  agent_ip_url: systemConfig.agent_ip_url,  // 代理 URL
  agent_ip_username: systemConfig.agent_ip_username  // 代理用户名
}
```

## 远程服务器 API（8.138.58.181）

axios baseURL = `http://8.138.58.181`，管理类 API 走这里：

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/user/login` | POST | 登录验证（username+password+udid） |
| `/api/get_xie` | GET | 获取协议 |
| `/api/zhushou/index` | POST | 首页信息（返回 host_url 等） |
| `/api/zhushou/get_platform` | GET | 平台列表 |
| `/api/zhushou/get_user_list` | GET | 社媒账号列表（需 udid+uid） |
| `/api/zhushou/get_model` | GET | 模特/账号列表 |
| `/api/zhushou/get_model_user_list` | GET | 模特用户列表 |
| `/api/zhushou/save_cookie` | POST | 保存 cookie |
| `/api/zhushou/save_model_cookie` | POST | 保存模特 cookie |
| `/api/zhushou/del_user` | POST | 删除账号（硬编码 8.138.58.181） |
| `/api/zhushou/del_model_user` | GET | 删除模特账号 |
| `/api/zhushou/check_rule` | GET | 检查规则 |
| `/api/zhushou/get_tongji` | POST | 获取统计 |
| `/api/PlatformList` | GET | 平台列表 |
| `/api/OfferingList` | GET | 文件列表 |
| `/api/OfferingHistory` | GET | 文件历史 |
| `/api/offeringAndAccountList` | GET | 文件+账号列表 |
| `/api/ClipTaskCreate` | POST | 创建剪辑任务 |
| `/api/HistoryCreate` | POST | 创建历史记录 |
| `/api/get_all` | GET | 全部数据 |
| `/api/get_form` | GET | 获取表单 |
| `/api/updateHistory` | POST | 更新历史 |
| `/api/tongji` | GET | 统计 |
| `/api/users` | GET/POST | 用户管理 |

## 启动条件

**必须从 `D:\GEO cli\auth helper\` 目录启动**（main.js 用 `process.cwd()` 拼路径，否则 Flask 不启动）。

```bash
# 正确启动方式（PowerShell）
Start-Process -FilePath 'D:\GEO cli\auth helper\auth helper.exe' `
  -WorkingDirectory 'D:\GEO cli\auth helper'
```

## 16 个社媒平台脚本

`src/api/script/` 目录：

| 文件 | 平台 | 文件 | 平台 |
|------|------|------|------|
| bili.js | B站 | kuaishou.js | 快手 |
| bjh.js | 百家号 | qeh.js | 企鹅号 |
| csdn.js | CSDN | sh.js | 搜狐号 |
| dy.js | 抖音 | sph.js | 视频号 |
| js.js | 简书 | tt.js | 头条号 |
| weibo.js | 微博 | wxgzh.js | 微信公众号 |
| wy.js | 网易号 | xhs.js | 小红书 |
| zdm.js | 什么值得买 | zh.js | 知乎 |

## 8 个 AI 平台认证

`src/api/aiAuth/` 目录：

| 模块 | 平台 | Flask 端点 |
|------|------|-----------|
| deepseek | DeepSeek | `/api/deepseek/login` |
| doubao | 豆包 | `/api/doubao/login` |
| kimi | Kimi | `/api/kimi/login` |
| nami | Nami | `/api/nami/login` |
| qianwen | 通义千问 | `/api/qianwen/login` |
| wenxin | 文心一言 | `/api/wenxin/login` |
| yuanbao | 元宝 | `/api/yuanbao/login` |
| zhipu | 智谱 | `/api/zhipu/login` |

## Electron 安全配置

```javascript
webPreferences: {
  webSecurity: false,        // 关闭跨域限制
  nodeIntegration: true,     // 渲染进程有 Node 权限
  contextIsolation: false,   // 可直接 require
  enableRemoteModule: true,
  webviewTag: true,
}
```

## WSL 控制方案

### ❌ 直接 HTTP（被防火墙拦截）

WSL 的 localhost forwarding 被 360/火绒/Defender 拦截：
```
http://localhost:5000  → Connection refused
http://127.0.0.1:5000  → Connection refused
http://10.255.255.254:5000  → Connection refused
```

### ✅ PowerShell 代理（推荐，已验证）

通过 `powershell.exe Invoke-WebRequest` 在 Windows 侧发 HTTP 请求：
```python
# 见 scripts/geo-client.py 的 _ps_request() 函数
subprocess.run(["powershell.exe", "-NoProfile", "-Command", ps_script], ...)
```

每次调用约 0.5-1 秒，但 100% 可靠。

### ❌ CDP / Playwright（被安全软件拦截）

- `--remote-debugging-port=9222` 能开端口，TCP 握手成功
- HTTP `/json/version` 请求全部超时
- 结论：无法通过 CDP 控制 Electron 客户端

## 凭证

从 localStorage 的 `savedLoginData` 提取（LevelDB 格式，解析困难）：
- **用户名**: 4000761588
- **api_url**: http://www.aijiqiren.vip
- **udid**: 需要从 app 界面获取（授权码）
- **uid**: 需要从远程 API 登录后获取

设置方式：
```bash
export GEO_UDID="授权码"
export GEO_UID="用户ID"
export GEO_USERNAME="4000761588"
```

## ASAR 提取方法

```bash
# Windows 侧用 @electron/asar
npm install @electron/asar
node -e "const asar = require('@electron/asar'); asar.extractAll('D:\\GEO cli\\auth helper\\resources\\app.asar', 'output-dir');"

# ⚠️ asar.extract 不存在，正确方法是 extractAll
# ⚠️ asar.listPackage 只列文件名不提取
```

## 代理配置

客户端支持代理设置，通过 IPC `proxyhandle` 事件：
- 格式: `[http://]username:password@host:port` 或 `host:port`
- 设置后通过 `app.commandLine.appendSwitch('proxy-server', ...)` 生效
- 代理认证通过 `app.on('login')` 自动填充
