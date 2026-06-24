#!/usr/bin/env python3
"""
奇计知识库初始化、检查、搜索工具。

用法:
  python3 init_knowledge_base.py              # 初始化目录结构
  python3 init_knowledge_base.py --check      # 检查知识库状态
  python3 init_knowledge_base.py --search "手机"  # 全文搜索
  python3 init_knowledge_base.py --index      # 重建索引
"""

import os
import sys
import re
import json
from pathlib import Path
from datetime import datetime

HERMES_HOME = Path(os.environ.get("HERMES_HOME", os.path.expanduser("~/.hermes")))
KB_ROOT = HERMES_HOME / "knowledge-base"

SUBDIRS = ["brands", "products", "industry", "customers", "competitors", "content"]


def init():
    """创建知识库目录结构和初始索引。"""
    if KB_ROOT.exists():
        print(f"知识库已存在: {KB_ROOT}")
        return

    for d in SUBDIRS:
        (KB_ROOT / d).mkdir(parents=True, exist_ok=True)

    write_index()
    print(f"✅ 知识库已创建: {KB_ROOT}")
    print(f"   目录结构: {', '.join(SUBDIRS)}")


def check():
    """检查知识库状态。"""
    if not KB_ROOT.exists():
        print("❌ 知识库未初始化")
        return

    stats = {}
    for d in SUBDIRS:
        path = KB_ROOT / d
        files = list(path.glob("*.md")) if path.exists() else []
        stats[d] = len(files)

    total = sum(stats.values())
    index_path = KB_ROOT / "_index.md"

    print(f"📂 知识库路径: {KB_ROOT}")
    print(f"📝 总条目: {total}")
    print(f"📅 索引更新: {index_path.stat().st_mtime if index_path.exists() else '无索引'}")
    print()
    for d, count in stats.items():
        marker = "📁" if count > 0 else "📂"
        print(f"  {marker} {d}: {count} 条")


def search(query):
    """全文搜索知识库。"""
    if not KB_ROOT.exists():
        print("❌ 知识库未初始化")
        return

    query_lower = query.lower()
    results = []

    for md_file in KB_ROOT.rglob("*.md"):
        if md_file.name == "_index.md":
            continue
        try:
            content = md_file.read_text(encoding="utf-8")
        except Exception:
            continue

        if query_lower in content.lower():
            # Extract title (first # heading)
            title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
            title = title_match.group(1) if title_match else md_file.stem

            # Find matching context
            lines = content.split("\n")
            context_lines = []
            for i, line in enumerate(lines):
                if query_lower in line.lower():
                    start = max(0, i - 1)
                    end = min(len(lines), i + 2)
                    context_lines.append("...".join(lines[start:end]).strip())

            rel_path = md_file.relative_to(KB_ROOT)
            results.append({
                "file": str(rel_path),
                "title": title,
                "context": context_lines[:3],
            })

    if not results:
        print(f'未找到匹配 "{query}" 的条目')
        return

    print(f'🔍 搜索 "{query}" — 找到 {len(results)} 条结果:\n')
    for r in results:
        print(f"  📄 {r['title']}")
        print(f"     路径: {r['file']}")
        for ctx in r["context"]:
            print(f"     > {ctx[:100]}")
        print()


def write_index():
    """扫描所有条目，重建 _index.md 索引。"""
    lines = ["# 📚 知识库索引\n"]
    lines.append(f"> 最后更新: {datetime.now().strftime('%Y-%m-%d')}\n")

    total = 0
    for d in SUBDIRS:
        path = KB_ROOT / d
        if not path.exists():
            continue
        files = sorted(path.glob("*.md"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not files:
            continue

        labels = {
            "brands": "品牌", "products": "产品", "industry": "行业知识",
            "customers": "客户", "competitors": "竞品", "content": "内容存档",
        }
        lines.append(f"\n## {labels.get(d, d)} ({len(files)})\n")
        for f in files:
            title = f.stem
            mtime = datetime.fromtimestamp(f.stat().st_mtime).strftime("%Y-%m-%d")
            lines.append(f"- [[{d}/{title}]] — 更新于 {mtime}")
        total += len(files)

    lines.insert(4, f"\n**总条目: {total}**\n")

    index_path = KB_ROOT / "_index.md"
    index_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅ 索引已更新: {index_path} ({total} 条目)")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] == "--init":
        init()
    elif sys.argv[1] == "--check":
        check()
    elif sys.argv[1] == "--search":
        if len(sys.argv) < 3:
            print("用法: --search <关键词>")
            sys.exit(1)
        search(sys.argv[2])
    elif sys.argv[1] == "--index":
        write_index()
    else:
        print(__doc__)
