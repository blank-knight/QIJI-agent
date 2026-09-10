#!/usr/bin/env python3
"""
skill 加密发布工具 — 改完明文 skill 后一键生成加密版

用法:
  # 1) 明文工作目录(改代码在这里改):
  #    /tmp/skill-plain/qiji-geo/  或任意目录
  # 2) 一键加密发布:
  python3 scripts/publish-skill.py --name qiji-geo --src /tmp/skill-plain/qiji-geo
  #    → 加密 → 同步到 repo skills/ + 打包vendor + 双端(WSL/Win) 对齐

流程:
  ① 读取明文源目录
  ② 用主密钥(~/.qiji-skill-master-key.txt) AES-256-GCM 加密所有文本文件 → .enc
  ③ 保留 wrapper(geo-cli.js/geo-client.py 同名非enc) — wrapper不加密!
  ④ 同步到: repo skills/{name}/ + win build/vendor/hermes-agent/skills/{name}/
  ⑤ git commit(提示你确认)
"""
import argparse, os, shutil, sys, subprocess
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

REPO = Path(__file__).resolve().parent.parent
KEY_FILE = Path.home() / '.qiji-skill-master-key.txt'
WRAPPER_NAMES = {'geo-cli.js', 'geo-client.py'}  # 明文wrapper白名单
TEXT_EXTS = {'.md', '.py', '.js', '.json', '.yaml', '.yml', '.sh', '.txt'}

def load_key() -> bytes:
    txt = KEY_FILE.read_text()
    hexkey = [l for l in txt.splitlines() if l.startswith('HEX:')][0][4:].strip()
    return bytes.fromhex(hexkey)

def encrypt_dir(src: Path, dst: Path, key: bytes) -> int:
    n = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for fname in files:
            fpath = Path(root) / fname
            rel = fpath.relative_to(src)
            out = dst / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            if fname in WRAPPER_NAMES:
                shutil.copy2(fpath, out)  # wrapper保持明文
                continue
            if fpath.suffix.lower() in TEXT_EXTS and fname not in ('package.json', 'package-lock.json'):
                pt = fpath.read_bytes()
                iv = os.urandom(12)
                enc = b'SQIJ' + iv + AESGCM(key).encrypt(iv, pt, None)
                out.with_suffix(fpath.suffix + '.enc').write_bytes(enc)
                n += 1
            else:
                shutil.copy2(fpath, out)  # 图片等二进制原样
    return n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--name', required=True, help='skill目录名,如 qiji-geo')
    ap.add_argument('--src', required=True, help='明文源目录')
    args = ap.parse_args()

    src = Path(args.src).resolve()
    assert (src / 'SKILL.md').exists(), '源目录缺 SKILL.md'
    key = load_key()

    # 目标1: repo skills/
    dst1 = REPO / 'skills' / args.name
    # 目标2: Windows打包vendor
    dst2 = Path('/mnt/c/Users/84673/qiji-fork/apps/desktop/build/vendor/hermes-agent/skills') / args.name

    for d in (dst1, dst2):
        if d.exists():
            shutil.rmtree(d)
        n = encrypt_dir(src, d, key)
        print(f'✓ {d} — 加密{n}个文件')

    print()
    print('完成。记得:')
    print(f'  cd {REPO} && git add skills/{args.name} && git commit')
    print('  下次打安装包自动带上(dist:win:sfx)')

if __name__ == '__main__':
    main()
