/**
 * DebugLogger - 独立的屏幕调试日志组件
 * 版本：v1.0.0
 */

(function() {
    'use strict';

    class DebugLogger {
        constructor() {
            this.logs = [];
            this.maxLogs = 50;
            this.isPaused = false;
            this.isVisible = false;
            this.autoScroll = true;

            // Wait for DOM
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.init());
            } else {
                this.init();
            }
        }

        init() {
            this.createUI();
            this.bindEvents();
            this.interceptConsole();
            window.Debug = this;
        }

        createUI() {
            let container = document.getElementById('debug-logger-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'debug-logger-container';
                document.body.appendChild(container);
            }

            container.innerHTML = `
                <div id="debug-toggle-btn" class="debug-toggle-btn" style="position:fixed;bottom:20px;right:20px;width:12px;height:12px;background:#00ff00;border-radius:50%;z-index:10000;cursor:pointer;box-shadow:0 0 10px rgba(0,255,0,0.5);">
                </div>

                <div id="debug-panel" class="debug-panel" style="display:none;position:fixed;bottom:40px;right:20px;width:320px;height:400px;background:rgba(0,0,0,0.85);color:#fff;font-family:monospace;font-size:12px;z-index:9999;border-radius:8px;flex-direction:column;box-shadow:0 0 20px rgba(0,0,0,0.5);border:1px solid #444;overflow:hidden;">
                    <div style="padding:10px;background:#333;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #444;">
                        <span style="font-weight:bold;">📋 调试日志</span>
                        <div style="display:flex;gap:10px;">
                            <button id="debug-clear" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:10px;">[清除]</button>
                            <button id="debug-close" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:10px;">[关闭]</button>
                        </div>
                    </div>
                    <div id="debug-log-list" style="flex:1;overflow-y:auto;padding:10px;scroll-behavior:smooth;"></div>
                </div>
            `;
            
            // Inject styles if not already present
            if (!document.getElementById('debug-logger-styles')) {
                const style = document.createElement('style');
                style.id = 'debug-logger-styles';
                style.innerHTML = `
                    .debug-log-item { margin-bottom: 4px; border-left: 3px solid #00ff00; padding-left: 6px; word-break: break-all; font-size: 11px; }
                    .debug-log-warn { border-left-color: #ffaa00; color: #ffaa00; }
                    .debug-log-error { border-left-color: #ff4444; color: #ff4444; }
                `;
                document.head.appendChild(style);
            }
        }

        bindEvents() {
            const toggle = document.getElementById('debug-toggle-btn');
            const panel = document.getElementById('debug-panel');
            const clear = document.getElementById('debug-clear');
            const close = document.getElementById('debug-close');

            if (toggle) toggle.onclick = () => {
                this.isVisible = !this.isVisible;
                panel.style.display = this.isVisible ? 'flex' : 'none';
            };
            if (close) close.onclick = () => {
                this.isVisible = false;
                panel.style.display = 'none';
            };
            if (clear) clear.onclick = () => {
                this.logs = [];
                document.getElementById('debug-log-list').innerHTML = '';
            };
        }

        interceptConsole() {
            const originalLog = console.log;
            const originalWarn = console.warn;
            const originalError = console.error;

            console.log = (...args) => {
                originalLog.apply(console, args);
                this.addLog(args.join(' '), 'log');
            };
            console.warn = (...args) => {
                originalWarn.apply(console, args);
                this.addLog(args.join(' '), 'warn');
            };
            console.error = (...args) => {
                originalError.apply(console, args);
                this.addLog(args.join(' '), 'error');
            };
        }

        addLog(msg, level) {
            const list = document.getElementById('debug-log-list');
            if (!list) return;

            const item = document.createElement('div');
            item.className = `debug-log-item debug-log-${level}`;
            const time = new Date().toLocaleTimeString();
            item.innerHTML = `<span style="color:#888;">[${time}]</span> ${msg}`;
            list.appendChild(item);
            
            if (list.childNodes.length > this.maxLogs) {
                list.removeChild(list.firstChild);
            }
            if (this.autoScroll) {
                list.scrollTop = list.scrollHeight;
            }
        }

        log(msg, level = 'log') {
            this.addLog(msg, level);
        }
    }

    // Auto-instantiate
    new DebugLogger();
})();
