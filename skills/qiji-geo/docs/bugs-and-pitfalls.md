# 踩坑记录

> 从实际使用中积累的坑。反复犯的用 **【高频】** 标注。
> SKILL.md 的故障排查表是快速版，这里是详细版。

---

## 【高频】坑1：Bootstrap Table 列偏移 / 数据重复

**严重度：★★★★★（每次写表格解析必犯）**

**现象：**
- 解析出来的列全是 undefined
- 关键词列和标题列对调
- 7 条数据被解析成 14 条（完全重复）

**根因：** 奇计平台用 Bootstrap Table（不是原生 `<table>`），有三个坑：
1. 第一列是 checkbox 或序号列，直接 `tds[0]` 拿到的是序号不是数据
2. 页面可能有两个 tbody（`table` 和 `.fixed-table-body` 匹配到同一个），数据翻倍
3. 列顺序不固定

**修复：**
```javascript
let rows = await frame.evaluate(() => {
  // 只取第一个 tbody，避免重复
  const tbody = document.querySelector('table tbody');
  if (!tbody) return [];
  const trs = tbody.querySelectorAll('tr');
  return Array.from(trs).map(tr => {
    let tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
    // 去掉序号/checkbox 列
    if (tds.length > 0 && /^\d+$/.test(tds[0])) tds = tds.slice(1);
    return { col1: tds[0], col2: tds[1] };
  }).filter(r => r.col1 && !/^\d+$/.test(r.col1));  // 过滤序号行
});
// 去重
rows = rows.filter((item, index, self) => index === self.findIndex(t => t.id === item.id));
```

DOM 解析失败时回退到 innerText 策略（详见 SKILL.md 的"Bootstrap Table 解析策略"章节）。

**教训：** 每次涉及奇计表格解析，先想清楚这三点：序号列偏移、重复 tbody、列顺序。别假设 `tds[0]` 就是第一列数据。

---

## 【高频】坑2：任务启动成功 ≠ 任务执行成功

**严重度：★★★★★**

**现象：** AI 发布 / 社媒发布任务返回 `{code:1, task_id:"xxx"}`，看起来成功了，但实际没发布。

**根因：** 余额不足时，任务 API 仍然返回成功（code:1 + task_id），但浏览器执行时报"网络异常"，不弹窗。平台余额检查在任务执行阶段，不在启动阶段。

**修复：**
1. 任务启动后，必须查 ai_logs 确认实际执行状态
2. 启动前先跑 `rights` 命令检查余额
3. 余额为 0 或负数时不要启动发布任务

**教训：** **API 返回 task_id 只说明任务排队了，不代表执行成功。** 永远要查日志确认最终状态。

---

## 坑3：udid 无法自动提取（LevelDB 压缩）

**严重度：★★★★☆**

**现象：** 想从 Chromium localStorage 自动提取 udid，提取到的是碎片。

**根因：** Chromium 把 localStorage 存在 LevelDB 里。SSTable block 压缩会把 JSON 值打碎：
```
{"username":"用户账号","password":  ← 到这里就断了，后面是二进制碎片
```

**修复：** 不要浪费时间解析 LevelDB。直接问用户要授权码。

获取 uid 的正确方法：
```bash
curl -X POST http://8.138.58.181/api/zhushou/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"你的账号","password":"你的密码","udid":"授权码","instanceCount":1}'
# 返回 JSON 的 data.uid
```

---

## 【高频】坑4：WSL 连不上本地 Flask:5000

**严重度：★★★★☆**

**现象：** `curl http://localhost:5000/...` 在 WSL 里全超时或 refused。

**根因：** Windows 的 360/火绒/Defender 拦截 localhost forwarding，WSL 无法直接访问 Windows 本地端口（127.0.0.1、localhost、host IP 全被拦）。

**修复：** 必须通过 PowerShell 代理调用。`geo-client.py` 已内置 `_ps_request()` 方法。不要尝试绕过。

**教训：** 这台机器上所有 WSL → Windows localhost 的连接都被安全软件拦截。别浪费时间试不同的 IP/端口组合，直接用 PowerShell 代理。

---

## 坑5：CDP 被 Windows 安全软件拦截

**严重度：★★★☆☆**

**现象：** 给 Electron 客户端加 `--remote-debugging-port=9222`，TCP 握手成功，但 HTTP `/json/version` 请求全部超时。

**根因：** 安全软件在 HTTP 层面掐断了 CDP 的 HTTP 响应。WebSocket 能连上（日志显示 `<ws connected>`），但 Playwright 的 `firstWindow()` 超时。

**结论：** 这台机器上无法通过 CDP 控制 Electron 客户端。只能走 PowerShell 代理 + Flask API。

---

## 【高频】坑6：POST /api/stop 探测杀掉运行中的任务

**严重度：★★★★★**

**现象：** 每次执行命令时，之前启动的发布任务突然被杀。

**根因：** `geo-client.py` 的 `check_flask()` 用 `POST /api/stop` 来探测 Flask 是否在线。这个端点会杀掉所有正在运行的任务——4 秒内任何任务都会被终止。

**修复：** 已改为 GET 探测（无副作用）。

**教训：** **绝对不要用 POST /api/stop 探测 Flask 是否在线。** 用 GET 请求做健康检查。

---

## 坑7：可视化模式下浏览器窗口不出现

**严重度：★★★☆☆**

**现象：** `--headless` 没加，但浏览器窗口就是不弹出来。

**根因：** Windows ConPTY 子进程抑制 GUI 窗口。奇计后端通过 pywinty/ConPTY 启动终端命令，进程链是 后端 → ConPTY shell → node → Playwright Chromium。ConPTY 环境可能阻止 GUI 窗口弹出。

**缓解措施：**
- `--start-maximized` 强制最大化
- `slowMo: 500ms` 可视化模式操作间隔
- `--disable-background-timer-throttling` 等反后台节流参数
- 如果仍不显示，可能需要改用系统已安装的 Chrome/Edge（`channel: 'chrome'`）

---

## 坑8：ai_push 需要完整请求体

**严重度：★★★☆☆**

**现象：** ai_push 任务启动了但浏览器不弹窗。

**根因：** ai_push 需要完整请求体（9个字段），不能只传 `{udid, uid}`。关键字段 `my_headless: false` 如果不传，可能走无头模式。

**修复：** 参见 `references/auth-helper-client.md` 中的完整请求体格式。

---

## 坑9：iframe 偶发未加载

**严重度：★★☆☆☆**

**现象：** 偶发性报 "frame not found"。

**修复：** `getFrame()` 已改为 async + 重试（15次，500ms间隔），等待 `addtabs=1` 的 iframe 出现且内容非空后才返回。

---

## 坑10：Flask API 端点 404 vs 500 区分

**严重度：★★☆☆☆**

**现象：** 调用某个 Flask API 端点返回 404，不知道是端点不存在还是请求体格式不对。

**判断方法：** POST `{}` 测试：
- **500** = 路由存在（bad body，服务器报错）
- **404** = 路由不存在

另外注意：有些端点走远程服务器（8.138.58.181）而非本地 Flask。
