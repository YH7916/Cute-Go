import { useState, useEffect, useRef, useCallback } from 'react';
import { BoardState, Player, BoardSize } from '../types';
import { logEvent } from '../utils/logger';

interface UseWebKataGoProps {
    boardSize: BoardSize;
    onAiMove: (x: number, y: number) => void;
    onAiPass: () => void;
    onAiResign: () => void;
}

export const useWebKataGo = ({ boardSize, onAiMove, onAiPass, onAiResign }: UseWebKataGoProps) => {
    const [isWorkerReady, setIsWorkerReady] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [aiWinRate, setAiWinRate] = useState(50);
    const workerRef = useRef<Worker | null>(null);
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[] } | null>(null);

    useEffect(() => {
        // 仅在非 Electron 环境下运行
        if (!(window as any).electronAPI) {
            
            // --- 1. 计算基础目录 (兼容 H5 子目录 / index.html) ---
            const pathName = window.location.pathname;
            // 去掉 index.html，只保留目录路径 (例如 "/game/" 或 "/")
            const directory = pathName.substring(0, pathName.lastIndexOf('/') + 1);
            const baseUrl = `${window.location.origin}${directory}`;

            // --- 2. 计算 Worker 和 Model 的绝对路径 ---
            // 这样无论你在哪里，都能找到 public 下的文件
            const ts = Date.now();
            const workerUrl = `${baseUrl}worker/ai-worker.js?v=${ts}`;
            const modelUrl = `${baseUrl}models/model.json?v=${ts}`; // <--- 这里定义了 modelUrl

            console.log("Worker URL:", workerUrl);
            console.log("Model URL:", modelUrl);

            let worker: Worker;
            try {
                worker = new Worker(workerUrl);
            } catch (e) {
                console.error("Worker Init Failed:", e);
                // 兜底尝试
                worker = new Worker('worker/ai-worker.js');
            }
            
            workerRef.current = worker;

            worker.onerror = (err) => {
                console.error("CRITICAL: Web Worker Error", err);
                setIsThinking(false);
            };

            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'init-complete') {
                    console.log('Web AI Ready');
                    setIsWorkerReady(true);
                    
                    if (pendingRequestRef.current && workerRef.current) {
                        const pending = pendingRequestRef.current;
                        pendingRequestRef.current = null;
                        workerRef.current.postMessage({
                            type: 'compute',
                            data: {
                                board: pending.board,
                                history: pending.history,
                                color: pending.playerColor,
                                size: boardSize
                            }
                        });
                    }
                } else if (msg.type === 'ai-response') {
                    setIsThinking(false);
                    const { move, winRate } = msg.data;
                    setAiWinRate(winRate);
                    if (move) onAiMove(move.x, move.y);
                    else onAiPass();
                } else if (msg.type === 'ai-resign') {
                    setIsThinking(false);
                    onAiResign();
                } else if (msg.type === 'error') {
                    console.error('[WebAI Error]', msg.message);
                    setIsThinking(false);
                    pendingRequestRef.current = null;
                }
            };

            // --- 3. 发送初始化消息 (带上 modelUrl) ---
            worker.postMessage({ 
                type: 'init',
                payload: { modelPath: modelUrl } // <--- 现在这里不会报错了
            });

            return () => {
                worker.terminate();
            };
        }
    }, []);

    const requestWebAiMove = useCallback((
        board: BoardState,
        playerColor: Player,
        history: any[],
        simulations: number = 45 // [New] Dynamic simulations
    ) => {
        if (!workerRef.current || isThinking) return;

        // [New] 埋点：记录 AI 请求
        logEvent('ai_request');
        
        setIsThinking(true);
        if (!isWorkerReady) {
            // 模型还未加载完成，先缓存请求，等 init-complete 后补发
            pendingRequestRef.current = { board, playerColor, history }; // Note: pending logic needs update too if strictly needed, but simple fallback is ok
            return;
        }

        // 发送完整数据到 Worker，让 Worker 负责繁重的计算
        workerRef.current.postMessage({
            type: 'compute',
            data: {
                board, // 原始棋盘数据
                history, // 原始历史数据
                color: playerColor,
                size: boardSize,
                simulations
            }
        });
    }, [boardSize, isThinking, isWorkerReady]);

    const stopThinking = useCallback(() => {
        setIsThinking(false);
        pendingRequestRef.current = null;
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    }, []);

    return {
        isWorkerReady,
        isThinking,
        aiWinRate,
        requestWebAiMove,
        stopThinking
    };
};