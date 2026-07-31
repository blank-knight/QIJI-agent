#!/usr/bin/env python3
"""
品牌一键生成脚本 — 当贴牌商什么都不提供时，自动生成全套品牌资产。

功能：
  1. 自动起名（从词库组合，或 AI 生成候选）
  2. AI 生成 Logo 图标（调 image_gen provider 生成候选 → 人工筛选）
     也支持从本地图片文件导入（操作者已用外部工具生成）
  3. Pillow 裁剪成全套图标尺寸（png × 3 + ico + icns）
  4. 生成品牌配置 JSON（可直接喂给 apply_brand.py）

用法:
  # 完全自动：起名 + AI 生成 Logo + 生成配置
  python generate_brand.py

  # 指定品牌名（跳过起名）
  python generate_brand.py --name 黑镜

  # 指定品牌名 + 从本地图片导入 Logo
  python generate_brand.py --name 黑镜 --logo-source ./my-logo.png

  # 指定品牌名 + 配色
  python generate_brand.py --name 黑镜 --palette midnight

  # 只起名不生成 Logo（看看有什么候选）
  python generate_brand.py --name-only

输出位置：
  scripts/brand/brands/{brand-id}.json     — 品牌配置
  scripts/brand/assets/{brand-id}/         — 全套图标（icon.ico 等）
  生成后把图标手动复制到 apps/desktop/assets/ 和 public/，
  或直接跑 apply_brand.py（它会提示手动步骤）。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from typing import List, Optional

# Windows GBK 终端兼容
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        try:
            _stream.reconfigure(encoding='utf-8', errors='replace')
        except (ValueError, OSError):
            pass

try:
    from PIL import Image
except ImportError:
    print("错误：需要 Pillow 库。请运行 pip install Pillow", file=sys.stderr)
    sys.exit(1)


# ============================================================
# 品牌名生成
# ============================================================

# 词库 — 科技感形容词 + 意象名词，组合出的名字要有"产品感"
_PREFIXES = [
    "黑", "星", "极", "深", "暗", "银", "光", "幻", "玄", "冰",
    "焰", "岚", "辰", "渊", "镜", "棱", "零", "核", "甲", "乙",
]

_SUFFIXES = [
    "镜", "渊", "光", "界", "核", "环", "矩阵", "引擎", "工坊", "实验室",
    "方舟", "纪元", "维度", "象限", "奇点", "深渊", "回廊", "塔", "门", "窗",
]

# 一些已知的、读起来顺的固定组合（优先推荐）
_CURATED_NAMES = [
    "黑镜", "星渊", "极光", "深渊", "银核", "玄界", "冰棱", "焰核",
    "岚图", "辰纪", "棱镜", "零维", "幻方", "光门", "暗塔", "星环",
]


def generate_name_candidates(count: int = 8) -> List[str]:
    """从词库组合生成品牌名候选。"""
    import random

    candidates = list(_CURATED_NAMES)
    # 随机组合补充
    random.shuffle(_PREFIXES)
    random.shuffle(_SUFFIXES)
    for p in _PREFIXES[:10]:
        for s in _SUFFIXES[:5]:
            name = f"{p}{s}"
            if len(name) <= 4 and name not in candidates:
                candidates.append(name)
            if len(candidates) >= count * 3:
                break
        if len(candidates) >= count * 3:
            break

    random.shuffle(candidates)
    return candidates[:count]


def pick_name_interactive(candidates: List[str]) -> str:
    """交互式让操作者挑一个品牌名。"""
    print("\n品牌名候选：")
    for i, name in enumerate(candidates, 1):
        print(f"  {i}. {name}")
    print(f"  0. 自己输入")

    while True:
        try:
            choice = input("\n选择编号: ").strip()
            if choice == "0":
                return input("输入品牌名: ").strip()
            idx = int(choice) - 1
            if 0 <= idx < len(candidates):
                return candidates[idx]
            print("无效选择，请重试")
        except (ValueError, EOFError, KeyboardInterrupt):
            print("\n已取消")
            sys.exit(1)


# ============================================================
# brand-id 生成（用于文件名/目录名）
# ============================================================

def to_brand_id(name: str, name_en: str = "") -> str:
    """品牌名 → 文件系统安全的 id。

    优先级：英文名 > 拼音全拼（pypinyin）> hash 回退。
    """
    # 优先用英文名
    if name_en:
        ascii_id = re.sub(r'[^a-zA-Z0-9-]', '', name_en).lower().strip('-')
        if ascii_id:
            return ascii_id

    ascii_name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    if ascii_name:
        return ascii_name

    # 中文名：尝试拼音全拼（比首字母更可读，如 heijing）
    try:
        from pypinyin import lazy_pinyin
        pinyin = lazy_pinyin(name)
        result = ''.join(pinyin)
        return result if result else f"brand-{abs(hash(name)) % 10000}"
    except ImportError:
        return f"brand-{abs(hash(name)) % 10000}"


def guess_name_en(name: str) -> str:
    """从中文名猜一个英文名。用拼音首字母大写（如 黑镜 → HeiJing）。

    如果是英文/数字，直接原样返回 Title Case。
    """
    ascii_name = re.sub(r'[^a-zA-Z0-9 -]', '', name)
    if ascii_name.strip():
        return ascii_name.strip().title()

    try:
        from pypinyin import lazy_pinyin
        pinyin_parts = lazy_pinyin(name)
        # 每个字的拼音首字母大写拼一起，如 "hei" + "jing" → "HeiJing"
        result = ''.join(p[0].upper() + p[1:] for p in pinyin if p)
        return result if result else name
    except ImportError:
        print(f"提示：未安装 pypinyin，无法从中文自动推断英文名。", file=sys.stderr)
        print(f"      建议用 --name-en 指定英文名，如 --name-en HeiMirror", file=sys.stderr)
        print(f"      或安装：python -m pip install pypinyin", file=sys.stderr)
        return name


# ============================================================
# 配色模板库（从 themes/presets.ts 提取的主色）
# ============================================================

PALETTES = {
    "teal":      {"primary": "#0D9488", "bg": "#0F2A2E", "name_cn": "青绿"},
    "midnight":  {"primary": "#1540B1", "bg": "#0D2F86", "name_cn": "深蓝紫"},
    "ember":     {"primary": "#B8390E", "bg": "#2A0F0A", "name_cn": "红铜"},
    "mono":      {"primary": "#4A4A4A", "bg": "#1A1A1A", "name_cn": "灰阶"},
    "cyberpunk": {"primary": "#39FF14", "bg": "#0A0A0A", "name_cn": "霓虹绿"},
    "rose":      {"primary": "#D6336C", "bg": "#FFF0F6", "name_cn": "粉红"},
    "nous-blue": {"primary": "#0053FD", "bg": "#F8FAFF", "name_cn": "亮蓝"},
}


# ============================================================
# AI Logo 生成
# ============================================================

def build_logo_prompt(name: str, palette_name: str) -> str:
    """构建给 image_gen 的 prompt。"""
    palette = PALETTES.get(palette_name, PALETTES["teal"])
    primary = palette["primary"]
    bg = palette["bg"]
    return (
        f"Minimalist app icon logo for a tech product. "
        f"Central focus: abstract geometric symbol representing the concept of '{name}'. "
        f"Style: modern, clean, flat design, iOS app icon aesthetic. "
        f"Colors: primary accent {primary} on {bg} background. "
        f"No text, no letters, no words — pure abstract icon. "
        f"High contrast, recognizable at small sizes (16x16 pixels). "
        f"Symmetric or balanced composition. Professional, premium feel."
    )


def generate_logos_via_provider(
    name: str,
    palette_name: str,
    count: int = 4,
) -> List[Path]:
    """通过 image_gen provider 生成 Logo 候选图。

    依赖当前 hermes 实例配好了 image_gen provider（FAL/xAI/OpenAI 等）。
    返回下载到本地的图片路径列表。
    """
    print(f"\n通过 image_gen 生成 {count} 个 Logo 候选...")

    try:
        # 延迟导入，避免在没配 provider 时崩溃
        from agent.image_gen_registry import get_active_provider
    except ImportError:
        print("错误：无法导入 image_gen 框架。请在 hermes 环境下运行，或用 --logo-source 指定本地图片。")
        return []

    provider = get_active_provider()
    if provider is None:
        print("错误：没有可用的 image_gen provider。请先用 'hermes tools' 配置图片生成。")
        print("     或用 --logo-source <图片路径> 指定本地 Logo 文件。")
        return []

    if not provider.is_available():
        print(f"错误：image_gen provider '{provider.name}' 不可用（可能缺少 API key）。")
        return []

    prompt = build_logo_prompt(name, palette_name)
    print(f"  Provider: {provider.display_name}")
    print(f"  Prompt: {prompt[:80]}...")

    # 缓存目录
    cache_dir = Path.home() / ".hermes" / "cache" / "brand-logos"
    cache_dir.mkdir(parents=True, exist_ok=True)

    results: List[Path] = []
    for i in range(count):
        print(f"  生成中 ({i+1}/{count})...", end=" ", flush=True)
        try:
            resp = provider.generate(prompt, aspect_ratio="square")
            if resp.get("success") and resp.get("image"):
                img_url = resp["image"]
                local_path = cache_dir / f"{name}_candidate_{i+1}.png"
                if _download_image(img_url, local_path):
                    results.append(local_path)
                    print(f"✓ {local_path.name}")
                else:
                    print("✗ 下载失败")
            else:
                err = resp.get("error", "未知错误")
                print(f"✗ {err}")
        except Exception as e:
            print(f"✗ 异常: {e}")

    return results


def _download_image(url: str, dest: Path) -> bool:
    """下载图片 URL 到本地。支持 http(s) URL 和本地路径。"""
    if not url:
        return False
    # 本地路径直接复制
    if os.path.exists(url):
        Path(url).replace(dest) if Path(url).resolve() != dest.resolve() else None
        import shutil
        shutil.copy2(url, dest)
        return True
    # HTTP 下载
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "brand-generator/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            dest.write_bytes(resp.read())
        return dest.exists() and dest.stat().st_size > 0
    except Exception as e:
        print(f"  下载失败: {e}")
        return False


# ============================================================
# Pillow 图标裁剪
# ============================================================

def process_icon(
    source_path: Path,
    brand_id: str,
    output_dir: Path,
) -> dict:
    """把源图片裁剪/缩放成全套图标尺寸。

    返回生成的文件路径字典。
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    src = Image.open(source_path).convert("RGBA")

    # 居中裁剪为正方形（icon 必须是正方形）
    w, h = src.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        src = src.crop((left, top, left + side, top + side))

    generated = {}

    # PNG — 各种尺寸
    png_sizes = {
        "icon.png": 512,
        "apple-touch-icon.png": 180,
        f"{brand_id}-logo.png": 256,
    }
    for filename, size in png_sizes.items():
        path = output_dir / filename
        src.resize((size, size), Image.LANCZOS).save(path, "PNG")
        generated[filename] = path
        print(f"  ✓ {filename} ({size}×{size})")

    # ICO — Windows 多尺寸
    ico_path = output_dir / "icon.ico"
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_images = [src.resize(s, Image.LANCZOS) for s in ico_sizes]
    # Pillow 的 ICO 保存：取第一张图，通过 sizes 参数指定多尺寸
    ico_images[0].save(
        ico_path, format="ICO",
        sizes=ico_sizes,
    )
    generated["icon.ico"] = ico_path
    print(f"  ✓ icon.ico (多尺寸: {', '.join(f'{w}×{h}' for w, h in ico_sizes)})")

    # ICNS — macOS
    try:
        icns_path = output_dir / "icon.icns"
        # ICNS 需要至少 512x512
        icns_img = src.resize((512, 512), Image.LANCZOS)
        icns_img.save(icns_path, format="ICNS")
        generated["icon.icns"] = icns_path
        print(f"  ✓ icon.icns (512×512)")
    except Exception as e:
        print(f"  ⚠ icon.icns 生成失败（macOS 图标，Windows 构建可忽略）: {e}")

    return generated


# ============================================================
# 品牌配置 JSON 生成
# ============================================================

def generate_brand_config(
    name_cn: str,
    brand_id: str,
    palette_name: str,
    name_en: str = "",
    portal_url: str = "https://www.aicps.vip",
) -> dict:
    """生成品牌配置 JSON。"""

    # 推断英文名
    if not name_en:
        name_en = guess_name_en(name_cn)

    # 繁体映射（简单规则，复杂字需人工校对）
    name_hant = name_cn  # 默认同简体，后续可人工调整

    palette = PALETTES.get(palette_name, PALETTES["teal"])

    return {
        "_comment": f"{name_cn}品牌配置 — 由 generate_brand.py 自动生成",
        "name_cn": name_cn,
        "name_en": name_en,
        "name_ja": name_en,
        "name_hant": name_hant,
        "app_id": f"com.{brand_id}.desktop",
        "portal_name_cn": f"{name_cn}云",
        "portal_name_en": f"{name_en} Cloud",
        "portal_url": portal_url,
        "subscription_path": "/manage-subscription",
        "docs_url": portal_url,
        "brand_logo": f"{brand_id}-logo.png",
        "theme_name_cn": f"{name_cn}{palette['name_cn']}",
        "nsis_title": f"安装{name_cn}",
        "synopsis_cn": f"{name_cn} — AI智能助手桌面版",
        "installer_name": f"{name_en} Installer",
        "legal_trademarks": name_cn,
        "git_origin": f"https://gitee.com/yourorg/{brand_id}-agent.git",
        "git_remote_name": "gitee",
        "theme": {
            "palette": palette_name,
            "typography": "system",
            "mode": "auto",
            "density": "normal",
            "font_url": "",
        },
    }


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description='品牌一键生成脚本 — 自动起名 + AI Logo + 全套图标 + 配置 JSON',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python generate_brand.py                          # 完全自动
  python generate_brand.py --name 黑镜               # 指定名字
  python generate_brand.py --name 黑镜 --palette midnight
  python generate_brand.py --name 黑镜 --logo-source ./my-logo.png
  python generate_brand.py --name-only              # 只看名字候选
        """)
    parser.add_argument('--name', help='指定品牌名（跳过自动起名）')
    parser.add_argument('--name-en', help='指定品牌英文名（默认从拼音推断，如 黑镜 → HeiJing）')
    parser.add_argument('--palette', default='teal',
                        choices=list(PALETTES.keys()),
                        help='配色模板（默认 teal）')
    parser.add_argument('--logo-source', help='从本地图片文件导入 Logo（跳过 AI 生成）')
    parser.add_argument('--logo-count', type=int, default=4, help='AI 生成 Logo 候选数量（默认 4）')
    parser.add_argument('--name-only', action='store_true', help='只生成名字候选，不生成 Logo')
    parser.add_argument('--portal-url', default='https://www.aicps.vip',
                        help='中转站 URL（默认 aicps.vip）')
    parser.add_argument('--no-interactive', action='store_true', help='非交互模式（取第一个候选）')
    args = parser.parse_args()

    # --- 第1步：品牌名 ---
    if args.name:
        name = args.name.strip()
        print(f"品牌名: {name}")
    else:
        candidates = generate_name_candidates(count=8)
        if args.name_only:
            print("\n品牌名候选：")
            for i, c in enumerate(candidates, 1):
                print(f"  {i}. {c}")
            return
        if args.no_interactive:
            name = candidates[0]
            print(f"自动选择品牌名: {name}")
        else:
            name = pick_name_interactive(candidates)

    name_en = args.name_en or ""
    brand_id = to_brand_id(name, name_en)
    if not name_en:
        name_en = guess_name_en(name)
    print(f"品牌名: {name} / {name_en} (brand_id: {brand_id})")

    if args.name_only:
        return

    # --- 第2步：Logo ---
    script_dir = Path(__file__).parent
    output_dir = script_dir / "assets" / brand_id

    logo_source: Optional[Path] = None

    if args.logo_source:
        # 从本地文件导入
        logo_source = Path(args.logo_source)
        if not logo_source.exists():
            print(f"错误：找不到 Logo 文件 {logo_source}")
            sys.exit(1)
        print(f"\n从本地文件导入 Logo: {logo_source}")
    else:
        # AI 生成
        candidates_paths = generate_logos_via_provider(name, args.palette, args.logo_count)
        if not candidates_paths:
            print("\nAI 生成失败。请用 --logo-source 指定本地 Logo 文件，或检查 image_gen 配置。")
            sys.exit(1)

        if args.no_interactive or len(candidates_paths) == 1:
            logo_source = candidates_paths[0]
            print(f"自动选择第一个候选: {logo_source.name}")
        else:
            # 交互式选择
            print(f"\n生成了 {len(candidates_paths)} 个 Logo 候选：")
            for i, p in enumerate(candidates_paths, 1):
                print(f"  {i}. {p}")
            print(f"  0. 全部不要，重来")

            while True:
                try:
                    choice = input(f"\n选择编号 (1-{len(candidates_paths)}): ").strip()
                    idx = int(choice) - 1
                    if 0 <= idx < len(candidates_paths):
                        logo_source = candidates_paths[idx]
                        break
                    print("无效选择")
                except (ValueError, EOFError, KeyboardInterrupt):
                    print("\n已取消")
                    sys.exit(1)

    # --- 第3步：裁剪全套图标 ---
    print(f"\n裁剪全套图标 → {output_dir}/")
    generated_icons = process_icon(logo_source, brand_id, output_dir)

    # --- 第4步：生成品牌配置 JSON ---
    config = generate_brand_config(name, brand_id, args.palette, name_en, args.portal_url)
    config_path = script_dir / "brands" / f"{brand_id}.json"
    config_path.write_text(
        json.dumps(config, ensure_ascii=False, indent=2) + "\n",
        encoding='utf-8',
    )
    print(f"\n品牌配置已生成: {config_path}")

    # --- 汇总 + 下一步指引 ---
    print(f"\n{'='*60}")
    print(f"品牌生成完成！")
    print(f"{'='*60}")
    print(f"  品牌名: {name} (brand_id: {brand_id})")
    print(f"  配色: {args.palette} ({PALETTES[args.palette]['name_cn']})")
    print(f"  图标目录: {output_dir}")
    print(f"  配置文件: {config_path}")
    print(f"\n下一步：")
    print(f"  1. 把图标复制到对应位置：")
    print(f"     {output_dir}/icon.ico          → apps/desktop/assets/icon.ico")
    print(f"     {output_dir}/icon.icns         → apps/desktop/assets/icon.icns")
    print(f"     {output_dir}/icon.png          → apps/desktop/public/icon.png")
    print(f"     {output_dir}/apple-touch-icon.png → apps/desktop/public/apple-touch-icon.png")
    print(f"     {output_dir}/{brand_id}-logo.png  → apps/desktop/public/{brand_id}-logo.png")
    print(f"  2. 在上游 fresh checkout 上执行品牌化：")
    print(f"     python scripts/brand/apply_brand.py --config scripts/brand/brands/{brand_id}.json --repo .")
    print(f"  3. 编译")


if __name__ == '__main__':
    main()
