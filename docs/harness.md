# Harness 与架构复用指南

> 自动生成：修改 `harness/architecture.mjs` 或 `harness/commands.mjs` 后运行 `npm run harness:sync`；不要直接修改本文。

业务模块沿用现有职责边界；harness 共享同一份依赖契约、命令编排和测试基础设施。

## 修改入口

1. 先读 [AGENTS.md](../AGENTS.md)，按下表查找复用入口，再搜索调用方和回归测试。
2. 相同职责扩展现有模块；确需共享抽象时列出至少两个实际消费者和共同语义。按独立职责或平台边界拆分不要求两个消费者。
3. 新能力遵守依赖矩阵。新边界/入口先修改契约，并增加独立的允许/禁止用例；不要由同一规则自动生成全部预期。
4. 运行 `npm run harness:sync` 更新本文，然后执行 `npm run check` 和 `git diff --check`。

运行流程和领域不变量见 [架构说明](architecture.md)；本文的矩阵、入口与检查命令由代码生成。

## 复用入口

### teaching-exercise

Course practice and personal review exercises share Go rules, grading and isolated position application.

- [domains/coach/exercise.ts](../domains/coach/exercise.ts)：`gradeExercise`, `applyExerciseGrade`

验证：Course, review exercise and stale-session regressions; independent missing-export counterexample.

限制：Rule-checkable objectives do not prove best play, advanced life and death or expert content quality.

### teaching-agent

UI sends complete positions and intent; the agent owns evidence, prompts, provider calls and local fallback.

- [agent/coach/client.ts](../agent/coach/client.ts)：`runCoachAgent`

验证：Runtime, Worker cancellation and hook stale-reply regressions; independent ESLint boundary counterexamples.

限制：This is in-app execution separation, not a hosted backend or a secret-hiding boundary; browser CORS still applies.

### game-position

Read/write one complete position, including history and both capture counts.

- [domains/game/positionState.ts](../domains/game/positionState.ts)：`GamePosition`, `PositionAccess`, `createInitialPosition`, `recordMove`, `recordPass`, `undoPosition`
- [hooks/useGameState.ts](../hooks/useGameState.ts)：`useGameState`

验证：PositionAccess readPosition/writePosition and readonly compatibility refs are checked by TypeScript and transition regressions.

限制：Static imports do not prove that a caller uses a complete snapshot or prevent a renamed duplicate state machine.

### go-rules

Reuse Go legality and scoring; live estimates and final scoring have distinct semantics.

- [core/go/rules.ts](../core/go/rules.ts)：`attemptMove`
- [core/go/scoring.ts](../core/go/scoring.ts)：`calculateScore`, `calculateModelScore`
- [core/go/liveEstimate.ts](../core/go/liveEstimate.ts)：`estimateLiveLead`

验证：Core dependency boundaries and Go/scoring behavioral regressions.

限制：Reviewers must identify copied rule or scoring algorithms; the harness does not compare semantics.

### go-search

One ownership-search implementation for Go analysis and Hard move selection.

- [core/inference/search.ts](../core/inference/search.ts)：`runOwnershipSearch`

验证：Worker and event-loop cancellation regressions exercise the shared search.

限制：An alternative implementation under a different name is not detected automatically.

### gomoku-search

One shared Gomoku search with explicit sync/Worker profiles.

- [core/gomoku/search.ts](../core/gomoku/search.ts)：`searchGomoku`, `getGomokuCandidates`
- [core/gomoku/profiles.ts](../core/gomoku/profiles.ts)：`getGomokuSearchProfile`, `GomokuSearchProfile`

验证：Sync/Worker tactics, board restoration and shared-search regressions.

限制：The dependency graph cannot prove equivalence of rewritten algorithms or budgets.

### worker-protocol

Main thread and Worker share request identities and message contracts.

- [core/inference/protocol.ts](../core/inference/protocol.ts)：`RequestIdentity`, `WorkerInMessage`, `WorkerOutMessage`, `WorkerReply`

验证：TypeScript and scheduler/Worker/hook lifecycle regressions.

限制：TypeScript alone cannot validate unknown runtime payloads or stop a differently named duplicate type.

### platform

Application callers use public capabilities; native SDK data is validated in the adapter.

- [services/platform/index.ts](../services/platform/index.ts)：`platform`, `getPlatform`
- [services/platform/environment.ts](../services/platform/environment.ts)：`isTapTapEnv`
- [services/platform/haptics.ts](../services/platform/haptics.ts)：`tryTapVibration`
- [services/platform/nativeMatchMessages.ts](../services/platform/nativeMatchMessages.ts)：`NativeMatchMessage`, `parseNativeMatchMessage`

验证：ESLint blocks SDK/provider internals and compatibility bridges outside named exceptions; fake SDK tests verify lifecycle.

限制：Native TapTap behavior still requires device/runtime acceptance.

### common-ui

Reuse existing Modal, Button and Toast before inventing equivalent controls.

- [ui/common/index.ts](../ui/common/index.ts)：`Modal`, `Button`, `Toast`

验证：Shared UI dependency boundaries and caller render/behavior regressions.

限制：Similarity of UI or visual design remains a human/browser review responsibility.

## 依赖矩阵

`harness/architecture.mjs` 为唯一数据来源；`harness/eslint.mjs` 转成 ESLint 规则，根配置只转发。默认拒绝未列出的本地依赖，特例见下一节。

| 模块 | 文件匹配 | 职责 | 允许依赖 |
| --- | --- | --- | --- |
| `legacy-core` | `utils/{micro-board,joseki}.ts` | Existing board primitives used by core; no permission for arbitrary utils. | `legacy-core`, `shared-types` |
| `legacy-bridge` | `utils/{goLogic,onnx-engine}.ts` | Compatibility re-exports; new callers use the corresponding core entry. | `core`, `shared-types` |
| `platform-bridge` | `utils/tapTapBridge.ts` | Deprecated TapTap re-exports, with no production callers allowed. | `platform-sdk` |
| `platform-sdk` | `services/platform/taptap/**` | TapTap SDK access, external payload validation and native resource lifetime. | `platform-sdk`, `platform-internal`, `platform-public`, `services`, `shared-types` |
| `platform-public` | `services/platform/{index,environment,haptics,nativeMatchMessages}.ts` | Public platform capabilities and wire-message validation used by application code. | `platform-public`, `platform-internal`, `platform-sdk`, `shared-types` |
| `platform-internal` | `services/platform/**` | Provider composition and platform implementation contracts, behind public facades. | `platform-internal`, `platform-public`, `platform-sdk`, `shared-types` |
| `composition-contract` | `components/app/AppViewModel.ts` | View contract derived from hook types; no hook runtime imports. | 无 |
| `core` | `core/**` | Pure board, Go/Gomoku rules/search and model inference. | `core`, `legacy-core`, `shared-types` |
| `domains` | `domains/**` | Complete game-position transitions and domain workflows. | `domains`, `core`, `utils`, `shared-types` |
| `coach-agent-contract` | `agent/coach/contract.ts` | Shared teaching request/result and Worker message contracts. | `domains`, `services`, `shared-types` |
| `coach-agent-client` | `agent/coach/client.ts` | Cancellable teaching Worker bridge with the same-runtime compatibility fallback. | `coach-agent-contract`, `coach-agent-runtime`, `shared-types` |
| `coach-agent-runtime` | `agent/coach/**` | UI-independent teaching orchestration; reuse verified rules and provider transport. | `coach-agent-runtime`, `coach-agent-contract`, `coach-provider`, `domains`, `core`, `services`, `shared-types` |
| `coach-provider` | `services/coach/client.ts` | Teaching-provider request policy and transport, called only through the agent runtime. | `services`, `shared-types` |
| `ui` | `ui/**` | Reusable presentation primitives without business dependencies. | `ui`, `shared-types` |
| `worker` | `worker/**` | Worker scheduling and engine lifetime; algorithms remain in core. | `worker`, `core`, `legacy-core`, `shared-types` |
| `utils` | `utils/**` | Existing mixed utilities, not the default home for new business logic. | `utils`, `shared-types`, `metadata` |
| `components` | `components/**` | Business UI composed from common UI and public capabilities. | `components`, `composition-contract`, `ui`, `core`, `services`, `platform-public`, `utils`, `shared-types` |
| `hooks` | `hooks/**` | State ownership, user workflows and resource lifecycle. | `hooks`, `coach-agent-client`, `coach-agent-contract`, `domains`, `core`, `services`, `platform-public`, `utils`, `shared-types` |
| `services` | `services/**` | Service adapters; application code uses public platform facades. | `services`, `platform-public`, `platform-internal`, `platform-sdk`, `shared-types` |
| `shared-types` | `types.ts` | Cross-layer domain types, independent of upper layers. | 无 |
| `metadata` | `package.json` | Repository version and package metadata. | 无 |
| `app` | `{App,AppController,index}.{ts,tsx,js,jsx,mjs,cjs}` | Application composition and startup. | `app`, `components`, `composition-contract`, `hooks`, `domains`, `core`, `services`, `platform-public`, `utils`, `shared-types`, `styles` |
| `styles` | `*.css` | Application stylesheet assets. | 无 |
| `declarations` | `*.d.ts` | Ambient environment declarations. | 无 |
| `harness` | `harness/**` | Architecture and verification tooling; no business runtime imports. | `harness`, `metadata` |
| `script-adapter` | `scripts/run-tests.mjs`, `eslint.config.js` | Thin entrypoints into shared harness tooling. | `harness`, `metadata` |
| `tests` | `tests/**` | Behavioral tests, fixtures and shared test infrastructure. | `*` |

### 迁移例外

- `composition-contract` → `hooks`, `services`, `platform-public`, `utils`, `shared-types`，仅 type 导入。Existing AppViewModel composes hook return types; runtime coupling is forbidden.
- `hooks` (`hooks/gameActions/useEndGameAction.ts`, `hooks/gameActions/useMoveAction.ts`) → `legacy-bridge` (`utils/goLogic.ts`)。Existing end-game and move actions still import compatibility exports; no new files may do so.

### 检查范围与质量限制

- 文件：`**/*.{ts,tsx}`, `{agent,core,domains,hooks,components,services,ui,utils,worker}/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `{App,AppController,index}.{ts,tsx,js,jsx,mjs,cjs}`, `harness/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `tests/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `scripts/run-tests.mjs`。
- 排除：`dist/**`, `node_modules/**`, `android/**`, `*.config.js`, `*.config.ts`。
- 文件上限：400 有效行；忽略空行 true，忽略注释 true；大小豁免 无。
- 禁止内联配置：true；未使用禁用指令：error；suppression 白名单：无。
- 禁止显式 any、未说明的类型忽略及运行时循环依赖；外部数据先校验。
- `agent/**/*.{ts,tsx,js,jsx,mjs,cjs}` 禁止包 `react`, `react/**`, `react-dom`, `react-dom/**`, `@capacitor/**`：Teaching execution must remain independent of presentation and native SDKs.
- `core/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `utils/{micro-board,joseki}.ts` 禁止包 `react`, `react/**`, `react-dom`, `react-dom/**`, `@capacitor/**`：Core rules and inference must stay independent of React and native platform adapters.
- `components/**/*.{ts,tsx,js,jsx,mjs,cjs}`, `ui/**/*.{ts,tsx,js,jsx,mjs,cjs}` 禁止包 `@capacitor/**`：UI code must use the platform service instead of native SDKs.
- `**/*.{ts,tsx,js,jsx,mjs,cjs}` 禁止属性 `tap`，排除 `services/platform/taptap/**`, `tests/**`：Access the TapTap SDK only inside services/platform/taptap; use the public platform service here.
- 独立运行时 `public/service-worker.js`：Independent browser worker; covered by its dedicated runtime tests.

## 统一检查流程

完整流程：`contracts` → `lint` → `typecheck` → `test` → `build`；任一步失败立即停止并保留非零退出码。

| 阶段 | 验证内容 |
| --- | --- |
| `contracts` | 架构契约、复用入口、文档与命令一致性 |
| `lint` | 依赖边界、类型逃逸、循环与文件大小 |
| `typecheck` | TypeScript 全量类型检查 |
| `test` | Node 回归和 harness 负向测试 |
| `build` | Vite 生产构建 |

| npm 入口 | 实际命令 |
| --- | --- |
| `npm run check` | `node harness/run.mjs check` |
| `npm run lint` | `node harness/run.mjs lint` |
| `npm run typecheck` | `node harness/run.mjs typecheck` |
| `npm run test` | `node harness/run.mjs test` |
| `npm run build` | `node harness/run.mjs build` |
| `npm run harness:sync` | `node harness/contracts.mjs --write` |
| `npm run test:flows` | `node harness/run.mjs test:flows` |

- 本地与 `.github/workflows/quality.yml` 均运行 `npm run check`；npm 脚本必须与上述编排一致。CI 的 Windows/Ubuntu 配置不代表远端已执行。
- contracts 检查引用模块、命名导出、npm 入口、CI 入口、规则指引和本文是否漂移；默认只读，`harness:sync` 仅更新生成指南。
- `npm test -- tests/review-position.test.ts` 或 `npm test -- tests/harness` 只做局部回归；不能替代完整 check。
- CLI 按仓库位置解析依赖和测试路径，可在任意 cwd 调用；check 不接受跳过阶段或缩小测试范围的参数。

## 测试基础设施

- `harness/testing.mjs` 统一递归发现 `.test.ts` / `.test.tsx` / `.test.mjs`，打包 TS 后交给 Node test；`scripts/run-tests.mjs` 仅转发。
- `npm run test:flows` 复用 test 阶段，固定选择 `tests/flows`，直接调用业务逻辑走流程；全量 test 和 check 自动包含这些回归。
- MJS 测试需加载 TS 时复用 `tests/helpers/loadTestModule.mjs` 的 `loadTestModule` / `bundleTestSource`；不再自行搭建 esbuild、临时模块或全局 require。
- `reactHost: true` 显式启用 `tests/helpers/reactHooks.ts`；普通模块不替换 React。该 host 验证回调/清理，不等价于真实 React 并发渲染。
- 共用加载器负责仓库根路径、独立临时目录和失败清理；业务 fixture、断言、SDK 假实现保留在各自测试。
- `tests/harness` 包含实际 ESLint 反例、命令失败/选择器/跨 cwd 回归和契约漂移检查；约束变更须补独立预期。

## 能力边界

- Literal static/dynamic imports and require calls are checked; computed module paths are not a sandbox boundary.
- Allowed file-level legacy exceptions still require review when imports change within those existing files.
- Named reuse entries describe ownership; semantic copies, renamed duplicates and actual UI quality cannot be proven by lint.
- JavaScript files receive architecture checks but do not gain TypeScript type safety merely by being linted.
- 自动检查包含 Node 单线程 WASM 的真实 ONNX 推理；不包含真实浏览器、Android 和原生 TapTap 验收。涉及模型/SDK/交互时按 AGENTS.md 补对应环境的实测。
