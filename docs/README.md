# docs/ 目录导航

## product/ — 项目文档
| 文件 | 说明 |
|------|------|
| PROJECT.md | 项目元信息（委托方、网址、需求文档路径） |
| product-plan.md | 产品化方案（功能范围、里程碑） |
| tech-stack-comparison.md | 四种打包方案技术对比 |
| architecture.md | 桌面端架构设计 |
| demo-issues.md | 测试版问题记录 |

## offline-build/ — 离线包专题（核心）
| 文件 | 说明 |
|------|------|
| how-it-works.md | **离线包原理详解** — vendor 是什么、npm 为什么在 desktop 下、完整架构图 |
| brand-customization.md | **品牌替换指南** — 换名称/图标/链接该改哪些文件 |
| build-and-test.md | **编译测试手册** — 完整编译流程、一键脚本、检查清单、三种测试方式 |
| bugs-and-pitfalls.md | **踩坑记录** — 11个坑（★高频标注）、根因、修复方案 |
| ui-customization-guide.md | UI 定制速查 — 改文案/颜色/图标的快速参考 |

## 上游文档（Hermes 原始，不修改）
以下为 Hermes Agent 上游文档，保持原样：
- session-lifecycle.md, relay-connector-contract.md
- chronos-managed-cron-contract.md
- rca-ssl-cacert-post-git-pull.md
- design/, kanban/, middleware/, observability/, plans/, security/
- hermes-kanban-v1-spec.pdf
