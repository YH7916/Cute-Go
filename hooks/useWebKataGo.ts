import { useState, useEffect, useRef, useCallback } from 'react';
import { BoardState, Player, BoardSize } from '../types';

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
        // 注意：Vite 中引用 public 下的 worker 可以直接使用绝对路径
        if (!(window as any).electronAPI) {
            const worker = new Worker('/worker/ai-worker.js');
            workerRef.current = worker;

            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'init-complete') {
                    console.log('Web AI Ready');
                    setIsWorkerReady(true);

                    // 如果在模型初始化期间已触发 AI 请求，则此处补发一次
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
                    
                    if (move) {
                        onAiMove(move.x, move.y);
                    } else {
                        onAiPass();
                    }
                } else if (msg.type === 'ai-resign') {
                    setIsThinking(false);
                    if (msg.data && typeof msg.data.winRate === 'number') {
                        setAiWinRate(msg.data.winRate);
                    }
                    onAiResign();
                } else if (msg.type === 'error') {
                    console.error('[WebAI Error]', msg.message);
                    setIsThinking(false);
                    pendingRequestRef.current = null;
                }
            };

            // 初始化模型
            worker.postMessage({ type: 'init' });

            return () => {
                worker.terminate();
            };
        }
    }, []);

    const requestWebAiMove = useCallback((
        board: BoardState,
        playerColor: Player,
        history: any[]
    ) => {
        if (!workerRef.current || isThinking) return;
        
        setIsThinking(true);
        if (!isWorkerReady) {
            // 模型还未加载完成，先缓存请求，等 init-complete 后补发
            pendingRequestRef.current = { board, playerColor, history };
            return;
        }

        // 发送完整数据到 Worker，让 Worker 负责繁重的计算
        workerRef.current.postMessage({
            type: 'compute',
            data: {
                board, // 原始棋盘数据
                history, // 原始历史数据
                color: playerColor,
                size: boardSize
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