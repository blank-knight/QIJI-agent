'use strict'
const test = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { verifyInstallerSignature, RELEASE_PUBLIC_KEYS } = require('./release-signature.cjs')

// 从硬编码公钥反推可签名的私钥不可行——测试里直接生成临时密钥对,把公钥注入模块级数组
const tmpPriv = crypto.generateKeyPairSync('ed25519').privateKey
  .export({ type: 'pkcs8', format: 'pem' })
const tmpPubHex = crypto.createPrivateKey(tmpPriv) && null // placeholder

async function makeKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex')
  return { privateKey, pubHex }
}

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

test('正确签名+sha匹配 → 通过', async () => {
  const { privateKey, pubHex } = await makeKey()
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.alloc(1024, 7))
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const sig = crypto.sign(null, Buffer.from(sha, 'utf8'), privateKey).toString('base64')
  // 临时替换公钥表
  const saved = RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, pubHex)
  try {
    const r = await verifyInstallerSignature(file, { sha256: sha, signature: sig, newversion: '0.19.0' })
    assert.strictEqual(r.ok, true)
  } finally {
    RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, ...saved)
    fs.rmSync(file, { force: true })
  }
})

test('签名被换 → 拒绝', async () => {
  const { privateKey, pubHex } = await makeKey()
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.alloc(512, 3))
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const sig = crypto.sign(null, Buffer.from(sha, 'utf8'), privateKey).toString('base64')
  const badSig = Buffer.from(sig, 'base64').reverse().toString('base64')
  const saved = RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, pubHex)
  try {
    await assert.rejects(
      () => verifyInstallerSignature(file, { sha256: sha, signature: badSig, newversion: '0.19.0' }),
      /签名验证失败/
    )
  } finally {
    RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, ...saved)
    fs.rmSync(file, { force: true })
  }
})

test('sha256不匹配 → 拒绝(包被替换)', async () => {
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.alloc(256, 9))
  await assert.rejects(
    () => verifyInstallerSignature(file, { sha256: 'a'.repeat(64), signature: '', newversion: '0.18.2' }),
    /sha256 不匹配/
  )
  fs.rmSync(file, { force: true })
})

test('无签名+目标版本<0.19.0 → 宽容放行(存量通道)', async () => {
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.alloc(128, 1))
  const r = await verifyInstallerSignature(file, { newversion: '0.18.2' })
  assert.strictEqual(r.lenient, true)
  fs.rmSync(file, { force: true })
})

test('无签名+目标版本>=0.19.0 → 强制拒绝', async () => {
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.alloc(128, 1))
  await assert.rejects(
    () => verifyInstallerSignature(file, { newversion: '0.19.0' }),
    /缺少发布签名/
  )
  fs.rmSync(file, { force: true })
})

test('多公钥轮换: 新旧key任一可验', async () => {
  const oldPair = await makeKey()
  const newPair = await makeKey()
  const file = path.join(os.tmpdir(), `qiji-sig-test-${Date.now()}.bin`)
  fs.writeFileSync(file, Buffer.from('rotation-test'))
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const sig = crypto.sign(null, Buffer.from(sha, 'utf8'), oldPair.privateKey).toString('base64')
  const saved = RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, newPair.pubHex, oldPair.pubHex)
  try {
    const r = await verifyInstallerSignature(file, { sha256: sha, signature: sig, newversion: '0.19.0' })
    assert.strictEqual(r.ok, true)
  } finally {
    RELEASE_PUBLIC_KEYS.splice(0, RELEASE_PUBLIC_KEYS.length, ...saved)
    fs.rmSync(file, { force: true })
  }
})
