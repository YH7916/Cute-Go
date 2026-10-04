<div align="center">
  <img src="https://github.com/user-attachments/assets/ce08dfdc-2d59-4ad8-8509-12695cc5fca5" alt="Logo" width="120" height="120">

  <h1 align="center">Cute-Go</h1>

  <p align="center">
    <strong>✨ 当古老的黑白智慧遇上治愈系画风 ✨</strong>
  </p>

  <p align="center">
    一款由<strong>Gemini 3 Pro</strong> 辅助编码，基于 <strong>React</strong> 与 <strong>Capacitor</strong> 打造的现代化、高颜值围棋 Android 应用。
  </p>

  <p align="center">
    <a href="#-关于项目">关于项目</a> •
    <a href="#-核心特性">核心特性</a> •
    <a href="#-技术栈">技术栈</a> •
    <a href="#-安装与构建">安装构建</a> •
    <a href="#-预览">界面预览</a>
  </p>

  <br />

  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Capacitor-Android-1192F4?style=flat-square&logo=capacitor&logoColor=white" alt="Capacitor" />
  <img src="https://img.shields.io/badge/AI-Gemini_3_Pro-8E75B2?style=flat-square&logo=google-gemini&logoColor=white" alt="Gemini" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/Software-AGPL--3.0--or--later-green?style=flat-square" alt="Software License: AGPL-3.0-or-later" /></a>
</div>

<br />

---

## 📖 关于项目

CuteGo 让新手在实际落子中理解围棋。原新手教学帮助熟悉规则，结束后可自由选择模式；“进阶教学”直接练习局面决策、按需看示范，“陪我下棋”围绕真实对局给提示。教学与陪练拥有独立局面，共享棋盘、角色和气泡；默认云服务未配置。

项目使用 **React** 构建棋盘交互。围棋挑战 AI 在浏览器 Worker 中通过 **ONNX Runtime / WASM** 本地推理；AI 陪练的启蒙对手与五子棋使用规则和搜索算法。Capacitor 用于原生封装，当前仓库的 Web 验收与 Android/TapTap 原生验收分别进行。

## ✨ 核心特性

* **🎨 治愈系 UI 设计**：告别枯燥的纹理，拥抱清新可爱的棋盘与棋子风格。
* **🤖 本地 AI**：围棋模型推理、领地预估与复盘；陪练启蒙对手和五子棋复用各自的规则/搜索入口。
* **💬 AI 陪练**：9 路执黑练习、带待机/思考/讲解/鼓励动作的褚嬴小助手与本地规则提示；在设置的“陪练讲解服务”二级页面填写自己的 DeepSeek / OpenAI / 兼容 API 配置，首次使用默认开启“记住密钥”，保存后在本机保留，可手动关闭，练习不计竞技积分。
* **📖 进阶教学**：接在新手规则之后，直接练习救棋、吃子方向、双打吃、连续追吃、倒扑与保眼做活；落子后看结果，需要时再看提示或示范。内容复用真实规则与本地学习记录，尚未经专业教师审校；覆盖及来源见 [教学设计](docs/teaching-agent-design.md)。
* **📱 原生级体验**：基于 Capacitor 跨平台技术，在 Android 设备上流畅运行。
* **⚡ 响应式交互**：React 驱动的流畅落子动画与即时反馈。

## 🛠 技术栈

本项目采用现代前端技术栈构建：

| 领域 | 技术/工具 | 说明 |
| :--- | :--- | :--- |
| **核心框架** | ![React](https://img.shields.io/badge/-React-black?style=flat-square&logo=react) | 构建用户界面的基石 |
| **跨平台** | ![Capacitor](https://img.shields.io/badge/-Capacitor-black?style=flat-square&logo=capacitor) | Web 到 Android 的桥梁 |
| **AI Copilot** | ![Gemini](https://img.shields.io/badge/-Gemini_3_Pro-black?style=flat-square&logo=google-gemini) | 用于生成逻辑代码、Bug 修复与重构建议 |
| **构建工具** | ![Vite](https://img.shields.io/badge/-Vite-black?style=flat-square&logo=vite) | 极速的开发与打包体验 |
| **样式方案** | ![TailwindCSS](https://img.shields.io/badge/-Tailwind-black?style=flat-square&logo=tailwindcss) | 优雅的样式原子 |

## 📸 界面预览

> *兼容多种设备尺寸，对平板和手机端分别设计*

<div align="center">
  <img src="https://github.com/user-attachments/assets/58cf4719-cc11-4741-9cb5-922a795468d2" width="500" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://github.com/user-attachments/assets/15a6c647-9534-4b78-b2e6-ad8312393014" width="200" />
</div>





## 🚀 安装与构建

如果你想在本地运行或二次开发，请遵循以下步骤：

### 前置要求
* Node.js (v22.12+，满足当前 Capacitor / Vite 依赖要求)
* Android Studio (用于真机调试)

### 1. 克隆仓库
```bash
git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
cd your-repo-name

```

### 2. 安装依赖

```bash
npm ci

```

### 3. 开发模式运行

```bash
npm run dev

```

### 4. 构建 Android 版本

```bash
# 构建 React 应用
npm run build

# 同步资源到 Android 目录
npx cap sync android

# 打开 Android Studio 进行打包或调试
npx cap open android

```

## 🤝 贡献指南

修改前阅读 [AGENTS.md](AGENTS.md)、[统一 harness 与复用入口](docs/harness.md) 和 [当前架构](docs/architecture.md)。
提交前运行 `npm run check` 及 `git diff --check`。CI 使用同一入口；架构映射、受检扩展名和复用入口只维护在 `harness/architecture.mjs`，文档由契约生成并检查同步。
局部测试使用 `npm test -- tests/具体文件.test.ts` 或 `npm test -- tests/harness`，完整验收始终运行 `npm run check`。

新增功能先定位现有模块与调用方，复用协议、局面动作、搜索、平台服务和基础 UI，再补相应回归。

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

除另有标注的第三方代码与资源外，Cute-Go 软件代码以 **[GNU AGPL-3.0-or-later](LICENSE)** 发布。

课程与题库按各自许可使用：OGS Learn to Play Go 的课程改编保留 **AGPL-3.0-or-later**；Go Game Guru 的题谱、原讲解及其中文改编保留 **CC BY-NC-SA 4.0**，用于非商业性学习。第三方依赖、模型、字体与图片的许可不因软件许可变更而改变。

原作者、上游仓库、固定版本与改编说明见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [third_party](third_party/)。应用内署名入口为“关于 → 致谢名单”。

---

<div align="center">
Made with ❤️ by Yohaku
</div>

