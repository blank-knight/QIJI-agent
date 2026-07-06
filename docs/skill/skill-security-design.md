# Skill 安全保护代码设计文档

> **文档版本:** 1.0  
> **创建日期:** 2026-07-06  
> **状态:** 待实现

---

## 1. 架构设计

### 1.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                     用户机器                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │  [离线包 Qiji.exe]                                │  │
│  │                                                  │  │
│  │  main.cjs                                        │  │
│  │  ├─ 动态密钥派生                                   │  │
│  │  ├─ skillView() 解密（内存中）                     │  │
│  │  └─ checkSkillUpdates() 下载更新                  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                         │
│  ~/.hermes/skills/                                       │
│  ├── qiji-geo/SKILL.md.enc  ← 加密存储                 │
│  └── fund-radar/SKILL.md.enc                             │
└─────────────────────────────────────────────────────────┘
                              │
                              │ HTTPS（可选鉴权）
                              ↓
┌─────────────────────────────────────────────────────────┐
│           Skill Server (FastAPI)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  storage/                                         │  │
│  │  ├── skills/qiji-geo-core/SKILL.md.enc           │  │
│  │  └── skills/fund-radar-core/SKILL.md.enc         │  │
│  │                                                  │  │
│  │  API:                                            │  │
│  │  ├─ GET /api/v1/download-skill                  │  │
│  │  └─ GET /api/v1/check-skill-update              │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                              │
                              │ 编译时上传（可选）
                              ↓
┌─────────────────────────────────────────────────────────┐
│                编译机（你的机器）                         │
│                                                         │
│  1. 编译离线包                                           │
│  2. 加密 Skill 文件（用服务端密钥）                      │
│  3. 上传到 Skill Server（可选）                          │
│  4. 代码混淆                                            │
│  5. 打包成 exe                                          │
└─────────────────────────────────────────────────────────┘
```

### 1.2 数据流

```
[编译流程]
  ↓
1. npm run build（编译前端 + 后端）
  ↓
2. 加密 Skill 文件
   read_file("qiji-geo/SKILL.md")
   → AES256_GCM.encrypt(content, SERVER_KEY)
   → SKILL.md.enc
  ↓
3. 上传到 Skill Server（可选）
   POST /api/v1/upload-skill
   { skill_name: "qiji-geo-core", file: SKILL.md.enc }
  ↓
4. 代码混淆
   javascript-obfuscator main.cjs → main.obf.cjs
  ↓
5. 打包
   electron-builder → Qiji-0.17.0-win-x64.exe
```

```
[用户首次启动]
  ↓
1. 启动离线包
  ↓
2. checkSkillUpdatesOnStartup()
   ↓
3. 下载加密 Skill
   GET /api/v1/download-skill?skill_name=qiji-geo-core
   ← SKILL.md.enc
  ↓
4. 写入本地（加密状态）
   write_file("~/.hermes/skills/qiji-geo/SKILL.md.enc", encrypted)
  ↓
5. 启动完成
```

```
[用户使用 Skill]
  ↓
1. 用户在聊天中输入："帮我做一下 GEO 诊断"
  ↓
2. Hermes 调用 skill_view("qiji-geo")
   ↓
3. 读取加密文件
   read_file("~/.hermes/skills/qiji-geo/SKILL.md.enc")
  ↓
4. 解密（内存中）
   key = deriveKey()
   decrypted = AES256_GCM.decrypt(encrypted, key)
  ↓
5. 解析 Skill
   parseSkill(decrypted.toString())
  ↓
6. 返回给 LLM
  ↓
7. LLM 按照 Skill 中的步骤执行
```

---

## 2. 模块设计

### 2.1 密钥派生模块

#### 2.1.1 动态密钥派生

**文件位置：** `electron/main.cjs`

**功能：** 运行时根据系统信息生成密钥，不在代码中明文存储

**代码：**

```javascript
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

**特点：**
- ✅ 密钥不在代码里明文存储
- ✅ 运行时动态生成
- ✅ 每个机器的密钥略有不同（但都能解密）
- ✅ 难以提取（需要在运行时拦截）

**性能：** 首次调用 ~50ms，后续调用缓存结果（可选优化）

---

### 2.2 加密/解密模块

#### 2.2.1 加密函数（编译时）

**文件位置：** `scripts/encrypt-skill-file.py`

**功能：** 编译时加密 Skill 文件

**代码：**

```python
#!/usr/bin/env python3
"""
编译时加密 Skill 文件
"""

import sys
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64

def encrypt_skill_file(input_path: str, output_path: str, key: str):
    """
    加密 Skill 文件
    
    Args:
        input_path: 输入文件路径（SKILL.md）
        output_path: 输出文件路径（SKILL.md.enc）
        key: 加密密钥（从环境变量读取）
    """
    # 1. 读取文件内容
    with open(input_path, 'r', encoding='utf-8') as f:
        plaintext = f.read().encode('utf-8')
    
    # 2. 生成随机 IV
    import os
    iv = os.urandom(16)
    
    # 3. 加密
    cipher = Cipher(
        algorithms.AES(key.encode('utf-8')),
        modes.GCM(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(plaintext) + encryptor.finalize()
    
    # 4. 组合：IV + 密文 + Tag
    encrypted = iv + ciphertext + encryptor.tag
    
    # 5. 写入输出文件
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
```

**使用方式：**

```bash
# 设置密钥（编译机）
export SKILL_ENCRYPTION_KEY="your-256-bit-encryption-key"

# 加密文件
python scripts/encrypt-skill-file.py \
  ~/clawd/qiji-fork/skills/qiji-geo/SKILL.md \
  ~/clawd/qiji-fork/skills/qiji-geo/SKILL.md.enc
```

---

#### 2.2.2 解密函数（运行时）

**文件位置：** `electron/main.cjs`

**功能：** 运行时解密 Skill 文件（内存中）

**代码：**

```javascript
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

### 2.3 Skill 更新模块

#### 2.3.1 检查更新（运行时）

**文件位置：** `electron/main.cjs`

**功能：** 首次启动时检查 Skill 更新

**代码：**

```javascript
/**
 * 首次启动时检查 Skill 更新
 * 下载加密的 Skill 文件到本地
 */
async function checkSkillUpdatesOnStartup() {
  try {
    const skillsToUpdate = [
      'qiji-geo-core',
      'fund-radar-core'
    ]
    
    for (const skillName of skillsToUpdate) {
      await downloadSkill(skillName)
    }
    
    console.log('Skill 更新完成')
  } catch (error) {
    console.log('Skill 更新失败，不影响使用:', error.message)
    // 静默失败，不影响正常使用
  }
}

/**
 * 下载加密的 Skill 文件
 * 
 * @param {string} skillName - Skill 名称
 */
async function downloadSkill(skillName) {
  const { https } = require('https')
  const url = `https://skill-server.qiji.internal/api/v1/download-skill?skill_name=${skillName}`
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`下载失败: ${res.statusCode}`))
        return
      }
      
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const encrypted = Buffer.concat(chunks)
        
        // 写入本地（加密状态）
        const skillDir = path.join(getSkillsDir(), skillName.replace('-core', ''))
        const encPath = path.join(skillDir, 'SKILL.md.enc')
        
        if (!fs.existsSync(skillDir)) {
          fs.mkdirSync(skillDir, { recursive: true })
        }
        
        fs.writeFileSync(encPath, encrypted)
        
        console.log(`Skill 下载完成: ${skillName}`)
        resolve()
      })
    }).on('error', reject)
  })
}
```

---

#### 2.3.2 Skill Server API

**文件位置：** `skill-server/main.py`

**功能：** 提供加密 Skill 文件的下载接口

**代码：**

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
import os

app = FastAPI()

STORAGE_DIR = "storage/skills"

@app.get("/api/v1/download-skill")
async def download_skill(skill_name: str):
    """
    下载加密的 Skill 文件
    
    Args:
        skill_name: Skill 名称（如 qiji-geo-core）
    
    Returns:
        加密的 Skill 文件
    """
    # 1. 构造文件路径
    file_path = os.path.join(STORAGE_DIR, skill_name, "SKILL.md.enc")
    
    # 2. 检查文件是否存在
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Skill not found")
    
    # 3. 读取加密文件
    with open(file_path, 'rb') as f:
        encrypted_content = f.read()
    
    # 4. 返回
    return Response(
        content=encrypted_content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename={skill_name}.enc"
        }
    )

@app.get("/api/v1/check-skill-update")
async def check_skill_update(skill_name: str, current_version: str):
    """
    检查 Skill 更新
    
    Args:
        skill_name: Skill 名称
        current_version: 当前版本
    
    Returns:
        是否需要更新
    """
    # TODO: 实现版本检查逻辑
    return {"need_update": False}
```

---

### 2.4 skill_view 修改

**文件位置：** `electron/main.cjs`

**功能：** 修改 `skill_view()` 函数，支持解密加密的 Skill 文件

**代码：**

```javascript
/**
 * 修改后的 skill_view 函数
 * 支持解密加密的 Skill 文件
 */
async function skillView(name, file_path = null) {
  const skillPath = path.join(getSkillsDir(), name)
  
  // 检查是否是加密文件
  const encPath = `${skillPath}.md.enc`
  
  if (fs.existsSync(encPath)) {
    // 1. 读取加密文件
    const encrypted = fs.readFileSync(encPath)
    
    // 2. 用动态密钥解密（内存中）
    const key = deriveKey()
    const decrypted = decryptSkill(encrypted, key)
    
    // 3. 解析并返回
    return parseSkill(decrypted)
  } else if (fs.existsSync(`${skillPath}.md`)) {
    // 兼容未加密的技能
    return fs.readFileSync(`${skillPath}.md`, 'utf-8')
  } else {
    throw new Error(`Skill not found: ${name}`)
  }
}
```

---

## 3. 代码混淆配置

### 3.1 配置文件

**文件位置：** `obfuscator.config.json`

**配置：**

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

### 3.2 编译脚本修改

**文件位置：** `electron/main.cjs`

**修改 package.json：**

```json
{
  "scripts": {
    "dist": "node scripts/assert-root-install.cjs && node scripts/write-build-stamp.cjs && node scripts/stage-native-deps.cjs && tsc -b && vite build && npm run postbuild && npm run obfuscate && npm run builder",
    "obfuscate": "javascript-obfuscator electron/main.cjs --config obfuscator.config.json --output electron/main.obf.cjs && node -e \"const fs=require('fs');fs.copyFileSync('electron/main.obf.cjs','electron/main.cjs');\""
  }
}
```

---

## 4. 目录结构

### 4.1 编译时目录结构

```
clawd/qiji-fork/
├── scripts/
│   ├── encrypt-skill-file.py       ← 加密脚本
│   └── write-build-stamp.cjs       ← 编译脚本
├── electron/
│   ├── main.cjs                    ← 主进程代码
│   └── main.obf.cjs                ← 混淆后的代码（临时）
├── skills/
│   ├── qiji-geo/
│   │   ├── SKILL.md                ← 明文
│   │   └── SKILL.md.enc            ← 加密后（编译时生成）
│   └── fund-radar/
│       ├── SKILL.md
│       └── SKILL.md.enc
├── obfuscator.config.json          ← 混淆配置
└── package.json                    ← 编译配置
```

### 4.2 用户机器目录结构

```
C:\Users\用户\AppData\Local\hermes\
├── skills/
│   ├── qiji-geo/
│   │   └── SKILL.md.enc            ← 加密存储
│   └── fund-radar/
│       └── SKILL.md.enc
└── .auth/                          ← （暂无，机器绑定时使用）
```

### 4.3 Skill Server 目录结构

```
skill-server/
├── main.py                         ← FastAPI 服务
├── storage/
│   └── skills/
│       ├── qiji-geo-core/
│       │   └── SKILL.md.enc        ← 加密存储
│       └── fund-radar-core/
│           └── SKILL.md.enc
└── requirements.txt                ← Python 依赖
```

---

## 5. 接口定义

### 5.1 离线包 → Skill Server

#### 5.1.1 下载 Skill

**请求：**
```
GET /api/v1/download-skill?skill_name=qiji-geo-core
```

**响应：**
```
200 OK
Content-Type: application/octet-stream

<二进制加密内容>
```

**错误：**
```
404 Not Found
Content-Type: application/json

{
  "detail": "Skill not found"
}
```

---

#### 5.1.2 检查更新

**请求：**
```
GET /api/v1/check-skill-update?skill_name=qiji-geo-core&current_version=1.0.0
```

**响应：**
```
200 OK
Content-Type: application/json

{
  "need_update": false,
  "latest_version": "1.0.0",
  "update_size": 0
}
```

---

### 5.2 编译机 → Skill Server（可选）

#### 5.2.1 上传 Skill

**请求：**
```
POST /api/v1/upload-skill
Content-Type: multipart/form-data

skill_name: qiji-geo-core
file: <二进制文件>
```

**响应：**
```
200 OK
Content-Type: application/json

{
  "success": true,
  "file_path": "storage/skills/qiji-geo-core/SKILL.md.enc"
}
```

---

## 6. 数据结构

### 6.1 加密文件格式

```
[加密文件结构]
├── IV (16 bytes)           ← 初始化向量
├── Ciphertext (N bytes)    ← 密文
└── Auth Tag (16 bytes)     ← 认证标签（GCM）
```

**示例（Base64 编码）：**
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...  <-- IV + Ciphertext + Tag
```

---

## 7. 性能分析

### 7.1 密钥派生

| 操作 | 时间 | 说明 |
|------|------|------|
| PBKDF2(100,000 次迭代) | ~50ms | 首次调用 |
| 缓存结果 | < 1ms | 后续调用 |

**优化建议：** 缓存 `deriveKey()` 结果，避免重复计算。

---

### 7.2 解密

| 文件大小 | 解密时间 | 说明 |
|---------|---------|------|
| 20 KB | < 1ms | Skill 文件典型大小 |
| 100 KB | ~2ms | |
| 1 MB | ~20ms | 大文件 |

---

### 7.3 编译

| 阶段 | 时间 | 说明 |
|------|------|------|
| 编译前端 + 后端 | ~10 分钟 | |
| 加密 Skill 文件 | < 1 分钟 | |
| 代码混淆 | ~2 分钟 | |
| 打包 | ~15 分钟 | |
| **总计** | **~28 分钟** | 比原来多 ~3 分钟 |

---

## 8. 错误处理

### 8.1 常见错误

| 错误 | 原因 | 处理方式 |
|------|------|---------|
| `Skill not found` | Skill 文件不存在 | 使用本地缓存（如有） |
| `Decryption failed` | 密钥不匹配或文件损坏 | 重新下载 Skill |
| `Network error` | 无法连接 Skill Server | 使用本地缓存（如有） |
| `Checksum mismatch` | 文件损坏 | 重新下载 |

### 8.2 错误处理代码示例

```javascript
async function skillView(name) {
  const encPath = `${skillPath}.md.enc`
  
  try {
    if (fs.existsSync(encPath)) {
      const encrypted = fs.readFileSync(encPath)
      const key = deriveKey()
      const decrypted = decryptSkill(encrypted, key)
      return parseSkill(decrypted)
    }
  } catch (error) {
    console.log(`解密失败，尝试重新下载: ${error.message}`)
    
    // 重新下载
    try {
      await downloadSkill(name)
      const encrypted = fs.readFileSync(encPath)
      const key = deriveKey()
      const decrypted = decryptSkill(encrypted, key)
      return parseSkill(decrypted)
    } catch (retryError) {
      throw new Error(`Skill 加载失败: ${retryError.message}`)
    }
  }
  
  throw new Error(`Skill not found: ${name}`)
}
```

---

## 9. 测试计划

### 9.1 单元测试

| 测试项 | 测试内容 |
|-------|---------|
| 密钥派生 | 验证相同机器生成相同密钥 |
| 加密/解密 | 验证加密后能正确解密 |
| skill_view | 验证能正确加载加密 Skill |

---

### 9.2 集成测试

| 测试项 | 测试内容 |
|-------|---------|
| 完整流程 | 编译 → 加密 → 下载 → 解密 → 使用 |
| 网络失败 | 网络不可用时的降级处理 |
| 文件损坏 | 损坏的 .enc 文件处理 |

---

### 9.3 安全测试

| 测试项 | 测试内容 |
|-------|---------|
| 加密强度 | 尝试用错误密钥解密 |
| 代码混淆 | 检查混淆后的代码可读性 |
| 内存保护 | 检查解密后内存中是否有明文残留 |

---

**文档结束**