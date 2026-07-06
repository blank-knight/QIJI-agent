# Skill 安全保护快速参考

> **快速参考，方便查找关键信息**

---

## 📋 实施步骤速查

### 阶段 1：基础防护（半天到 1 天）

| 步骤 | 命令 | 文件 |
|------|------|------|
| 1. 安装依赖 | `npm install --save-dev javascript-obfuscator` | - |
| 2. 添加密钥派生 | - | `electron/main.cjs` |
| 3. 添加解密函数 | - | `electron/main.cjs` |
| 4. 修改 skill_view | - | `electron/main.cjs` |
| 5. 配置混淆 | - | `obfuscator.config.json` |
| 6. 修改编译脚本 | - | `package.json` |
| 7. 测试 | `npm run dist:win:nsis` | - |

---

### 阶段 2：加强防护（2-3 天）

| 步骤 | 命令 | 文件 |
|------|------|------|
| 1. 反调试 | - | `electron/main.cjs` |
| 2. 完整性检查 | - | `electron/main.cjs` + `scripts/write-build-stamp.cjs` |
| 3. 内存保护 | - | `electron/main.cjs` |
| 4. 测试 | `npm run dist:win:nsis` | - |

---

## 🔑 核心代码片段

### 1. 密钥派生

```javascript
function deriveKey() {
  const cpuInfo = require('os').cpus()[0].model
  const hostname = require('os').hostname()
  const username = process.env.USERNAME || process.env.USER || 'unknown'
  const platform = process.platform
  const arch = process.arch
  const version = process.version
  
  const seed = `${cpuInfo}|${hostname}|${username}|${platform}|${arch}|${version}`
  
  const { createHash, pbkdf2Sync } = require('crypto')
  const salt = createHash('sha256').update(seed).digest()
  const key = pbkdf2Sync(seed, salt, 100000, 32, 'sha256')
  
  return key.toString('hex')
}
```

---

### 2. 解密函数

```javascript
function decryptSkill(encryptedData, key) {
  const { createDecipheriv } = require('crypto')
  
  const iv = encryptedData.slice(0, 16)
  const cipherTextWithTag = encryptedData.slice(16)
  const cipherText = cipherTextWithTag.slice(0, -16)
  const authTag = cipherTextWithTag.slice(-16)
  
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(cipherText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  
  return decrypted.toString('utf-8')
}
```

---

### 3. skill_view 修改

```javascript
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  const encPath = `${skillPath}.md.enc`
  
  if (fs.existsSync(encPath)) {
    try {
      const encrypted = fs.readFileSync(encPath)
      const key = deriveKey()
      const decrypted = decryptSkill(encrypted, key)
      return parseSkill(decrypted)
    } catch (error) {
      // 降级到未加密文件
      if (fs.existsSync(`${skillPath}.md`)) {
        return fs.readFileSync(`${skillPath}.md`, 'utf-8')
      }
      throw new Error(`Skill 加载失败: ${error.message}`)
    }
  }
  
  // ... 其余代码
}
```

---

## ⚙️ 配置文件

### obfuscator.config.json

```json
{
  "compact": true,
  "controlFlowFlattening": true,
  "controlFlowFlatteningThreshold": 0.75,
  "deadCodeInjection": true,
  "deadCodeInjectionThreshold": 0.4,
  "debugProtection": true,
  "debugProtectionInterval": 0,
  "disableConsoleOutput": true,
  "identifierNamesGenerator": "hexadecimal",
  "log": false,
  "renameGlobals": false,
  "selfDefending": true,
  "stringArray": true,
  "stringArrayEncoding": ["rc4"],
  "stringArrayThreshold": 0.75,
  "unicodeEscapeSequence": false,
  "target": "node"
}
```

---

### package.json 修改

```json
{
  "scripts": {
    "dist": "... && npm run obfuscate && npm run builder",
    "obfuscate": "javascript-obfuscator electron/main.cjs --config obfuscator.config.json --output electron/main.obf.cjs && node -e \"const fs=require('fs');fs.copyFileSync('electron/main.obf.cjs','electron/main.cjs');\""
  }
}
```

---

## 🔍 加密文件格式

```
[加密文件结构]
├── IV (16 bytes)           ← 初始化向量
├── Ciphertext (N bytes)    ← 密文
└── Auth Tag (16 bytes)     ← 认证标签（GCM）
```

---

## 📊 性能数据

| 操作 | 时间 | 说明 |
|------|------|------|
| 密钥派生 | ~50ms | 首次调用 |
| 缓存密钥 | < 1ms | 后续调用 |
| 解密 20KB | < 1ms | Skill 文件典型大小 |
| 解密 100KB | ~2ms | |
| 解密 1MB | ~20ms | 大文件 |
| 代码混淆 | ~2 分钟 | 编译时 |
| 总编译时间 | ~28 分钟 | 比原来多 ~3 分钟 |

---

## 🎯 成功标准

### 阶段 1

- [ ] 磁盘上的 Skill 文件是加密的
- [ ] 用户直接查看看到乱码
- [ ] 用户能正常使用 Skill
- [ ] 编译/安装/更新流程不受影响

---

### 阶段 2

- [ ] 检测到调试器时退出
- [ ] exe 被修改时退出
- [ ] 解密后立即清除内存
- [ ] 所有阶段 1 的标准

---

## ⚠️ 常见问题

| 问题 | 解决方案 |
|------|---------|
| 编译时报错 `javascript-obfuscator not found` | `npm install --save-dev javascript-obfuscator` |
| 解密失败 `Unsupported state or unable to authenticate data` | 重新下载 Skill，或检查密钥 |
| 混淆后代码无法运行 | 降低混淆强度，或跳过 `debugProtection` |
| 首次启动很慢 | 缓存密钥派生结果 |

---

## 🔄 回滚方案

### 禁用加密

```javascript
// 在 skill_view 中跳过解密
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  
  // 直接使用未加密文件
  if (fs.existsSync(`${skillPath}.md`)) {
    return fs.readFileSync(`${skillPath}.md`, 'utf-8')
  }
}
```

### 跳过混淆

```json
{
  "scripts": {
    "dist": "... && npm run builder"  // 移除 npm run obfuscate
  }
}
```

---

## 📁 目录结构

```
clawd/qiji-fork/
├── electron/
│   ├── main.cjs                    ← 主进程代码
│   └── main.obf.cjs                ← 混淆后的代码（临时）
├── scripts/
│   ├── encrypt-skill-file.py       ← 加密脚本
│   └── write-build-stamp.cjs       ← 编译脚本
├── skills/
│   ├── qiji-geo/
│   │   ├── SKILL.md                ← 明文
│   │   └── SKILL.md.enc            ← 加密后
│   └── fund-radar/
│       ├── SKILL.md
│       └── SKILL.md.enc
├── obfuscator.config.json          ← 混淆配置
└── package.json                    ← 编译配置
```

---

## 🔐 安全等级对比

| 防护措施 | 阶段 1 | 阶段 2 | 阶段 3 |
|---------|-------|-------|-------|
| 加密存储 | ✅ | ✅ | ✅ |
| 动态密钥 | ✅ | ✅ | ✅ |
| 代码混淆 | ✅ | ✅ | ✅ |
| 反调试 | ❌ | ✅ | ✅ |
| 完整性检查 | ❌ | ✅ | ✅ |
| 内存保护 | ❌ | ✅ | ✅ |
| C++ 扩展 | ❌ | ❌ | ✅ |
| 机器绑定 | ❌ | ❌ | ✅ |
| 服务端执行 | ❌ | ❌ | ✅ |

---

## 📞 技术支持

遇到问题时，查看：

1. **需求文档**：`docs/offline-build/skill-security-requirements.md`
2. **设计文档**：`docs/offline-build/skill-security-design.md`
3. **实现指南**：`docs/offline-build/skill-security-implementation.md`

---

## ✅ 快速检查

开始实施前，确保：

- [ ] 已备份现有代码
- [ ] 已阅读需求文档
- [ ] 已阅读设计文档
- [ ] 已准备好测试环境

---

**文档结束**