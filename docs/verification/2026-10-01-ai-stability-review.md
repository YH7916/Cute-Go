# AI 稳定性修改：技术评审记录

日期：2026-10-01。范围：M0 底层修复；新手课程、难度策略和 LLM 陪练暂不实现。

结论：已确认的生命周期/缓存缺陷完成修复，自动回归与本机真实 ONNX 验证通过；可以进入代码评审。尚不能据此宣称所有手机适配完成或直接发布。

## 修复依据与行为变化

| 原问题／触发条件 | 修改 | 验证依据 |
| --- | --- | --- |
| A 取消后 B 开始，A 的迟到结果可能被 B 接收 | 请求 ID、代际、Worker 实例身份共同校验；分析与落子分别路由 | 实际 hook 与 Worker 入口回归，先复现失败 |
| 取消仅解锁，旧 ONNX 尚未结束；释放/重载与推理重叠 | Worker 队列串行执行；当前 run 完成后停止后续搜索，再释放、重载 | 实际 Worker 入口：最大并发推理为 1，release 在 run 后 |
| 已收到结果、延迟 200ms 落子期间重开/悔棋 | 保存可取消计时器；应用前核对棋盘、历史、执子方 | 4 个延迟落子回归，原行为全部失败，修复后通过 |
| 终局分析返回时棋局已变化；使用新棋盘和旧提子数计分 | 绑定请求时棋局、贴目、提子数；重开/悔棋/结束/错误清理；拒收旧局面 | 计分快照回归；本地计分取消无必要的异步延迟 |
| 并发初始化重复建 session；dispose 后初始化可能复活 | 合并初始化；中止下载；等待现有推理与异步 release；代际检查 | 实际 engine + mock ORT/fetch 回归 |
| 分片模型 fallback 改用不存在的整包 URL，或重复创建 session | fallback 复用同一份模型数据，只尝试一次保守 WASM | 分片失败、重试、释放回归 |
| 无隔离、无线程/SIMD能力时请求未打包的 WASM 变体 | 检测隔离、SAB 传递、WASM 线程/SIMD；不满足则单线程 vanilla | 能力组合回归；本机两种真实浏览器环境 |
| value softmax 溢出；异常输出静默污染选点/显示 | 稳定 softmax；校验模型输出类型、形状和有限值 | 真实模型声明核对、异常输出回归、实际推理 |
| 稳定模型/WASM URL 永久命中旧缓存；根路径注册影响子目录部署 | 网络优先、HTTP 错误/断网缓存回退；WASM URL 带 ORT 版本；按应用 scope 管理缓存/注册 | 12 项实际 SW/入口源码 VM 回归，含旧缓存迁移 |

## 交叉评审拦下的回归

生命周期修改后，独立组合审查和实际浏览器验收发现并修复了四处集成问题，没有把单模块通过当作完成：

1. 永久加载失败触发自动重建循环：失败后锁住自动重试；用户重开/重新进入模式才恢复。
2. 后台取消初始化后，启动 effect 又重启：启动逻辑订阅页面可见性；隐藏时不启动，回前台恢复一次。
3. Fun 模式用户执白，自动启动 effect 取消 AI 第一手计时器：自动 effect 不干涉刚排好的本地落子；主动切换模式仍负责释放。
4. 真实页面中，Fun 计算结束后仍等待 200ms 落子，主流程误判锁过期并重复计算：等待有效落子计时器期间不重试。新增三 hook + 真实延迟落子组合回归，验证 180ms 计算 + 200ms 延迟后恰好一手，交回用户回合。

真实 hooks 组合回归已覆盖上述四项；测试 host 使用 Worker 替身，实际页面补测详情见下。

## 已执行验证

- 修改前：严格 lint、类型检查、90 项测试、生产构建通过。
- 最终工作区：`npm run check` 通过（lint → typecheck → **218/218** tests → production build）；`git diff --check` 通过。完整检查日志保存于本机 `%TEMP%\cutego-stability-check-final.log`。
- 本项专项：20 个 engine、14 个 hook/组合、2 个实际 Worker 入口、2 个 scheduler、12 个缓存/注册、4 个延迟落子、3 个计分快照回归。
- 工作区同时有其他棋盘/五子棋/棋局状态/工程治理改动。218 是运行当时的全仓总数，不能把相对基线的全部增量归入本项；本记录也不替其他改动宣称单独审计完成。
- 未升级 ORT 1.18.0，未更换模型及 WASM 二进制。模型 SHA256：`ADD249ED29E374D8DC52260B3E8049F7890B90D79583CDBEBE332636950D4640`。
- 现有构建警告：Browserslist 数据过期、ORT bundle 使用 eval；本次没有以升级依赖消除这些既有警告。

## 实际模型兼容性矩阵

设备：当前 Windows 桌面、Codex Chromium 浏览器；真实 Worker + 仓库 engine + ORT + `public/models/kata_dynamic.onnx`，不是 mock 推理。

| 环境 | 实际加载文件/配置 | 9/13/19 路、黑白各一次 | dispose → 拒绝推理 → 重载 |
| --- | --- | --- | --- |
| 无 COOP/COEP、无 SAB | `ort-wasm.wasm?ort=1.18.0`；1 线程；SIMD=false | 6 次全部通过 | 通过，重载后另做 1 次推理 |
| COOP/COEP、SAB 可用 | `ort-wasm-simd-threaded.wasm?ort=1.18.0`；2 线程；SIMD=true | 6 次全部通过 | 通过，重载后另做 1 次推理 |
| Android / iOS / 旧 WebView / 低内存机 | 未连接真机；能力分支仅自动测试 | 未验收 | 未验收 |
| WebGPU 真正执行 | 当前 ORT 默认入口没有注册 WebGPU，实际后端为 WASM | 未启用 | 不作支持承诺 |

两种实测路径胜率输出相同（展示精度 3 位小数），ownership 长度分别为 81/169/361。单次记录仅用于证明可运行，不作为性能基准或棋力评估。

生产页面（4173）实际冒烟：13 路 Medium、19 路 Easy、9 路 Hard 均完成 AI 先手；Hard 思考时重开后只出现新首手，悔棋可再次启动。最终构建 `index-CB-6JyMv.js` 复测 Fun 用户执白：AI 第一手成功，用户下一手后 AI 再落一手，正常交回用户回合；最终重载后未新增此前的 stale-lock 循环警告。Worker 构建为 `ai.worker-Cu39mXao.js`。

本机截图证据：[单线程](C:/Users/Yohaku/.codex/visualizations/2026/10/01/01a0f60e-0d18-7602-b9a4-e804203949aa/onnx-single.png)、[双线程 SIMD](C:/Users/Yohaku/.codex/visualizations/2026/10/01/01a0f60e-0d18-7602-b9a4-e804203949aa/onnx-threaded.png)、[Fun 实际三手对局](C:/Users/Yohaku/.codex/visualizations/2026/10/01/01a0f60e-0d18-7602-b9a4-e804203949aa/fun-first-move-regression.png)。

临时复现环境：`C:\Users\Yohaku\AppData\Local\Temp\cutego-onnx-smoke-20261001`，执行 `node server.cjs`，浏览器访问 4145（普通）或 4146（隔离）后点击 Run checks。目录是本机临时验证材料，未作为产品功能交付。

## 技术评审应确认的边界

- **取消语义**：拒收结果、停止后续访问；无法硬中断当前 ONNX run/同步五子棋计算。超时通过终止 Worker 回收，不能复用卡死的线程。
- **失败恢复体验**：本轮使用已有重开/换模式恢复；若要保留当前棋局并提供独立“重试 AI”入口，作为下一项窄改评审，不能恢复无限自动重试。
- **移动端发布门槛**：至少测一台低内存 Android、一台主流 Android及目标 WebView；若支持 iOS，另测 Safari/WKWebView。覆盖首次下载/断网、缓存升级、连续换尺寸、切后台、重开/悔棋、长局热机与内存。
- **离线升级**：源码 VM 已覆盖缓存迁移与版本隔离；仍需在实际安装的 PWA/WebView 上验旧版→新版→断网。没有新版本 WASM 的离线缓存时应报错，不能把旧版本字节冒充新版本。
- **新功能准入**：先确认此底座，再讨论难度标定与教练证据层；现有 policy 排名、占位候选分数和原始 misc 输出不可当成准确目损解释给玩家。

后续产品范围见 [修改计划](../superpowers/plans/2026-10-01-beginner-coach-and-difficulty.md)。
