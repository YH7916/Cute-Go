# Harness 审计与首轮治理

审计对象是仓库如何指导、约束和验证 AI 改代码，不是棋力或整个产品的质量评分。

## 改动前的证据

| 问题 | 现场证据 | 后果 |
| --- | --- | --- |
| Agent 指令缺乏可操作标准 | 根 AGENTS.md 主要是 2026-05-07 的 UI 会话摘要 | 没有真实入口、依赖方向、完成标准和技术债处理规则 |
| 检查全绿但覆盖有洞 | lint 0 error / 0 warning；69 条诊断被文件内禁用；import 插件默认只解析 JS 扩展 | TypeScript 环无法通过现有 no-cycle 设置被可靠识别 |
| 边界约束很弱 | default allow、违规 warn；App.tsx 未按 file 匹配，components 未列禁止项 | 核心反向依赖组件和入口可以漏检 |
| 协议文件并不约束通信 | protocol.ts 无调用方，声明 ready/result 等；实际收发 init-complete/ai-response/status 等 | 维护者容易修改无效契约，收发双方独立漂移 |
| 自动化未闭环 | 没有 CI 和统一 check；test runner 只发现 tests 根目录的 .test.ts | 分层测试容易漏跑，lint/test/build 可以被选择性执行 |

已有正面基础：TypeScript strict 已开启；68 项回归在改动前通过；已有 core、platform、gameActions 拆分；本机 typecheck/build 可通过。问题是这些基础没有构成可靠的约束闭环。

## 本轮范围

- 根 AGENTS 替换为真实架构、修改流程和验收规则；旧摘要原样归档，CLAUDE.md 指向同一入口。
- 修正 ESLint 模块分类、TypeScript 解析与禁止方向；类型问题为 error；禁用行内关闭检查；超长文件冻结预算。
- 存量类型债移入可审计的 ESLint 计数清单，新增错误不得增长；新增架构负向测试。
- 增加 `npm run check`、递归测试发现、Windows / Ubuntu CI。
- Worker 与 hook 统一使用真实消息协议；共享 GameSettingsData/TsumegoSet 移出 UI 反向依赖。
- 删除已被 Git 跟踪的 AboutModal 的陈旧忽略条目，源码保持原样；已核对 HEAD 包含该文件，这不是新检出缺文件问题。

本轮不声称已消除大型组件、重复五子棋搜索和状态同步复杂度；治理队列及逐项验收见 [architecture.md](architecture.md)。`version:sync` 当前还引用缺失的 update-version.js，Android 发布流程需另外修复和验证，不属于本轮 Web 验收。

## 验证记录

- 当前 Windows / Node 24.14.0：`npm run check` 通过；91/91 测试（原有 68 + 新增 23 项架构反例/正例），lint、typecheck、生产构建通过；`git diff --check` 通过。
- 独立临时源码快照：复制 Git 已跟踪文件和未忽略的新文件，排除本机 dist、日志等；复用现有 node_modules 的 junction，再次通过完整 check。该结果不等于重新安装依赖或远端 Linux CI 已验证。
- 构建仍有原有的 Browserslist 数据过期及 ONNX 依赖 eval 警告；没有通过升级依赖扩大本轮范围。
- 55 处 any 和 4 处 TS 忽略仍待偿还，全部集中在 4 个文件的抑制清单；协议相关文件已不需要整文件类型豁免。
- CI 尚未提交到远端执行；未验证浏览器交互、ONNX 真模型、TapTap 真机或 Android 打包。本轮保留原有未提交业务修复，未提交或推送。

## 验收后的并行改动

91 项结果对应首轮已验证源码快照。此后工作区新增了另一批 AI 引擎 / Worker 生命周期测试及 AppController、Worker 调度重构；首轮结束时 `npm run check` 被新门禁拦住：AppController 有效行数 507，超过其存量预算 503；`git diff --check` 还报告 Worker 并行重写中的换行/空白问题。当时没有增加预算或豁免错误，因此首轮结束时不能报告整个工作区全部通过。

## 第二轮验收更新

用户随后要求实施代码治理。已完成棋盘职责拆分、五子棋共用搜索、完整局面动作与计分消费方迁移，并整合当前并行改动重新验收：**217/217 测试，lint、typecheck、build、diff check 通过**。未提高旧预算；类型债降至 TapTap 桥接层 35 处 any。详细证据、行为边界和未覆盖项见 [第二轮治理记录](code-governance-2026-10-01.md)。本段更新不将第二轮结果追溯为首轮的验证结果。

## 第三轮 TapTap 更新

按用户要求使用官方 CLI 核验平台能力，并完成 SDK 平台层收口、未知数据校验、登录/退出与房间代次治理。类型抑制清单已空，旧桥/provider 超长预算已删除；本轮完整工作区 **279/279 测试，lint、typecheck、build、diff check 通过**。CLI 后台检查不等于原生运行验证，未上传或发布；完整变更、官方契约和设备验收限制见 [TapTap 治理记录](taptap-governance-2026-10-01.md)。
