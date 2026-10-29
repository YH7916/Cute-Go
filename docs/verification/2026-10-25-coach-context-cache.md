# 简洁讲解、ONNX 证据与前缀缓存验收

日期：2026-10-25。沿用用户自带 key、后台 Pi 执行的独立前后端结构；没有提交、推送或部署。

## 改动

- system prompt 实测 544 字符，保留教学目标、证据边界与输出协议；字段含义放在固定工具定义。新 explain 正文只接受一句、最多 80 字，目标 30–50 字；超限拒绝而不截掉规则条件。既有本地正文和 parts 材料不被这条新协议裁切。
- Pi 首轮 user 消息直接携带最新完整棋盘与有界教学/引擎证据；不强制先调 read_position。普通回答可一次调用完成，可选复查仍受最多三次模型请求、六次工具调用约束。
- ONNX 现有 ownership 沿 Worker → lifecycle → hook → agent 保留，验证尺寸、有限值和 [-1,1] 后复制，再生成九区域均值。语义是搜索访问节点的黑方归属平均，不能当作每候选终局图或确定死活。
- 真实 root pass 分支保留 visits/prior，仅访问过时提供黑方价值；未用分析响应的 move:null 占位当停着建议。候选/pass 共用 AnalysisMoveEvaluation，搜索只增加结果序列化，没有修改搜索策略、访问预算或 Hard 选点行为。
- 端侧生成可引用的粗略形势、明显区域归属、停着分析状态和至多三组候选两两比较；指定坐标优先。结构化 prior/visits/value 用于理解，正文不直接报告精确胜率或目数。上下文仍不超过 6000 字符、12 项依据、3 个引用/圈点。
- 固定 system/tools 前缀，动态局面放最后；OpenAI 按用户 key、模型与 prompt 用进程盐 HMAC 生成匿名缓存路由键，显式 short 保留。DeepSeek 使用自动前缀缓存。每次仍是独立 Agent，不累积旧棋盘，不让 key 进入模型消息。
- 响应可带供应商用量统计；任一模型回合缺少/含无效用量则省略整次 usage，避免将部分输入假报为完整命中率。缓存占比为 cachedInputTokens/inputTokens。

## 实际验证

- 最终 `npm run check` 退出码 0：contracts → lint → typecheck → test → build 全通过，**1391/1391**，0 失败/跳过；前后端生产构建成功。日志：`output/coach-compact-check-final.log`。
- `git diff --check` 退出码 0。未修改架构允许矩阵、额度或检查编排。
- 新输出限额、ownership/pass 引用、三候选指定两点比较先补失败回归再实现；非 Pi 陪练 486/486，字段管线与搜索/真实 Worker 消息入口/Hook/Hard 回归 92/92。
- 真实 Pi SDK + 本机 SSE fixture 验证首轮可直接回答、当前完整 snapshot、不带旧问题、可选工具、3/6 限额、取消、缓存路由稳定及用户/模型隔离。强设 PI_CACHE_RETENTION=long 仍不发送 24h，DeepSeek 不接收 OpenAI 缓存字段。
- 两种供应商的合成 usage 字段累计正确；首/末回合缺少 usage 的反例先失败，再修为省略整个统计。缓存/HTTP 定向 24/24 通过。所有缓存命中数字均为 fixture，不是线上命中实测。
- 真实 Headless Chrome 156 + 生产 Worker + 仓库 ONNX/WASM：**20/20** 场景通过，覆盖尺寸/难度、分析、stop/release 恢复和新增黑白 9 路陪练证据。两份真实 ownership 均 81 点并生成九区域摘要；两份 pass 都为 0 visits、无价值估计；合法新局面拒绝旧引擎证据。详细结果见 [真实 ONNX 报告](../../output/playwright/pi-onnx-evidence-report.md)，原始数据及模型/Worker 哈希同目录保存。

## 限制

真实浏览器覆盖 Worker/模型/agent 证据校验，完整 React Hook 传递仍以 Node 回归验证；没有把它称为浏览器整链验证。没有付费模型教学质量、真实缓存命中率/费用/时延或 TapTap/Android 原生验收。

复盘/终局尚未接入局中浅搜回调；Pi 没有新增云端棋力搜索。当前候选、价值和归属是有预算的浅层证据，不证明最佳手、真实终局比分或棋力提升。构建保留既有 Browserslist 过旧及 ONNX 依赖 eval 提示，未升级依赖。

运行、默认输入及缓存参数见 [后台说明](../pi-coach-backend.md)，真实模型教学质量仍按 [评测方案](../coach-prompt-evaluation.md) 另行检验。
