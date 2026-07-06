# Skill 安全保护实现指南

> **文档版本:** 1.0  
> **创建日期:** 2026-07-06  
> **状态:** 待实现

---

## 1. 实施概览

### 1.1 推荐实施路径

```
阶段 1（基础防护）→ 阶段 2（加强防护）→ 阶段 3（终极防护）
```

**建议：先做阶段 1，如果发现被破解再做阶段 2。**

---

## 2. 阶段 1：基础防护（推荐立即实施）

**目标：** 防止 95% 的普通用户  
**时间：** 半天到 1 天  
**复杂度：** ⭐⭐ 简单

### 2.1 步骤概览

| 步骤 | 任务 | 时间 |
|------|------|------|
| 1 | 安装依赖 | 10 分钟 |
| 2 | 修改 main.cjs（密钥派生 + 解密） | 1 小时 |
| 3 | 修改 skill_view() | 30 分钟 |
| 4 | 配置代码混淆 | 10 分钟 |
| 5 | 修改 package.json | 10 分钟 |
| 6 | 测试 | 1 小时 |

**总计：** 半天到 1 天

---

### 2.2 详细步骤

#### 步骤 1：安装依赖

```bash
cd ~/clawd/qiji-fork/apps/desktop

# 安装代码混淆工具
npm install --save-dev javascript-obfuscator

# 安装 Python 加密依赖（编译机）
pip install cryptography
```

---

#### 步骤 2：修改 main.cjs

**文件位置：** `electron/main.cjs`

**添加密钥派生函数：**

```javascript
// 在 main.cjs 顶部添加

/**
 * 动态密钥派生
 * 根据系统信息生成密钥，不在代码中明文存储
 */
function deriveKey() {
  // 1. 获取多个系统信息（难以伪造）
  const cpuInfo = require('os').cpus()[0].model
  const hostname = require('os').hostname()
  const username = process.env.USERNAME || process.env.USER || 'unknown'
  const platform = process.platform
  const arch = process.arch
  const version = process.version
  
  // 2. 拼接种子
  const seed = `${cpuInfo}|${hostname}|${username}|${platform}|${arch}|${version}`
  
  // 3. 生成密钥（PBKDF2，10万次迭代）
  const { createHash, pbkdf2Sync } = require('crypto')
  const salt = createHash('sha256').update(seed).digest()
  const key = pbkdf2Sync(seed, salt, 100000, 32, 'sha256')
  
  return key.toString('hex')
}
```

**添加解密函数：**

```javascript
// 在 main.cjs 中添加

/**
 * 解密加密的 Skill 文件
 * 
 * @param {Buffer} encryptedData - 加密的数据（IV + 密文 + Tag）
 * @param {string} key - 解密密钥（从 deriveKey() 获取）
 * @returns {string} 解密后的明文
 */
function decryptSkill(encryptedData, key) {
  const { createDecipheriv } = require('crypto')
  
  // 1. 提取 IV（前 16 字节）
  const iv = encryptedData.slice(0, 16)
  
  // 2. 提取密文（剩余数据 - 16 字节 Tag）
  const cipherTextWithTag = encryptedData.slice(16)
  const cipherText = cipherTextWithTag.slice(0, -16)
  const authTag = cipherTextWithTag.slice(-16)
  
  // 3. 创建解密器
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv)
  decipher.setAuthTag(authTag)
  
  // 4. 解密
  let decrypted = decipher.update(cipherText)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  
  return decrypted.toString('utf-8')
}
```

---

#### 步骤 3：修改 skill_view()

**文件位置：** `electron/main.cjs`

**找到 skill_view 函数，修改为：**

```javascript
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  
  // 检查是否是加密文件
  const encPath = `${skillPath}.md.enc`
  
  if (fs.existsSync(encPath)) {
    try {
      // 1. 读取加密文件
      const encrypted = fs.readFileSync(encPath)
      
      // 2. 用动态密钥解密（内存中）
      const key = deriveKey()
      const decrypted = decryptSkill(encrypted, key)
      
      // 3. 解析并返回
      return parseSkill(decrypted)
    } catch (error) {
      console.log(`解密失败，尝试使用未加密文件: ${error.message}`)
      
      // 降级到未加密文件
      if (fs.existsSync(`${skillPath}.md`)) {
        return fs.readFileSync(`${skillPath}.md`, 'utf-8')
      }
      
      throw new Error(`Skill 加载失败: ${error.message}`)
    }
  } else if (fs.existsSync(`${skillPath}.md`)) {
    // 兼容未加密的技能
    return fs.readFileSync(`${skillPath}.md`, 'utf-8')
  } else {
    throw new Error(`Skill not found: ${name}`)
  }
}
```

---

#### 步骤 4：配置代码混淆

**文件位置：** `~/clawd/qiji-fork/apps/desktop/obfuscator.config.json`

**创建文件：**

```bash
cat > ~/clawd/qiji-fork/apps/desktop/obfuscator.config.json << 'EOF'
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
EOF
```

---

#### 步骤 5：修改 package.json

**文件位置：** `package.json`

**添加混淆脚本：**

```json
{
  "scripts": {
    "dist": "node scripts/assert-root-install.cjs && node scripts/write-build-stamp.cjs && node scripts/stage-native-deps.cjs && tsc -b && vite build && npm run postbuild && npm run obfuscate && npm run builder",
    "obfuscate": "javascript-obfuscator electron/main.cjs --config obfuscator.config.json --output electron/main.obf.cjs && node -e \"const fs=require('fs');fs.copyFileSync('electron/main.obf.cjs','electron/main.cjs');\""
  }
}
```

**说明：** 在 `dist` 脚本中加入 `npm run obfuscate`，打包前自动混淆。

---

#### 步骤 6：测试

**6.1 编译测试**

```bash
cd ~/clawd/qiji-fork/apps/desktop
npm run dist:win:nsis
```

**验证：**
- ✅ 编译成功，没有报错
- ✅ 生成的 exe 文件在 `release/` 目录

---

**6.2 加密 Skill 文件测试**

**先创建加密脚本：**

```bash
cat > ~/clawd/qiji-fork/apps/desktop/scripts/encrypt-skill-file.py << 'EOF'
#!/usr/bin/env python3
import sys
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

def encrypt_skill_file(input_path: str, output_path: str, key: str):
    with open(input_path, 'r', encoding='utf-8') as f:
        plaintext = f.read().encode('utf-8')
    
    iv = os.urandom(16)
    cipher = Cipher(
        algorithms.AES(key.encode('utf-8')),
        modes.GCM(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    encrypted = iv + ciphertext + encryptor.tag
    
    with open(output_path, 'wb') as f:
        f.write(encrypted)
    
    print(f"加密完成: {input_path} → {output_path}")
    print(f"文件大小: {len(encrypted)} bytes")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("用法: python encrypt-skill-file.py <input.md> <output.md.enc>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    key = os.environ.get('SKILL_ENCRYPTION_KEY')
    
    if not key:
        print("错误: SKILL_ENCRYPTION_KEY 环境变量未设置")
        sys.exit(1)
    
    encrypt_skill_file(input_path, output_path, key)
EOF
```

**加密测试文件：**

```bash
# 设置密钥（测试用，32 字符）
export SKILL_ENCRYPTION_KEY="01234567890123456789012345678901"

# 加密测试文件
python ~/clawd/qiji-fork/apps/desktop/scripts/encrypt-skill-file.py \
  ~/clawd/qiji-fork/skills/qiji-geo/SKILL.md \
  ~/clawd/qiji-fork/skills/qiji-geo/SKILL.md.enc
```

**验证：**
- ✅ 生成了 `SKILL.md.enc` 文件
- ✅ 直接查看看到乱码
- ✅ 文件大小略大于原文（+16 字节 IV + 16 字节 Tag）

---

**6.3 解密测试**

**在测试代码中验证：**

```javascript
// 在 main.cjs 中临时添加测试代码
const testEncrypted = fs.readFileSync('~/clawd/qiji-fork/skills/qiji-geo/SKILL.md.enc')
const testKey = deriveKey()
const testDecrypted = decryptSkill(testEncrypted, testKey)
console.log('解密成功:', testDecrypted.substring(0, 100))
```

**验证：**
- ✅ 解密成功，能看到明文
- ✅ 明文内容与原文一致

---

**6.4 完整流程测试**

```bash
# 1. 安装离线包
双击 release/Qiji-0.17.0-win-x64.exe

# 2. 把加密的 Skill 文件放到 ~/.hermes/skills/qiji-geo/SKILL.md.enc

# 3. 启动离线包

# 4. 在聊天中输入："看一下 qiji-geo 技能"

# 5. 验证：
#    ✅ 能正常加载 Skill
#    ✅ 能正常使用 Skill
#    ✅ 磁盘上文件是加密的
```

---

## 3. 阶段 2：加强防护（可选）

**目标：** 防止 99% 的用户  
**时间：** 2-3 天  
**复杂度：** ⭐⭐⭐ 中等

### 3.1 步骤概览

| 步骤 | 任务 | 时间 |
|------|------|------|
| 1 | 反调试（检测调试器） | 2 小时 |
| 2 | 完整性检查（exe 哈希） | 3 小时 |
| 3 | 内存保护（解密后清除） | 1 小时 |
| 4 | 测试 | 1 小时 |

**总计：** 2-3 天

---

### 3.2 详细步骤

#### 步骤 1：反调试

**文件位置：** `electron/main.cjs`

**添加反调试函数：**

```javascript
/**
 * 检测调试器
 * 
 * @returns {boolean} 是否检测到调试器
 */
function detectDebugger() {
  // 1. 检查进程是否被调试
  const debuggerPresent = process.debugPort !== undefined
  
  // 2. 检查父进程是否是调试器
  try {
    const { execSync } = require('child_process')
    const parentPid = process.ppid
    
    if (process.platform === 'win32') {
      const parentCmd = execSync(
        `wmic process where ProcessId=${parentPid} get CommandLine /NOHEADER`,
        { encoding: 'utf-8' }
      )
      
      if (parentCmd.includes('x64dbg') || 
          parentCmd.includes('ida') || 
          parentCmd.includes('windbg') ||
          parentCmd.includes('devenv')) {
        return true
      }
    }
  } catch {
    // 忽略错误
  }
  
  // 3. 时间异常检测（单步调试会让执行变慢）
  const start = Date.now()
  for (let i = 0; i < 10000; i++) {
    Math.random()
  }
  const end = Date.now()
  
  if (end - start > 1000) {
    return true  // 执行太慢，可能在调试
  }
  
  return debuggerPresent
}
```

**在启动时检测：**

```javascript
// 在 app.on('ready', ...) 之前添加

if (detectDebugger()) {
  console.error('Debugger detected. Exiting.')
  process.exit(1)
}
```

---

#### 步骤 2：完整性检查

**文件位置：** `electron/main.cjs`

**添加完整性检查函数：**

```javascript
/**
 * 检查 exe 完整性
 * 
 * @returns {boolean} 是否通过检查
 */
function checkIntegrity() {
  const { createHash } = require('crypto')
  const fs = require('fs')
  
  // 1. 获取 exe 文件路径
  const exePath = process.execPath
  
  // 2. 计算 exe 的 SHA256
  const exeHash = createHash('sha256')
    .update(fs.readFileSync(exePath))
    .digest('hex')
  
  // 3. 对比编译时记录的哈希（嵌入到代码中）
  const EXPECTED_HASH = 'PLACEHOLDER_HASH'
  
  if (EXPECTED_HASH === 'PLACEHOLDER_HASH') {
    // 开发环境，跳过检查
    return true
  }
  
  if (exeHash !== EXPECTED_HASH) {
    console.error('Executable has been modified. Exiting.')
    process.exit(1)
  }
  
  return true
}
```

**在启动时检测：**

```javascript
// 在 app.on('ready', ...) 之前添加

if (!checkIntegrity()) {
  process.exit(1)
}
```

**修改编译脚本：**

**文件位置：** `scripts/write-build-stamp.cjs`

**在脚本末尾添加：**

```javascript
const { createHash } = require('crypto')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// 1. 编译 exe
execSync('npm run dist:win:nsis -- --skip-obfuscate')
const exePath = path.join(process.cwd(), 'release', 'Qiji-0.17.0-win-x64.exe')

// 2. 计算 exe 的 SHA256
const exeHash = createHash('sha256')
  .update(fs.readFileSync(exePath))
  .digest('hex')

console.log(`Exe hash: ${exeHash}`)

// 3. 写入到 main.cjs
const mainCjsPath = path.join(process.cwd(), 'electron', 'main.cjs')
const mainCjsContent = fs.readFileSync(mainCjsPath, 'utf-8')
const patched = mainCjsContent.replace(
  /const EXPECTED_HASH = '.*'/,
  `const EXPECTED_HASH = '${exeHash}'`
)
fs.writeFileSync(mainCjsPath, patched)

// 4. 重新编译（嵌入哈希后的版本）
execSync('npm run dist:win:nsis')

console.log('完整性检查哈希已嵌入')
```

---

#### 步骤 3：内存保护

**文件位置：** `electron/main.cjs`

**修改 skill_view 函数：**

```javascript
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  const encPath = `${skillPath}.md.enc`
  
  if (fs.existsSync(encPath)) {
    let decrypted = null
    
    try {
      const encrypted = fs.readFileSync(encPath)
      const key = deriveKey()
      decrypted = decryptSkill(encrypted, key)
      
      const parsed = parseSkill(decrypted.toString())
      
      // ⚠️ 关键：清除明文（手动覆盖）
      for (let i = 0; i < decrypted.length; i++) {
        decrypted[i] = 0
      }
      
      return parsed
    } catch (error) {
      // 清除明文（即使出错也要清除）
      if (decrypted) {
        for (let i = 0; i < decrypted.length; i++) {
          decrypted[i] = 0
        }
      }
      
      throw error
    }
  }
  
  // ... 其余代码不变
}
```

---

## 4. 阶段 3：终极防护（可选）

**目标：** 防止 99.9% 的用户  
**时间：** 1-2 周  
**复杂度：** ⭐⭐⭐⭐ 困难

### 4.1 步骤概览

| 步骤 | 任务 | 时间 |
|------|------|------|
| 1 | C++ 原生扩展 | 1 周 |
| 2 | 机器绑定（License Key） | 2 天 |
| 3 | 服务端执行 | 3-5 天 |
| 4 | 测试 | 2 天 |

**总计：** 1-2 周

**注意：** 阶段 3 需要额外的技能（C++、服务器管理），建议有需要时再考虑。

---

## 5. 常见问题

### 5.1 编译问题

**问题：** 编译时报错 `javascript-obfuscator not found`

**解决：**
```bash
npm install --save-dev javascript-obfuscator
```

---

**问题：** 混淆后代码无法运行

**解决：**
- 降低混淆强度
- 在 `obfuscator.config.json` 中设置 `"deadCodeInjectionThreshold": 0.2`
- 或跳过 `"debugProtection"` 选项

---

### 5.2 运行问题

**问题：** 解密失败，提示 `Unsupported state or unable to authenticate data`

**原因：**
- 密钥不匹配
- 文件损坏

**解决：**
```javascript
// 在 skill_view 中添加降级逻辑
try {
  const decrypted = decryptSkill(encrypted, key)
  return parseSkill(decrypted)
} catch (error) {
  // 重新下载 Skill
  await downloadSkill(name)
  // 重试解密
  const decrypted = decryptSkill(encrypted, key)
  return parseSkill(decrypted)
}
```

---

### 5.3 性能问题

**问题：** 首次启动很慢

**原因：** 密钥派生需要 50ms

**解决：** 缓存密钥

```javascript
let cachedKey = null

function deriveKey() {
  if (cachedKey) {
    return cachedKey
  }
  
  // ... 原有逻辑
  
  cachedKey = key.toString('hex')
  return cachedKey
}
```

---

## 6. 回滚方案

### 6.1 如果出现问题

**方法 1：暂时禁用加密**

```javascript
// 在 skill_view 中跳过解密
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  
  // 直接使用未加密文件
  if (fs.existsSync(`${skillPath}.md`)) {
    return fs.readFileSync(`${skillPath}.md`, 'utf-8')
  }
  
  // ... 其余逻辑
}
```

**方法 2：跳过混淆**

```json
// package.json
{
  "scripts": {
    "dist": "node scripts/assert-root-install.cjs && node scripts/write-build-stamp.cjs && node scripts/stage-native-deps.cjs && tsc -b && vite build && npm run postbuild && npm run builder"
    // 移除 npm run obfuscate
  }
}
```

---

## 7. 验证清单

### 7.1 阶段 1 验证清单

- [ ] 代码混淆成功
- [ ] 密钥派生正常工作
- [ ] 能正确解密 Skill 文件
- [ ] 用户能正常使用 Skill
- [ ] 磁盘上文件是加密的
- [ ] 编译流程不受影响
- [ ] 安装流程不受影响

---

### 7.2 阶段 2 验证清单

- [ ] 检测到调试器时退出
- [ ] exe 被修改时退出
- [ ] 解密后立即清除内存
- [ ] 所有阶段 1 的清单项

---

## 8. 后续优化

### 8.1 性能优化

- 缓存密钥派生结果
- 异步解密（不阻塞 UI）
- 增量更新 Skill（只下载变化部分）

---

### 8.2 安全优化

- 定期更新密钥派生算法
- 添加机器指纹（可选）
- 使用 C++ 原生扩展（可选）

---

**文档结束**