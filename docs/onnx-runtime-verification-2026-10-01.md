# ONNX 本地实际运行验收

2026-10-01，Windows / Chromium 154.0.8037.58，当前生产构建与 `npm run preview -- --host 127.0.0.1 --port 3002 --strictPort`。使用真实浏览器 Worker、真实 ONNX 文件、真实 ORT WASM；没有替换推理结果或模型 session。

后续代码健康治理已修复下方发现的模型输出问题，并再次通过 18/18 真模型测试，新增 ownership 范围和首手误计检查。最新全量测试 337/337；见 [代码健康验收](code-health-2026-10-01.md) 与 [新实测结果](../output/playwright/onnx-code-health.json)。以下 281 项和性能数值保留为首次验收记录。

## 已验证

- 模型 `public/models/kata_dynamic.onnx`：4,137,491 字节；SHA256 `ADD249ED29E374D8DC52260B3E8049F7890B90D79583CDBEBE332636950D4640`。
- 模型与 `/wasm/ort-wasm.wasm?ort=1.18.0` 均由本机返回 HTTP 200。实际路径为 CPU 单线程 WASM，`crossOriginIsolated=false`；不把 WebGPU 不可用警告误当加载失败，也不声称测过 GPU。
- 5/9/10/13/19 路 × Easy/Medium/Hard，**15 组真实模型请求通过**。开局使用首手黑中心及一致历史，验证落点为盘内空交叉点、胜率有限且在 0—100、lead 有限、ownership 长度为棋盘面积且全部有限。
- 9 路分析、19 路 Hard 中途取消后继续 9 路、19 路 Hard 中途释放后重建并继续 13 路：**3 组通过，共 18/18**。Hard 普通请求使用真实桌面 25 visits，分析请求 100（内部上限 32），取消场景用 32 visits 建立在途条件。
- 实际 UI：9 路 Easy 连续两次玩家落子均有 AI 回复；切换 19 路 Hard、人执白，AI 正常先行；在实际 Hard 回合中点击重开，旧结果没有返回，新局 AI 正常落子。
- **离线验证通过**：生产页面取得 Service Worker 控制并预热模型后，Playwright 将浏览器网络设为 offline，再重载页面；`navigator.onLine=false` 时，19 路 Hard 仍产生真实模型回包和 AI 落子。测试后恢复网络。这验证的是预热后的离线使用，不是空缓存首次安装。

本机单次 smoke 的 19 路 Hard（25 visits）约 4.80 秒；各尺寸 Hard 约 0.69—4.80 秒。数值来自一次自动化运行，不能当作其他设备的性能保证。

## 实测发现并修复：取消消息被连续推理阻塞

修复前，19 路 Hard 开始约 42 毫秒后发送 stop 和下一请求，旧请求仍在约 3.36 秒后返回；后继请求被迫等待。现有 mock 测试直接调用调度器，未模拟浏览器消息需要获得事件循环执行机会的条件。

根因：单线程 WASM 的 `session.run()` 可能仅通过微任务完成，连续搜索没有让 Worker 处理消息事件。仅有 `await` 与 generation 校验并不能让 stop 及时被读取。

修复位于 `worker/engineLifecycle.ts`：一次推理实际完成后让出一个事件循环任务，再校验 generation，之后才允许下次搜索或回包。**不能中断正在执行的一次同步 WASM 运算**；没有提前释放尚在运行的 session，也没有改变搜索策略。

- 新增 `tests/worker-event-loop.test.ts` 两项确定性回归：先红 2/2，修复后通过；模型 stub 只返回 resolved Promise，取消从 timer 任务投递，验证旧搜索不会继续、旧回包被丢弃、新请求仍可完成。
- 真实模型复测：stop 后约 153 毫秒收到新请求结果；被取消的旧请求没有回包。release 后约 138 毫秒确认释放，reinit 后继续推理成功。
- 实际 UI 重开：旧 requestId=2 未返回；新 generation=1 / requestId=3 正常落子。
- 完整 `npm run check` 通过：严格 lint、typecheck、**281/281 测试**、生产构建；`git diff --check` 通过。构建仍有既有 Browserslist / ONNX eval 警告。

## 可复跑入口和证据

`scripts/verify-onnx-browser.mjs` 导出自包含函数，无 Playwright 包依赖，不在默认 Node 测试里伪装成模型实测。可在已有 Playwright runner 中执行：

```js
import { verifyOnnxBrowser } from './scripts/verify-onnx-browser.mjs';
// 在生产预览页面完成模型初始化，获取当前实际加载的 Worker URL。
const workerUrl = page.workers().find(w => w.url().includes('/assets/ai.worker-')).url();
const report = await page.evaluate(verifyOnnxBrowser, { workerUrl });
if (!report.ok) throw new Error(report.error);
```

- [修复前失败记录](../output/playwright/onnx-before-fix.json)
- [修复后 18 项结果与事件时间线](../output/playwright/onnx-after-fix.json)
- [实际 UI 重开与后继落子](../output/playwright/onnx-ui-reset.json)
- [断网重载后的真实模型结果](../output/playwright/onnx-offline.json)
- [9 路 Easy 实际落子](../output/playwright/onnx-easy-live.png)、[19 路 Hard 实际落子](../output/playwright/onnx-hard19-live.png)

## 首次验收发现的输出语义问题（现已修复）

运行通过只证明模型加载、推理、回包和落子链路可用，不代表所有展示指标已经校准：

1. **实时领先目数误用了终局地盘计数**。开局只有一颗黑子时，整片空域仅接触黑子，被计成黑地，默认 9 路首回合显示黑领先 76.5 目。现已将 play 路径改用独立软领地估计；真实同局面得到约 0.619，终局数目法仍独立保留。
2. **ownership 后处理缺少归一化**。本地模型 `output_ownership` 直接来自卷积节点，图内没有 Tanh；旧 `engine.ts` 只转换执子视角。现按 [KataGo v1.12.4 官方 pretanh 后处理](https://github.com/lightvector/KataGo/blob/v1.12.4/cpp/neuralnet/nneval.cpp#L961-L976) 执行 tanh，再转换视角；真实各尺寸 ownership 全部落在 −1～1。源 checkpoint/导出脚本缺失，未擅自采用 misc 输出的未知尺度。

这两项都不是 ONNX 加载失败。TapTap/Android 原生环境和触屏手势不属于本次本机浏览器验收；未提交、推送或发布。
