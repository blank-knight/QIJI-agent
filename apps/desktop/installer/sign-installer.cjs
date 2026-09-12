#!/usr/bin/env node
/**
 * Qiji 安装包签名工具（发版链专用）
 *
 * 用法: node sign-installer.js <安装包路径> [--key <私钥pem路径>]
 *   私钥默认路径: ~/clawd/qiji-release-keys/qiji-release-private.pem（可用 QIJI_SIGN_KEY 环境变量或 --key 覆盖）
 *
 * 输出: <安装包>.sig （64字节ed25519签名,base64）+ 终端打印 base64 签名与 sha256
 * 发版时把 base64 签名填进 fa_version.signature 字段（或七牛对象 meta）。
 */
'use strict'
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

const args = process.argv.slice(2)
const target = args.find(a => !a.startsWith('--'))
const keyArgIdx = args.indexOf('--key')
const keyPath = keyArgIdx >= 0 ? args[keyArgIdx + 1]
  : process.env.QIJI_SIGN_KEY
  || path.join(os.homedir(), 'clawd/qiji-release-keys/qiji-release-private.pem')

if (!target) {
  console.error('用法: node sign-installer.js <安装包路径> [--key <私钥pem>]')
  process.exit(2)
}
if (!fs.existsSync(target)) {
  console.error(`文件不存在: ${target}`)
  process.exit(2)
}
if (!fs.existsSync(keyPath)) {
  console.error(`私钥不存在: ${keyPath}`)
  process.exit(2)
}

const privPem = fs.readFileSync(keyPath)
const buf = fs.readFileSync(target)

// 签名「文件sha256的hex字符串」而不是整个文件——签名体固定,与 fa_version.sha256 字段天然对齐
const sha256 = crypto.createHash('sha256').update(buf).digest('hex')
const sig = crypto.sign(null, Buffer.from(sha256, 'utf8'), privPem)
const sigB64 = sig.toString('base64')

fs.writeFileSync(`${target}.sig`, sigB64, 'utf8')

console.log(JSON.stringify({
  file: path.basename(target),
  size: buf.length,
  sha256,
  signature: sigB64
}, null, 2))
