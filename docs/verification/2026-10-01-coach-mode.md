# CuteGo 陪练首版交付与验证

日期：2026-10-01。状态：首版功能、全量工程检查和本机生产浏览器验收完成；真实供应商与 Android 真机未验。本文只描述此次陪练首版，不表示 [新手路线 M1–M6](../superpowers/plans/2026-10-01-beginner-coach-and-difficulty.md) 全部完成。

**后续状态**：用户随后要求删除独立死活题模块；首版记录保留，以下 430/430 与浏览器 19/19 均为移除前结果。最新范围及待补验收见 [文末追加记录](#后续变更移除独立死活题)。

## 已落地体验

| 范围 | 实际行为 |
| --- | --- |
| 首页 | 保持双列入口；原娱乐入口改为“AI 陪练”，死活题从教程进入 |
| 首盘 | 启动新 9 路围棋，玩家执黑，使用现有 `Fun` 对手；没有修改其搜索或棋力策略 |
| 助手 | 桌面侧边、手机棋盘下方状态栏旁；默认收起，点击展开、点击关闭或 Escape 收起；复用 `RenderStoneIcon`、公共 `Button`、`Panel`，不自动弹开 |
| 讲解 | “讲解这一手”“给点提示”、自由提问；可选“每回合自动讲解”，默认关闭 |
| 本地能力 | 根据真实规则提取坐标、气、提子、停着与合法局部候选；提示可标记棋盘候选点 |
| API 配置 | 玩家填写地址、模型、密钥；预设 DeepSeek / OpenAI / 自定义，地址与模型可编辑 |
| 错误与取消 | 未配置、超时或服务失败时保留本地提示；可继续下棋；旧请求不能覆盖新局面或新请求 |
| 结算 | 陪练不计竞技积分；普通 AI 和联机对局保留原结算路径 |

逐回合自动讲解在轮到玩家、局面稳定后触发；不是每次界面渲染都发请求。玩家主动提问、取消或局面改变会使旧的自动任务失效。LLM 只返回文字，不能直接修改棋盘或判定比赛结果。

## 模块与证据来源

- `domains/coach/evidence.ts`：本地规则证据与提示，复用现有规则模块；候选是局部建议，不宣称最优。
- `hooks/useCoachSession.ts`：请求、局面归属、取消、错误回退与自动讲解生命周期。
- `services/coach/client.ts`：兼容 Chat Completions 的网络边界、响应验证和安全错误信息。
- `services/coach/settings.ts`、`hooks/useCoachSettings.ts`：配置校验、内存密钥和本地存储。
- `components/CoachSettings.tsx`：预设与设置；`CoachAssistant.tsx`、`CoachPanel.tsx`：可收起的小助手及讲解内容。
- 启动、退出、重开与结算仍通过既有游戏工作流整合，不另建棋盘或落子算法。

## 接入与密钥行为

| 项目 | 实现与限制 |
| --- | --- |
| 协议 | POST `/chat/completions`，`model`、`messages`、`stream: false`、`max_tokens: 512`；从 `choices[0].message.content` 读取文字 |
| 地址 | HTTPS；本机 localhost / 127.0.0.1 / IPv6 回环允许 HTTP；支持基础地址或完整 endpoint；拒绝 userinfo、查询参数、片段 |
| 认证 | 非空密钥仅放入 `Authorization: Bearer`；本机兼容服务允许无密钥；远程缺密钥时不发请求 |
| 请求边界 | 30 秒超时；调用方取消；禁止跟随重定向，不携带浏览器凭据；浏览器仍受 CORS 限制 |
| 响应边界 | 响应体不超过 64 KiB，文字显示上限 1200 字符；检查未知 JSON 结构；不回显服务端错误原文或任意网络异常详情 |
| 保存 | 地址、模型保存在本机；密钥默认仅内存；明确勾选“记住密钥”才以明文保存在此设备的浏览器存储中 |
| 清除/切换 | 清除操作删除内存及记住的密钥；编辑地址或切换预设清空旧密钥输入与记住选项，重新保存后生效 |
| 存储失败 | 本次内存配置仍可用，并提示本机存储异常；不能声称浏览器拒绝访问时已成功删除其历史存储 |

讲解会将当前局面证据和玩家问题发送到玩家配置的服务；计费、模型可用性及 CORS 支持由该服务决定。应用没有内置共享密钥，也没有部署公共服务代理。

### 官方预设依据

2026-10-01 核对文档后采用以下默认值；模型与服务接口可能变化，配置仍可编辑。文档核对不等于真实账户调用通过。

| 预设 | 基础地址 | 模型 | 官方依据 |
| --- | --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` | [DeepSeek API 文档与首次调用](https://api-docs.deepseek.com/) |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` | [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) |
| 自定义 | 玩家填写 | 玩家填写 | 需兼容上述协议；本机服务可不填写密钥 |

## 自动回归记录

编号用于本次交付记录，现有测试入口及原断言保留。测试使用真实业务模块与替换后的网络/存储边界，不等于真实供应商或原生平台验收。

| 编号 | 测试文件 | 覆盖 | 已有结果 |
| --- | --- | --- | --- |
| C01 | `tests/coach-client.test.ts` | URL 安全与标准请求形成、认证、HTTP/网络错误、CORS 提示、未知/超大响应、密钥回显隐藏、取消、超时、无效证据 | 9/9 通过 |
| C02 | `tests/coach-settings.test.ts` | 默认不存密钥、显式记住/取消记住、写入失败清除旧记录、损坏数据回退 | 4/4 通过 |
| C03 | `tests/coach-settings-hook.test.mjs` | 内存密钥重开丢弃、主动清除、存储故障仍保留本次可用配置 | 3/3 通过 |
| C04 | `tests/coach-settings-ui.test.mjs` | 切换供应商和编辑地址清密钥；非法 userinfo 地址不进入保存回调 | 3/3 通过 |
| C05 | `tests/coach-evidence.test.ts` | 黑白视角/坐标、真实提子回放、打吃与救棋、自杀/劫排除、停着、候选限制、局面身份 | 12/12 通过 |
| C06 | `tests/coach-session.test.mjs` | 成功/失败回退、缺配置、本机免密钥、同步局面变化、迟到响应、请求交错、取消、自动与手动任务、卸载 | 17/17 通过 |
| C07 | `tests/coach-start-and-rating.test.mjs` | 新 9 路黑方陪练、旧任务清理、退出到普通模式、陪练胜负不计积分、普通/联机结算保留 | 7/7 通过 |
| C08 | `tests/game-ai-session.test.mjs` | 新增退出时旧 move/pass/scoring/延迟落子失效；保留原分析与复盘回归 | 9/9 通过，其中本轮新增 4 项 |

服务及设置 C01–C04 共 **19/19 通过**，对应文件局部 ESLint 和当时全量 TypeScript 检查通过。最终集成可能继续修改 UI，交付以主任务最后一次复跑为准。

复跑这些服务与设置专项：

```powershell
npm test -- tests/coach-client.test.ts tests/coach-settings.test.ts tests/coach-settings-hook.test.mjs tests/coach-settings-ui.test.mjs
```

最终全量门禁：2026-10-01 执行 `npm run check`，contracts → lint → typecheck → **430/430 tests** → build 全部通过；`git diff --check` 通过。日志：`output/coach-check.log`。未升级依赖；构建仍提示原有 Browserslist 数据较旧和 ONNX 第三方包 eval 警告。

本轮额外确认并修复：首页退出只改页面状态时，迟到的 AI 计分仍可能进入结算。先增加 4 个失败回归，再实现 `cancelAiSession()`，同步清理 Worker 请求、计分所有权、延迟落子和回合锁；首页回调先取消再退出陪练，保留已加载模型。

## 浏览器验收与截图

在生产构建 `http://127.0.0.1:4178/` 检查；桌面 1280×800、手机视口 375×667。截图已逐张检查，手机为浏览器模拟视口。自动浏览器流程 **19/19** 通过，另完成普通 ONNX 应手与教程入口检查。

| 编号 | 路径 | 结果/截图 |
| --- | --- | --- |
| B01 | 首页双列入口 → AI 陪练 → 9 路黑方首盘 | 通过；`output/playwright/coach-home-desktop.png`、`coach-home-mobile.png` |
| B02 | 棋子小助手默认收起、点击展开/收起；棋盘和操作按钮可用 | 通过；`coach-assistant-desktop.png`、`coach-assistant-expanded.png`；Escape 可收起 |
| B03 | 无配置提示、真实启蒙对手应手；模拟 API 成功/自由提问/HTTP 503/重开后旧回复失效 | 通过；`output/playwright/coach-browser-report.json`，4 次请求全部被测试路由拦截，无真实供应商请求 |
| B04 | 预设切换清密钥、默认不持久化、保存 API 不重开棋盘、表单可滚动操作 | 通过；`coach-api-settings-mobile.png`；记住/清除的持久化边界另由 C02–C04 验证 |
| B05 | 教程中的死活题入口；普通 AI 对战及返回首页 | 通过；`coach-tutorial-practice.png`；退出陪练后 9 路 Easy 完成真实 ONNX 推理并应手，`coach-normal-onnx-after.png`，本机一次推理约 109ms，不代表移动设备性能 |
| B06 | 窄屏/桌面布局、助手展开位置、设置滚动与遮挡 | 通过；`coach-assistant-mobile.png`，375px 视口保留完整棋盘，收起助手不遮挡落点或操作按钮；展开由玩家主动触发 |

复跑入口：`scripts/verify-coach-browser.mjs` 导出 `verifyCoachBrowser(page, baseUrl)`，使用 Playwright page 调用。它使用独立本机预览 origin 的测试偏好和拦截 API；不要对真实用户会话运行。真实 ONNX 验收未被拦截，使用本项目已打包的 Worker/模型；浏览器 WebGPU 不可用时既有 WASM 回退正常。

真实供应商 API：**未验**，未提供可用密钥，未发送付费请求。浏览器 mock 响应可验证本地行为，但不能证明服务商 CORS、账户权限、额度、延迟或讲解质量。

Android 原生/WebView：**未验**。本机浏览器通过不能替代触屏、键盘遮挡、跨域、后台恢复和设备性能实测。

## 未完成范围

- 未完成整套 M1–M6：新教程课程重排、教学进度/独立掌握记录、局后两个重点与复练闭环仍属后续方案。
- 未新增较强引擎的实时独立分析；当前证据以确定的本地规则为基础，不提供已校准目损、可靠最优手或完整死活证明。
- 未完成 LLM 自然语言中的所有坐标、数字、因果和变化的事实校验；提示词与规则证据只能降低幻觉风险，不能保证讲解完全正确。
- 未调整或标定启蒙/简单/中等/困难的真实棋力差距；陪练目前复用 `Fun`，不是已完成新手难度曲线实验。
- 未实现长期 Agent 学习者画像、自动能力诊断或长期记忆；本次不是完整自适应教学系统。
- 未验证真实供应商调用、Android 原生和零基础用户学习效果；没有据此作教学有效性或跨端兼容保证。

本次没有提交、推送、发布或上传密钥。

## 后续变更：移除独立死活题

2026-10-01，按用户明确要求移除整个独立死活题功能，保留教程里的数气、吃子等规则教学。首版 B05 的“教程中的死活题入口”和对应截图属于历史验收，不再代表当前入口。

### 专属源码与资产清理

删除前确认每个绝对路径均位于 `D:\Projects\Games\Cute-Go_Windows` 内，无目录链接/重解析点；实际删除使用 PowerShell `Remove-Item -LiteralPath`。

| 已删除的项目内路径 | 文件数 | 删除前字节数 |
| --- | ---: | ---: |
| `domains/tsumego/` | 3 | 25,292 |
| `components/Tsumego/` | 2 | 18,555 |
| `components/TsumegoListModal.tsx` | 1 | 4,815 |
| `components/TsumegoResultModal.tsx` | 1 | 4,941 |
| `utils/tsumegoData.ts` | 1 | 4,427 |
| `scripts/generate_manifest.js` | 1 | 3,925 |
| `public/problems_manifest.json` | 1 | 568,199 |
| `public/Problems/`（只有 `Tsumego/` 下 120 个 SGF） | 120 | 37,339 |
| 合计 | 130 | 667,493 |

题库资产只有独立题库加载链使用，教程不依赖它们。原 manifest 另含 5,479 个实际已不存在的官子题引用，随清单移除。共享 `utils/sgfParser.ts` 与 `core/go/sgf.ts` 保留；不删除既有陪练、普通对局和棋谱工具。

### 验证状态

- 文件检查：上述 8 个目标均不存在，共享 `utils/sgfParser.ts` 仍存在。
- 文档：README 与当前架构说明更新；旧首版和稳定性记录保留，不改写历史测试结果。
- 删除后的 `npm run check`：contracts → lint → typecheck → **432/432 tests** → build 通过，日志 `output/tsumego-removal-check.log`；`git diff --check` 通过。生产构建无题库清单/SGF 资产或专属代码引用。只移除被删除功能的专属测试，保留混合文件中的 SGF/CuteGo 导入、摆棋、联机落子断言。
- 浏览器：重新通过陪练 **19/19** 专项；375×667 视口实际完成教程提子、前后翻页，独立题库入口不存在，截图 `output/playwright/tutorial-without-tsumego-mobile.png`；旧 `Tsumego` 设置重新加载后回写 `PvP`，可落两手并悔棋回空盘。SGF/CuteGo 导入由真实 hook 回归覆盖，本次未单独再跑浏览器导入。
- Service Worker v4 → v5：新增先失败后通过的缓存迁移回归，旧题库缓存淘汰，模型与带版本的 WASM 缓存保留。此项为 VM 运行真实 Worker 源码的验证，不冒充真实设备离线升级。
- 真实供应商 API 与 Android 原生：仍未验。
