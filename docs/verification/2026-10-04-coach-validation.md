# 陪练讲解校验与静默回退验收

## 复现

已配置云服务时请求“提示”或“讲解”，提供商返回包含未知引用、无依据坐标或新增数量的正文，旧行为显示“讲解内容未通过校验，已保留本地提示”。回归构造真实 runtime 请求链路与受控 HTTP 响应：9 路盘面上 B8 黑棋仅剩 B7 一口气，云端返回未知引用及“A1 的黑棋有 99 口气”。用户当次失败的原始响应未取得，不能据此确认当次被哪条规则拒绝。

## 改动与验收边界

- 校验失败保留同一局面的有效本地正文和圈点，不显示校验错误，不自动发第二次付费请求；结果标记 `cacheable: false`，再次点击仍可请求云端。
- 网络、鉴权等服务错误继续显示；取消、迟到结果、局面切换的失效边界保留。
- 系统提示与 renderer 复用 `getCoachResponseLimits → teachingRequest`：默认 80 字，具体问题 160 字，最多两句、三个引用、三个圈点。提示明确引用项与正文事实的对应关系。
- 提问坐标仅在本地确认属于引用棋块或气点后加入 `coordinates`。同值中文数字、否定措辞、单个完整 JSON 围栏和正文换行可归一化；未知引用、新坐标、新数量及额外正文仍须拒绝。兼容处理不证明自然语言语义正确。
- 规则验证过的引擎变化坐标可随对应引用输出；引擎候选文案缩为两句，避免自带材料超过回复句数。数字提取排除导航词“下一步／一步步”，仍检查真实步数，不让观察动作被误当成新事实。

## 回归入口

`tests/coach-validation-fallback.test.ts` 覆盖真实 runtime 回退正文、圈点、无错误、不缓存与单次请求；`tests/coach-response-validation.test.ts`、`tests/coach-board-references.test.mjs` 保留引用与圈点边界；`tests/coach-session.test.mjs`、`tests/flows/coach-http-flow.test.mjs` 保留取消、迟到及服务错误恢复路径。

## 实际验证

- 新增误拒与静默回退回归先红后绿。最终 `npm run check` 完整通过 contracts → lint → typecheck → test → build；1284/1284 测试通过。`git diff --check` 通过。日志：`output/coach-validation-fix-check.log`。
- Playwright 使用构建产物、真实浏览器 ONNX / WASM 与本机受控服务。9 路空盘本地候选 E5、落子后 4 口气：第一次服务返回不存在的引用和 T19 必胜，页面只显示“可以试下这里，比较落子前后的气。”及 E5 圈点，无校验报错，HTTP 仅一次。
- 再次点“提示”确实发出第二次 HTTP 请求；完整 JSON 围栏内的“E5落子后有四口气。\n不能断言必活。”正常显示为“这里落子后有四口气。 不能断言必活。”，保留 E5 圈点。第三次相同点击命中成功缓存，总请求数仍为 2。
- 浏览器截图已查看：`output/playwright/coach-validation-local.png`、`output/playwright/coach-validation-cloud.png`；对应快照及脱敏请求证据 `output/playwright/coach-validation-http.json`。浏览器验证在最终导航词补丁构建前完成，导航词补丁由最终全量回归覆盖；其余被测路径未再修改。
- 未调用真实云服务，未测提供商实际生成合格率或 Android / TapTap 原生。本次不改 ONNX 搜索算法；真实 ONNX 浏览器验证仅覆盖上述 9 路请求。已有 favicon 404、WebGPU 不可用后转 WASM 的控制台信息不影响此次流程。
