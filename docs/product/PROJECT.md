# 奇计 Agent 项目信息

## 基本信息

- 项目名：奇计 Agent
- 开发者：赵文韬 + 莉雅
- 委托方：奇计公司
- 面向用户：中小企业、个体商户（Windows 用户）
- 平台网址：https://geo.heikexia.cc
- 飞书知识库：https://ask.feishu.cn/shared-space/7571282566537445380

## 技术选型

- 底座：Hermes Agent v0.17.0 (MIT License)
- 桌面框架：Hermes Desktop (Electron 40 + React + Vite)
- 浏览器自动化：Playwright (Node.js)
- LLM：GLM 系列（智谱 API），支持多 Provider 降级
- 更新源：Gitee 镜像（`gitee.com/wintao-storm/QIJI-agent`）

## 仓库

| 仓库 | 用途 |
|------|------|
| `blank-knight/QIJI-agent` (GitHub) | Fork 主仓库，代码 + 文档 |
| `wintao-storm/QIJI-agent` (Gitee) | 国内镜像，自动同步自 GitHub |
| `NousResearch/hermes-agent` (GitHub) | Upstream 上游 |

## 代码规则

1. 禁止假数据
2. 先读再写
3. 模块化（单文件 <300 行）
4. 每步验证
5. 每步完成 → 更新 progress

## 关键路径

- WSL 源码：`~/clawd/qiji-fork`
- Windows 编译副本：`C:\Users\84673\qiji-fork`
- 运行中 Hermes（只读依赖源）：`C:\Users\84673\AppData\Local\hermes`
- 离线编译指南：[offline-build-guide.md](offline-build-guide.md)

## 文档索引

| 文档 | 内容 |
|------|------|
| [offline-build-guide.md](offline-build-guide.md) | 离线安装包编译指南（5步 + 5个坑） |
| [CHANGELOG.md](CHANGELOG.md) | 变更历史（2026-06-18 起） |
| [architecture.md](architecture.md) | 架构设计 |
| [product-plan.md](product-plan.md) | 产品化方案 |
| [tech-stack-comparison.md](tech-stack-comparison.md) | 四方案对比（Hermes vs Nuwax vs OpenClaw vs 从零） |
| [demo-issues.md](demo-issues.md) | 测试版问题记录 |

## 待做

- [ ] SOUL.md 品牌化（奇计 GEO 助手人格，预装到桌面版）
- [ ] 干净 Windows 机器上验证完整首装 + 更新流程
- [ ] Gitee 同步后验证国内用户更新流程
- [ ] GEO skill `articles`/`titles` 列偏移修复
- [ ] **TTS 国内用户 fallback**：edge-tts 连续失败时自动切到 Piper 本地 TTS（模型约 60MB，支持中文，绕过 ffmpeg 依赖）
- [x] **GEO 网址自动获取**：geo-cli.js 启动时自动调 geo-client.py 的 `get-web-url`，从远程 API 获取 `api_url`，无需用户手动提供
