#!/usr/bin/env python3
"""
奇计知识库批量导入工具。

扫描用户指定的文件夹，列出所有可导入的文件，
按类型分类，生成导入清单供 Agent 逐个处理。

用法:
  python3 import_data.py <目录路径>              # 扫描并列出文件
  python3 import_data.py <目录路径> --json        # JSON 输出（Agent 用）
  python3 import_data.py <目录路径> --recursive   # 递归扫描子目录
"""

import os
import sys
import json
from pathlib import Path
from datetime import datetime

# 支持的文件类型 → 知识库分类映射
FILE_TYPE_MAP = {
    # 文档类 → 可能是品牌/产品/行业资料
    ".pdf": {"category": "auto", "parser": "pymupdf", "desc": "PDF文档"},
    ".docx": {"category": "auto", "parser": "read_file", "desc": "Word文档"},
    ".doc": {"category": "auto", "parser": "read_file", "desc": "Word文档(旧格式)"},
    ".txt": {"category": "auto", "parser": "read_file", "desc": "文本文件"},
    ".md": {"category": "auto", "parser": "read_file", "desc": "Markdown文件"},
    # 表格类 → 可能是产品列表/客户清单
    ".xlsx": {"category": "auto", "parser": "read_file", "desc": "Excel表格"},
    ".xls": {"category": "auto", "parser": "read_file", "desc": "Excel表格(旧格式)"},
    ".csv": {"category": "auto", "parser": "read_file", "desc": "CSV表格"},
    # 图片类 → 需要 OCR
    ".png": {"category": "auto", "parser": "vision_ocr", "desc": "图片(PNG)"},
    ".jpg": {"category": "auto", "parser": "vision_ocr", "desc": "图片(JPG)"},
    ".jpeg": {"category": "auto", "parser": "vision_ocr", "desc": "图片(JPEG)"},
    ".webp": {"category": "auto", "parser": "vision_ocr", "desc": "图片(WebP)"},
}

# 文件名关键词 → 推荐分类
FILENAME_HINTS = {
    "品牌": "brands", "brand": "brands", "公司": "brands", "company": "brands",
    "产品": "products", "product": "products", "商品": "products",
    "客户": "customers", "customer": "customers", "用户画像": "customers",
    "竞品": "competitors", "competitor": "competitors", "对手": "competitors",
    "行业": "industry", "industry": "industry", "市场": "industry", "趋势": "industry",
    "文章": "content", "爆文": "content", "案例": "content", "文案": "content",
}


def guess_category(filepath: Path) -> str:
    """根据文件名猜测分类。"""
    name_lower = filepath.stem.lower()
    for keyword, category in FILENAME_HINTS.items():
        if keyword in name_lower or keyword.lower() in name_lower:
            return category
    return "auto"  # Agent 需要读内容后决定


def scan_directory(dir_path: str, recursive: bool = False) -> list:
    """扫描目录，返回可导入文件清单。"""
    root = Path(dir_path)
    if not root.exists():
        return []

    results = []
    if recursive:
        files = root.rglob("*")
    else:
        files = root.iterdir()

    for f in files:
        if not f.is_file():
            continue
        ext = f.suffix.lower()
        if ext not in FILE_TYPE_MAP:
            continue

        info = FILE_TYPE_MAP[ext]
        stat = f.stat()
        category_guess = guess_category(f)

        results.append({
            "path": str(f.resolve()),
            "filename": f.name,
            "ext": ext,
            "size_mb": round(stat.st_size / 1024 / 1024, 2),
            "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d"),
            "parser": info["parser"],
            "suggested_category": category_guess,
            "desc": info["desc"],
        })

    # 按修改时间排序（新的在前）
    results.sort(key=lambda x: x["modified"], reverse=True)
    return results


def print_report(files: list):
    """打印人类可读的导入清单。"""
    if not files:
        print("未找到可导入的文件。")
        print(f"支持的格式: {', '.join(FILE_TYPE_MAP.keys())}")
        return

    print(f"📂 找到 {len(files)} 个可导入文件:\n")

    # 按推荐分类分组
    by_category = {}
    for f in files:
        cat = f["suggested_category"]
        by_category.setdefault(cat, []).append(f)

    for cat, cat_files in by_category.items():
        labels = {
            "brands": "品牌资料", "products": "产品信息",
            "customers": "客户资料", "competitors": "竞品分析",
            "industry": "行业知识", "content": "内容存档",
            "auto": "未分类（需读取后判断）",
        }
        label = labels.get(cat, cat)
        print(f"  📁 {label} ({len(cat_files)} 个):")
        for f in cat_files:
            print(f"     {f['filename']} ({f['desc']}, {f['size_mb']}MB) → {f['parser']}")
        print()

    # 统计
    parsers = {}
    for f in files:
        parsers.setdefault(f["parser"], []).append(f)
    print("处理方式统计:")
    for parser, pfiles in parsers.items():
        print(f"  {parser}: {len(pfiles)} 个文件")

    print(f"\n💡 提示: 对话中说「导入这些文件」即可批量处理。")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    dir_path = sys.argv[1]
    recursive = "--recursive" in sys.argv or "-r" in sys.argv
    as_json = "--json" in sys.argv

    files = scan_directory(dir_path, recursive)

    if as_json:
        print(json.dumps({"files": files, "count": len(files)}, ensure_ascii=False, indent=2))
    else:
        print_report(files)


if __name__ == "__main__":
    main()
