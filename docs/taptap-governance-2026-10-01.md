# 第三轮：TapTap CLI 核验与平台代码治理

范围：保持现有对弈、界面和存储键；治理 TapTap 平台边界、异步生命周期及外部数据。全部改动仍在本地工作区。

## 官方 CLI 的实际使用

已使用安装的 `@taptap/cli`，阅读 `taptap-cli`、共享执行、身份与材料相关官方 skills，并执行只读查询。

| 操作 | 实际结果 |
| --- | --- |
| `taptap-cli --version` / `doctor --json` | 初始 2026.9.11；服务端要求至少 2026.9.21，旧版被版本门禁拒绝 |
| `taptap-cli update --check --json` / `update --json` | 升级至 2026.9.24；CLI 自动同步 11 个官方 skills，这是本机工具环境变更 |
| 更新后 `doctor --json` | 凭据、服务连通、元数据检查通过；操作目录 1.0.49，共 75 项 |
| `developer +list` / `app +list --dev-id 376133 --kw Cute` | 工作室可访问；找到 CuteGo 809520（已上线）、809519（未发布），未替用户选择写入对象 |
| 命令 schema 核验 | 当前目录主要覆盖开发者后台、材料与发布流程，没有小游戏原生 SDK 的运行时测试命令 |
| `materials +inspect dist` | 只读材料清点：7 个图片、142 个未识别类型、0 个安装包/资源包；此结果不等于 SDK 或发布验收 |

未上传、修改应用后台、提审或发布。后续后台写操作应先核对明确的 app ID 与具体授权范围。

## 结构与可执行约束

- `providers/taptapPlatform.ts` 保留平台业务接口，SDK 声明、调用适配、身份解析、档案存储、连接与房间生命周期迁入 `services/platform/taptap/*`。
- `utils/tapTapBridge.ts` 缩为 17 行兼容导出，内部调用方已清空。UI 的环境检测走 `environment.ts`，振动走 `haptics.ts`；三份房间事件适配合并为 `matchSession.ts`。
- 新增 `platform-sdk` 依赖边界，UI/hooks 不得导入其内部实现或旧桥；SDK 全局访问限制在平台内部。架构测试通过真实 ESLint 分别验证允许与禁止路径。
- 原生数据从 `unknown` 开始校验，不用类型断言假装外部结果可信。最后 35 处 `any` 已清理，`eslint-suppressions.json` 为空；删除 provider 和旧桥的超长文件预算，新模块全部受默认 400 有效行限制。

## 已修复的具体问题

| 风险 | 修复与保持的行为 |
| --- | --- |
| 将临时登录 code 当作本地账号键 | 只接受稳定身份来源；无稳定 ID 返回明确错误，不创建随机身份档案；保留已有 battle playerId/account fallback |
| SDK 的 callback 与 Promise 支持不一致 | 统一适配、保留方法接收者、一次完成、消费晚到拒绝；不再用函数参数个数推测调用模式 |
| 授权停留或异常 SDK 结果导致流程悬挂/抛错 | 登录、资料、设置请求有 15 秒等待上限；需要玩家决定的授权弹窗不强制超时；null/错误形状安全处理 |
| 统一解析时改变旧账号优先级 | login 仍先 union ID，userInfo/accountInfo 仍先 openid；同时返回两种 ID 时保留原档案和 ELO |
| 退出后迟到登录复活旧会话 | provider 用请求代次取消旧登录；旧退出不得覆盖新登录；hook 以有效会话通知更新状态 |
| 迟到连接、旧房间回包干扰新房间 | 连接按代次隔离，同一 native manager 的房间/断开操作串行；旧进房完成后先清理，再执行下一次进房 |
| 旧页面回调向新房间发消息或退房 | session 的 send/leave 闭包绑定原房间与连接，失效会话不能控制新房间 |
| 监听失败被当作已注册、事件名漂移 | 注册成功后才标记，失败可重试；兼容官方表格与示例中的两套事件名；可用时注销旧监听 |
| 畸形房间/玩家/本地档案穿透类型 | 校验 room/player、档案和成就；拒绝原型继承字段、非有限数值与错误容器；消息在领域层继续校验 |
| 存储失败却报告成功 | 档案/身份/成就写入失败显式返回失败；读取异常时避免盲目覆盖；身份多键写入失败尽力回滚 |

保留存储键、默认积分、排行榜 ID、房间配置、合法旧字段别名、授权重试与振动降级顺序。没有改棋力、对局规则或页面布局。

## 验证与证据边界

新增 60 项 TapTap/实际 auth hook 回归，以及 1 项新增架构检查：

- SDK 16 项：callback/Promise、this、重复完成、拒绝/超时、用户资料授权、隐私弹窗等待及可选能力。
- battle 18 项：外部 payload、断开/重连、过期连接和房间、SDK 调用顺序、监听兼容、失效 session 的 send/leave。
- profile store 12 项：旧档案、非法字段、原型键、存储读取/写入失败、身份回滚、成就数据。
- provider/事件/haptics 10 项：临时 code、三类身份优先级、登录退出竞争、事件与振动。
- 实际 auth hook 4 项：普通退出、重复点击、无 SDK 的本地退出、新登录后旧退出晚完成。

主要故障先在旧实现或待审版本复现失败，再修复：临时 code 身份、畸形身份、迟到登录；非法 playerId/room players、迟到 connect；两类来源的身份优先级回退；真实 hook 的退出竞态。

Windows / Node 24.14.0：`npm run lint:prune` 与完整 `npm run check` 通过，严格 lint、typecheck、**279/279 测试**、生产构建均通过；其中架构检查 24 项。`git diff --check` 通过。测试总数包含工作区原有及并行完成的 AI 生命周期回归，不把它们算作本轮 TapTap 新增。

构建仍有既有 Browserslist 数据过期和 ONNX 依赖 eval 警告；没有借本轮升级项目依赖。测试使用 fake SDK、临时存储和 React hook host，未连接真实 TapTap 对局服务；不等同于原生设备或 React 并发渲染验证。未提交、推送或发布。

## 尚需原生验收的边界

1. 原生 SDK 的不可取消请求若永不完成，同一 manager 后续操作会等待。丢弃 Promise 不等于取消原生连接/进房；本轮没有用超时伪装取消成功。
2. 同一连接中缺少 roomId 的消息无法可靠识别是否来自旧房间；有 roomId 的事件会过滤。旧 SDK 若没有 unregister，原生端可能保留已逻辑失效的监听对象。
3. localStorage 没有多键事务；持续写入异常可能阻止回滚。当前返回失败，不保证异常存储介质下的原子性。
4. 正式 callback 登录只返回 code 时，必须另取稳定 playerId 或经服务端换取身份；本轮保留已有稳定 ID 路径，没有新建身份后端，也没有声称本地会话实现了服务端鉴权。
5. 发布前需在实际 TapTap 环境验证授权停留、登录/退出/重登、双端进退房、快速重连、消息格式、排行榜和成就。CLI doctor 和本地 check 均不能替代这些步骤。

## 官方契约来源

- [tap.login](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/login/tap.login/)：callback 模式，code 为 5 分钟临时凭证，需要服务端交换。
- [tap.getUserInfo](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/user-info/tap.getUserInfo/)：callback 与 userInfo 数据包、授权要求。
- [OnlineBattleManager.connect](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.connect/)：Promise 与 playerId。
- [OnlineBattleManager.createRoom](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.createRoom/)：roomCfg/playerCfg 和房间结果。
- [OnlineBattleManager.registerListener](https://developer.taptap.cn/minigameapidoc/dev/api/open-api/tap-battle/OnlineBattleManager.registerListener/)：事件表格和示例命名不一致，因此保留两套别名；不能据此断言所有设备 SDK 都已实测。
