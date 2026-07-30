"""
Skill 文件运行时解密模块

从 3 个散落在不同目录的密钥片段拼出完整密钥，
解密 .enc 文件。解密结果只在内存中存在，不落盘。

加密文件格式: MAGIC(4B "SQIJ") + IV(12B) + Ciphertext + Tag(16B)
其中 GCM 的 Tag 自动附加在 ciphertext 末尾。
"""

import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

MAGIC = b"SQIJ"

# 缓存密钥，避免重复拼接
_cached_key: Optional[bytes] = None


def _assemble_key() -> bytes:
    """
    从 3 个片段拼出完整密钥。

    片段位置:
    - gateway/_skill_key.py → _K1
    - agent/_skill_key.py   → _K2
    - tools/_skill_key.py   → _K3

    3 个都在才能还原密钥。
    """
    global _cached_key
    if _cached_key is not None:
        return _cached_key

    import importlib.util
    from pathlib import Path

    # 通过文件路径加载，避免 import 路径 / 包命名空间问题
    _here = Path(__file__).resolve().parent.parent  # repo root
    fragments = [
        (_here / "gateway" / "_skill_key.py", "_K1"),
        (_here / "agent" / "_skill_key.py", "_K2"),
        (_here / "tools" / "_skill_key.py", "_K3"),
    ]

    parts = []
    for frag_path, attr in fragments:
        if not frag_path.exists():
            logger.debug("密钥片段缺失: %s", frag_path)
            continue
        try:
            spec = importlib.util.spec_from_file_location(f"_skill_key_{attr}", frag_path)
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                parts.append(getattr(mod, attr))
        except Exception:
            logger.debug("密钥片段读取失败: %s", frag_path)

    if len(parts) != 3:
        raise RuntimeError("密钥片段不完整，无法解密 skill 文件")

    key_hex = "".join(parts)
    _cached_key = bytes.fromhex(key_hex)
    return _cached_key


def is_encrypted(data: bytes) -> bool:
    """判断数据是否是加密格式"""
    return len(data) >= 4 and data[:4] == MAGIC


def is_encrypted_file(file_path: Path) -> bool:
    """判断文件是否是 .enc 加密文件"""
    return file_path.suffix == ".enc"


def decrypt_bytes(encrypted: bytes, key: bytes) -> bytes:
    """
    AES-256-GCM 解密

    Args:
        encrypted: MAGIC(4B) + IV(12B) + Ciphertext + Tag(16B)
        key: 32 字节密钥

    Returns:
        解密后的明文 bytes
    """
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    if not is_encrypted(encrypted):
        # 不是加密格式，原样返回
        return encrypted

    # 去掉 MAGIC
    iv = encrypted[4:16]       # 12 bytes IV
    ciphertext_and_tag = encrypted[16:]  # Ciphertext + Tag(16B)

    aesgcm = AESGCM(key)
    plaintext = aesgcm.decrypt(iv, ciphertext_and_tag, None)
    return plaintext


def decrypt_file(file_path: Path) -> Optional[str]:
    """
    读取并解密一个文件，返回字符串内容。

    如果文件不是加密格式（没有 .enc 后缀），直接读取返回。
    如果解密失败，返回 None。

    Args:
        file_path: 要读取的文件路径（.enc 或普通文件）

    Returns:
        解密后的文本内容，或 None（解密失败时）
    """
    try:
        raw = file_path.read_bytes()
    except Exception as e:
        logger.error("读取文件失败 %s: %s", file_path, e)
        return None

    if not is_encrypted(raw):
        # 普通文件，直接返回文本
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            logger.warning("文件不是 UTF-8 文本: %s", file_path)
            return None

    # 加密文件 — 解密
    try:
        key = _assemble_key()
        plaintext = decrypt_bytes(raw, key)
        return plaintext.decode("utf-8")
    except Exception as e:
        logger.error("解密失败 %s: %s", file_path, e)
        return None


def resolve_enc_path(file_path: Path) -> Path:
    """
    查找加密后的文件路径。

    如果原文件不存在但 .enc 版本存在，返回 .enc 路径。
    如果原文件存在，返回原路径（decrypt_file 内部会判断是否加密）。

    Args:
        file_path: 原始文件路径（如 SKILL.md）

    Returns:
        实际应该读取的文件路径
    """
    if file_path.exists():
        return file_path

    # 检查 .enc 版本
    enc_path = file_path.with_suffix(file_path.suffix + ".enc")
    if enc_path.exists():
        return enc_path

    return file_path  # 都不存在，返回原路径（上层会处理 not found）
