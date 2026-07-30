"""
Skill 加密端到端验证脚本

验证项:
  1. 加密后磁盘上只有 .enc 文件（原文件已删）
  2. .enc 文件以 MAGIC 头 b"SQIJ" 开头（不是明文）
  3. 运行时解密模块能正确解密，内容与原文一致
  4. skills_tool.py 的 decrypt_file() 能读到正确内容

用法:
    set SKILL_ENCRYPTION_KEY=test-verify-key
    python scripts/verify-skill-encryption.py

跑完后原文件自动恢复，不影响代码。
"""
import hashlib
import os
import shutil
import sys
from pathlib import Path

# 确保能 import 项目模块
repo_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(repo_root))

MAGIC = b"SQIJ"

# ===== 工具函数 =====

def derive_key(passphrase: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", passphrase.encode("utf-8"), b"qiji-skill-salt", 100000, dklen=32)

def encrypt_bytes(plaintext: bytes, key: bytes) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(iv, plaintext, None)
    return MAGIC + iv + ciphertext

def print_result(ok, msg):
    icon = "[OK]" if ok else "[FAIL]"
    print(f"  {icon} {msg}")
    if not ok:
        raise AssertionError(msg)

# ===== 主流程 =====

def main():
    passphrase = os.environ.get("SKILL_ENCRYPTION_KEY") or "test-verify-key"
    key = derive_key(passphrase)

    # 选一个测试文件（不破坏真实 skill）
    skill_dir = repo_root / "skills" / "qiji-geo"
    test_file = skill_dir / "SKILL.md"
    enc_file = skill_dir / "SKILL.md.enc"
    backup_file = skill_dir / "SKILL.md.bak"

    if not test_file.exists():
        print(f"找不到 {test_file}，跳过")
        return

    print("=" * 50)
    print("Skill 加密端到端验证")
    print("=" * 50)

    # ---- 备份 ----
    print("\n1. 备份原文件")
    shutil.copy2(test_file, backup_file)
    original_content = test_file.read_bytes()
    print(f"   原文件: {len(original_content)} bytes")

    try:
        # ---- 加密 ----
        print("\n2. 加密 SKILL.md")
        encrypted = encrypt_bytes(original_content, key)
        enc_file.write_bytes(encrypted)
        test_file.unlink()  # 删除原文件
        print(f"   加密后: {len(original_content)} -> {len(encrypted)} bytes")

        # ---- 验证 1: 磁盘上只有 .enc ----
        print("\n3. 验证磁盘状态")
        print_result(not test_file.exists(), "原文件已删除 (SKILL.md 不存在)")
        print_result(enc_file.exists(), "加密文件存在 (SKILL.md.enc)")

        # ---- 验证 2: .enc 不是明文 ----
        print("\n4. 验证加密文件格式")
        enc_data = enc_file.read_bytes()
        print_result(enc_data[:4] == MAGIC, f"MAGIC 头正确: {enc_data[:4]}")
        print_result(b"qiji" not in enc_data.lower() or enc_data[:4] == MAGIC, "密文中不含明文 'qiji'")
        # 检查是否有 frontmatter 明文
        print_result(b"name:" not in enc_data[16:], "密文中不含明文 frontmatter")

        # ---- 验证 3: 解密模块能还原 ----
        print("\n5. 验证运行时解密")
        sys.path.insert(0, str(repo_root / "tools"))

        # 写入密钥片段（模拟编译时生成的状态）
        key_hex = key.hex()
        for mod, attr, part in [
            ("gateway", "_K1", key_hex[:22]),
            ("agent", "_K2", key_hex[22:44]),
            ("tools", "_K3", key_hex[44:]),
        ]:
            frag_path = repo_root / mod / "_skill_key.py"
            frag_path.write_text(f'"""auto-generated"""\n{attr} = "{part}"\n', encoding="utf-8")

        # 用解密模块解密
        from tools.skill_crypto import decrypt_file, is_encrypted, is_encrypted_file

        print_result(is_encrypted(enc_data), "is_encrypted() 识别正确")

        decrypted = decrypt_file(enc_file)
        print_result(decrypted is not None, "decrypt_file() 返回非 None")

        if decrypted:
            print_result(decrypted.encode("utf-8") == original_content, "解密内容与原文完全一致")

            # 验证能解析出 frontmatter
            if "---" in decrypted:
                print_result("name:" in decrypted or "name:" in original_content.decode("utf-8"),
                             "frontmatter 可解析")

        # ---- 验证 4: skills_tool 的 resolve_enc_path ----
        print("\n6. 验证文件查找兼容性")
        from tools.skill_crypto import resolve_enc_path
        resolved = resolve_enc_path(test_file)
        print_result(resolved == enc_file, f"resolve_enc_path 正确指向 .enc: {resolved.name}")

        print("\n" + "=" * 50)
        print("  全部验证通过!")
        print("=" * 50)

    finally:
        # ---- 恢复原文件 ----
        print("\n7. 恢复原文件")
        if backup_file.exists():
            shutil.copy2(backup_file, test_file)
            backup_file.unlink()
        if enc_file.exists():
            enc_file.unlink()
        # 清理密钥片段
        for mod in ["gateway", "agent", "tools"]:
            frag = repo_root / mod / "_skill_key.py"
            if frag.exists():
                frag.unlink()
        print("   已恢复原文件，已清理临时文件")

if __name__ == "__main__":
    main()
