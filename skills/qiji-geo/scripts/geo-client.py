#!/usr/bin/env python3
"""
奇计 GEO 客户端控制脚本

通过 Flask API 控制 auth helper 桌面客户端。
Flask 运行在 Windows 127.0.0.1:5000，WSL2 通过 localhost forwarding 访问。

用法:
  python3 geo-client.py status           # 检查客户端状态
  python3 geo-client.py accounts         # 查看社媒账号列表
  python3 geo-client.py platforms        # 查看支持的平台
  python3 geo-client.py push             # 启动社媒发布
  python3 geo-client.py stop             # 停止发布
  python3 geo-client.py logs <task_id>   # 查看发布日志
  python3 geo-client.py ai-push          # 启动 AI 发布
  python3 geo-client.py ai-stop          # 停止 AI 发布
  python3 geo-client.py ai-logs <task_id> # 查看 AI 日志
  python3 geo-client.py start            # 启动客户端
"""

import sys
import os
import json
import urllib.request
import urllib.error
import subprocess
import time

# ============================================================
# 配置
# ============================================================

# Flask 端口（默认 5000，可被环境变量覆盖）
FLASK_PORT = os.environ.get("GEO_CLIENT_PORT", "5000")

# Flask base URL — 通过 PowerShell 在 Windows 侧访问 127.0.0.1
# (WSL↔Windows 的 localhost forwarding 被防火墙拦截，必须用 PowerShell 代理)
FLASK_BASE = f"http://127.0.0.1:{FLASK_PORT}"

# 远程服务器（管理类 API）
REMOTE_BASE = "http://8.138.58.181"

# 客户端路径
CLIENT_EXE = r"D:\GEO cli\auth helper\auth helper.exe"
CLIENT_DIR = r"D:\GEO cli\auth helper"

# 凭证（从 localStorage 提取，或环境变量覆盖）
GEO_UDID = os.environ.get("GEO_UDID", "")
GEO_UID = os.environ.get("GEO_UID", "")
GEO_USERNAME = os.environ.get("GEO_USERNAME", "")
GEO_PASSWORD = os.environ.get("GEO_PASSWORD", "")

# 运行时缓存：从远程 API 获取的完整配置
_runtime_config = {}


def _resolve_credentials():
    """自动获取 uid 和完整运行参数（api_url 等）。

    流程：
    1. 用 username+password+udid 调 POST /api/zhushou/login → 拿到 uid
    2. 用 uid+udid 调 POST /api/zhushou/index → 拿到 api_url / agent_ip_url 等

    结果缓存在 _runtime_config 中。如果 udid 未设置，跳过。
    """
    global _runtime_config
    if _runtime_config:
        return _runtime_config
    if not GEO_UDID:
        return {}

    # 1. 登录获取 uid
    login_body = json.dumps({
        "username": GEO_USERNAME,
        "password": GEO_PASSWORD,
        "udid": GEO_UDID,
    })
    code, data = http_post(f"{REMOTE_BASE}/api/zhushou/login", body=json.loads(login_body), timeout=15)
    if code == 200 and isinstance(data, dict) and data.get("code") == 1:
        login_data = data.get("data", {})
        _runtime_config["uid"] = str(login_data.get("uid", ""))
        _runtime_config["udid"] = login_data.get("udid", GEO_UDID)

    # 2. 获取首页配置
    index_body = {"username": GEO_USERNAME, "udid": GEO_UDID, "uid": _runtime_config.get("uid", "")}
    code2, data2 = http_post(f"{REMOTE_BASE}/api/zhushou/index", body=index_body, timeout=15)
    if code2 == 200 and isinstance(data2, dict) and data2.get("code") == 1:
        cfg = data2.get("data", {})
        _runtime_config["api_url"] = cfg.get("api_url", "")
        _runtime_config["agent_ip_url"] = cfg.get("agent_ip_url", "")
        _runtime_config["agent_ip_username"] = cfg.get("agent_ip_username", "")

    return _runtime_config

# ============================================================
# HTTP 工具
# ============================================================

def _ps_request(url, method="GET", body=None, timeout=10):
    """通过 PowerShell 发 HTTP 请求（绕过 WSL↔Windows 防火墙拦截）"""
    ps_script = (
        "try {\n"
        f"  $ErrorActionPreference = 'Stop'\n"
        f"  $url = '{url}'\n"
    )
    if method == "POST":
        json_body = json.dumps(body or {}).replace("'", "''")
        ps_script += (
            f"  $body = '{json_body}'\n"
            "  $resp = Invoke-WebRequest -Uri $url -Method POST "
            "-Body $body -ContentType 'application/json' "
            f"-UseBasicParsing -TimeoutSec {timeout}\n"
        )
    elif method == "GET":
        ps_script += (
            "  $resp = Invoke-WebRequest -Uri $url -Method GET "
            f"-UseBasicParsing -TimeoutSec {timeout}\n"
        )
    ps_script += (
        "  Write-Output $resp.StatusCode\n"
        "  Write-Output '---BODY---'\n"
        "  Write-Output $resp.Content\n"
        "} catch {\n"
        "  if ($_.Exception.Response) {\n"
        "    Write-Output $_.Exception.Response.StatusCode.value__\n"
        "    Write-Output '---BODY---'\n"
        "    $stream = $_.Exception.Response.GetResponseStream()\n"
        "    $reader = New-Object System.IO.StreamReader($stream)\n"
        "    Write-Output $reader.ReadToEnd()\n"
        "  } else {\n"
        "    Write-Output '0'\n"
        "    Write-Output '---BODY---'\n"
        "    Write-Output $_.Exception.Message\n"
        "  }\n"
        "}\n"
    )

    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command", ps_script],
        capture_output=True, timeout=timeout + 10
    )
    # PowerShell on Chinese Windows outputs GBK (cp936); decode safely
    try:
        output = result.stdout.decode("gbk", errors="replace").strip()
    except Exception:
        output = result.stdout.decode("utf-8", errors="replace").strip() if result.stdout else ""
    if not output:
        stderr_msg = ""
        try:
            stderr_msg = result.stderr.decode("gbk", errors="replace").strip()
        except Exception:
            stderr_msg = "PowerShell error"
        return 0, stderr_msg or "PowerShell error"

    lines = output.split("\n", 2)
    status = int(lines[0].strip()) if lines[0].strip().isdigit() else 0
    body_text = lines[2].strip() if len(lines) >= 3 and lines[1].strip() == "---BODY---" else ""

    try:
        return status, json.loads(body_text) if body_text else None
    except json.JSONDecodeError:
        return status, body_text


def http_get(url, timeout=5):
    """GET 请求（通过 PowerShell 代理）"""
    return _ps_request(url, "GET", timeout=timeout)


def http_post(url, body=None, timeout=10):
    """POST 请求（通过 PowerShell 代理）"""
    return _ps_request(url, "POST", body=body, timeout=timeout)


def check_flask():
    """检查 Flask 是否在运行（用 GET 探测，不触发任何副作用）"""
    # ⚠️ 不要用 POST /api/stop 探测——会杀掉正在运行的任务！
    code, _ = http_get(f"{FLASK_BASE}/api/ai_logs/ping", timeout=3)
    # 404 也说明 Flask 在线（路由不存在但服务器响应了）
    return code in (200, 404, 500)


# ============================================================
# 命令实现
# ============================================================

def cmd_status():
    """检查客户端状态"""
    print("=== 奇计 GEO 客户端状态 ===\n")

    # 1. 检查 Flask
    flask_ok = check_flask()
    print(f"Flask API (端口 {FLASK_PORT}): {'✅ 运行中' if flask_ok else '❌ 未运行'}")

    if flask_ok:
        # 2. 尝试获取 push 状态
        code, data = http_post(f"{FLASK_BASE}/api/stop", timeout=3)
        if code == 200 and isinstance(data, dict):
            print(f"  最近操作: {data.get('msg', '?')}")

    # 3. 检查 auth helper 进程
    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command",
         "(Get-Process -Name 'auth helper' -ErrorAction SilentlyContinue | Measure-Object).Count"],
        capture_output=True, timeout=5
    )
    proc_count = result.stdout.decode("gbk", errors="replace").strip() if result.stdout else ""
    print(f"Electron 进程: {'✅ ' + proc_count + ' 个进程' if proc_count and proc_count != '0' else '❌ 未运行'}")

    result2 = subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command",
         "(Get-Process -Name 'main' -ErrorAction SilentlyContinue | Measure-Object).Count"],
        capture_output=True, timeout=5
    )
    flask_proc = result2.stdout.decode("gbk", errors="replace").strip() if result2.stdout else ""
    print(f"Flask 进程 (main.exe): {'✅ 运行中' if flask_proc and flask_proc != '0' else '❌ 未运行'}")

    # 4. 凭证状态
    print(f"\n凭证:")
    print(f"  用户名: {GEO_USERNAME}")
    print(f"  UID: {GEO_UID or '(未设置)'}")
    print(f"  UDID: {'✅ 已设置' if GEO_UDID else '❌ 未设置'}")

    if not flask_ok:
        print(f"\n💡 启动客户端: python3 {sys.argv[0]} start")
    
    return flask_ok


def cmd_start():
    """启动客户端"""
    print("启动奇计客户端...")
    
    # 先杀残留进程
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command",
         "Get-Process -Name 'auth helper' -ErrorAction SilentlyContinue | Stop-Process -Force; "
         "Get-Process -Name 'main' -ErrorAction SilentlyContinue | Stop-Process -Force"],
        capture_output=True, timeout=10
    )
    time.sleep(2)

    # 启动（必须指定工作目录，否则 main.exe 路径拼不对）
    subprocess.run(
        ["powershell.exe", "-NoProfile", "-Command",
         f"Start-Process -FilePath '{CLIENT_EXE}' -WorkingDirectory '{CLIENT_DIR}'"],
        capture_output=True, timeout=10
    )
    
    print("等待 Flask 启动...", end=" ")
    
    # 轮询等待 Flask 就绪
    for i in range(15):
        time.sleep(2)
        if check_flask():
            print(f"✅ Flask 就绪 (约 {(i+1)*2} 秒)")
            cmd_status()
            return True
    
    print("❌ Flask 30 秒内未就绪")
    print("可能原因: 工作目录不对 / main.exe 崩溃 / 安全软件拦截")
    return False


def cmd_push():
    """启动社媒发布"""
    if not check_flask():
        print("❌ 客户端未运行，请先执行: python3 geo-client.py start")
        return False

    print("启动社媒发布任务...")

    # 自动获取凭证（如果设置了 udid）
    cfg = _resolve_credentials()
    uid = GEO_UID or cfg.get("uid", "")
    api_url = cfg.get("api_url", "")

    # 构建 push 请求体
    body = {
        "uid": uid,
        "udid": GEO_UDID,
        "my_headless": True,    # True = 显示浏览器窗口（参数名是反的！True→可见）
        "publish_interval": 5,
        "google_path": "",
        "api_url": api_url,
        "agent_ip_url": "",
        "agent_ip_username": "",
    }

    code, data = http_post(f"{FLASK_BASE}/api/push", body, timeout=30)
    
    if code == 200 and isinstance(data, dict):
        if data.get("code") == 1:
            task_id = data.get("task_id", "")
            print(f"✅ 发布任务已启动")
            print(f"   Task ID: {task_id}")
            print(f"   消息: {data.get('msg', '')}")
            if task_id:
                print(f"\n查看日志: python3 {sys.argv[0]} logs {task_id}")
        else:
            print(f"❌ 启动失败: {data.get('msg', data)}")
    else:
        print(f"❌ HTTP {code}: {data}")

    return code == 200


def cmd_stop():
    """停止发布"""
    if not check_flask():
        print("❌ 客户端未运行")
        return False

    code, data = http_post(f"{FLASK_BASE}/api/stop", timeout=5)
    
    if code == 200 and isinstance(data, dict):
        print(f"✅ {data.get('msg', '已停止')}")
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_logs(task_id=None):
    """查看发布日志"""
    if not task_id:
        print("用法: python3 geo-client.py logs <task_id>")
        return False

    if not check_flask():
        print("❌ 客户端未运行")
        return False

    # AI push uses /api/ai_logs/, regular push uses /api/logs/
    # Try both
    for log_path in [f"/api/ai_logs/{task_id}", f"/api/logs/{task_id}"]:
        url = f"{FLASK_BASE}{log_path}"
        code, data = http_get(url, timeout=10)
        if code == 200:
            break
    
    if code == 200:
        if isinstance(data, dict):
            logs = data.get("logs", data.get("data", []))
            if isinstance(logs, list):
                for entry in logs:
                    print(entry if isinstance(entry, str) else json.dumps(entry, ensure_ascii=False))
            else:
                print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            print(data)
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_ai_push():
    """启动 AI 发布"""
    if not check_flask():
        print("❌ 客户端未运行")
        return False

    # 自动获取凭证（如果设置了 udid）
    cfg = _resolve_credentials()
    uid = GEO_UID or cfg.get("uid", "")
    api_url = cfg.get("api_url", "")

    # Parameters must match the client's Vue component exactly
    # Source: app.fd1c1ddf.js → startAiPushTask({uid,udid,model_type,my_headless,...})
    body = {
        "uid": uid,
        "udid": GEO_UDID,
        "model_type": "",           # AI model ID (empty = default/all)
        "my_headless": True,       # True = 显示浏览器窗口（参数名是反的！True→可见）
        "publish_interval": 5,
        "google_path": "",
        "api_url": api_url,
        "agent_ip_url": "",
        "agent_ip_username": "",
    }
    code, data = http_post(f"{FLASK_BASE}/api/ai_push", body, timeout=30)
    
    if code == 200 and isinstance(data, dict):
        if data.get("code") == 1:
            task_id = data.get("task_id", "")
            print(f"✅ AI 发布任务已启动")
            print(f"   Task ID: {task_id}")
            print(f"   消息: {data.get('msg', '')}")
        else:
            print(f"❌ {data.get('msg', data)}")
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_ai_stop():
    """停止 AI 发布"""
    if not check_flask():
        print("❌ 客户端未运行")
        return False

    code, data = http_post(f"{FLASK_BASE}/api/ai_stop", timeout=5)
    
    if code == 200 and isinstance(data, dict):
        print(f"✅ {data.get('msg', '已停止')}")
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_accounts():
    """查看账号列表（远程 API）"""
    if not GEO_UDID:
        print("❌ 需要设置 GEO_UDID 环境变量")
        return False

    url = f"{REMOTE_BASE}/api/zhushou/get_user_list?udid={GEO_UDID}&uid={GEO_UID}"
    code, data = http_get(url, timeout=10)
    
    if code == 200 and isinstance(data, dict):
        users = data.get("data", data.get("users", []))
        if isinstance(users, list):
            print(f"=== 社媒账号列表 ({len(users)} 个) ===\n")
            for u in users:
                platform = u.get("platform", u.get("pt", "?"))
                account = u.get("account", u.get("username", u.get("name", "?")))
                status = u.get("status", "?")
                print(f"  {platform:12s} | {account:20s} | 状态: {status}")
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_platforms():
    """查看支持的平台（远程 API）"""
    url = f"{REMOTE_BASE}/api/zhushou/get_platform"
    code, data = http_get(url, timeout=10)
    
    if code == 200 and isinstance(data, dict):
        platforms = data.get("data", [])
        if isinstance(platforms, list):
            print(f"=== 支持的平台 ({len(platforms)} 个) ===\n")
            for p in platforms:
                name = p.get("name", p.get("platform_name", "?"))
                pid = p.get("id", p.get("platform_id", "?"))
                print(f"  [{pid}] {name}")
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(f"❌ HTTP {code}: {data}")
    
    return code == 200


def cmd_account_status():
    """查看全平台授权状态（社媒16 + AI 8）

    对比「支持的16个社媒平台」和「已授权的账号列表」，
    以及「8个AI平台」和「已认证的AI列表」，
    输出每个平台的授权状态。

    用法: python3 geo-client.py account-status
    """
    # ── 社媒平台完整定义（与客户端 16 个脚本一一对应）──
    SOCIAL_PLATFORMS = {
        "bili":    "B站",
        "bjh":     "百家号",
        "csdn":    "CSDN",
        "dy":      "抖音",
        "js":      "简书",
        "kuaishou":"快手",
        "qeh":     "企鹅号",
        "sh":      "搜狐号",
        "sph":     "视频号",
        "tt":      "头条号",
        "weibo":   "微博",
        "wxgzh":   "微信公众号",
        "wy":      "网易号",
        "xhs":     "小红书",
        "zdm":     "什么值得买",
        "zh":      "知乎",
    }

    # ── AI 平台完整定义（8个认证端点）──
    AI_PLATFORMS = {
        "deepseek": "DeepSeek",
        "doubao":   "豆包",
        "kimi":     "Kimi",
        "nami":     "Nami",
        "qianwen":  "通义千问",
        "wenxin":   "文心一言",
        "yuanbao":  "元宝",
        "zhipu":    "智谱",
    }

    print("═" * 50)
    print("  奇计 GEO 全平台授权状态")
    print("═" * 50)

    # ════════ 社媒平台 ════════
    print("\n📋 社媒平台（16个）\n")

    social_authorized = set()
    social_data_ok = False

    if GEO_UDID:
        cfg = _resolve_credentials()
        uid = GEO_UID or cfg.get("uid", "")
        url = f"{REMOTE_BASE}/api/zhushou/get_user_list?udid={GEO_UDID}&uid={uid}"
        code, data = http_get(url, timeout=15)
        if code == 200 and isinstance(data, dict):
            users = data.get("data", data.get("users", []))
            if isinstance(users, list):
                social_data_ok = True
                for u in users:
                    plat = u.get("platform", u.get("pt", "")).lower().strip()
                    if not plat:
                        # 有些返回用中文名或 id，尝试匹配
                        for en, cn in SOCIAL_PLATFORMS.items():
                            if cn in str(u) or en in str(u):
                                plat = en
                                break
                    if plat:
                        social_authorized.add(plat)

    social_done = 0
    for en, cn in SOCIAL_PLATFORMS.items():
        if en in social_authorized:
            print(f"  ✅ {cn:8s} ({en})")
            social_done += 1
        else:
            print(f"  ❌ {cn:8s} ({en})  ← 未授权")

    print(f"\n  社媒汇总: {social_done}/{len(SOCIAL_PLATFORMS)} 已授权")

    if not social_data_ok:
        print("  ⚠️  无法获取账号列表（需要 GEO_UDID），以上仅显示默认状态")

    # ════════ AI 平台 ════════
    print("\n🤖 AI 平台（8个）\n")

    ai_authorized = set()
    ai_data_ok = False

    if GEO_UDID:
        cfg = _resolve_credentials()
        uid = GEO_UID or cfg.get("uid", "")
        # 尝试 get_model 获取已认证的 AI 列表
        url = f"{REMOTE_BASE}/api/zhushou/get_model?udid={GEO_UDID}&uid={uid}"
        code, data = http_get(url, timeout=15)
        if code == 200 and isinstance(data, dict):
            models = data.get("data", [])
            if isinstance(models, list):
                ai_data_ok = True
                for m in models:
                    plat = str(m.get("platform", m.get("pt", m.get("name", "")))).lower().strip()
                    for en, cn in AI_PLATFORMS.items():
                        if en in plat or cn in plat:
                            ai_authorized.add(en)
                            break

    ai_done = 0
    for en, cn in AI_PLATFORMS.items():
        if en in ai_authorized:
            print(f"  ✅ {cn:8s} ({en})")
            ai_done += 1
        else:
            print(f"  ❌ {cn:8s} ({en})  ← 未认证")

    print(f"\n  AI 汇总: {ai_done}/{len(AI_PLATFORMS)} 已认证")

    if not ai_data_ok:
        print("  ⚠️  无法获取AI认证列表（需要 GEO_UDID），以上仅显示默认状态")

    # ════════ 总结 ════════
    total = len(SOCIAL_PLATFORMS) + len(AI_PLATFORMS)
    done = social_done + ai_done
    print("\n" + "═" * 50)
    print(f"  总计: {done}/{total} 已授权")

    pending_social = [cn for en, cn in SOCIAL_PLATFORMS.items() if en not in social_authorized]
    pending_ai = [cn for en, cn in AI_PLATFORMS.items() if en not in ai_authorized]

    if pending_social:
        print(f"\n⚠️  未授权社媒 ({len(pending_social)}): {', '.join(pending_social)}")
        print(f"   批量授权: python3 {sys.argv[0]} media-login")

    if pending_ai:
        print(f"\n⚠️  未认证AI ({len(pending_ai)}): {', '.join(pending_ai)}")
        print(f"   批量认证: python3 {sys.argv[0]} ai-auth")

    if not pending_social and not pending_ai:
        print("\n🎉 全部平台已授权！可以开始发布内容了。")

    return True


def cmd_stats():
    """查看发布统计（远程 API）"""
    if not GEO_UDID:
        print("❌ 需要设置 GEO_UDID 环境变量")
        return False

    cfg = _resolve_credentials()
    uid = GEO_UID or cfg.get("uid", "")
    body = {"udid": GEO_UDID, "uid": uid}
    code, data = http_post(f"{REMOTE_BASE}/api/zhushou/get_tongji", body=body, timeout=10)

    if code == 200 and isinstance(data, dict):
        stats = data.get("data", data)
        print(f"=== 发布统计 ===\n")
        if isinstance(stats, dict):
            for k, v in stats.items():
                print(f"  {k}: {v}")
        elif isinstance(stats, list):
            for s in stats:
                print(json.dumps(s, ensure_ascii=False))
        else:
            print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(f"❌ HTTP {code}: {data}")

    return code == 200


def cmd_delete_account(*args):
    """删除社媒账号（远程 API）"""
    if not GEO_UDID:
        print("❌ 需要设置 GEO_UDID 环境变量")
        return False

    if len(args) < 1:
        print("用法: python3 geo-client.py delete-account <平台ID或账号名>")
        return False

    target = args[0]
    cfg = _resolve_credentials()
    uid = GEO_UID or cfg.get("uid", "")

    # 远程 API 的 del_user 需要 udid+uid+平台标识
    body = {"udid": GEO_UDID, "uid": uid, "id": target}
    code, data = http_post(f"{REMOTE_BASE}/api/zhushou/del_user", body=body, timeout=10)

    if code == 200 and isinstance(data, dict):
        if data.get("code") == 1:
            print(f"✅ 已删除: {target}")
        else:
            print(f"❌ 删除失败: {data.get('msg', data)}")
    else:
        print(f"❌ HTTP {code}: {data}")

    return code == 200


def cmd_media_login():
    """社媒平台授权登录（本地 Flask，可视化浏览器）"""
    if not check_flask():
        print("❌ 客户端未运行，请先执行: python3 geo-client.py start")
        return False

    cfg = _resolve_credentials()

    body = {
        "udid": GEO_UDID,
        "uid": GEO_UID or cfg.get("uid", ""),
        "agent_ip_username": "",
        "agent_ip_url": "",
        "googlePath": cfg.get("google_path", ""),
        "platform": "",  # 空=全部，或指定平台名
    }

    code, data = http_post(f"{FLASK_BASE}/api/media/login", body=body, timeout=60)

    if code == 200 and isinstance(data, dict):
        if data.get("code") == 1:
            print(f"✅ 授权成功")
            print(f"   消息: {data.get('msg', '')}")
        else:
            print(f"❌ 授权失败: {data.get('msg', data)}")
    else:
        print(f"❌ HTTP {code}: {data}")

    return code == 200


# AI 平台认证端点映射
AI_AUTH_ENDPOINTS = {
    "deepseek": "/api/deepseek/login",
    "doubao": "/api/doubao/login",
    "kimi": "/api/kimi/login",
    "nami": "/api/nami/login",
    "qianwen": "/api/qianwen/login",
    "wenxin": "/api/wenxin/login",
    "yuanbao": "/api/yuanbao/login",
    "zhipu": "/api/zhipu/login",
}


def cmd_ai_auth(*args):
    """AI 平台认证（本地 Flask，可视化浏览器）

    用法: python3 geo-client.py ai-auth [平台名]
    平台名: deepseek, doubao, kimi, nami, qianwen, wenxin, yuanbao, zhipu
    不指定平台名则认证全部。
    """
    if not check_flask():
        print("❌ 客户端未运行，请先执行: python3 geo-client.py start")
        return False

    platform = args[0] if args else ""

    if platform and platform not in AI_AUTH_ENDPOINTS:
        print(f"❌ 未知平台: {platform}")
        print(f"   支持: {', '.join(AI_AUTH_ENDPOINTS.keys())}")
        return False

    cfg = _resolve_credentials()

    targets = [platform] if platform else list(AI_AUTH_ENDPOINTS.keys())

    for p in targets:
        endpoint = AI_AUTH_ENDPOINTS[p]
        body = {
            "udid": GEO_UDID,
            "agent_ip_username": "",
            "agent_ip_url": "",
            "googlePath": cfg.get("google_path", ""),
        }

        print(f"认证 {p}...")
        code, data = http_post(f"{FLASK_BASE}{endpoint}", body=body, timeout=120)

        if code == 200 and isinstance(data, dict):
            if data.get("code") == 1:
                print(f"  ✅ {p} 认证成功")
            else:
                msg = data.get("msg", "")
                print(f"  ❌ {p} 认证失败: {msg}")
        else:
            print(f"  ❌ {p} HTTP {code}: {data}")

    return True


# ============================================================
# 主入口
# ============================================================

COMMANDS = {
    "status": ("检查客户端状态", cmd_status),
    "start": ("启动客户端", cmd_start),
    "push": ("启动社媒发布", cmd_push),
    "stop": ("停止发布", cmd_stop),
    "logs": ("查看发布日志", cmd_logs),
    "ai-push": ("启动 AI 发布", cmd_ai_push),
    "ai-stop": ("停止 AI 发布", cmd_ai_stop),
    "accounts": ("查看社媒账号列表", cmd_accounts),
    "platforms": ("查看支持的平台", cmd_platforms),
    "stats": ("查看发布统计", cmd_stats),
    "delete-account": ("删除社媒账号", cmd_delete_account),
    "account-status": ("查看全平台授权状态（社媒16+AI 8）", cmd_account_status),
    "media-login": ("社媒平台授权登录（可视化）", cmd_media_login),
    "ai-auth": ("AI平台认证（可视化，可指定平台）", cmd_ai_auth),
}

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(f"奇计 GEO 客户端控制工具 v1.0\n")
        print("用法: python3 geo-client.py <命令> [参数]\n")
        print("可用命令:")
        for cmd, (desc, _) in COMMANDS.items():
            print(f"  {cmd:12s}  {desc}")
        print(f"\n环境变量:")
        print(f"  GEO_UDID    授权码（必需）")
        print(f"  GEO_UID     用户ID")
        print(f"  GEO_USERNAME 用户名（必需）")
        sys.exit(1)

    cmd = sys.argv[1]
    args = sys.argv[2:]
    
    desc, fn = COMMANDS[cmd]
    # logs / delete-account / ai-auth 接收额外参数
    if cmd in ("logs", "delete-account", "ai-auth"):
        success = fn(*args)
    else:
        success = fn()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
