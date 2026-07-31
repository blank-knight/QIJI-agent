# Hermes 自我改进闭环（Self-Improvement Loop）

> 本文档梳理 Hermes Agent「自我改进闭环」的完整流程与代码路径，便于后续学习与改造。
> 基于代码库 `feat/backend-integration` 分支梳理。

## 一、为什么这是 Hermes 的精华

大多数 Agent（Claude Code、Codex 等）是「一次性工具」——用完即走，经验不沉淀。

Hermes 的核心差异是：**Agent 会把自己每次工作的经验沉淀成可复用的「技能（Skill）」和「记忆（Memory）」，并自动维护这个知识库**。结果是 Agent 越用越聪明，越用越贴合用户。

这套系统由三个不同时间尺度的子系统咬合而成：

| 子系统 | 时间尺度 | 触发方式 | 入口文件 |
|--------|---------|---------|---------|
| 实时学习（background review） | 每轮对话后 | 工具迭代数超阈值 | `agent/background_review.py` |
| 显式学习（/learn） | 用户主动触发 | `/learn` 斜杠命令 | `agent/learn_prompt.py` |
| 长周期维护（curator） | 7 天 / 空闲时 | gateway tick / CLI 启动 | `agent/curator.py` |

---

## 二、闭环全景图

```
┌─────────────────────────────────────────────────────────────┐
│                    主对话循环 (run_agent.py)                  │
│                                                             │
│   用户消息 → LLM → 工具调用 → 回复                            │
│                    │                                        │
│                    ▼                                        │
│   ┌─────────────────────────────────┐                       │
│   │   turn_finalizer.py             │                       │
│   │   每轮结束后检查两个触发条件:    │                       │
│   │   1. _iters_since_skill >= 阈值  │  ──── 短周期 (每N轮)  │
│   │   2. _memory_nudge 到期          │                       │
│   └────────────┬────────────────────┘                       │
│                │                                            │
│                ▼                                            │
│   ╔════════════════════════════════════════╗                │
│   ║  spawn_background_review_thread        ║  ← 实时学习    │
│   ║  (agent/background_review.py)          ║                │
│   ║  daemon 线程，fork 一个子 Agent        ║                │
│   ╚══════════════════╤═════════════════════╝                │
│                       │                                    │
│                       ▼                                    │
│   ┌─────────────────────────────────────────┐              │
│   │   /learn 命令 (agent/learn_prompt.py)   │  ← 显式学习  │
│   │   用户主动触发：把一段工作蒸馏成 SKILL.md│              │
│   └─────────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘

         ⋮  (另一个时间尺度)

┌─────────────────────────────────────────────────────────────┐
│              长周期 Curator (agent/curator.py)                │
│                                                             │
│   触发点: gateway tick / CLI 启动                            │
│   间隔: 默认 7 天                                            │
│   门槛: Agent 空闲 >= 2 小时                                 │
│                                                             │
│   Step 1: apply_automatic_transitions()                     │
│           纯函数，无 LLM                                     │
│           按活跃度自动迁移: active→stale→archived            │
│                                                             │
│   Step 2 (可选): run_curator_review()                       │
│           fork 子 Agent，做 umbrella 合并                    │
│           把零散技能归类成 class-level 技能                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、子系统一：实时学习（每轮触发）

### 3.1 触发链路

入口在 `agent/turn_finalizer.py` 的 `run_conversation` 结束段：

```python
# turn_finalizer.py:425-435
# Check skill trigger — based on how many tool iterations THIS turn used.
if (agent._skill_nudge_interval > 0
        and agent._iters_since_skill >= agent._skill_nudge_interval
        and "skill_manage" in agent.valid_tool_names):
    _should_review_skills = True
    agent._iters_since_skill = 0

# Background memory/skill review — runs AFTER the response is delivered
# so it never competes with the user's task for model attention.
if final_response and not interrupted and (_should_review_memory or _should_review_skills):
    agent._spawn_background_review(
        messages_snapshot=list(messages),
        review_memory=_should_review_memory,
        review_skills=_should_review_skills,
    )
```

**触发条件**：这一轮工具调用次数超过阈值（通常意味着做了复杂工作）。
**设计哲学**：「只有费力气的任务才值得沉淀」。

`_spawn_background_review` 是 `run_agent.py` 里的薄封装：

```python
# run_agent.py:1439-1458
def _spawn_background_review(self, messages_snapshot, review_memory=False, review_skills=False):
    from agent.background_review import spawn_background_review_thread
    target, _prompt = spawn_background_review_thread(
        self, messages_snapshot,
        review_memory=review_memory,
        review_skills=review_skills,
    )
    t = threading.Thread(target=target, daemon=True, name="bg-review")
    t.start()
```

### 3.2 Fork 子 Agent（核心创新）

`agent/background_review.py` 的 `_run_review_in_thread` 是整个闭环最精妙的部分。
它不是简单起个线程，而是**完整 fork 一个新的 AIAgent 实例**：

```python
# background_review.py:580-600
review_agent = AIAgent(
    model=_rt.get("model") or agent.model,
    max_iterations=16,
    quiet_mode=True,
    platform=agent.platform,
    provider=_rt.get("provider") or agent.provider,
    api_mode=_rt.get("api_mode"),
    base_url=_rt.get("base_url") or None,
    api_key=_rt.get("api_key") or None,
    credential_pool=getattr(agent, "_credential_pool", None),
    parent_session_id=agent.session_id,
    enabled_toolsets=getattr(agent, "enabled_toolsets", None),
    disabled_toolsets=getattr(agent, "disabled_toolsets", None),
    skip_memory=True,   # 关键：不碰外部记忆插件
)
```

#### 四个关键不变量

| 不变量 | 实现位置 | 为什么 |
|--------|---------|--------|
| **不污染主会话** | `daemon=True` + `skip_memory=True` | 外部插件（Honcho/mem0）不知道有 fork 发生 |
| **prompt cache 复用** | `_cached_system_prompt = agent._cached_system_prompt` + `session_id = agent.session_id` | fork 用同一个 cache key，prefix cache 命中率 ~26% 成本节省 |
| **工具白名单** | `set_thread_tool_whitelist({"memory", "skill_manage"})` | 只允许写记忆和技能，不能跑 terminal/read_file 等 |
| **危险命令自动拒绝** | `_bg_review_auto_deny` callback | 子 Agent 不会被恶意 prompt 骗去执行危险 shell |

对应代码片段：

```python
# background_review.py:660-675
review_agent._cached_system_prompt = agent._cached_system_prompt  # cache 复用
review_agent.session_start = agent.session_start
review_agent.session_id = agent.session_id
review_agent._end_session_on_close = False       # 不终结父会话
review_agent.compression_enabled = False          # 不压缩（否则会和父会话竞争）

# background_review.py:680-690
review_whitelist = {
    t["function"]["name"]
    for t in get_tool_definitions(enabled_toolsets=["memory", "skills"], quiet_mode=True)
}
set_thread_tool_whitelist(review_whitelist, deny_msg_fmt=...)
```

### 3.3 模型路由策略（成本优化）

`_resolve_review_runtime` 有一个聪明的设计：

- **默认**（`routed=False`）：fork 用**主模型**，完整 replay 对话。
  因为主模型的 prefix cache 已经热了，cache read 很便宜。
- **配置了更便宜的 aux 模型**（`routed=True`）：fork 用便宜模型，但 replay 时用 `_digest_history()` **压缩对话**（保留最近 24 条，更早的折叠成 digest）。
  因为换模型后 cache key 不同，cache 必然 miss，与其冷写全文不如冷写摘要。

```python
# background_review.py:429-433
_review_history = (
    _digest_history(messages_snapshot) if _routed
    else messages_snapshot
)
```

### 3.4 Review Prompt（教 Agent "怎么学习"）

三个 prompt 常量是整个系统的"教学大纲"：
- `_MEMORY_REVIEW_PROMPT`：只看记忆
- `_SKILL_REVIEW_PROMPT`：只看技能
- `_COMBINED_REVIEW_PROMPT`：两者都看

以 `_SKILL_REVIEW_PROMPT` 为例（`background_review.py:170-260`），它明确告诉 Agent：

**要捕获的信号**（任一即可触发）：
- 用户纠正了风格/格式/流程 → 这是 "first-class skill signal"，不只是记忆
- 出现了非平凡的技巧/workaround/调试路径
- 已加载的技能发现是错的/过时的 → 立即 patch

**优先级顺序**（prefer the earliest action that fits）：
1. **UPDATE A CURRENTLY-LOADED SKILL**（最优先，因为它刚在用）
2. **UPDATE AN EXISTING UMBRELLA**（via `skills_list` + `skill_view`）
3. **ADD A SUPPORT FILE** under an existing umbrella（`references/` / `templates/` / `scripts/`）
4. **CREATE A NEW CLASS-LEVEL UMBRELLA SKILL**（最后选项）

**禁止捕获的**（防止"自我设限"）：
- 环境依赖的失败（`command not found` 等）—— 用户能修，不是持久规则
- 对工具的负面断言（"browser tools 不工作" → 会变成永久拒绝）
- 一次性任务（"总结今天的新闻"）

### 3.5 结果反馈

Review 完成后，`summarize_background_review_actions` 扫描子 Agent 的 tool calls，
提取成功的 `memory` / `skill_manage` 动作，生成人类可读摘要：

```python
# background_review.py:735-745
actions = summarize_background_review_actions(
    review_messages, messages_snapshot,
    notification_mode=getattr(agent, "memory_notifications", "on"),
)
if actions:
    summary = " · ".join(dict.fromkeys(actions))
    agent._safe_print(f"  💾 Self-improvement review: {summary}")
```

---

## 四、子系统二：显式学习（/learn 命令）

`agent/learn_prompt.py` 是用户主动触发：用户描述一个工作流/代码目录/API文档，
Agent 用已有工具（`read_file` / `search_files` / `web_extract`）采集资料，
然后按一套硬编码的 "house-style" 写成 SKILL.md。

**核心是 `_AUTHORING_STANDARDS`** — 强制规定技能的结构：

- `name`：lowercase-hyphenated，≤64 字符
- `description`：≤60 字符，一句话说能力不说实现
- `version`：`0.1.0`
- 8 个固定章节顺序：
  1. `# <Human Title>` + 2-3 句介绍
  2. `## When to Use` — 具体触发场景
  3. `## Prerequisites` — 环境变量、安装步骤、凭证
  4. `## How to Run` — 通过 Hermes 工具的规范调用
  5. `## Quick Reference` — 扁平命令/端点列表
  6. `## Procedure` — 编号步骤 + 可复制命令
  7. `## Pitfalls` — 已知限制、rate limit
  8. `## Verification` — 证明技能生效的单条检查

**工具引用规范**：必须用 Hermes 工具名（`terminal` / `read_file` / `patch` / `web_extract`），
不能写 shell 命令（`cat` / `grep` / `sed`）。这让技能跨后端（local/docker/ssh）通用。

---

## 五、子系统三：长周期维护（Curator）

### 5.1 触发链路

Curator 在两个地方被触发：

**Gateway tick**（`gateway/run.py:17331-17339`）：

```python
# maybe_run_curator() is internally gated by config.interval_hours
# (7 days by default), so CURATOR_EVERY is just the poll rate — the
# real work only fires once per config interval.
if tick_count % CURATOR_EVERY == 0:
    from agent.curator import maybe_run_curator
    maybe_run_curator(
        idle_for_seconds=float("inf"),  # gateway 总是在跑
        on_summary=lambda msg: logger.info("curator: %s", msg),
    )
```

**CLI 启动**（`cli.py:12510`）：

```python
maybe_run_curator(
    idle_for_seconds=float("inf"),  # CLI startup = fully idle
    on_summary=lambda msg: self._console_print(f"[dim #6b7684]💾 {msg}[/]"),
)
```

### 5.2 三重门槛

`maybe_run_curator`（`agent/curator.py:1898-1916`）的四重 gate：

```python
def maybe_run_curator(*, idle_for_seconds=None, on_summary=None):
    if not should_run_now():        # gate 1: enabled + not paused + interval 到期
        return None
    if idle_for_seconds is not None:
        min_idle_s = get_min_idle_hours() * 3600.0
        if idle_for_seconds < min_idle_s:   # gate 2: 空闲时间足够
            return None
    return run_curator_review(on_summary=on_summary)
```

**关键参数**（`curator.py:65-71`）：

| 参数 | 默认值 | 含义 |
|------|--------|------|
| `DEFAULT_INTERVAL_HOURS` | `24 * 7`（7 天） | 运行间隔 |
| `DEFAULT_MIN_IDLE_HOURS` | `2` | 最小空闲时间 |
| `DEFAULT_STALE_AFTER_DAYS` | `30` | 标记为 stale 的阈值 |
| `DEFAULT_ARCHIVE_AFTER_DAYS` | `90` | 归档的阈值 |
| `DEFAULT_CONSOLIDATE` | `False` | LLM 合并 pass 默认关 |

**首次运行延迟**：新装不会立即跑，而是把 `last_run_at` 设为 now，延后一个完整周期。
避免「刚 update 完就自动改库」。

### 5.3 Step 1：确定性状态迁移（无 LLM）

`apply_automatic_transitions`（`curator.py:276-329`）是纯函数，无 LLM 调用：

```
active ──(30天没用)──→ stale ──(90天没用)──→ archived
   ↑                    │
   └──(被重新使用)──────┘  (reactivate)
```

严格不变量：
- **pinned 技能永不迁移**（用户手动钉住的重要技能）
- **archived 可恢复**（不删除，只移到 `.archive/`）
- 首次看到的技能先 seed baseline，不会立即被归档

### 5.4 Step 2：LLM 合并（默认关闭）

`run_curator_review` 里的 `_llm_pass()`。这个 pass 默认 **OFF**
（`DEFAULT_CONSOLIDATE = False`），因为它是「有意见的」——会主动合并/重组技能。

`CURATOR_REVIEW_PROMPT`（`curator.py:353-490`）非常详尽，核心策略：

**目标**：把 "one-session-one-skill" 的扁平列表 → class-level umbrella 技能库

**工作流**：
1. 扫描全部技能，找 **prefix cluster**（`hermes-config-*` / `gateway-*` / `codex-*` 等）
2. 对每个 cluster 判断：人类维护者会写成 N 个独立技能，还是 1 个带 N 个子章节的技能？
3. 三种合并方式：
   - **MERGE INTO EXISTING UMBRELLA**：cluster 里有一个够宽的 → patch 它，archive 兄弟
   - **CREATE NEW UMBRELLA**：都不够宽 → 新建 class-level 技能，absorb 兄弟
   - **DEMOTE TO SUPPORT FILE**：兄弟有有价值的具体内容 → 移到 `references/` / `templates/` / `scripts/`

**严格不变量**：
- 只碰 agent-created 技能，bundled / hub 技能不碰
- 永不删除，只 archive（可恢复）
- pinned 技能完全跳过

### 5.5 运行报告

每次 curator 运行会在 `~/.hermes/logs/curator/{YYYYMMDD-HHMMSS}/` 下写：
- `run.json` — 结构化数据
- `REPORT.md` — 人类可读报告

并更新 `~/.hermes/skills/.curator_state`。`hermes curator status` 可以查看。
支持 `--dry-run` 预览（只生成报告，不改动库）。

---

## 六、三个子系统如何咬合

```
    用户使用 Agent
         │
         ├── 每轮复杂工作 ──→ background_review ──→ 创建/patch 技能
         │                   (实时，daemon 线程)        │
         │                                              ▼
         ├── 用户 /learn ──→ learn_prompt ──→ 新建技能
         │   (显式)                                  │
         │                                           ▼
         │                              ┌───── 技能库 ─────┐
         │                              │  (SKILL.md +     │
         │                              │   references/    │
         │                              │   templates/     │
         │                              │   scripts/)      │
         │                              └───────┬──────────┘
         │                                      │
         ├── 7天空闲 ──→ curator ──→ 自动状态迁移
         │               (长周期)       + umbrella 合并
         │                                      │
         │                                      ▼
         └── 下次启动时 ──→ 技能库已被整理好，Agent 更聪明
```

---

## 七、关键代码索引

| 功能 | 文件 | 关键函数/行号 |
|------|------|--------------|
| 触发实时 review | `agent/turn_finalizer.py` | `run_conversation` 结尾 ~L425-435 |
| fork 子 Agent | `agent/background_review.py` | `_run_review_in_thread` ~L540-690 |
| 模型路由 | `agent/background_review.py` | `_resolve_review_runtime` ~L60-117 |
| 对话摘要（routed 路径） | `agent/background_review.py` | `_digest_history` ~L120-150 |
| Review prompt（教学大纲） | `agent/background_review.py` | `_SKILL_REVIEW_PROMPT` ~L170-260 |
| 显式学习 | `agent/learn_prompt.py` | `_AUTHORING_STANDARDS` ~L30-80 |
| Curator 入口 | `agent/curator.py` | `maybe_run_curator` ~L1898-1916 |
| 确定性状态迁移 | `agent/curator.py` | `apply_automatic_transitions` ~L276-329 |
| LLM 合并 prompt | `agent/curator.py` | `CURATOR_REVIEW_PROMPT` ~L353-490 |
| Curator 主流程 | `agent/curator.py` | `run_curator_review` ~L1450+ |
| Gateway 触发 curator | `gateway/run.py` | ~L17331-17339 |
| CLI 触发 curator | `cli.py` | ~L12510 |

---

## 八、设计哲学小结

这套闭环的精妙之处不在于单个技巧，而在于一组**互相约束的权衡**：

1. **成本 vs 学习深度**：用 prompt cache 复用 + 模型路由 + digest 压缩，把「每轮都 fork 一个 Agent」的成本压到可接受。
2. **自动化 vs 安全**：技能库会被自动修改，但永不删除（只 archive）、pinned 永不碰、bundled/hub 技能完全保护。
3. **主动性 vs 自我设限**：prompt 明确告诉 Agent「不要记录环境失败」「不要记录对工具的负面断言」，防止 Agent 把自己关进笼子。
4. **短期 vs 长期**：实时 review 负责「刚学到的东西立即沉淀」；curator 负责「长期把零散技能归类成体系」。

> **一句话总结**：Hermes 不是静态的工具集合，而是一个会随使用越来越贴合用户、技能库会自动进化的系统。
