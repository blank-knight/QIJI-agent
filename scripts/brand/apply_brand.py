#!/usr/bin/env python3
"""
奇计品牌化脚本 — 从上游 Hermes Agent 源码一键打品牌。

用法:
  python apply_brand.py --config brands/qiji.json --repo /path/to/repo
  python apply_brand.py --config brands/qiji.json --repo . --dry-run    # 预览
  python apply_brand.py --config brands/qiji.json --repo . --verify     # 验证残留

工作原理:
  脚本假设 repo 指向上游 Hermes Agent 的 fresh checkout（或已打过品牌的 fork）。
  逐层替换品牌名、URL、平台描述等，覆盖 6 层品牌化。
  图标资源和 OAuth→openExternal 代码改动需要手动处理（见 README.md）。
"""

import argparse
import json
import re
import sys
from pathlib import Path


# ============================================================
# 工具函数
# ============================================================

class Colors:
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    CYAN = '\033[96m'
    DIM = '\033[2m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def log(msg, color=None):
    if color:
        print(f"{color}{msg}{Colors.RESET}")
    else:
        print(msg)


changes_log = []  # [(file, old, new), ...]


def replace_in_text(text, old, new, filepath, desc=""):
    """替换文本，记录变更。返回 (new_text, count)。"""
    if old not in text:
        return text, 0
    count = text.count(old)
    new_text = text.replace(old, new)
    label = f"  {desc}: " if desc else "  "
    log(f"{Colors.GREEN}✓{Colors.RESET} {filepath}")
    log(f"{Colors.DIM}{label}\"{old[:60]}{'...' if len(old) > 60 else ''}\" → \"{new[:60]}{'...' if len(new) > 60 else ''}\" ({count}处){Colors.RESET}")
    changes_log.append((filepath, old, new, count))
    return new_text, count


def apply_to_file(filepath, replacements, dry_run=False):
    """对单个文件应用一组 (old, new, desc) 替换。"""
    p = Path(filepath)
    if not p.exists():
        log(f"{Colors.YELLOW}⚠ 文件不存在: {filepath}{Colors.RESET}")
        return
    text = p.read_text(encoding='utf-8')
    original = text
    for old, new, desc in replacements:
        text, _ = replace_in_text(text, old, new, str(filepath), desc)
    if text != original and not dry_run:
        p.write_text(text, encoding='utf-8')


def replace_regex_in_file(filepath, pattern, replacement, dry_run=False, desc=""):
    """用正则替换文件内容。"""
    p = Path(filepath)
    if not p.exists():
        log(f"{Colors.YELLOW}⚠ 文件不存在: {filepath}{Colors.RESET}")
        return
    text = p.read_text(encoding='utf-8')
    matches = re.findall(pattern, text)
    if not matches:
        return
    new_text = re.sub(pattern, replacement, text)
    count = len(matches)
    log(f"{Colors.GREEN}✓{Colors.RESET} {filepath}")
    log(f"{Colors.DIM}  {desc}: {count}处{Colors.RESET}")
    changes_log.append((str(filepath), pattern, replacement, count))
    if new_text != text and not dry_run:
        p.write_text(new_text, encoding='utf-8')


# ============================================================
# 第1层：package.json
# ============================================================

def layer1_package_json(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第1层：构建配置 (package.json){Colors.RESET}")

    pkg_path = repo / "apps" / "desktop" / "package.json"
    if not pkg_path.exists():
        log(f"{Colors.YELLOW}  ⚠ package.json 不存在{Colors.RESET}")
        return

    text = pkg_path.read_text(encoding='utf-8')
    original = text

    # 品牌英文名
    text, _ = replace_in_text(text, '"productName": "Hermes"',
                              f'"productName": "{brand["name_en"]}"', str(pkg_path), "productName")

    # 可能有两种格式的 productName
    if '"productName": "Hermes Agent"' in text:
        text, _ = replace_in_text(text, '"productName": "Hermes Agent"',
                                  f'"productName": "{brand["name_en"]}"', str(pkg_path), "productName")

    # appId
    text, _ = replace_in_text(text, '"appId": "com.nousresearch.hermes"',
                              f'"appId": "{brand["app_id"]}"', str(pkg_path), "appId")
    text, _ = replace_in_text(text, '"appId": "com.hermes.desktop"',
                              f'"appId": "{brand["app_id"]}"', str(pkg_path), "appId")

    # legalTrademarks
    text, _ = replace_in_text(text, '"legalTrademarks": "Hermes"',
                              f'"legalTrademarks": "{brand["legal_trademarks"]}"', str(pkg_path), "legalTrademarks")

    # shortcutName
    text, _ = replace_in_text(text, '"shortcutName": "Hermes"',
                              f'"shortcutName": "{brand["name_cn"]}"', str(pkg_path), "shortcutName")

    # CFBundleName (macOS)
    text, _ = replace_in_text(text, '"CFBundleName": "Hermes"',
                              f'"CFBundleName": "{brand["name_cn"]}"', str(pkg_path), "CFBundleName")

    # DMG title
    text, _ = replace_in_text(text, '"title": "Install Hermes"',
                              f'"title": "{brand["nsis_title"]}"', str(pkg_path), "DMG title")

    # maintainer (Linux)
    text, _ = replace_in_text(text, '"maintainer": "Hermes"',
                              f'"maintainer": "{brand["name_en"]}"', str(pkg_path), "maintainer")

    # synopsis
    # 这个字段可能没有固定旧值，用正则
    text = re.sub(r'"synopsis": "[^"]*Hermes[^"]*"',
                  f'"synopsis": "{brand["synopsis_cn"]}"', text)

    # uninstallDisplayName
    text, _ = replace_in_text(text, '"uninstallDisplayName": "Hermes"',
                              f'"uninstallDisplayName": "{brand["name_cn"]}"', str(pkg_path), "uninstallDisplayName")

    if text != original and not dry_run:
        pkg_path.write_text(text, encoding='utf-8')


# ============================================================
# 第2层：图标资源（仅提示，需手动替换）
# ============================================================

def layer2_icons(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第2层：图标资源（需手动替换）{Colors.RESET}")
    icons = [
        "apps/desktop/assets/icon.ico",
        "apps/desktop/assets/icon.icns",
        "apps/desktop/public/icon.png",
        "apps/desktop/public/apple-touch-icon.png",
    ]
    brand_logo = f"apps/desktop/public/{brand['brand_logo']}"
    log(f"  {Colors.YELLOW}以下文件需手动替换为 {brand['name_cn']} 品牌图标：{Colors.RESET}")
    for icon in icons:
        p = repo / icon
        status = "✓" if p.exists() else "✗"
        log(f"    {status} {icon}")
    log(f"    ★ {brand_logo} (品牌 Logo，用于 onboarding 和推荐栏)")

    # 检查是否有残留的旧品牌图标
    old_icons = list((repo / "apps" / "desktop" / "public").glob("hermes*")) if (repo / "apps" / "desktop" / "public").exists() else []
    if old_icons:
        log(f"  {Colors.YELLOW}⚠ 发现旧品牌图标，建议删除：{Colors.RESET}")
        for f in old_icons:
            log(f"    {f.relative_to(repo)}")


# ============================================================
# 第3层：前端 i18n 国际化
# ============================================================

def layer3_i18n(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第3层：前端界面 (i18n){Colors.RESET}")

    i18n_dir = repo / "apps" / "desktop" / "src" / "i18n"

    # 语言 → 品牌名映射
    lang_map = {
        "en.ts": brand["name_en"],
        "zh.ts": brand["name_cn"],
        "zh-hant.ts": brand.get("name_hant", brand["name_cn"]),
        "ja.ts": brand["name_ja"],
    }

    for filename, brand_name in lang_map.items():
        filepath = i18n_dir / filename
        if not filepath.exists():
            log(f"{Colors.YELLOW}  ⚠ {filename} 不存在，跳过{Colors.RESET}")
            continue

        text = filepath.read_text(encoding='utf-8')
        original = text
        count = 0

        # 策略：替换单词边界内的 "Hermes"，不碰 camelCase 标识符
        # \bHermes\b 匹配 "Hermes" 但不匹配 "startingHermesDesktop" 或 "HERMES_HOME"

        def replace_hermes(match):
            nonlocal count
            count += 1
            return match.group(0).replace("Hermes", brand_name)

        text = re.sub(r'\bHermes\b', replace_hermes, text)

        # 替换 "Nous Portal" → 品牌门户名（在英文文件中）
        if filename == "en.ts":
            old_portal = "Nous Portal"
            if old_portal in text:
                text2, n = replace_in_text(text, old_portal, brand["portal_name_en"], str(filepath), "Portal name")
                text = text2
                count += n

        # 在中文文件中替换 portal 相关名称
        if filename in ("zh.ts", "zh-hant.ts"):
            # "Nous Portal" 在中文翻译里也可能出现
            if "Nous Portal" in text:
                text = text.replace("Nous Portal", brand["portal_name_cn"])
                count += text.count(brand["portal_name_cn"])  # 近似

        if count > 0:
            log(f"{Colors.GREEN}✓{Colors.RESET} {filepath.relative_to(repo)}")
            log(f"{Colors.DIM}  Hermes → {brand_name}: {count}处{Colors.RESET}")
            changes_log.append((str(filepath), "Hermes", brand_name, count))
            if text != original and not dry_run:
                filepath.write_text(text, encoding='utf-8')
        else:
            log(f"{Colors.DIM}  {filename}: 无需替换{Colors.RESET}")


# ============================================================
# 第4层：Python 后端 (web_server.py + setup.py)
# ============================================================

def layer4_python_backend(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第4层：Python 后端 (web_server.py + setup.py){Colors.RESET}")

    # --- web_server.py ---
    ws = repo / "hermes_cli" / "web_server.py"
    if ws.exists():
        text = ws.read_text(encoding='utf-8')
        original = text

        # 4a. FastAPI title
        text, _ = replace_in_text(text,
            'title="Hermes Agent"',
            f'title="{brand["name_cn"]}"', str(ws.relative_to(repo)), "FastAPI title")

        # 4b. 平台描述 — 用宽匹配覆盖所有 "动词 Hermes" 句式
        # 替换 description 字段里的 Hermes（英文上下文用 name_en）
        desc_count_before = text.count("Hermes")
        text = re.sub(
            r'("description":\s*")([^\"]*?)\bHermes\b([^\"]*")',
            lambda m: m.group(1) + m.group(2) + brand["name_en"] + m.group(3),
            text
        )
        desc_count = desc_count_before - text.count("Hermes")
        if desc_count > 0:
            log(f"{Colors.GREEN}✓{Colors.RESET} {ws.relative_to(repo)}")
            log(f"{Colors.DIM}  平台描述 Hermes → {brand['name_en']}: {desc_count}处{Colors.RESET}")
            changes_log.append((str(ws), "desc Hermes", brand["name_en"], desc_count))

        # 4c. 主题标签
        theme_pairs = [
            ('"Hermes Teal"', f'"{brand["theme_name_cn"]}"'),
        ]
        for old_t, new_t in theme_pairs:
            text, _ = replace_in_text(text, old_t, new_t, str(ws.relative_to(repo)), "theme label")

        # 主题描述里的 Hermes
        text = re.sub(
            r'(canonical\s+)Hermes(\s+look)',
            f'\\g<1>{brand["name_cn"]}\\g<2>', text
        )

        # 4d. source_label 品牌化
        text, _ = replace_in_text(text,
            'source_label": f"Hermes PKCE',
            f'source_label": f"{brand["name_cn"]} PKCE', str(ws.relative_to(repo)), "source_label")

        # 4e. docs_url 替换 — 全局替换 hermes-agent.nousresearch.com
        #     (第5层会处理所有 Python 文件中的这个域名)

        # 4f. subscription_url
        text, _ = replace_in_text(text,
            '"subscription_url": "https://portal.nousresearch.com',
            f'"subscription_url": "{brand["portal_url"]}', str(ws.relative_to(repo)), "subscription_url")

        if text != original and not dry_run:
            ws.write_text(text, encoding='utf-8')

    # --- setup.py ---
    sp = repo / "hermes_cli" / "setup.py"
    if sp.exists():
        text = sp.read_text(encoding='utf-8')
        original = text
        setup_count = 0

        def replace_hermes_setup(match):
            nonlocal setup_count
            setup_count += 1
            return match.group(0).replace("Hermes", brand["name_cn"])

        # 只替换 print_info/print_warning 等函数里的 Hermes
        text = re.sub(r'\bHermes\b', replace_hermes_setup, text)

        if setup_count > 0:
            log(f"{Colors.GREEN}✓{Colors.RESET} {sp.relative_to(repo)}")
            log(f"{Colors.DIM}  Hermes → {brand['name_cn']}: {setup_count}处{Colors.RESET}")
            changes_log.append((str(sp), "Hermes", brand["name_cn"], setup_count))
            if text != original and not dry_run:
                sp.write_text(text, encoding='utf-8')


# ============================================================
# 第5层：Portal URL（13处，6个文件）
# ============================================================

def layer5_portal_urls(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第5层：Portal URL（6个Python文件）{Colors.RESET}")

    portal_url = brand["portal_url"]
    sub_url = f'{portal_url}{brand["subscription_path"]}'

    # 文件 → 替换规则
    portal_files = {
        "hermes_cli/portal_cli.py": [
            ('DEFAULT_PORTAL_URL = "https://portal.nousresearch.com"',
             f'DEFAULT_PORTAL_URL = "{portal_url}"'),
            ('SUBSCRIPTION_URL = "https://portal.nousresearch.com/manage-subscription"',
             f'SUBSCRIPTION_URL = "{sub_url}"'),
        ],
        "hermes_cli/auth.py": [
            ('DEFAULT_NOUS_PORTAL_URL = "https://portal.nousresearch.com"',
             f'DEFAULT_NOUS_PORTAL_URL = "{portal_url}"'),
        ],
        "hermes_cli/nous_billing.py": [
            ('DEFAULT_PORTAL_BASE_URL = "https://portal.nousresearch.com"',
             f'DEFAULT_PORTAL_BASE_URL = "{portal_url}"'),
        ],
        "hermes_cli/nous_account.py": [
            ('DEFAULT_NOUS_PORTAL_URL = "https://portal.nousresearch.com"',
             f'DEFAULT_NOUS_PORTAL_URL = "{portal_url}"'),
            ('base = (portal_base_url or "https://portal.nousresearch.com")',
             f'base = (portal_base_url or "{portal_url}")'),
        ],
        "hermes_cli/models.py": [
            ('base = (portal_base_url or "https://portal.nousresearch.com")',
             f'base = (portal_base_url or "{portal_url}")'),
            ('return "https://portal.nousresearch.com"',
             f'return "{portal_url}"'),
        ],
        "hermes_cli/dashboard_register.py": [
            ('return "https://portal.nousresearch.com"',
             f'return "{portal_url}"'),
            ('default_portal = "https://portal.nousresearch.com"',
             f'default_portal = "{portal_url}"'),
        ],
        "hermes_cli/config.py": [
            ('"portal_url": "https://portal.nousresearch.com"',
             f'"portal_url": "{portal_url}"'),
        ],
        "hermes_cli/setup.py": [
            ('Sign up: https://portal.nousresearch.com/manage-subscription',
             f'Sign up: {sub_url}'),
        ],
    }

    for relpath, replacements in portal_files.items():
        filepath = repo / relpath
        if not filepath.exists():
            log(f"{Colors.YELLOW}  ⚠ {relpath} 不存在{Colors.RESET}")
            continue
        text = filepath.read_text(encoding='utf-8')
        original = text
        for old, new in replacements:
            text, _ = replace_in_text(text, old, new, relpath, "Portal URL")
        if text != original and not dry_run:
            filepath.write_text(text, encoding='utf-8')

    # web_server.py 里的 portal URL（已在第4层处理 subscription_url，这里处理剩余）
    ws = repo / "hermes_cli" / "web_server.py"
    if ws.exists():
        text = ws.read_text(encoding='utf-8')
        original = text
        text, _ = replace_in_text(text,
            '"https://portal.nousresearch.com"',
            f'"{portal_url}"', str(ws.relative_to(repo)), "Portal URL")
        if text != original and not dry_run:
            ws.write_text(text, encoding='utf-8')

    # 全局替换 hermes-agent.nousresearch.com → 品牌 docs 域名（所有 Python 文件）
    log(f"\n  {Colors.CYAN}全局替换文档域名 hermes-agent.nousresearch.com → {brand['docs_url']}...{Colors.RESET}")
    docs_count = 0
    docs_files = set()
    for pyfile in (repo / "hermes_cli").glob("*.py"):
        text = pyfile.read_text(encoding='utf-8')
        if "hermes-agent.nousresearch.com" not in text:
            continue
        original = text
        text = text.replace("hermes-agent.nousresearch.com", brand["docs_url"].replace("https://", "").replace("http://", ""))
        n = original.count("hermes-agent.nousresearch.com")
        docs_count += n
        docs_files.add(pyfile.name)
        if text != original and not dry_run:
            pyfile.write_text(text, encoding='utf-8')
    if docs_count > 0:
        log(f"  {Colors.GREEN}✓{Colors.RESET} {docs_count}处，{len(docs_files)}个文件")
        changes_log.append(("hermes_cli/*.py", "hermes-agent.nousresearch.com", brand["docs_url"], docs_count))


# ============================================================
# 第5.5层：前端组件（Portal 品牌名 + OAuth→openExternal）
# ============================================================

def layer5b_frontend_components(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第5.5层：前端组件品牌化{Colors.RESET}")

    # --- desktop-onboarding-overlay.tsx ---
    overlay = repo / "apps" / "desktop" / "src" / "components" / "desktop-onboarding-overlay.tsx"
    if overlay.exists():
        text = overlay.read_text(encoding='utf-8')
        original = text

        # Portal 显示名
        text, _ = replace_in_text(text,
            "title: 'Nous Portal'",
            f"title: '{brand['portal_name_cn']}'", str(overlay.relative_to(repo)), "portal title")

        # 品牌图片
        text, _ = replace_in_text(text,
            "nous-brand.png",
            brand["brand_logo"], str(overlay.relative_to(repo)), "brand logo")
        text, _ = replace_in_text(text,
            "hermes-brand.png",
            brand["brand_logo"], str(overlay.relative_to(repo)), "brand logo")

        # 残留的 Hermes 引用
        text = re.sub(r'\bHermes\b', brand["name_cn"], text)

        if text != original and not dry_run:
            overlay.write_text(text, encoding='utf-8')

    # --- providers-settings.tsx ---
    ps = repo / "apps" / "desktop" / "src" / "app" / "settings" / "providers-settings.tsx"
    if ps.exists():
        text = ps.read_text(encoding='utf-8')
        original = text
        text = re.sub(r'\bHermes\b', brand["name_cn"], text)
        if text != original:
            log(f"{Colors.GREEN}✓{Colors.RESET} {ps.relative_to(repo)}")
            log(f"{Colors.DIM}  Hermes → {brand['name_cn']}{Colors.RESET}")
            if not dry_run:
                ps.write_text(text, encoding='utf-8')

    # --- constants.ts ---
    ct = repo / "apps" / "desktop" / "src" / "app" / "settings" / "constants.ts"
    if ct.exists():
        text = ct.read_text(encoding='utf-8')
        original = text

        # Portal provider 名称
        text, _ = replace_in_text(text,
            "name: 'Nous Portal'",
            f"name: '{brand['portal_name_cn']}'", str(ct.relative_to(repo)), "portal name")

        text = re.sub(r'\bHermes\b', brand["name_cn"], text)

        # docsUrl
        text, _ = replace_in_text(text,
            "docsUrl: 'https://portal.nousresearch.com'",
            f"docsUrl: '{brand['portal_url']}'", str(ct.relative_to(repo)), "docsUrl")

        if text != original and not dry_run:
            ct.write_text(text, encoding='utf-8')

    # --- OAuth→openExternal 代码改动 ---
    log(f"\n  {Colors.YELLOW}⚠ OAuth→openExternal 代码改动需手动处理（见 README.md 第5层）{Colors.RESET}")
    log(f"{Colors.DIM}  涉及文件：{Colors.RESET}")
    log(f"{Colors.DIM}    desktop-onboarding-overlay.tsx — select() 函数拦截 nous provider{Colors.RESET}")
    log(f"{Colors.DIM}    providers-settings.tsx — 同理拦截 nous provider{Colors.RESET}")


# ============================================================
# 第6层：install.ps1 品牌化
# ============================================================

def layer6_install_script(repo, brand, dry_run):
    log(f"\n{Colors.CYAN}{Colors.BOLD}第6层：安装脚本 (install.ps1){Colors.RESET}")

    ip = repo / "scripts" / "install.ps1"
    if not ip.exists():
        log(f"{Colors.YELLOW}  ⚠ install.ps1 不存在{Colors.RESET}")
        return

    text = ip.read_text(encoding='utf-8')
    original = text

    # 安装器名称
    text, _ = replace_in_text(text,
        '"Hermes Installer"',
        f'"{brand["installer_name"]}"', str(ip.relative_to(repo)), "installer name")

    # git config user.name
    text, _ = replace_in_text(text,
        'config user.name "Hermes Installer"',
        f'config user.name "{brand["installer_name"]}"', str(ip.relative_to(repo)), "git user.name")

    # git remote origin URL
    text, _ = replace_in_text(text,
        'https://github.com/NousResearch/hermes-agent.git',
        brand["git_origin"], str(ip.relative_to(repo)), "git origin")

    # 安装横幅中的品牌名
    text, _ = replace_in_text(text,
        '* Hermes Installer',
        f'* {brand["installer_name"]}', str(ip.relative_to(repo)), "banner")

    # vendor 强制覆盖（修复升级场景品牌化不生效的 bug）
    old_vendor = 'if ((Test-Path $vendorRepo) -and -not (Test-Path (Join-Path $InstallDir "cli.py"))) {'
    new_vendor = 'if (Test-Path $vendorRepo) {'
    text, _ = replace_in_text(text, old_vendor, new_vendor,
        str(ip.relative_to(repo)), "vendor force-overwrite fix")

    # 默认语言注入
    text, _ = replace_in_text(text,
        '# Inject default Chinese language for Hermes',
        f'# Inject default Chinese language for {brand["name_en"]}',
        str(ip.relative_to(repo)), "language comment")

    if text != original and not dry_run:
        ip.write_text(text, encoding='utf-8')


# ============================================================
# 验证模式
# ============================================================

def verify(repo, brand):
    """检查残留的旧品牌名。"""
    log(f"\n{Colors.CYAN}{Colors.BOLD}{'='*60}{Colors.RESET}")
    log(f"{Colors.CYAN}{Colors.BOLD}验证：检查残留的旧品牌名{Colors.RESET}")
    log(f"{Colors.CYAN}{Colors.BOLD}{'='*60}{Colors.RESET}\n")

    issues = []

    # 1. Python 后端 — 用户可见的 description/label/title
    ws = repo / "hermes_cli" / "web_server.py"
    if ws.exists():
        text = ws.read_text(encoding='utf-8')
        # 搜索 description 字段里的 Hermes
        for i, line in enumerate(text.split('\n'), 1):
            if re.search(r'"description".*\bHermes\b', line):
                issues.append((str(ws.relative_to(repo)), i, line.strip()))
            if re.search(r'"label".*\bHermes\b', line):
                issues.append((str(ws.relative_to(repo)), i, line.strip()))

    # 1b. setup.py — 用户可见文字（print/banner/提示）
    sp = repo / "hermes_cli" / "setup.py"
    if sp.exists():
        text = sp.read_text(encoding='utf-8')
        for i, line in enumerate(text.split('\n'), 1):
            # 只报用户可见的行（print/banner），排除 CLI 命令名
            if re.search(r'\bHermes\b', line):
                stripped = line.strip()
                if any(cmd in stripped for cmd in ['hermes setup', 'hermes config', 'hermes gateway',
                        'hermes model', 'hermes doctor', 'hermes portal', 'hermes claw',
                        'hermes import', 'hermes update', 'hermes tools', 'hermes memory',
                        'hermes mcp', 'hermes skills', 'hermes profile', 'hermes sessions']):
                    continue  # CLI 命令名，不改
                if any(s in stripped for s in ['print', 'Colors.', '│', 'Wizard', 'configure']):
                    issues.append((str(sp.relative_to(repo)), i, stripped))

    # 1c. hermes-agent.nousresearch.com 文档 URL
    for pyfile in (repo / "hermes_cli").glob("*.py"):
        text = pyfile.read_text(encoding='utf-8')
        for i, line in enumerate(text.split('\n'), 1):
            if 'hermes-agent.nousresearch.com' in line and not line.strip().startswith('#'):
                issues.append((str(pyfile.relative_to(repo)), i, line.strip()))

    # 2. Portal URL 残留
    for pyfile in (repo / "hermes_cli").glob("*.py"):
        text = pyfile.read_text(encoding='utf-8')
        for i, line in enumerate(text.split('\n'), 1):
            if 'portal.nousresearch.com' in line and not line.strip().startswith('#'):
                issues.append((str(pyfile.relative_to(repo)), i, line.strip()))

    # 3. i18n 残留（排除测试文件）
    i18n_dir = repo / "apps" / "desktop" / "src" / "i18n"
    if i18n_dir.exists():
        for f in i18n_dir.glob("*.ts"):
            if ".test." in f.name:
                continue
            text = f.read_text(encoding='utf-8')
            for i, line in enumerate(text.split('\n'), 1):
                if re.search(r'\bHermes\b', line):
                    issues.append((str(f.relative_to(repo)), i, line.strip()))

    # 4. package.json 残留
    pkg = repo / "apps" / "desktop" / "package.json"
    if pkg.exists():
        text = pkg.read_text(encoding='utf-8')
        for i, line in enumerate(text.split('\n'), 1):
            if 'Hermes' in line and any(k in line for k in
                ['productName', 'appId', 'legalTrademarks', 'shortcutName', 'CFBundleName', 'maintainer', 'uninstallDisplayName']):
                issues.append((str(pkg.relative_to(repo)), i, line.strip()))

    if issues:
        log(f"{Colors.RED}发现 {len(issues)} 处残留：{Colors.RESET}\n")
        for filepath, lineno, content in issues:
            log(f"  {Colors.RED}{filepath}:{lineno}{Colors.RESET}")
            log(f"    {content}")
        return False
    else:
        log(f"{Colors.GREEN}✓ 零残留！品牌化完整。{Colors.RESET}")
        return True


# ============================================================
# 主入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='Hermes Agent 白标品牌化脚本',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python apply_brand.py --config brands/qiji.json --repo .
  python apply_brand.py --config brands/qiji.json --repo . --dry-run
  python apply_brand.py --config brands/qiji.json --repo . --verify
        """)
    parser.add_argument('--config', required=True, help='品牌配置 JSON 文件路径')
    parser.add_argument('--repo', required=True, help='仓库根目录路径')
    parser.add_argument('--dry-run', action='store_true', help='预览变更，不写入文件')
    parser.add_argument('--verify', action='store_true', help='仅验证残留，不修改')
    args = parser.parse_args()

    # 加载配置
    config_path = Path(args.config)
    if not config_path.is_absolute() and not config_path.exists():
        # 相对于脚本目录解析
        script_dir = Path(__file__).parent
        config_path = script_dir / args.config

    with open(config_path, encoding='utf-8') as f:
        brand = json.load(f)

    # 过滤掉 _comment 字段
    brand = {k: v for k, v in brand.items() if not k.startswith('_')}

    repo = Path(args.repo).resolve()

    log(f"\n{Colors.BOLD}品牌化脚本{Colors.RESET}")
    log(f"  品牌: {brand['name_cn']} ({brand['name_en']})")
    log(f"  仓库: {repo}")
    log(f"  Portal: {brand['portal_url']}")
    mode = "验证" if args.verify else ("预览" if args.dry_run else "执行")
    log(f"  模式: {mode}\n")

    if args.verify:
        success = verify(repo, brand)
        sys.exit(0 if success else 1)

    # 执行6层品牌化
    layer1_package_json(repo, brand, args.dry_run)
    layer2_icons(repo, brand, args.dry_run)
    layer3_i18n(repo, brand, args.dry_run)
    layer4_python_backend(repo, brand, args.dry_run)
    layer5_portal_urls(repo, brand, args.dry_run)
    layer5b_frontend_components(repo, brand, args.dry_run)
    layer6_install_script(repo, brand, args.dry_run)

    # 汇总
    total_changes = sum(c for _, _, _, c in changes_log)
    log(f"\n{Colors.CYAN}{Colors.BOLD}{'='*60}{Colors.RESET}")
    log(f"{Colors.CYAN}{Colors.BOLD}汇总{Colors.RESET}")
    log(f"{Colors.CYAN}{Colors.BOLD}{'='*60}{Colors.RESET}")
    log(f"  总变更: {total_changes} 处")
    log(f"  涉及文件: {len(set(f for f, _, _, _ in changes_log))} 个")

    if args.dry_run:
        log(f"\n{Colors.YELLOW}这是预览模式，未写入任何文件。去掉 --dry-run 执行。{Colors.RESET}")
    else:
        log(f"\n{Colors.GREEN}品牌化完成！{Colors.RESET}")
        log(f"{Colors.YELLOW}手动步骤（脚本无法自动处理）：{Colors.RESET}")
        log(f"  1. 替换图标: assets/icon.ico, public/icon.png 等")
        log(f"  2. OAuth→openExternal 代码改动（见 README.md）")
        log(f"  3. 运行 --verify 确认无残留")

    # 自动验证（dry-run 时跳过，因为文件没变）
    if not args.dry_run:
        log(f"\n{Colors.DIM}自动验证中...{Colors.RESET}")
        verify(repo, brand)


if __name__ == '__main__':
    main()
