# Cute-Go 渐进式重构计划

日期：2026-05-06  
分支：`refactor/modular-arch`  
策略：每阶段独立commit，编译通过才继续

## 目标

将 App.tsx（2686行）拆解为模块化架构，目标 ≤300行。  
删除云端AI（useCloudKataGo）和 Supabase，迁移到 TapTap 原生能力。

## 阶段列表

### P0 — 工具链配置
- [ ] 新建 `refactor/modular-arch` 分支
- [ ] 添加 ESLint（@typescript-eslint, import/no-cycle, eslint-plugin-boundaries）
- [ ] 添加 Prettier
- [ ] tsconfig.json 开启 strict: true
- [ ] 修复所有 lint/type 报错
- **验证**：`npm run lint` 通过，`npm run build` 通过

### P1 — 拆分 core/ 层
- [ ] 创建 `src/core/board/`：createBoard, getNeighbors, getBoardHash
- [ ] 创建 `src/core/go/`：rules.ts, scoring.ts, sgf.ts（从 goLogic.ts 提取）
- [ ] 创建 `src/core/gomoku/`：rules.ts, ai.ts（从 goLogic.ts 提取）
- [ ] 删除/精简 utils/goLogic.ts
- **验证**：编译通过，围棋/五子棋游戏功能不变

### P2 — 整理 inference/ 层
- [ ] 创建 `src/core/inference/engine.ts`（从 onnx-engine.ts 迁移）
- [ ] 创建 `src/core/inference/protocol.ts`（Worker 消息类型）
- [ ] 删除 useCloudKataGo（云端AI）
- [ ] worker/ai.worker.ts 内部围棋/五子棋逻辑分段注释
- **验证**：本地 AI 对弈正常

### P3 — 提取 useTsumego
- [ ] 创建 `src/domains/tsumego/useTsumego.ts`
- [ ] 从 App.tsx 移出死活题相关 state/effect/logic
- **验证**：死活题功能正常

### P4 — 提取 useOnline
- [ ] 创建 `src/domains/online/useOnline.ts`
- [ ] 从 App.tsx 移出在线对战相关逻辑（WebRTC + ELO）
- **验证**：在线对战正常

### P5 — 提取 useAuth（TapTap 迁移）
- [ ] 创建 `src/domains/auth/useAuth.ts`
- [ ] 删除 Supabase 依赖，接入 TapTap 登录
- **验证**：登录/登出正常

### P6 — 统一 ui/common/ 组件库
- [ ] 创建 `src/ui/common/Modal.tsx`（统一所有模态框基础）
- [ ] 创建 `src/ui/common/Button.tsx`
- [ ] 创建 `src/ui/common/Toast.tsx`
- [ ] 迁移现有 20+ 模态框使用统一基础组件
- **验证**：UI 视觉不变

### P7 — useAppSettings 重构
- [ ] 将 14 个独立 useState 合并为单一 settings 对象
- [ ] 改用 useReducer 管理
- [ ] 持久化逻辑统一
- **验证**：设置持久化正常，页面刷新后恢复

## 不动的文件

- `src/utils/types.ts` — 全局类型，保持原样
- `src/utils/themes.ts` — 主题系统
- `src/utils/helpers.ts` — ELO计算、版本比较
- `src/utils/aiConfig.ts` — AI难度配置
- `src/components/common/TopBar`, `StoneSkinPreview`, `RenderStoneIcon`
- `vite.config.ts` — 代码分割配置

## 当前进度

- [x] 计划文件创建
- [ ] P0 开始
