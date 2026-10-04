# 代码健康治理与验收

2026-10-01。按用户要求直接修复已确认问题，保留现有 core / domains / hooks / components / platform 分层和玩家界面结构；没有升级运行时依赖或新增状态框架。

## 真实缺陷与修复

| 问题 | 处理与约束 |
| --- | --- |
| 首手黑子使整片未定空域被算为黑地，9 路显示领先 76.5 目 | 分离局中软估计与终局 flood-fill；局中按空点 ownership、俘虏、强证据死子和贴目估计，存活棋子不计目；UI 标注“预估” |
| ONNX ownership 直接从卷积输出，被错误当作 −1～1 | 在唯一输出边界执行 tanh 和黑方视角转换，保留整组判死阈值；不猜测 misc 输出尺度 |
| 同 render 摆棋丢首子、导入混入旧提子数、题目棋盘与设置尺寸不一致 | 完整 GamePosition 提交；删除 7 个单字段 writer，3 个最新值 refs 只读 |
| 题目提示/自动应手未计提子或进入历史 | 复用 recordMove，撤销仍能恢复完整局面 |
| 题目重置/退出后旧应手、旧结果弹窗回写；成功重复通知 | 绑定局面和题目会话，清理定时器；结果、完成记录由单一入口发布 |
| AI 思考期间导入同尺寸棋谱，旧 move/pass 作用到新盘 | 请求发出时绑定局面，回包与延迟落子分别校验，失效后允许新回合请求 |
| 复盘显示的落子前棋盘却携带多一手历史、反向执子 | 统一 selectReviewPosition；分析在滑块状态提交后执行，换手取消旧请求和旧覆盖层 |
| 清理死子后重新计算成就分数，丢失死子俘虏分 | 成就复用本次已结算分数，普通未结算调用保留原路径 |
| 联机超时/取消后迟到会话泄漏，旧房间回调改新房间，重复握手重置棋盘 | 分离会话资源、UI 状态、消息协议；延迟会话释放，握手幂等、消息 ID 去重、自身 echo 过滤 |
| 等待联机发送时重置，旧点击下到新盘；发送抛错锁不释放 | 发送成功后重新确认局面，finally 释放交互锁 |
| 从首页导入成功后首页仍遮挡棋盘 | 成功提交后触发进入棋局；失败不切换界面 |

同房间对手离线/返回的原体验保留；真实断线、主动取消、卸载和换账号才释放房间。新客户端消息带可选 ID，旧客户端仍兼容；无 ID 的旧消息不能保证跨回合完整去重。

## 防止继续堆积

- AppController 只组合流程；AI 结果应用放 useGameAiSession，复盘放 useGameReview，应用弹层/Toast 放 useAppUiState。
- useOnlineMatch 缩至 200 物理行；sessionLifecycle、roomMessages、types 各自负责资源、协议、契约。
- 撤掉最后两项超长文件豁免，统一 400 有效行。实际 ESLint 负向测试保证入口文件也不能越界。
- 类型债清单必须为空；依赖默认拒绝、禁止运行时循环、any 和内联禁用的规则继续生效。
- AGENTS.md 与架构文档同步实际边界。检查无法证明所有设计正确，但能自动阻止已知退化路径。

## 验证

- `npm run check`：严格 lint、全量 typecheck、**337/337 测试**、生产构建通过；`git diff --check` 通过。
- 新回归先暴露问题再修实现：入口状态、联机生命周期、模型输出、Worker 实时分数、旧 AI move/pass、终局成就。复盘新增历史契约与 hook 组合验收。hook host 测试不等同于真实 React 调度。
- **真实生产 Worker + 本地 ONNX/WASM：18/18**。5/9/10/13/19 路 × Easy/Medium/Hard，以及分析、stop 后继续、release/reinit 后继续。新增 ownership 范围校验及首手整盘误计反例检查。
- 本次 9 路首手中心、贴目 3.5 的模型实时预估黑领先约 **0.619** 目，之前为 76.5；19 路对应约白领先 9.169 目。这是软估计，不是官方 scoreLead 的精度保证。
- 实际浏览器 UI：9 路 Easy 落子和回复正常，“预估黑领先 0.6目”无布局溢出；摆棋两颗后开始，首手 AI 请求保留 2 颗初始子和正确历史；首页 SGF 导入直接进入对弈；双人两次停着结算正常。
- 实际复盘：第 1 手点击“结果”后发送最终 4 手（含两次停着）的局面；滑回第 1 手发送 1 颗黑子、白方行棋、1 手历史，旧分析取消，新分析完成。
- 生产构建只有既有 Browserslist 和 ORT eval 提示；浏览器看到的资源错误仅 favicon.ico 404，未见应用运行异常。

证据：[模型 18 项结果](../output/playwright/onnx-code-health.json)、[实际对弈画面](../output/playwright/code-health-live.png)、[复盘请求/响应](../output/playwright/code-health-review.json)、[复盘画面](../output/playwright/code-health-review.png)。复跑模型入口仍为 `scripts/verify-onnx-browser.mjs`，Worker 文件 hash 为 `ai.worker-CJK5aE97.js`。

## 验收边界

- TapTap CLI 已在前轮完成官方 CLI/doctor/scope 验证，本轮没有远端平台写入。SDK 回归使用 fake SDK；原生双端、移动触屏、Android 仍未验收。
- 本地模型无 checkpoint/版本/尺度元数据；ownership pretanh 契约参考 [KataGo v1.12.4 官方实现](https://github.com/lightvector/KataGo/blob/v1.12.4/cpp/neuralnet/nneval.cpp#L961-L976)，图内直接输出 Conv 且没有 Tanh。未知 misc 标度没有用于展示或终局。
- Android 工程不在当前工作树，`version:sync` 仍引用缺失脚本；本次不把 Web 验收当作 Android 发布链路通过。
- 终局展示标志仍独立于撤销局面，异步题库网络加载与真实平台行为仍需对应场景审查。工程检查不能承诺永远没有技术债。
- 修改留在本地工作区；未提交、推送、上传或发布。
