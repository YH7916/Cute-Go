# Cute-Go

围棋与五子棋小游戏，提供本地双人、AI 对战、围棋课堂、复盘和 AI 陪练。

[在线体验](https://yesterhaze.codes/) · [Cloudflare 地址](https://cute-go.pages.dev/) · [第三方内容与许可](THIRD_PARTY_NOTICES.md)

围棋 AI 在浏览器 Worker 中通过 ONNX Runtime / WASM 本地推理；启蒙对手和五子棋使用规则及搜索。课堂复用真实规则与固定来源题目，保留独立作答、辅助曝光和续学记录。云讲解经独立 Pi 后台执行，玩家自行选择模型服务商并提供 API key；未配置时继续使用本地讲解。

## 开发与检查

要求 Node.js 22.19+。

```sh
git clone https://github.com/YH7916/Cute-Go.git
cd Cute-Go
npm ci
npm run dev
```

修改前阅读 [AGENTS.md](AGENTS.md) 和 [当前架构](docs/architecture.md)。交付前执行：

```sh
npm run check
git diff --check
```

统一入口依次运行 contracts、lint、typecheck、test、build；前端输出 `dist/`，后台输出 `dist-server/`。局部定位可用 `npm test -- tests/具体文件.test.ts`，不能替代全量检查。

## 发布

Cloudflare Pages 连接 `main`，以 `npm run check` 检查并部署 `dist/`；生产和预览环境都配置公开的 `VITE_COACH_ENDPOINT`。GitHub Pages 备用入口仍由 Quality 工作流在 Windows、Ubuntu 两端检查通过后部署，并读取同名仓库变量。TapTap H5 包也应以同一公开地址构建；模型 API key 不放入构建变量。

后台通过 SSH 单独发布，推送仓库不会重启后台；流程见 [阿里云部署](docs/deploy-aliyun.md)。TapTap 上传、提审和发布各有独立状态，上传成功不等于已经上线。

Android 封装需 Android Studio；运行 `npm run build`、`npx cap sync android`、`npx cap open android` 后进行设备验证。浏览器和 Node 检查不能替代 Android / TapTap 原生验收。

## 字体资源

发布字体为 `ui/fonts/GenSenRounded2PJP-M.woff2`，保留界面、课程字形和 GB2312 常用字；其他字形由系统字体补足。`font-display: swap` 允许下载期间显示系统字体，Vite 为发布字体生成内容哈希以更新缓存。

完整原字体在 `third_party/fonts/`，不随 H5 包体分发。更新文案或课程后，可重建并校验字形覆盖与字宽：

```sh
uv run --with fonttools --with brotli python scripts/prepare-webfont.py
```

生成的 WOFF2 随源码保存；常规 Node 构建不依赖 Python。

## 维护文档

| 文档 | 用途 |
| --- | --- |
| [架构](docs/architecture.md) | 当前调用链、职责与限制 |
| [Harness](docs/harness.md) | 由契约生成的检查指南 |
| [固定流程测试](docs/testing-flows.md) | 可执行验证与替代边界 |
| [教学设计](docs/teaching-agent-design.md) | 课程来源、适配和学习记录 |
| [Prompt 评测](docs/coach-prompt-evaluation.md) | 云讲解评估方法与历史基线 |
| [Pi 后台](docs/pi-coach-backend.md) | 协议、配置与运行 |
| [部署运维](docs/deploy-aliyun.md) | 已有服务、发布和回退 |

已完成的历史计划、逐轮验收及旧设计截图可从 Git 历史查阅。许可证、来源档案、模型资源及可执行回归继续保留。

## 许可

软件代码采用 [AGPL-3.0-or-later](LICENSE)，另有声明的第三方内容保留各自许可。OGS 课程改编沿用 AGPL；Go Game Guru 题谱与改编沿用 CC BY-NC-SA 4.0，不适用软件代码许可证。模型、字体、图片和音频的权利声明独立保留，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。
