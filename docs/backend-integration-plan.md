# 后端联动改造方案

> 状态：讨论中，待确认细节
> 日期：2026-07-29
> 分支：feat/backend-integration
> 相关文档：~/clawd/qiji-backend/客户端改动清单.md、~/clawd/qiji-backend/API设计文档_v1.md

---

## 一、背景

奇计桌面端（基于 Hermes Agent）要与后端服务器联动，实现账号体系、额度管理、统一 API Key 下发。

**只改 Hermes 桌面端**，geo-client.py 控制 auth helper.exe 的部分不管。

---

## 二、确认的设计决策

### 2.1 登录方式

- **登录账号**：username（用户名），不是手机号
- **登录请求**：`POST /api/client/v1/auth/login`，请求体 `{username, password}`
- **登录不需要短信验证**，注册时才需要填手机号 + 短信验证码
- 注：之前的聊天记录里某个 AI 提到"后端用 mobile"，但 API 设计文档 L183-187 明确写的是 username，以文档为准

### 2.2 引导页和设置页

**默认全部隐藏，只有后端明确授权才显示。**

**引导页（OnboardingOverlay）：** 永不弹（不管 is_custom_key 是什么值）

**设置页隐藏 3 个入口（is_custom_key=0 时）：**
| 入口 | 组件 | 隐藏理由 |
|------|------|---------|
| 设置 → 模型 | `model-settings.tsx` | 选默认模型/reasoning/service tier |
| 设置 → 提供方 | `providers-settings.tsx` | 加/删 provider、OAuth 连接 |
| 设置 → 密钥 | `keys-settings.tsx` | 直接填 env var 形式的 key |

**模型选择器（composer 内）：** is_custom_key=0 时也隐藏，不能手动切模型。

**唯一例外：** 后端返回 `is_custom_key=1` 的用户，以上 4 项全部正常显示，跟现在一样。

实现要点：设置页导航是数据驱动的（[settings/index.tsx](file:///c:/Users/GBJ-1094/Desktop/code/QIJI-agent/apps/desktop/src/app/settings/index.tsx) 的 `SETTINGS_VIEWS` 数组 + `SECTIONS`），按 `is_custom_key` 过滤即可，不用改各组件内部。

### 2.3 登录界面位置

桌面端内建登录页。用户启动后先看到登录界面，输账号密码后才进入主界面。

### 2.4 启动流程（方案 A）

登录页与 gateway 启动并行，用户感知更快：

```
桌面端启动
  → Electron main 进程启动 gateway（后台并行）
  → 同时检查本地有没有存有效登录 token（未过 30 天保质期）
      ├ 有 token → 跳过登录页，直接进主界面
      │   └ 启动时用存的 api_key 自动配好 LLM
      └ 没 token → 显示登录页（覆盖层，比所有东西都顶层）
          ├ 用户输 username + password
          ├ 调 POST /api/client/v1/auth/login
          ├ 成功 → 存 token + api_key + is_custom_key + score
          │   └ 关闭登录页，进主界面
          └ 失败 → 显示错误，留在登录页

  → 引导页：永远不弹（从代码里移除或禁用）
  → 设置页：根据 is_custom_key 动态显示
      ├ is_custom_key=0 → 隐藏 ModelSettings、ProvidersSettings、KeysSettings
      └ is_custom_key=1 → 正常显示（跟现在一样）
```

### 2.5 api_key 与 score 的关系

**api_key = 用什么钥匙开门（谁的账户在付费 LLM）**
- is_custom_key=0 的用户没有自己的 key
- 后端沿代理链（用户→代理→贴牌→总后台）往上找第一个有 key 的，下发
- 多个用户共用同一把代理的 key
- 一个代理有多个 key 时怎么分配是后端的业务逻辑，客户端不关心

**score = 你能用多少（额度）**
- 每次调 LLM 消耗 token，后端从 score 扣
- 扣完就不能用，弹窗提示充值
- 体验用户 score 很少（如 10），正式用户由代理充值

两种 token 的区分：
- 登录 token = 通行证，有 7 天保质期，用于调后端 API 的鉴权
- LLM token = 文本计量单位，每次调 LLM 消耗，后端用 score 计量

**边界情况：代理链全无 key**
- 后端沿代理链往上找 key，理论上存在"一路都没 key"的可能
- 客户端处理：登录成功后检查 `api_key` 是否为空（`null` / `""`）
  - 空 → 不进主界面，提示"当前账号未配置 AI 服务，请联系代理/上级开通"
  - 非空 → 正常 `setEnvVar` 配进 gateway，进主界面
- 注意：需跟后端确认登录响应在"无 key"时是返回 `code:1 + api_key:""` 还是 `code:0` 拒绝登录，两种情况客户端都要兜住

### 2.6 用户体验流程

```
用户注册（无邀请码）
  → mode=trial, score=少量
  → 后端下发代理的 api_key
  → 客户端自动配好 LLM，能聊天
  → 每次聊天消耗 token → 后端从 score 扣
  → 扣到 0 → 弹窗"额度不足，联系代理充值"
  → 用户拿到邀请码 → 填进去激活 → 变 formal
  → 联系代理充值 → 代理给 score 充值 → 继续用
```

---

## 三、需要改的文件（任务清单）

> 按依赖顺序排列。每层做完才能做下一层。✅ = 决策已定，可直接动手。

### 第 1 层：认证基础设施（后面所有东西都依赖它）

| # | 文件 | 改什么 | 决策 |
|---|------|--------|------|
| 1.1 | 新建 `lib/backend.ts` | 导出 `BACKEND_BASE_URL`（占位 `http://8.138.58.181`，等 4.1 定了改一行）；导出 `backendFetch()` 包装所有后端请求，自动带 `Authorization: Bearer <token>`，**统一拦截 401 → 清 auth store → 触发登录覆盖层** | 4.2 ✅ 4.4 ✅ |
| 1.2 | 新建 `store/auth.ts` | nanostores atom 管理：`token` / `username` / `is_custom_key` / `mode` / `score` / `loginAt`（时间戳）。持久化到 localStorage（token+loginAt+is_custom_key+mode），score 只存内存。导出 `login(username,password)` / `logout()` / `isAuthenticated()` / `isTokenExpired()`（读 loginAt + 30 天判断） | 4.2 ✅ |
| 1.3 | 新建 `components/login-overlay.tsx` | 顶层覆盖层。username + password + 登录按钮 + 错误提示。底部「注册账号」「忘记密码」两个 `window.open()` 外链。调 `store/auth.ts` 的 `login()`，成功后 `setEnvVar('OPENAI_API_KEY', api_key)` 把 key 推进 gateway，然后关覆盖层 | 4.3 ✅ |
| 1.4 | 改 `app/desktop-controller.tsx` | overlays 栈里加 `<LoginOverlay>`，门控：`!isAuthenticated() \|\| isTokenExpired()` 时显示。**不依赖 gatewayState**（登录调的是后端 HTTP，不走 gateway）。登录页与 gateway 启动并行 | 2.4 ✅ |
| 1.5 | 改 `store/onboarding.ts` | `INITIAL.configured` 永远置 `true`，`firstRunSkipped` 永远置 `true` → 引导页永不弹。保留 gatewayState 门控逻辑（给登录页用） | 2.2 ✅ |

### 第 2 层：按 is_custom_key 隐藏设置入口

| # | 文件 | 改什么 | 决策 |
|---|------|--------|------|
| 2.1 | 改 `app/settings/index.tsx` | `SETTINGS_VIEWS` 和 `SECTIONS` 按 `is_custom_key` 过滤：`=0` 时移除 `config:model`、`providers`、`keys` 三个入口。导航是数据驱动的，不用改组件内部 | 2.2 ✅ |
| 2.2 | 改 `app/chat/composer/model-pill.tsx` | `is_custom_key=0` 时不渲染 ModelPill（或渲染成只读标签，不可点击） | 2.2 ✅ |
| 2.3 | 改 `app/desktop-controller.tsx` | `is_custom_key=0` 时不挂载 `ModelPickerOverlay` / `ModelVisibilityOverlay` | 2.2 ✅ |

### 第 3 层：额度显示 + Token 上报

| # | 文件 | 改什么 | 决策 |
|---|------|--------|------|
| 3.1 | 改 `app/settings/about-settings.tsx` | 加一行"剩余额度：{score}"。组件挂载时调 `GET /api/client/v1/quota` 刷新 score | 4.6 ✅ |
| 3.2 | 新建 `lib/quota-report.ts` | 封装 `reportUsage(model, input_tokens, output_tokens, request_id)` → `POST /api/client/v1/quota/report`。返回 `{remaining_score}` 时更新 `store/auth.ts` 的 score；返回 `{code:0}` 时触发额度不足弹窗 | 4.5 ✅ |
| 3.3 | 改 `app/session/hooks/use-message-stream.ts` | 找到 L819-820 / L923-924 的 `payload?.usage` 处理点，在 `message.end` 事件里追加调用 `reportUsage()`（模型名、token 数从 payload 取） | 4.5 ✅ |
| 3.4 | 改 composer 发送逻辑 | 发消息前预判 `score <= 0` → 直接弹"额度不足，联系代理充值"，不发起 LLM 调用 | 4.5 ✅ |

### 第 4 层：更新机制（优先级低，可后面做）

| # | 文件 | 改什么 |
|---|------|--------|
| 4.1 | 改 `store/updates.ts` | git-based 检查换成 HTTP `GET /api/client/v1/update/check` |

### 实现顺序建议
1. **先做第 1 层**（1.1 → 1.2 → 1.5 → 1.3 → 1.4）—— 基地址先用占位常量，4.1 定了改一行
2. **再做第 2 层**（2.1 → 2.2 → 2.3）—— 能跑通"登录→进主界面→隐藏设置入口"主流程
3. **然后第 3 层**（3.2 → 3.3 → 3.1 → 3.4）—— 额度闭环
4. **最后第 4 层** —— 不阻塞主线

---

## 四、待确认的细节问题（明天讨论）

### 4.1 后端基地址
现在硬编码 `http://8.138.58.181`。写死在代码里？还是可配置？

### 4.2 Token 存储方式
- localStorage（页面刷新不丢，但关浏览器后清除）
- Electron secureStorage / keychain（最安全，但复杂）
- 写入 Hermes 的 config.yaml（持久化，重启不丢）

### 4.3 登录页 UI 范围 ✅ 已定
**主体：** username + password + 登录按钮 + 错误提示
**底部两个外链入口：**
- 「注册账号」→ `window.open()` 打开后端注册页（注册要短信验证码，桌面端不做）
- 「忘记密码」→ `window.open()` 打开后端找回密码页

实现参照现有 onboarding overlay 的外链模式（`docsUrl` + `window.open()`，见 `desktop-onboarding-overlay.tsx` 的 `DocsLink`）。
两个入口的 URL 随 4.1 基地址一起定（现在待定）。

**不做：**
- 不做桌面端内注册（要短信验证码，复杂，丢给网页）
- 不做"记住密码"
- 不做第三方登录（微信/Google 等）

### 4.4 Token 过期处理
7 天过期后：自动重新登录（需要存密码）？弹登录页？refresh token（后端文档没提）？

### 4.5 体验模式（trial）vs 正式模式（formal）✅ 已定
**score=0 也让进主界面，在聊天时拦截。**
- 发消息前前端预判 `score <= 0` → 直接弹"额度不足，联系代理充值"，不发起 LLM 调用
- 理由：用户得能看见界面才知道去哪充值/填邀请码
- 兜底：即使前端漏判，后端 `/quota/report` 返回 `{code:0}` 时也弹同样的提示

### 4.6 显示剩余点数 ✅ 已定
**放设置页 → 关于（About）里，不挂标题栏。**
- 用户主动进设置 → 关于页才能看到剩余 score
- 理由：额度不是高频关注信息，放显眼处反而焦虑；让用户主动查
- 关于页加一行"剩余额度：{score}"，打开关于页时刷新一次（调 `GET /api/client/v1/quota`）
- 额度不足的强提示仍然走 4.5 的聊天拦截弹窗（那个是必须主动打扰的）

---

## 五、后端 API 接口映射

### 登录
```
POST /api/client/v1/auth/login
请求: {username, password}
响应: {code:1, data:{token, user_id, username, api_key, is_custom_key, score, mode, quota:{...}}}
```

### 获取 API Key
```
GET /api/client/v1/apikey
Authorization: Bearer <token>
响应: {code:1, data:{api_key, is_custom_key, key_source, can_customize}}
```

### 查询额度
```
GET /api/client/v1/quota
Authorization: Bearer <token>
```

### 上报 Token 用量
```
POST /api/client/v1/quota/report
Authorization: Bearer <token>
请求: {model, input_tokens, output_tokens, request_id}
响应: {code:1, data:{remaining_score}}
额度不足时: {code:0, msg:"额度不足"}
```

### 检查更新
```
GET /api/client/v1/update/check?version=1.0.0
响应: {code:1, data:{has_update, enforce, newversion, downloadurl, upgradetext}}
```

---

## 六、当前分支状态

- 分支：`feat/backend-integration`（已从 main 拉出）
- main 上最后一个 commit：`6b2fc490f docs: 更新CHANGELOG和离线打包踩坑记录`
- 尚未写任何代码，纯方案讨论阶段
