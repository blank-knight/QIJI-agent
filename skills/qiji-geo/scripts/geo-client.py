#!/usr/bin/env python3
"""qiji-geo geo-client 加密执行包装器(解密同名.enc到临时目录后以模块方式加载)。"""
import os, sys, tempfile, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ENC = os.path.join(HERE, 'geo-client.py.enc')

def assemble_key():
    import re
    root = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
    hexs = ''
    for sub, name in (('gateway', '_K1'), ('agent', '_K2'), ('tools', '_K3')):
        p = os.path.join(root, sub, '_skill_key.py')
        with open(p, encoding='utf-8') as f:
            m = re.search(r'_K\d = "([^"]+)"', f.read())
            if m:
                hexs += m.group(1)
    return bytes.fromhex(hexs)

def main():
    if not os.path.exists(ENC):
        print('[geo-client] 密文缺失: ' + ENC, file=sys.stderr)
        sys.exit(1)
    raw = open(ENC, 'rb').read()
    if raw[:4] != b'SQIJ':
        print('[geo-client] 非加密格式,无明文可执行', file=sys.stderr)
        sys.exit(1)
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key = assemble_key()
    plain = AESGCM(key).decrypt(raw[4:16], raw[16:], None)
    tmpd = tempfile.mkdtemp(prefix='qiji-geoc-')
    tmpf = os.path.join(tmpd, 'geo-client.py')
    open(tmpf, 'wb').write(plain)
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('geo_client', tmpf)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        # geo-client被当库用时常用入口: 保持模块属性可用
        sys.modules['geo_client'] = mod
        if hasattr(mod, 'main') and len(sys.argv) > 1:
            sys.exit(mod.main(sys.argv[1:]) or 0)
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)

if __name__ == '__main__':
    main()
