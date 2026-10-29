# 当前架构与治理边界

更新：2026-10-25。目录位于仓库根部，没有 `src/`。旧重构计划不是当前进度表。教学本轮实现与未覆盖内容见 [教学设计](teaching-agent-design.md)，实际验收见 [互动教学验收](verification/2026-10-03-interactive-teaching.md)。

本文包含状态入口、模型语义和联机生命周期的最新治理，见 [代码健康验收](code-health-2026-10-01.md)。首次护栏审计见 [审计报告](harness-audit-2026-10-01.md)，结构治理见 [第二轮记录](code-governance-2026-10-01.md)，平台验证与限制见 [TapTap 治理记录](taptap-governance-2026-10-01.md)。以源码和重新执行的检查为准。

## 真实执行路径

- 渲染：`index.tsx → App.tsx → AppController.tsx → components/AppView.tsx`。
- 对弈：`AppController → hooks/useGameActions.ts → hooks/gameActions/* → domains/game/positionState.ts`。局面含棋盘、行棋方、双方提子数、末手、连续停着数、历史；对弈、导入、摆棋入口均提交完整快照，`readPosition()` 同步读最新值。单字段写接口已删除，最新值 refs 只读；gameOver 等展示/终局状态暂时独立。
- 棋盘：`components/GameBoard.tsx` 组合 `components/board/*` 的几何/牵丝/表情/气线派生、交互 hook、SVG 图层；规则仍来自 core。
- AI：`hooks/useGameFlow.ts → hooks/useWebKataGo.ts → hooks/aiRequestLifecycle.ts → worker/ai.worker.ts`；调度/引擎生命周期位于 `core/inference/scheduler.ts`、`worker/engineLifecycle.ts`，围棋推理调用 `core/inference/*`。
- 围棋难度：启蒙复用 `core/go/ai.getBeginnerAIMove` 的局部启发式；简单也使用同一局部前三候选，单次模型推理只把候选抽样权重调整到 1–3，不引入全盘推荐点。模型优先停着与无候选时的合法落子兜底仍由 Worker 管理。中等保留一次推理后的前八候选抽样；困难单次推理后按模型策略概率选择最高的合法着手，不做搜索重排或随机采样，并尊重模型首选停着，不受半盘手数门槛限制。共享多次搜索仅用于分析与陪练证据；配置中的中等 simulations 目前不参与搜索。分档未做段级/Elo 标定，实测与限制见 [简单档衔接验收](verification/2026-10-02-easy-difficulty.md)。
- 五子棋：同步 `core/gomoku/ai.ts` 与 Worker 都调用 `core/gomoku/search.ts`；`profiles.ts` 明确保存两端既有深度、宽度、排序、预算差异。真实 Worker 入口仍需单独回归。
- 异步结果：`core/inference/protocol.ts` 统一 requestId/generation；`useGameAiSession` 在请求发出时绑定局面，move/pass 都校验请求局面，延迟落子再校验一次。终局计分使用同一快照及结算分数，界面和成就不重复计分。
- 模型语义：`core/inference/outputs.ts` 校验张量并将 pretanh ownership 归一化到黑方视角；`core/go/liveEstimate.ts` 负责局中软领地估计，`core/go/scoring.ts` 保留终局数目法。未根据未知导出尺度使用原始 misc 值。
- 复盘：`useGameReview → domains/game/reviewPosition.ts`，显示与分析共享 before-action 快照、执子、提子数、历史前缀。试下由 `useGameReview` 持有独立根局面与完整 PositionAccess，落子/停着/悔棋复用规则及 positionState，不写回原谱。切手、换局或退出清理旧分支；连续两次停着后须先回退才能继续试下。历史问答和收藏快照通过复盘展示，不能替换实战状态。同一本谱的历史讲解同步定位到对应手数，外部收藏保持独立试下。
- 在线与账户：hooks → `services/platform` 公开接口 → `providers/taptapPlatform.ts` → `taptap/*`。`useOnlineMatch` 管 UI 状态；`hooks/online/sessionLifecycle.ts` 管请求与房间释放；`roomMessages.ts` 管握手、重连和消息幂等。SDK 适配、身份解析、本地档案、连接、房间与事件转换各自独立。组件环境判断和振动只使用公开 facade。
- 陪练：`useCoachSession → agent/coach/client.ts → 教学 Worker → runtime.ts → domains/coach/evidence.ts / context.ts / response.ts / services/coach/client.ts`。端侧规则与 ONNX 负责分析，云端依据证据组织简短表达：新响应为 `{kind:'explain',text,refs}`，兼容旧 `parts` 选项协议。系统提示与 renderer 通过 `getCoachResponseLimits → teachingRequest` 共用限额：新 explain 正文统一最多 50 字、一句、三个引用；圈点建议最多三个，合法点更多时仍完整绑定；旧 parts 保留原有三点上限。云文案直接采用，客户端只检查JSON结构、有效引用ID、长度、句数、棋盘范围和标记绑定，不再用variants的数字/坐标白名单或确定性词匹配裁决语义。支持单个完整JSON围栏、换行和坐标写法归一化；格式通过不证明棋理正确。校验失败静默保留本地正文和圈点，返回 `cacheable: false`，不缓存为成功回答，用户可再次手动请求；网络、鉴权等服务错误仍提示，取消继续失效旧请求。正文坐标统一大小写与全角后，按提及顺序转为“这里”或①②③，重复位置共用编号，只画实际提及的点；模型直接写无绑定的“这里”“此处”或圈号会回退本地讲解。Worker 不可用时复用同一端侧 runtime，故障不自动重发云请求。讲解通过 `services/coach/client.ts → POST /api/coach → server/coach/http.ts → provider.ts → runtime.ts` 进入独立 Node 后台的官方 Pi Agent；后台持有系统提示和只读围棋工具，按固定服务商地址映射使用本次请求的用户 API key；模型与服务商由用户选择。每请求独立 Agent，首轮直接附完整最新快照，通常无需工具往返；固定 system/tools 前缀与按用户/模型隔离的 OpenAI 匿名路由键用于前缀缓存。响应可带服务商实际 usage 计数，未知时不填；最多三次模型调用、六次工具调用，不自动重试；断连/超时取消推理。前端配置服务商、模型和 API key，通过 Authorization 请求头交给后台；后台地址通常由公开的 VITE_COACH_ENDPOINT 预设。shared/coach.ts 统一前后端协议及校验。旧直连与后台令牌协议已删除，v3 设置默认不持久化 key；后台独立部署，无后台或 key 时继续本地讲解。系统提示按具体提问、hint 和上一手组织教学，保留规则条件与浅搜不确定性；评测方案见 [prompt 评测](coach-prompt-evaluation.md)。运行与限制见 [Pi 后台](pi-coach-backend.md)。
- 讲解上下文：`domains/coach/context.ts` 将请求证据限制在 6000 字符内，以完整 `boardRows`（B/W/.）表示棋盘，携带尺寸、难度、执子、行棋方、贴目、手数、提子、上一手、相关棋块和规则候选；不是棋盘截图或完整棋谱。ONNX 证据包含经校验的候选、prior、真实搜索访问所得的黑方价值估计及最多四手示例变化，未访问候选不伪造价值；这些浅搜信息不证明最优或死活。ownership 经尺寸/范围验证后传入陪练并压为九区域均值，语义为搜索访问节点的平均归属，不能当作单个候选终局图；真实停着分支保留 prior/visits 与仅已访问时的黑方价值。定性形势、区域和候选比较通过端侧生成的 engine 教学项提供依据，prompt要求不输出精确胜率或目数。`teachingChoices` 最多 12 项，按当前局面和问题选取，引用项的 `coordinates` 仅补充本地验证属于相关棋块或气点的提问坐标；这些字段提供事实与定位，不再作为云文案的字面坐标许可表。课程概念复用 curriculum 的 concept/misconception，不发送习题答案或把概念当作当前棋盘证明。默认不传对话历史；具体问题最多附最近三轮，标记 current/earlier 并限长脱敏；历史正文附原圈号与坐标的短对照，界面仍显示原讲解；端侧将明确圈号或唯一单点指代解析成questionReferences，参与当前棋块/概念选材与ONNX关注点。历史不作为棋盘事实，旧位置被提走时仍定位原点，不改指别处。超预算先移除完整可选项，不能容纳必要证据时回退本地。
- 对话归属：`useCoachSession` 本地保存当前会话最近六轮问答及原局面，并缓存最多八条成功回答；默认按钮按局面和意图复用，具体问题另绑定最近三轮对话，避免重复追问引用旧主题。配置了局中分析但暂时未取得 ONNX 结果时不缓存，模型恢复后可重新请求。局面、配置、账号、模式和请求版本控制迟到结果；新局和身份切换不串接旧问答。玩家落子后手动请求且已显示的讲解可保留到 AI 应手后的阅读阶段，标注原手数并可回看；旧圈点不画到新棋盘，玩家再次落子或重置即失效。回看原快照保留已完成回答，安静或失败的后台检查不清空可读讲解。终局允许手动提问、规则解释，自动本地预览与自动云点评静默，服务配置状态保持可用。
- 端云协同：局中手动讲解和提示即使未配置 API，也可经 `useGameAiSession.requestCoachAnalysis` 复用唯一 KataGo/ONNX Worker；正常应手优先，分析绑定完整局面与问题坐标。无指定点时预算为 8 次访问，每个指定点再增加 8 次；当前文本提问最多提取两个点（8/16/24 次），底层接口上限为三个点及 32 次访问；缓存最多八项分析，重置或释放引擎时清除。候选及示例变化重验合法性与劫，估计统一黑方视角；模型文字不直接落子。复盘与终局不接该局中分析回调，旧局面、取消、超时或模型不可用时继续规则讲解。API 配置由 `useCoachSettings` 管理；进入陪练保留现有棋盘尺寸、难度和执子，沿用所选难度的对手，不计竞技积分。设置中可选 5–19 路和启蒙/简单/中等/困难，点击“应用设置并重新开始”后生效；启蒙对手走局部规则，其他难度按既有 ONNX 分支执行。
- 陪练交互：`CoachAssistant` 是独立附加模块；普通对战和陪练共用 `TopBar / ScoreBoard / GameControls`。人物复用同一可聚焦拖动手柄，点击不触发提问或落子；正文与常驻的讲解／提示两个操作复用共享 `Panel` 和 `Button`，不再设置更多、单独形势、重复设置或收起按钮。讲解复用 `explain-position`，优先危险弱棋，其次上一手已验证的提子、解围、连接和停着，再讲当前开局或围空；提示仍是下一步观察。普通对弈和陪练均不提供常驻“回看棋谱”入口，避免局中误入不能直接续下的复盘模式；结算和导入棋谱复用已有复盘流程。复盘上方 GameControls 将上一手、设置页同款进度滑条、手数与下一手放在共享 Panel 的一行内，结果保留独立方形按钮，不再提供退出按钮；新增 AI 复用底部同一个 CoachAssistant 人物与气泡，仅保留讲解、试下，试下时显示返回原谱与撤回分支一步，不再在上方加工具栏或重复退出入口，设置沿用顶部入口。未配置云服务时只显示一行操作；已配置用户的提问框直接可用，草稿不受新回复影响。实战正文完整保留、可独立滚动，新回复复位阅读位置。竖屏棋盘由可用宽度确定正方形尺寸，导航、棋盘、陪练依次按内容排布；空间不足时允许整页纵向滚动，不按剩余高度压缩棋盘。气泡与人物底部对齐，正文按内容收缩，移除正文与按钮之间的分隔线；背景采用主题底色的 82% 不透明度，尾尖默认按人物嘴部高度定位，短气泡按可用高度夹紧尾尖与边框缺口的共同中心，避免压到圆角；高度不超过 739px 的竖向布局使用纵向 Flex，讲解框 sticky 吸底并在左侧让出人物位置，人物默认位于左下角、脚部与框底对齐，只有人物手柄与气泡接收点击。横屏仍为左右两栏，经典操作区可独立滚动；棋盘允许单指纵向滚页。布局依据及验收见 [横竖屏设计](design/coach-module-2026-10-03.md) 与根目录 `design-qa.md`。
- 人物拖动：`CoachAssistant / LearningExercise → components/coach/useCoachPlacement.ts → coachPlacement.ts` 共用同一定位入口。默认停靠保留既有布局；首次拖动以可见视口坐标浮动人物与气泡，保留原容器占位避免棋盘跳动。只接受主指针左键并捕获指针；点击不提问，取消恢复拖前位置，方向键移动，Home/Escape 归位。气泡依可用空间在右、左、上、下出现，尾尖避开圆角；窗口、可见视口和内容尺寸改变后重新夹紧，长正文继续内部滚动，卸载清理监听。位置仅为当前页面临时状态，不写入设置或棋局。
- 实战教学：实战自动本地预览和云请求统一等到玩家回合，以 `hint` 解释下一步的解围、提子或观察重点，不在玩家刚落子、AI 尚未应手时逐手点评。按当前一气棋块判断提醒必要性，包含 AI 普通应手后仍存在的危险；AI 已提走的棋不再提示解围，普通无危险局面保持安静。复盘本地预览和手动上一手讲解仍复用 `shouldExplainCoachPosition` 与历史重放证据。关键变化提醒在实战中常开，不另设开关；配置云服务后才可补充云讲解，复盘只允许手动云讲解。`proactive` 贯穿本地预览、必要性复核和云请求；无新见解可返回静默标记，但不清空已有本地提醒，手动问题误收标记则退回本地回答。讲解默认一两句，直接说动作和原因，不追加重复数气、固定提醒或概念前缀；禁入、劫、反提等必要条件和规则证据继续保留；具体合法解围提示优先于无解释的引擎推荐。自动云请求不提供回顾式 `last-action` 讲解项；补充加载时保留当前正文和阅读滚动位置，仅新正文复位，玩家再次落子则清除旧建议与圈点。详见 [简洁教学验收](verification/2026-10-02-coach-concise-teaching.md)。
- 规则与形势教学：真实玩家被拒绝的落子、点选已有棋子的查看动作 → `useCoachSession.explainIllegalMove` → 教学 Worker → `domains/coach/teaching.ts`。规则原因复用 `core/go/rules.inspectMove`，`attemptMove` 兼容调用同一实现，保持先提子再检查自杀/劫；规则讲解仅本地执行，不改变局面。局中手动形势教学复用同一个 KataGo 分析入口，即使没配置云端也能使用本地软估计；按黑方视角及玩家执子描述粗略方向，不能当作终局分数。
- 独立教学：首页“围棋课堂”与“陪我下棋”分别进入课程和陪练，新手引导首次自动打开，也可从围棋设置中重看。`AppController → useTeachingWorkspace → useLearningCenter / useLearningPractice / useLearningProgress` 持有独立完整局面；`LearningCenter / LearningExercise` 复用 GameBoard、CoachPet、CoachBubble、Panel、TopBar 和 Button，课堂直接接上次练到的题，课程目录按需打开；主屏只有一张棋盘。进入教学同步取消对局/陪练任务，暂停对局调度、模型自动初始化及复盘分析。来源档案保留固定版本 OGS 25 课/98 页与 Go Game Guru 4 课/16 题，共 29 课/114 步；这是选集，OGS 固定来源清单共有 248 课/3551 页，GGG easy 目录有 140 题。`curriculum.ts` 保留 26 课/100 步，依次数气与提子、解围与连接、眼形与做活、吃子与对杀、围地与终局、综合练习；省去数棋块、纯入门介绍、重复劫演示和提前给出假眼答案的一页，数气等基础练习仍保留。新手讲过的概念直接练习，新概念在每课第一题配一句介绍。入口按当前档案的 courseCursor 恢复：未完成留在原题，成功后进入下一题；旧档案按最新有效课程作答恢复，无有效位置才从首个未完成题开始。课内及跨课按顺序推进，已完成后的重练也不跳题。原题 ID、版本、棋形、执子和答案树保留，旧成绩仍有效；原始标记留在来源档案，练习初始画面只保留目标与候选标记，隐藏代数气、编号棋块和直接标出解答落点的标记。来源与许可集中在关于致谢。点棋块可看气，两层提示跟随当前变化节点。来源与覆盖限度见 [教学设计](teaching-agent-design.md)，实际验证见 [互动教学验收](verification/2026-10-03-interactive-teaching.md)。内容为 source-adapted，本地中文适配仍需专业审校；旧自编题集退出主目录，仅保留作回归与有限概念材料。
- 练习交互：`domains/coach/exercise.ts` 用共享规则判定棋盘目标、数气、已确认活棋的数地和有限连续变化；源题树经 sourceExercise.ts 逐步重放，仅原题明确正确节点记录成功（包含带后续解释的非叶节点）；尚未完成返回 continue，未知合法分支保持 unverified。停着、死子选择和结束计分分别判题。`exerciseInteraction.ts` 从当前 exercise 的完整起始局面生成同题示范，保留尺寸、执子、提子与劫历史；落子和对方应手分帧，数字题同图圈出真实气点或地，返回时恢复原作答局面。合法偏离目标后保留题目已有反驳，并停在反馈局面；未收录的合法分支标记为 unverified，不追加通用 AI 应手或继续自由试下，须重开或悔棋后继续练习。LearningCenter 用约 420 ms 展示学生落子后的快照再显示应手，定时器只改呈现状态，不落子；换题、关闭与卸载清理预览。选择题点选即判定；28 道来源选择题分别提供不报答案的错答观察线索和答对后的一两句原因，点讲解继续显示本次反馈。题干只交代目标，主动查看第二层提示或示范才给出解法。选错标记所选项并轻晃提示，选对用共享 Modal 显示正确与短解析，提供下一题按钮；中部操作区常驻悔棋、下一题、重开，分别使用回退、向右和顺时针圆箭头；示范时同一排切换为上一手、下一步、返回练习。本题示范及停着等专用动作放在人物气泡内，应手展示期间禁用棋盘、答案输入和全部练习动作；未完成跳题按原有 abandoned 记录。答对弹窗关闭后将焦点交给中部下一题，末题结束则返回课程入口。课程答对后按反馈长度停留 1.5–6 秒自动进入下一题；答错停留，打开讲解或查看棋块时暂停，换题、退出、切换档案或卸载使旧定时器失效。首次答案先保存再给反馈；看棋块、示范、提示、撤回和重复题不刷独立证据，仅更新练习自己的完整局面。
- 复盘教学事件：`reviewTeaching.ts` 从最近 240 手提取最多 8 个规则事件，不做引擎目损排序。已有收藏的一步提子/解围目标仍共用判题，其他保存片段；复盘页面已移除问答列表、规则重点、保存和收藏入口，历史及本地学习数据继续保留。复盘只展示一个完整教学要点，保留该项的完整条件和短句；正文与圈点一起重新映射，不显示被省略段落的标记，实战陪练和历史记录保留原文。
- 本地学习记录：`useLearningProgress → domains/coach/learning.ts / learningValidation.ts → services/coach/learningStorage.ts`。原始作答、提示曝光、收藏及课程续学位置按 owner 存入 IndexedDB，进度由 projectLearning 重算；存储操作按 owner 排队，账号切换拒绝旧回包。新题族无提示首答才产生独立证据；到期旧题本次无提示答对可推进 1/3/7/14/30 天日程，但不增加独立或迁移证据。续学位置不产生作答或提示证据，答题结果与同题游标完成状态原子写入；支持校验后的 JSON 备份合并与当前档案删除，合并保留时间较新的续学位置；读损坏保护旧数据，写失败显示未保存状态。当前无多端同步或服务端可信身份。
- 终局记录：同步与 Worker 计分只提交 finalScore 和结算结果，清死子产生的临时棋盘不覆盖正式 GamePosition；复盘终点保留真实动作后的原棋盘。试下、学习判题和模型回复不得改变该结果。
- 入门与棋谱：`domains/coach/beginnerTutorial.ts` 统一定义 11 页新手内容和稳定 ID：前 9 页恢复旧版气、提子、同生共死、禁入点、打劫、眼位与死活、虚手、数地、开局的顺序及棋盘尺寸，最后保留双指缩放与模式选择；保留禁入点、真两眼、实际提子和终局计算的规则修正，`beginnerPositions.ts / beginnerInteraction.ts` 复用 core 规则与完整 GamePosition。`useTeachingWorkspace` 提供同一内容对象，`TutorialModal` 保留原 UI 和指定页重看能力。首次使用自动打开，围棋设置中可重看；普通课程目录只列课程练习，不嵌入新手教程，新手浏览记录也不计课程独立练习证据。`TutorialGuide` 用简短探索页引导进入围棋课堂、本地双人、联机、AI 对战和陪练，复用现有启动入口。新手禁入与两眼摆图另有真实规则回归。SGF 导入导出继续走 `hooks/useImportExportFlow.ts → core/go/sgf.ts`；共享 `utils/sgfParser.ts` 保留。独立死活题功能及其 `domains/tsumego`、专属组件、数据加载器、清单生成脚本和 `public/Problems` 题库已移除。
- 教学文案：新手、课堂、陪练与复盘直接说明当前动作及原因；并列信息用短列表，必要规则条件留在同一条讲解中。人物气泡、新手页面与答对弹窗复用 `ui/common/text.tsx` 渲染纯文本段落和无序列表，不解释 HTML；默认讲解项仍受本地证据及引用数量限制。
- 宽竖屏对局：`AppView` 的 `game-layout` 在竖屏且宽度至少 640 CSS px 时，将现有提子卡置于原顶栏中间并与导航按钮同高；形势和对局操作并排，无形势时操作跨整行。棋盘使用可用全宽，半透明陪练沿用底部 sticky 布局，高度不足可纵向滚动。普通对弈、摆棋与复盘复用同一入口；窄手机、横屏与课堂保留既有路径。按可用视口判断，不识别设备品牌，竖屏平板同样适用。
- 样式：`index.html` 仍含 `btn-retro`、`inset-track` 等共享定义，不能仅搜索 `index.css`。

## 契约与复用方式

[harness/architecture.mjs](../harness/architecture.mjs) 是唯一架构数据契约，保存模块分类与职责、依赖关系、精确迁移例外、检查范围、文件预算和业务复用入口。ESLint 适配器与契约检查消费同一份数据；本页只叙述真实执行流程，不另维护允许依赖矩阵。[harness/commands.mjs](../harness/commands.mjs) 是唯一检查编排来源。

[harness 指南](harness.md) 从这些来源生成。更新契约或编排后运行 `npm run harness:sync`，不要手工改生成文档。迁移例外必须在契约中有明确文件和原因，不能把历史调用方的例外扩大为整个目录的权限。

新增实现前，先从契约的复用入口定位模块，再搜索实现、类型、调用方和行为回归。共享类型与 Worker 协议由现有入口同时供发送端、接收端引用；模型、状态、平台和 UI 应扩展既有职责，避免新建同义实现或转发层。需要通用抽象时，先证明至少两个现存实际消费者具有相同语义；职责拆分或平台边界可以只有一个消费者，既有策略差异应显式保留。

检查只验证可表达的工程约束。动态拼接的模块路径、改名后的算法复制、职责是否合理仍需审查；通过静态检查不等于完成架构验收。TypeScript 也不能替代网络和原生 SDK 输入的运行时校验。

## 验收入口和存量债

`npm run check` 通过共享编排依次执行 **contracts → lint → typecheck → test → build**，本地与 CI 使用同一入口。GitHub Actions 对 PR 和 main push 执行 Windows / Ubuntu 双平台检查。工作流文件存在不代表远端已经运行或分支保护已经配置。

`npm run test:flows` 直接执行固定业务流程：真实对弈 hooks、启蒙应手、悔棋与重开、陪练成功/失败/恢复、真实本地 HTTP 及模型 Worker 生命周期。测试复用生产规则与状态入口，不打开浏览器或读取玩家密钥；完整 `check` 同时包含这些回归。替代边界与运行方式见 [固定业务流程回归](testing-flows.md)。

ESLint 的历史文件级禁用已移除，`eslint-suppressions.json` 由测试强制保持为空。不得重建类型豁免或增加额度；外部 SDK 数据以 `unknown` 接收并运行时校验。

受检查文件与行数预算直接读取架构契约，不在文档或适配器另设额度；AppController/useOnlineMatch 已撤掉存量大小豁免。行数限制用于阻止继续堆积，不能证明预算内的文件职责合理。

`tests/harness/architecture.test.mjs` 通过实际 ESLint API 验证禁止和允许的依赖、循环、类型逃逸与行数限制。修改契约、适配器或验证编排须增加独立负向用例；不能仅从允许矩阵反推测试期望，否则规则误放行时测试也会随之通过。

`npm test` 递归发现 `.test.ts` / `.test.tsx` / `.test.mjs`。`npm test -- tests/...` 接受具体文件或目录，用于局部定位，不能替代全量 `npm run check`。

测试中的源码打包和模块加载统一复用 [tests/helpers/loadTestModule.mjs](../tests/helpers/loadTestModule.mjs)：`loadTestModule` 管临时模块和清理，`bundleTestSource` 提供 VM 等场景所需源码，调用方仍拥有各自测试环境。hook 测试显式开启 `reactHost`，仅验证回调、定时器与清理，不等同于真实 React 调度；棋盘静态渲染继续使用真实 React 和拆分前的 36 组完整 DOM/SVG 哈希。不要为统一加载器而统一不同运行环境或改写业务断言。

平台契约还由 TypeScript 检查。真实 ONNX 已在本机生产浏览器验收：18 项、UI 对弈/重开、预热后断网推理通过，见 [模型实测记录](onnx-runtime-verification-2026-10-01.md)；以后改模型/运行时可用 `scripts/verify-onnx-browser.mjs` 复跑。原生/Android 验证仍需单独执行。

## 后续治理顺序

| 优先级 | 独立改动 | 验收依据 |
| --- | --- | --- |
| P2 | 恢复模型来源/checkpoint/导出脚本，校准官方 scoreLead 与不同尺寸棋力 | 当前软估计与归一化已修复并实测；模型没有版本/尺度元数据，不能声称官方数值校准完成 |
| P1 | 课程专家复核、进阶多分支训练、真实学习效果评估 | 当前固定来源课程覆盖基础规则到局部战术及入门死活；完整布局、官子与引导实战尚缺，规则与有限变化验算不证明陌生棋形迁移或完整段级能力 |
| P2 | 按需求独立评审深分析、默认托管和多端同步 | 已有独立 Pi 后台及用户自带 key；未部署用户认证、按用户额度、官方深分析或同步服务 |
| P1 | 补移动端手势与原生在线对局验收 | 本机真实 ONNX 已通过；触屏、设备性能与平台 SDK 仍需对应环境检查 |
| P2 | 新增模式时继续收紧终局状态和异步讲解的所有权 | 局面写接口已统一；新流程需覆盖成功、失败、退出、重试，避免恢复单字段写入 |
| P1 | TapTap 原生环境验证登录、授权等待、快速退出/重连与双端房间切换 | 类型债已清零；fake SDK 回归不能证明设备事件格式、断线和真实服务行为 |
| P2 | 逐步迁移契约中明确列出的 legacy utils 调用方 | 搜索实际调用方，迁移后收紧对应例外、运行 `npm run harness:sync` 和 `npm run check` |

每项单独交付；先锁定原行为再替换实现。不要同时重写搜索、状态管理和 UI。
