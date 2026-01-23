const { app, Menu, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
// const isDev = require('electron-is-dev'); // <--- 删除或注释掉这行
const readline = require("readline");
const fs = require("fs");

let mainWindow;
let katagoProcess = null;

// === 0. 定义环境判断变量 (官方推荐方式) ===
const isDev = !app.isPackaged;

// === 1. 路径处理 ===
const getResourcePath = (filename) => {
  // 生产环境 (app.isPackaged = true): 指向 resources/katago
  // 开发环境 (app.isPackaged = false): 指向 ../resources/katago
  const basePath = isDev
    ? path.join(__dirname, "../resources/katago")
    : path.join(process.resourcesPath, "katago");
  return path.join(basePath, filename);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  // === 2. 加载逻辑 (关键修复) ===
  // 如果打包了(!isDev)，强制使用 loadFile
  if (isDev) {
    console.log("Running in Development Mode");
    mainWindow.loadURL("http://localhost:3001");
    mainWindow.webContents.openDevTools(); // 开发模式打开控制台
  } else {
    console.log("Running in Production Mode");
    // 这里的路径逻辑是：app.asar/electron/main.cjs -> app.asar/dist/index.html
    const indexPath = path.join(__dirname, "../dist/index.html");

    mainWindow.loadFile(indexPath).catch((e) => {
      console.error("File load failed:", e);
    });
  }
}

// === 3. KataGo 进程管理 (修复版) ===
function startKataGo() {
  if (katagoProcess) return;

  const exe = getResourcePath("katago.exe");
  const model = getResourcePath("model.bin.gz"); // 确保文件名对应
  const cfg = getResourcePath("default_gtp.cfg"); // 确保文件名对应

  console.log("--- 正在启动 KataGo ---");
  console.log("EXE:", exe);

  try {
    const fs = require("fs");
    if (!fs.existsSync(exe)) {
      console.error(`❌ 找不到文件: ${exe}`);
      mainWindow.webContents.send("katago-response", {
        status: "error",
        data: "KataGo exe not found",
      });
      return;
    }

    // 启动进程
    katagoProcess = spawn(exe, ["gtp", "-model", model, "-config", cfg]);

    // === 关键修改：使用 Readline 按行解析 ===
    const rl = readline.createInterface({
      input: katagoProcess.stdout,
      terminal: false,
    });

    rl.on("line", (line) => {
      const str = line.trim();
      console.log("[KataGo输出]:", str);

      // 忽略空行
      if (!str) return;

      if (str.startsWith("=")) {
        // 成功回复：去除 "=" 和前面的 ID（如果有）
        // GTP 标准回复格式: "= [result]" 或 "=ID [result]"
        const content = str.replace(/^=\s*/, "").trim();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("katago-response", {
            status: "success",
            data: content,
          });
        }
      } else if (str.startsWith("?")) {
        console.error("[KataGo GTP错误]:", str);
      } else {
        // 可能是 KataGo 启动时的 Version 信息或者 Loading 信息
        // 可以选择忽略或打印到控制台
        console.log("[KataGo Info]:", str);
      }
    });

    katagoProcess.stderr.on("data", (data) => {
      console.error("[KataGo 内部日志]:", data.toString());
    });

    katagoProcess.on("close", (code) => {
      console.log(`KataGo 退出，代码: ${code}`);
      katagoProcess = null;
    });
  } catch (e) {
    console.error("启动逻辑崩溃:", e);
  }
}

// === 4. IPC 通信监听 ===
ipcMain.on("init-ai", () => {
  startKataGo();
});

ipcMain.on("ai-command", (event, command) => {
  if (katagoProcess && katagoProcess.stdin.writable) {
    console.log("[发送指令]:", command);
    katagoProcess.stdin.write(command + "\n");
  } else {
    console.error("无法发送指令，KataGo 未运行");
  }
});

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  if (katagoProcess) {
    katagoProcess.kill();
  }
  app.quit();
});
