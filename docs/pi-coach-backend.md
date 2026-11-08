# Pi 围棋讲解后台

前端与后台独立运行、分别部署。用户在前端选择服务商、填写自己的 API key；端侧规则与 ONNX 生成局面证据，Node 后台嵌入官方 `@earendil-works/pi-agent-core@1.4.0`，使用本次请求的 key 调用模型。系统提示、Pi 执行和服务商地址选择在后台，前端不直接调用模型。

## 本地运行

要求 Node.js 22.19+。首次运行 `npm ci`，然后：

```powershell
Copy-Item .env.coach.example .env.coach.local
# 核对端口及允许的前端 origin；此文件不填写模型 key。
npm run build
npm run coach:start
```

另一个终端启动前端：

```powershell
npm run dev
```

打开 `http://localhost:3001`，进入陪练 → 设置 → 陪练讲解服务，选择 DeepSeek 或 OpenAI，填写该服务商的 API key。高级设置里的后台地址填 `http://127.0.0.1:8787/api/coach`；模型名称可改为该服务商支持流式工具调用、兼容当前 Chat Completions 参数的模型。并非任意模型都能使用。

前端用公开的 `VITE_COACH_ENDPOINT` 在构建时预设完整后台地址，正常发布后玩家只需选择服务商并填 key。没有后台地址或 key 时继续本地讲解。Vite 不代理后台请求。设置升级到 v3，清除 v1 直连配置与 v2 后台令牌，不迁移旧凭证。

key 默认仅保存在当前打开期间；主动勾选“记住”才写入本机站点存储。切换服务商或后台地址会清空待提交的 key，需要重新填写。清除 key 后云端请求停止，本地功能保留。

## 配置与部署

GitHub Pages 对应的阿里云服务、HTTPS 入口和运维方式见 [阿里云部署](deploy-aliyun.md)。前端构建从 GitHub 仓库变量读取公开的 `VITE_COACH_ENDPOINT`；后台服务与模型凭证仍分别管理。

| 后台变量 | 用途 |
| --- | --- |
| `COACH_HOST` / `COACH_PORT` | 默认 `127.0.0.1` / `8787` |
| `COACH_ALLOWED_ORIGIN` | 浏览器调用时必配的一个前端 origin，例如 `https://game.example.com`，无路径、尾斜杠或通配符；同源部署也须明确配置 |

`npm run build` 顺序构建前端 `dist/` 与后台 `dist-server/main.mjs`。静态站点只部署 `dist/`；Node 服务部署 `dist-server/`、`package.json`、`package-lock.json`，执行 `npm ci --omit=dev` 后启动。后台从进程环境或工作目录下被 Git 忽略的 `.env.coach.local` 读取监听配置；生产环境优先使用部署平台的环境变量。HTTPS 由部署平台或反向代理提供。任何 key 都不得作为 `VITE_*` 注入前端构建。

模型费用由用户的服务商账号承担。后台不保存 key 或聊天会话，不记录请求正文和 Authorization；部署平台的日志策略需单独核对。当前没有应用账号鉴权或按用户限流，进程级并发限制和精确 CORS 不等于这些能力。Android/TapTap 客户端须使用可访问的 HTTPS 后台地址，并按实际运行环境验证跨域、域名准入与模型资源加载。只上传 H5 静态文件不会启动 Pi 后台。

## 接口与执行边界

`POST /api/coach`，`Content-Type: application/json`，必须携带 `Authorization: Bearer <用户的模型API-key>`。不再使用后台共享令牌。

已处理的模型调用失败、执行超时、调用上限与无效输出返回 HTTP 424，并保留固定脱敏 JSON `code` 和 CORS 头；避免公网代理将应用的 502/504 替换成不带跨域头的网关错误页。401/403/400/429 等鉴权、输入和并发拒绝状态保持独立。

```json
{"provider":"deepseek","model":"deepseek-flash","evidence":{"boardSize":9,"boardRows":["…"]},"question":"为什么先观察角部？"}
```

以上仅展示外层结构；实际 `evidence` 必须是 `domains/coach/context.ts` 生成的完整、有界上下文，不能使用示例中的省略棋盘。成功响应为 `{"text":"模型输出的讲解 JSON","usage":{"modelCalls":1,"inputTokens":1200,"cachedInputTokens":800,"outputTokens":50}}`（usage 数字仅为结构示例，服务商未提供用量时省略）；该文本沿用 `{kind:"explain",text,refs}` 协议，端侧检查JSON、引用ID、长度/句数与棋盘范围，绑定圈点后直接展示云文案，不再对引用项做数字或坐标字面匹配。后台校验输入形状与限额，不声称独立重跑了端侧规则或 ONNX。

`shared/coach.ts` 是前端与后台共用的服务商、模型校验及 wire 类型。服务商地址固定映射至 DeepSeek/OpenAI 官方 API，客户端不能覆盖 base URL。key 只经请求头进入本次执行，不进入 prompt、工具证据或返回值；错误使用固定脱敏文案。

每请求创建独立 Pi Agent，不持久化多用户聊天状态。首轮 user 消息直接附带完整最新局面和已有引擎分析，普通讲解可一次模型调用完成；只读工具用于可选复查，不再强制先调用 read_position。工具只有 `read_position`、`read_teaching_choices`、`read_engine_analysis`，读取本次请求的不可变快照。教学工具只筛选已有条目，引擎工具只读取端侧结果；都不会新增搜索、检索整个课程或读取完整棋谱，也没有文件、命令或任意 URL 工具。

最多 3 次模型请求、6 次工具调用；每次输出上限 768 token、无自动重试。Pi 超时 24 秒、HTTP 25 秒、前端 30 秒；HTTP 断连向 Pi 传递取消。请求上限 64 KiB、证据上限 6000 字符、最多 4 个并发。失败和无效讲解保留端侧原有本地兜底，旧局面回包仍拒绝应用。

## 默认模型输入与缓存

固定前缀为简短 system prompt 和顺序稳定的三个工具定义；最新问题与完整局面作为最后一条 user 消息发送。默认可见：完整棋盘 B/W/.、行棋方和玩家颜色、尺寸/贴目/难度、提子与手数、上一手、相关棋块、规则候选、至多 12 个可引用教学项；有 ONNX 时还含候选 prior/visits/黑方价值、合法短变化、一步效果、软形势估计、九区域归属均值和真实停着分支。具体追问最多附最近三轮标记过局面归属的对话；不附完整聊天、完整棋谱、原始模型权重或原始全盘浮点张量。

OpenAI 的缓存路由键由进程随机盐对用户 key、模型和 prompt 进行 HMAC 后生成，发送为 Pi `sessionId`（供应商参数 `prompt_cache_key`），不泄漏 key、也不保留聊天；服务重启会更新路由键。显式使用 `cacheRetention: short`，不受环境变量误切换到 24 小时保留。DeepSeek 使用默认自动前缀缓存，不发送 OpenAI 的缓存参数。每步仍发送最新棋盘，不用旧局面换取缓存命中，也不填充无用文字或累积整个棋谱。

可用量时，响应 `usage` 汇总本次所有模型回合的输入、缓存读取和输出 token；`cachedInputTokens / inputTokens` 是本次输入缓存占比，`inputTokens` 包含 cacheRead/cacheWrite。任一模型回合缺少或含无效用量时省略整次 usage，而不是用部分数字假报总命中率。程序回归证明参数、前缀稳定和计数正确；2026-10-25的14条完整DeepSeek实测响应输入缓存占比为37.72%，详见[真实模型基线](verification/2026-10-25-coach-real-model.md)，不能保证后续命中率或时延。缓存规则依据：[DeepSeek](https://api-docs.deepseek.com/guides/kv_cache/)、[OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching)。

## 验证入口

`npm run check` 包含前后端构建与全部回归。`tests/coach-pi-runtime.test.mjs` 使用真实 Pi SDK 和本机流式模型 fixture；`tests/coach-pi-provider.test.mjs` 验证固定地址分发及用户请求隔离，`tests/coach-pi-http.test.mjs` 验证真实 HTTP 生命周期。它们验证程序行为，不证明真实模型讲解质量或生产部署可用性。

## 分析内容与提示词

当前讲解覆盖棋块与气、打吃与解围、合法提子与连接、上一手效果、围棋规则，以及局中已有的 ONNX 候选和短变化，以及粗略形势、九区域归属摘要、实际搜索的停着分支、已访问候选之间的定性比较。归属是搜索访问节点的平均，不能解释为每候选的终局结果；原始策略先验、访问数和黑方价值供模型理解，不直接作为精确胜率、目数或推荐分输出。文本提问最多提取两个指定坐标，局中浅搜预算为 8/16/24 次访问；底层接口上限为三个点、32 次访问，不能当作当前 UI 已覆盖。模型忙碌、缺失、超时或局面变更时降级规则证据。

复盘和终局讲解未接入局中的浅搜回调；复盘领地图的分析不会自动进入 Pi。当前没有云端独立深搜、完整棋谱逐手得失评估、确定死活证明或跨局记忆。H5 能否调用还依赖后台实际部署与平台运行环境验收。

系统提示集中在 `server/coach/prompt.ts`：具体问题先直接回答，再讲必要原因；hint 才优先关注危险棋块；规则事实、浅搜建议和课程概念分开使用；证据不足时讲清已知和具体未知。新 explain 正文只接受一句、最多 50 字（不设字数下限，能短则短），最多三个引用，建议最多三个圈点；合法点更多时完整绑定，不因此丢弃云文案。数气先报数量，未问气点时不逐点列举；不能为了简短删除必要规则条件。自动提醒可静默，手动提问必须回应。提示词不能替代端侧校验，也不能创造尚未接入的棋力能力。行为评测方案见 [prompt 评测](coach-prompt-evaluation.md)。

具体点位在模型 JSON 内使用棋盘范围内的坐标；端侧统一大小写和全角写法，校验后复用现有棋盘标记：单点正文显示“这里”并画圈，多点按正文出现顺序显示①②③，棋盘标同序数字，重复位置复用标记。模型直接写无绑定的“这里”“此处”或圈号会回退本地讲解，不让正文指向不存在的圈点。历史追问附带原圈号与坐标的短对照，玩家界面的历史文字仍保留圈号。端侧从最近带标记的一轮解析明确圈号或唯一单点指代，生成questionReferences并参与本轮选材/ONNX关注点；歧义不猜，历史结论不代替当前事实。旧局面标记不会直接绘到新棋盘。

官方接口依据：[Pi Agent 1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/agent/README.md)、[Pi AI 1.4.0](https://github.com/earendil-works/pi/blob/v1.4.0/packages/ai/README.md)。

默认模型名于 2026-10-25 核对：[DeepSeek 模型文档](https://api-docs.deepseek.com/quick_start/pricing/) 的 `deepseek-flash`、[OpenAI 模型文档](https://developers.openai.com/api/docs/models/gpt-4.1-mini) 的 `gpt-4.1-mini`；当前未进行付费真实模型验收。
