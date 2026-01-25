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
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</div>

<br />

---

## 📖 关于项目

在传统的印象中，围棋往往是严肃、厚重的。CuteGo旨在打破这一刻板印象。

我们利用 **React** 构建了轻盈灵动的交互界面，通过 **Capacitor** 将其封装为原生 Android 体验，并接入了 Google 最新的 **Gemini 3 Pro** 模型作为幕后军师。无论你是想在通勤路上来一局轻松的对弈，还是欣赏萌系画风下的死活题，这里都是你的最佳选择。

## ✨ 核心特性

* **🎨 治愈系 UI 设计**：告别枯燥的纹理，拥抱清新可爱的棋盘与棋子风格。
* **🤖 Gemini 3 Pro 赋能**：利用顶尖的 LLM 辅助复盘、形势判断与交互对话，AI 也可以很温柔。
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
* Node.js (v18+)
* Android Studio (用于真机调试)

### 1. 克隆仓库
```bash
git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git)
cd your-repo-name

```

### 2. 安装依赖

```bash
npm install
# 或者
yarn install

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

我们欢迎任何形式的贡献，无论是新的可爱棋子皮肤、更强的 AI Prompt 调优，还是 Bug 修复。

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 📄 许可证

本项目基于 [MIT License](https://www.google.com/search?q=LICENSE) 开源。

---

<div align="center">
Made with ❤️ by Yohaku
</div>

