#!/usr/bin/env node
/**
 * qiji-geo geo-cli 加密执行包装器
 * 磁盘上的 geo-cli.js.enc 是密文;本wrapper在执行时解密到临时目录后加载运行,
 * 用完即删 — 明文只在内存/临时目录短暂存在。
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const ENC = path.join(HERE, 'geo-cli.js.enc');
if (!fs.existsSync(ENC)) {
  console.error('[geo-cli] 密文文件缺失: ' + ENC);
  process.exit(1);
}

// 密钥拼装(与 tools/skill_crypto.py 同源: 3片段)
function assembleKey() {
  const repoRoot = path.resolve(HERE, '..', '..', '..'); // skills/qiji-geo -> hermes-agent
  const frags = [
    path.join(repoRoot, 'gateway', '_skill_key.py'),
    path.join(repoRoot, 'agent', '_skill_key.py'),
    path.join(repoRoot, 'tools', '_skill_key.py'),
  ];
  let hex = '';
  for (const f of frags) {
    if (!fs.existsSync(f)) throw new Error('密钥片段缺失: ' + f);
    const m = fs.readFileSync(f, 'utf8').match(/_K\d = "([^"]+)"/);
    if (m) hex += m[1];
  }
  return Buffer.from(hex, 'hex'); // 32字节AES密钥(64 hex)
}

function aesGcmDecrypt(buf, key) {
  const crypto = require('crypto');
  const iv = buf.slice(4, 16);
  const ct = buf.slice(16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(ct.slice(ct.length - 16));
  return Buffer.concat([decipher.update(ct.slice(0, ct.length - 16)), decipher.final()]);
}

const MAGIC = Buffer.from('SQIJ');
const raw = fs.readFileSync(ENC);
if (!raw.slice(0, 4).equals(MAGIC)) {
  // 不是加密格式(开发模式) — 直接执行明文geo-cli.js
  const plain = path.join(HERE, 'geo-cli.js.plain');
  if (fs.existsSync(plain)) {
    require(plain);
  } else {
    console.error('[geo-cli] 非加密包但无明文文件');
    process.exit(1);
  }
} else {
  // 加密模式: 解密到临时目录执行
  const key = assembleKey();
  const plain = aesGcmDecrypt(raw, key);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qiji-geo-'));
  const tmpFile = path.join(tmp, 'geo-cli.js');
  fs.writeFileSync(tmpFile, plain);
  // package.json依赖(node_modules)在原目录 — 保留cwd,main路径换tmp
  try {
    const args = process.argv.slice(2);
    const r = execFileSync(process.execPath, [tmpFile, ...args], {
      cwd: HERE,           // node_modules/包解析仍走skill目录
      stdio: 'inherit',
      env: process.env,
    });
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(r === null ? 0 : 0);
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(typeof e.status === 'number' ? e.status : 1);
  }
}
