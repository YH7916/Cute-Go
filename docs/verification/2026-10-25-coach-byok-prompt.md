# Pi 用户自带 key 与教学提示词验收

日期：2026-10-25。延续独立 Pi 后台，替换上一轮的共享访问令牌方案；未提交、推送或部署。

## 本次变更

- 前端选择 DeepSeek/OpenAI、模型并填写自己的 API key。前端只向陪练后台请求，key 经 Authorization 请求头传入，正文为 `{provider,model,evidence,question}`。
- `shared/coach.ts` 统一浏览器与后台的协议、服务商和模型校验。后台固定服务商 URL，每请求创建独立 Pi/key 上下文；拒绝客户端 base URL、正文 key 和额外字段。
- 移除服务器模型凭证及共享令牌配置。v3 设置清除 v1/v2；默认不记住 key，显式记住才写本机存储，切换服务商或后台地址清空待提交 key。
- 系统提示按提问意图、证据、工具、确定程度和输出协议组织：先回答具体问题，默认 hint 才危险优先；保留规则条件，区分浅搜示例与已证实事实。普通不确定表述避免触发现有确定性过滤，未放宽 renderer。
- 保留端侧规则/ONNX、完整局面归属、取消、输出验证和本地回退。新增 [八场景评测方案](../coach-prompt-evaluation.md)，未声称已经完成真实模型质量评测。

## 实际验证

- 最终 `npm run check` 退出码 0；contracts → lint → typecheck → test → build 通过，**1345/1345** 测试通过，0 失败/跳过。日志：`output/coach-byok-check-final.log`。
- `git diff --check` 退出码 0。前端 `dist/` 与后台 `dist-server/main.mjs` 均生成。
- 前端局部回归 450 项通过；覆盖设置迁移、配置变更使旧请求失效、无 key 不请求、记住/清除语义、固定脱敏错误。
- 后台及真实 Pi SDK + 本机 SSE fixture 回归 35 项通过：完整端侧 → HTTP → Pi → 输出校验链路、用户并发 key/问题隔离、固定服务商地址、取消与超时、错误脱敏、限额和 prompt 协议。fixture 没有生成真实模型答案。
- 架构负向回归 36 项通过：共享协议可供前后端使用，但不能导入后台、UI、React 或 Pi；前端仍不能导入 Pi 执行。独立反例发现过重叠包规则覆盖问题，已通过合并共享层限制修正，未放宽边界。
- 最终生产后台无需模型环境变量即可启动：允许来源预检 204、缺 key 401、无效证据 400、其他来源 403；无真实服务商调用。日志：`output/coach-byok-smoke.log`。
- 构建后的 7 个前端 JavaScript 文件未检出 Pi 包名、后台 runner 或系统提示标识；该扫描与架构检查一起使用，不构成通用安全证明。
- 隔离浏览器实际检查桌面 1440×900 与移动尺寸 390×844：服务商/key 主入口、高级配置及保存/清除按钮可见，无水平溢出，高级设置中的模型可滚动访问。使用合成 key 验证默认不持久化、显式记住、切换服务商/后台清 key、重开保留当前会话 key、刷新清除未记住的 key。截图位于 `output/playwright/pi-coach-byok-{desktop,mobile,mobile-setup,mobile-advanced}.png`，报告为 `output/playwright/pi-coach-byok-browser-report.md`。隔离浏览器与本次启动的 Vite 已关闭。

## 未覆盖与能力边界

未调用真实付费模型，未部署后台或 H5，未运行 TapTap/Android 宿主验收；未重新执行真实 ONNX 模型验收。本次桌面浏览器移动尺寸检查不代表手机或小游戏原生验证。

Pi 工具只读取端侧已有局面和分析，没有新增云端深搜、完整棋谱逐手得失评估、确定死活证明或跨局记忆。局中实际文本提问最多两个坐标（8/16/24 次浅搜访问）；复盘/终局讲解未接入该分析回调。能力和部署步骤见 [Pi 后台说明](../pi-coach-backend.md)。

构建仍有现有 Browserslist 数据过旧、ONNX 依赖包含 eval 的提示；本次未升级依赖或改变推理运行时。
