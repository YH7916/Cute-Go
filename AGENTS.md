# Cute-Go：代码修改约定

默认用中文 Operational Shorthand：结论、改动、验证、剩余限制；不要把计划写成已完成。

## 开始修改

1. 先看 `git status --short`、相关 diff、本文和 `docs/architecture.md`。保留用户已有改动。
2. 先查 `harness/architecture.mjs` 的复用入口，再搜索现有实现、类型、实际调用方和回归测试，沿调用链确认当前路径。优先扩展现有职责，不因目录或名字不合意另建一套；目录存在不等于已完成迁移。
3. 一次变更处理一个行为或边界；先说明范围，再修改。不要顺手全库格式化、升级依赖或重写 UI。
4. 历史记录在 `docs/archive/` 和 `docs/superpowers/`，仅作背景；当前源码、可执行规则和验证结果为准。

## 统一契约与复用

[harness/architecture.mjs](harness/architecture.mjs) 是唯一架构数据契约：模块职责、依赖关系、迁移例外、受检查文件、行数预算和业务复用入口均在此定义。`eslint.config.js` 只适配该契约，不维护另一份规则数据。

[harness/commands.mjs](harness/commands.mjs) 是唯一检查编排来源；npm 命令、本地运行器、CI 和生成指南复用它。[docs/harness.md](docs/harness.md) 是生成文档，不直接编辑；修改契约或编排后运行 `npm run harness:sync`。真实业务调用链见 [docs/architecture.md](docs/architecture.md)，本文不另维护依赖矩阵或预算。

新增通用抽象前，必须指出至少两个现存实际消费者及它们共享的语义；只因代码外形相似、假设将来可复用，不足以引入通用框架。按职责或平台边界拆分可以只有一个消费者。复用已有入口时保留各调用方的合法策略差异；拆分按职责，不按行号切片，不增加例外绕过约束。

## 不能退步的约束

- 先复用再新增；不要复制 Worker 协议、`Difficulty`、设置结构或同一算法的另一份实现。
- `utils/goLogic.ts`、`utils/onnx-engine.ts` 是兼容入口，新代码直接引用对应 core 模块。
- `utils/tapTapBridge.ts` 仅保留兼容导出，禁止新增内部调用方。`window.tap` 只在 `services/platform/taptap` 访问；UI 环境判断走 `services/platform/environment.ts`，振动走 `services/platform/haptics.ts`。
- TapTap 登录 `code` 不作账号 ID；保持不同身份来源的既有字段优先级，避免切换旧档案。联机结果的 send/leave 绑定原会话；退出/重连后的异步回包不得恢复旧身份或控制新房间。
- 禁止新增 `any`、`@ts-ignore`、`@ts-nocheck`、内联 ESLint 禁用以消除错误；外部未知数据用 `unknown` 并缩窄。
- `eslint-suppressions.json` 已清空，测试强制保持为空；不得自动重建、增加额度或豁免边界/循环依赖/文件大小。
- 修改契约、检查配置或编排必须增加独立负向验证：故意违反规则时检查应失败；期望结果不能完全从同一允许矩阵生成，以免错误放行后测试一起变绿。不得删断言、跳过测试或放宽规则让变更通过。
- 规则/AI bug：先补能复现故障的回归，再修实现；保留输入棋盘、颜色视角、贴目和撤销语义。
- 五子棋搜索只在 `core/gomoku/search.ts` 实现；同步/Worker 差异在 `profiles.ts`。改算法必须覆盖两种配置和真实 Worker 消息入口，不能偷偷统一深度、候选顺序或时间预算。
- 落子、停着、悔棋、重置、导入、摆棋和死活题通过 `readPosition()` / `writePosition()` 和 `domains/game/positionState.ts` 更新完整局面。单字段 setter 已删除，最新值 refs 只读；回调不得混用旧 render 的提子数与新 ref 的棋盘。
- AI 应用回包在 `useGameAiSession` 发请求时绑定局面，move/pass 都须拒绝旧局面；题目应手/结果在换题、退出和重置后失效。复盘统一使用 `selectReviewPosition`，历史项是落子前快照，索引 n 只含前 n 手。
- 模型 ownership 先归一化并统一黑方视角；实时软估计走 `core/go/liveEstimate.ts`，终局走 `core/go/scoring.ts`。终局成就复用已结算分数，不得在清除死子后重新计分。
- 联机请求/资源由 `hooks/online/sessionLifecycle.ts` 管理，握手与消息幂等由 `roomMessages.ts` 管理；迟到 SDK 会话要释放，旧房间事件不能改新房间。对手短暂离线保留原房间的重连体验。
- 棋盘交互放 `components/board/useBoardInteraction.ts`，纯派生与 SVG 绘制分开；视觉气线是每颗棋子到气点的边，不能用去重后的气数替代。
- UI 改动复用现有主题，检查 `index.html` 内联样式与 `index.css`，并实际看浏览器效果；构建通过不等于视觉验收。

## 完成标准

环境：Node.js 22.12+，首次安装 `npm ci`。执行 **`npm run check`**，按 `harness/commands.mjs` 编排依次运行 **contracts → lint → typecheck → test → build**。提交前另跑 `git diff --check`。

新增运行时测试放 `tests/**/*.test.ts` / `.test.tsx` / `.test.mjs`，由 `npm test` 自动发现；只打印 FAILURE 的临时脚本不算回归测试。普通 UI 文案或纯类型搬迁不需要镜像实现的测试。

测试内需要打包或加载源码时，复用 `tests/helpers/loadTestModule.mjs` 的 `loadTestModule` / `bundleTestSource`，不要复制 esbuild 配置、临时目录或模块装载器。hook 测试按需显式启用 `reactHost`；真实 React 渲染和 VM/浏览器测试保留各自运行环境。`npm test -- tests/...` 可运行指定文件或目录帮助定位，但不能替代交付前的全量 `npm run check`。

交付必须说明改动目的、实际验证结果和未覆盖项。浏览器、真实 ONNX 加载/推理、TapTap 原生和 Android 验证不能用 Node mock 测试代替。ONNX 可在本机浏览器验收，复跑入口见 `scripts/verify-onnx-browser.mjs`；连续 WASM 推理必须让出事件循环处理取消，resolved Promise 不代表消息事件已执行。不要未经请求提交、推送或发布。

TapTap 开发者后台/材料任务优先用官方 `taptap-cli`：先读对应 skill、运行 `doctor --json` 并核对当前命令 schema；同名应用用明确 app ID 区分。CLI 材料扫描不证明小游戏 SDK 可运行，登录/房间逻辑仍需 SDK 回归及原生验收。不得把本地代码治理扩展为上传、提审或发布。
