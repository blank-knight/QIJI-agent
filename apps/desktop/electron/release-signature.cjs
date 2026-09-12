/**
 * release-signature.cjs — 安装包发布签名校验（fail-closed）
 *
 * 威胁模型: 服务端/CDN/下载链路任何一环被替换安装包（内鬼或劫持）。
 * 只有 axibawa 私钥签出的包才能通过本机校验; 验签失败 = 拒绝安装。
 *
 * 机制:
 *   - 服务端 update/check 响应新增 sha256 + signature(base64 ed25519) 字段
 *   - 签名对象 = 安装包 sha256 的 hex 字符串（与 fa_version.sha256 对齐）
 *   - 公钥 32 字节硬编码于本文件（编译进安装包,随加密构建分发）
 *   - 0.18.2 之前的存量版本无签名字段——为它们保留宽容窗口,0.19.0 起强制
 */
'use strict'
const crypto = require('crypto')

// ed25519 公钥（raw 32 bytes, hex）。轮换密钥时追加新 key 到数组即可平滑过渡。
const RELEASE_PUBLIC_KEYS = [
  '588e684174d9ce8cca96eef1395c11c5f84bad4ad812905029f39f9b2b627ec8'
]

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')

function publicKeyFromHex(hex) {
  const der = Buffer.concat([SPKI_PREFIX, Buffer.from(hex, 'hex')])
  return crypto.createPublicKey({ key: der, format: 'der', type: 'spki' })
}

// 0.19.0 起强制验签; 更早版本(存量客户)进入宽容模式: 无签名字段不拦截
const ENFORCE_SINCE = '0.19.0'

function versionGte(current, floor) {
  const parse = v => String(v || '').replace(/^v/i, '').split(/[.,]/).map(n => parseInt(n, 10) || 0)
  const [a, b] = [parse(current), parse(floor)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0)
    if (d !== 0) return d > 0
  }
  return true
}

/**
 * 校验已下载安装包文件。
 * @param filePath 本地安装包路径
 * @param meta 服务端下发的 { sha256, signature, newversion }
 * @returns {{ok:true, sha256:string}} 或抛错（信息面向日志,不含密钥材料）
 */
async function verifyInstallerSignature(filePath, meta) {
  const fs = require('fs/promises')
  const buf = await fs.readFile(filePath)
  const actualSha = crypto.createHash('sha256').update(buf).digest('hex')

  const declaredSha = String(meta?.sha256 || '').trim().toLowerCase()
  const sigB64 = String(meta?.signature || '').trim()
  const targetVersion = meta?.newversion || ''

  // 1) 服务端声明了 sha256 时必须一致（防下载链路截断/替换）
  if (declaredSha && declaredSha !== actualSha) {
    throw new Error(`安装包校验失败: sha256 不匹配 (server=${declaredSha.slice(0, 12)} local=${actualSha.slice(0, 12)})`)
  }

  // 2) 无签名: 仅在目标版本 < 0.19.0 的宽容窗口放行（存量更新到 0.18.x 的通道）
  if (!sigB64) {
    if (versionGte(targetVersion, ENFORCE_SINCE)) {
      throw new Error(`更新包缺少发布签名 (target=${targetVersion})——已按策略拒绝安装`)
    }
    return { ok: true, sha256: actualSha, lenient: true }
  }

  // 3) ed25519 验签: 签名对象 = sha256 hex
  const sig = Buffer.from(sigB64, 'base64')
  const payload = Buffer.from(declaredSha || actualSha, 'utf8')
  const ok = RELEASE_PUBLIC_KEYS.some(hex => {
    try {
      return crypto.verify(null, payload, publicKeyFromHex(hex), sig)
    } catch {
      return false
    }
  })
  if (!ok) {
    throw new Error('更新包发布签名验证失败——安装包来源不可信,已拒绝安装')
  }
  return { ok: true, sha256: actualSha }
}

module.exports = { verifyInstallerSignature, RELEASE_PUBLIC_KEYS }
