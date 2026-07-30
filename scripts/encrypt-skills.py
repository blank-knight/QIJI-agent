#!/usr/bin/env python3
"""
编译时加密 Skill 文件

用法:
    # 设置密钥（32 字节 hex 或 base64）
    set SKILL_ENCRYPTION_KEY=your-64-char-hex-key
    python scripts/encrypt-skills.py

    # 指定 skill 目录
    python scripts/encrypt-skills.py --skills-dir skills/qiji-geo

    # 指定要加密的扩展名（默认加密所有文本文件）
    python scripts/encrypt-skills.py --extensions .md .py .js .json .yaml .yml

加密后:
    - 原文件被替换为 .enc 文件（原文件删除）
    - .enc 文件格式: MAGIC(4B) + IV(12B) + Ciphertext + Tag(16B)
    - MAGIC = b"SQIJ"  (Skill Qiji Encrypted)
"""

import argparse
import getpass
import os
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("错误: 缺少 cryptography 库。请运行: pip install cryptography", file=sys.stderr)
    sys.exit(1)

MAGIC = b"SQIJ"


def derive_key(passphrase: str) -> bytes:
    """从口令派生 32 字节 AES 密钥"""
    import hashlib

    return hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), b"qiji-skill-salt", 100000, dklen=32)


def encrypt_bytes(plaintext: bytes, key: bytes) -> bytes:
    """AES-256-GCM 加密"""
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return MAGIC + iv + ciphertext  # Tag 在 GCM 里自动附加在 ciphertext 末尾


def encrypt_file(file_path: Path, key: bytes, dry_run: bool = False) -> bool:
    """加密单个文件，返回是否成功"""
    try:
        plaintext = file_path.read_bytes()
    except Exception as e:
        print(f"  跳过（读取失败）: {file_path} — {e}", file=sys.stderr)
        return False

    encrypted = encrypt_bytes(plaintext, key)
    enc_path = file_path.with_suffix(file_path.suffix + ".enc")

    if dry_run:
        print(f"  [DRY-RUN] 会加密: {file_path} -> {enc_path}")
        return True

    enc_path.write_bytes(encrypted)
    file_path.unlink()  # 删除原文件
    print(f"  加密: {file_path.name} -> {enc_path.name} ({len(plaintext)} -> {len(encrypted)} bytes)")
    return True


def should_encrypt(file_path: Path, extensions: set[str], exclude: set[str]) -> bool:
    """判断文件是否需要加密"""
    # 排除列表
    if file_path.name in exclude:
        return False
    # 已经是 .enc 文件
    if file_path.suffix == ".enc":
        return False
    # package.json / package-lock.json 不加密（npm 需要）
    if file_path.name in ("package.json", "package-lock.json"):
        return False
    # 按扩展名过滤
    return file_path.suffix.lower() in extensions


def encrypt_skill_dir(skill_dir: Path, key: bytes, extensions: set[str], dry_run: bool = False) -> int:
    """加密一个 skill 目录下的所有文本文件"""
    count = 0
    for root, dirs, files in os.walk(skill_dir):
        # 跳过 node_modules
        dirs[:] = [d for d in dirs if d != "node_modules"]
        for fname in files:
            fpath = Path(root) / fname
            if should_encrypt(fpath, extensions, exclude={"package.json", "package-lock.json"}):
                if encrypt_file(fpath, key, dry_run):
                    count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description="编译时加密 Skill 文件")
    parser.add_argument(
        "--skills-dir",
        type=str,
        default=None,
        help="要加密的 skill 目录（默认扫描 skills/ 下所有子目录）",
    )
    parser.add_argument(
        "--extensions",
        nargs="+",
        default=[".md", ".py", ".js", ".json", ".yaml", ".yml", ".sh", ".txt"],
        help="要加密的文件扩展名",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印会做什么，不实际加密",
    )
    parser.add_argument(
        "--key",
        type=str,
        default=None,
        help="加密密钥（64 字符 hex）。不传则从 SKILL_ENCRYPTION_KEY 环境变量读取",
    )
    args = parser.parse_args()

    # 获取密钥
    passphrase = args.key or os.environ.get("SKILL_ENCRYPTION_KEY")
    if not passphrase:
        if sys.stdin.isatty():
            passphrase = getpass.getpass("请输入加密口令: ")
        else:
            print("错误: 请通过 --key 或 SKILL_ENCRYPTION_KEY 环境变量提供密钥", file=sys.stderr)
            sys.exit(1)

    key = derive_key(passphrase)
    extensions_set = {ext.lower() for ext in args.extensions}

    # 确定要加密的目录
    repo_root = Path(__file__).resolve().parent.parent
    if args.skills_dir:
        skill_dirs = [Path(args.skills_dir)]
    else:
        skills_root = repo_root / "skills"
        if not skills_root.exists():
            print(f"错误: skills 目录不存在: {skills_root}", file=sys.stderr)
            sys.exit(1)
        skill_dirs = [d for d in skills_root.iterdir() if d.is_dir() and not d.name.startswith(".")]

    print(f"加密扩展名: {', '.join(sorted(extensions_set))}")
    print(f"目标目录: {', '.join(str(d) for d in skill_dirs)}")
    if args.dry_run:
        print("[DRY-RUN 模式 — 不会实际加密]\n")
    else:
        print()

    total = 0
    for skill_dir in skill_dirs:
        print(f"处理: {skill_dir.name}/")
        count = encrypt_skill_dir(skill_dir, key, extensions_set, args.dry_run)
        print(f"  完成: {count} 个文件\n")
        total += count

    print(f"总计加密: {total} 个文件")

    if total == 0 and not args.dry_run:
        print("警告: 没有文件被加密。检查 --extensions 参数。", file=sys.stderr)

    # 把密钥也保存到运行时解密模块能读到的位置
    # （密钥片段散落存放，增加逆向难度）
    if not args.dry_run and total > 0:
        _write_key_fragments(repo_root, key, passphrase)


def _write_key_fragments(repo_root: Path, key: bytes, passphrase: str):
    """
    将密钥拆成 3 段，散落在不同文件里。
    单独拿到一个文件无法还原密钥。
    """
    import base64

    key_hex = key.hex()
    # 拆成 3 段
    part1 = key_hex[:22]  # 44 chars
    part2 = key_hex[22:44]  # 44 chars
    part3 = key_hex[44:]  # 20 chars

    # 片段 1: gateway 常量文件
    frag1_path = repo_root / "gateway" / "_skill_key.py"
    frag1_path.write_text(
        f'"""Skill 运行时密钥片段 1/3。自动生成，勿手动修改。"""\n'
        f'_K1 = "{part1}"\n',
        encoding="utf-8",
    )

    # 片段 2: agent 工具目录常量
    frag2_path = repo_root / "agent" / "_skill_key.py"
    frag2_path.write_text(
        f'"""Skill 运行时密钥片段 2/3。自动生成，勿手动修改。"""\n'
        f'_K2 = "{part2}"\n',
        encoding="utf-8",
    )

    # 片段 3: tools 目录常量
    frag3_path = repo_root / "tools" / "_skill_key.py"
    frag3_path.write_text(
        f'"""Skill 运行时密钥片段 3/3。自动生成，勿手动修改。"""\n'
        f'_K3 = "{part3}"\n',
        encoding="utf-8",
    )

    print(f"密钥片段已写入 3 个位置（需要 3 个都在才能解密）")


if __name__ == "__main__":
    main()
