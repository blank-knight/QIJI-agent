# 奇计 Agent 变更历史

> 从 qiji-agent/memory-bank/progress.md 精简而来。
> 详细的每日调试记录见 git log。

---

## 2026-06-30 隔离编译架构 + vendor 修复

- **隔离编译**：编译目录从 `AppData\Local\hermes` 迁移到独立的 `C:\Users\84673\qiji-fork`，不再覆盖运行中的 Hermes 实例
- **vendor 无限嵌套修复**：根因是 `Copy-Item -Recurse` 跟随 `node_modules\hermes` junction（指向 `apps\desktop`，含 `build\vendor`）。改用 `robocopy /XJ`
- **GITHUB_SHA 缺失修复**：robocopy 排除了 `.git`，编译脚本找不到 commit hash。编译前设 `$env:GITHUB_SHA`
- **install.ps1 git 防御性检查**：Install-Git 新增检查 `$HermesHome\git` 目录（vendor 复制的 PortableGit），不再依赖跨进程 PATH
- **产物**：Qiji-0.17.0-win-x64.exe (923 MB)，vendor 完整，奇计化通过

## 2026-06-28 GEO Skill 全面测试

- 网页端 6 命令测试（login/rights/keywords/articles/titles/report）
- 桌面客户端 6 命令测试（status/start/platforms/stats/accounts/stop）
- 修复 `accounts` 命令：参数错误（缺 `_resolve_credentials()`）+ 输出泄露 cookies（解析路径错误）
- 已知遗留：`articles` 数据重复 + 列偏移（Bootstrap Table 选择器问题）

## 2026-06-27 GEO Skill v1.4.0 + 增量更新系统

### Bug 修复（3个关键 bug）
1. **my_headless 参数名是反的**：True=可见，False=无头。之前传反了
2. **PowerShell GBK 编码导致 Python 崩溃**：subprocess 改为 `decode('gbk', errors='replace')`
3. **缺凭证导致 push 报网络异常**：新增 `_resolve_credentials()` 自动获取 uid + api_url

### 功能补全
- 网页端新增 9 命令（titles/galleries/knowledge/instructions/categories/write-tasks/batch-fuken/dashboard/consumption）
- 客户端新增 4 命令（stats/delete-account/media-login/ai-auth）
- 功能覆盖率：网页端 40%→100%，客户端 55%→91%

### 增量更新系统
- 路径 A（Python/skills/.md 改动）：跳过 rebuild，~30s
- 路径 B（前端 .ts/.tsx 改动）：tsc+vite+asar，~60s
- 路径 C（Electron 核心改动）：完整 rebuild，~3-4min
- 安全兜底：任何失败自动 fallback 完整 rebuild

### 更新流程三大 bug 修复
1. i18n 类型定义不同步（TS2353 错误）
2. 白标 exe 名不匹配：`_desktop_packaged_executable()` 写死找 `Hermes.exe` → 改为 glob 搜索
3. 更新卡死无提示：build 失败/成功时弹原生对话框

## 2026-06-26 更新体验全面修复（7个问题）

1. bootstrap-runner.cjs 语法错误
2. Windows 应用内更新（不再显示"从终端更新"）
3. 系统托盘（点 X 隐藏到后台）
4. 奇计品牌任务栏图标
5. 桌面图标恢复窗口（second-instance show）
6. 更新进度条卡住 + 自动重启（done 加入终态列表 + app.relaunch）
7. 每日检查更新（30分钟→24小时）

## 2026-06-25 Gitee 镜像 + HTTP Fallback

- Gitee 镜像方案落地（更新源全切 Gitee）
- 基线 tag `v1.0.0-baseline`
- **阻断发现**：360+火绒+Defender 三安全软件共存时 git.exe 被注入 hook 导致崩溃（`STATUS_ENTRYPOINT_NOT_FOUND`）
- HTTP fallback 实现（`update-http-fallback.cjs`）：git.exe 不可用时走 Gitee REST API 检测更新
- `.git` 检查顺序修复 + bootstrap marker SHA fallback

## 2026-06-24 Fork 仓库 + 自主更新 + 离线包 + 知识库 Skill

- Fork 仓库建立（`blank-knight/QIJI-agent`，origin=fork, upstream=NousResearch）
- 全量去 Hermes 化（26文件，+732/-440行）：i18n 376处、main.cjs、package.json、图标
- 离线包支持搬入 fork（8文件）：vendor + bundled install.ps1
- `qiji-knowledge-base` skill 创建（品牌知识库 + 批量导入）
- `qiji-geo` skill 放入 fork `preinstalled/skills/`

## 2026-06-23 离线包完成

- vendor/ 目录 2.58GB（Python+site-packages+node_modules+tools+chromium）
- install.ps1 加 vendor 跳过逻辑（检测到 vendor 内容时跳过网络下载）
- Qiji-1.0.0-win-x64.exe = 524.8MB（离线包）

## 2026-06-22 小白一键安装

- **根因**：install-stamp.json 含假 commit hash → bootstrap 去 GitHub 下载 install.ps1 → 404
- **修复**：install.ps1 打包进 app resources，bootstrap 优先从本地找
- 首启死循环修复：`isBootstrapComplete()` 允许 `pinnedCommit === null`
- 产物：Qiji-1.0.0-win-x64.exe (110.6MB)

## 2026-06-21 技能中文化 + 品牌化第二批

- 80+ 技能中文翻译 + 40+ 工具集翻译（`translations.ts`）
- 卸载区/网关设置/消息平台 全量中文化

## 2026-06-20 全量品牌化 + 编译

- 4 语言 i18n 文件全量去 Hermes（zh/en/zh-hant/ja）
- Logo 替换（放大镜+"奇"字）
- **build 脚本大坑**：step-build3.ps1 从 staging 覆盖文件 → 改 i18n 必须同步三处副本
- 产物：Qiji-1.0.0-win-x64.exe (110.5MB)

## 2026-06-19 全量品牌去 Hermes 化（第一轮）

- 67 个源文件用户可见 "Hermes" → "奇计"
- 4 个语言文件 + Electron 后端 + About 页面 + 图标
- 原则：代码标识符（HermesGateway、HERMES_HOME 等）不改

## 2026-06-18 项目启动

- Logo 生成（SVG 放大镜+AI神经网络）
- qiji-geo Skill 完成（8个操作命令，实测通过）
- 品牌定制（package.json/index.html/main.cjs/presets.ts/icon）
- Windows 编译成功：QijiGEO-1.0.0-win-x64.exe (111MB)
