// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  initAI: () => ipcRenderer.send('init-ai'),
  sendCommand: (cmd) => ipcRenderer.send('ai-command', cmd),
  
  // === 修改重点 ===
  // 现在这个函数会返回一个清理函数 removeListener
  onResponse: (callback) => {
    const subscription = (_event, value) => callback(value);
    // 注册监听
    ipcRenderer.on('katago-response', subscription);
    // 返回取消监听的函数
    return () => {
      ipcRenderer.removeListener('katago-response', subscription);
    };
  },
});