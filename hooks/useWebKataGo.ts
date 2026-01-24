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
    const [isLoading, setIsLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false); // [Lazy Load]
    const [initStatus, setInitStatus] = useState<string>(''); // [Lazy Load]
    const [aiWinRate, setAiWinRate] = useState(50);
    const workerRef = useRef<Worker | null>(null);
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[]; simulations: number; komi?: number; difficulty?: string } | null>(null);
    const expectingResponseRef = useRef(false);
    const initializingRef = useRef(false); // [Fix] Lock to prevent double-init

    // [Lazy Load] Initialization Function
    const initializeAI = useCallback(() => {
        if (isWorkerReady || isInitializing || workerRef.current || initializingRef.current) return;
        
        // Only run in non-Electron environment
        if ((window as any).electronAPI) return;

        console.log("[WebAI] Starting Initialization...");
        initializingRef.current = true; // Lock immediately
        setIsLoading(true);
        setIsInitializing(true);
        setInitStatus('正在启动 AI 引擎...');

        // --- 1. Paths ---
        const pathName = window.location.pathname;
        const directory = pathName.substring(0, pathName.lastIndexOf('/') + 1);
        const baseUrl = `${window.location.origin}${directory}`;
        
        const modelUrl = `${baseUrl}models/kata1-b18c384nbt-s9996604416-d4316597426.uint8.onnx`;
        const wasmUrl = `${baseUrl}wasm/`;

        console.log("WebAI Model URL:", modelUrl);

        // --- 2. Worker Initialization ---
        let worker: Worker;
        try {
            worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { 
                type: 'module'
            });
        } catch (e) {
            console.error("Worker Init Failed:", e);
            setInitStatus('Worker 启动失败');
            setIsLoading(false);
            setIsInitializing(false);
            initializingRef.current = false; // Unlock
            return;
        }
        
        workerRef.current = worker;

        worker.onerror = (err) => {
            console.error("CRITICAL: Web Worker Error", err);
            setIsThinking(false);
            setIsLoading(false);
            setIsInitializing(false);
            initializingRef.current = false; // Unlock
            setInitStatus('AI 引擎发生错误');
        };

        worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.type === 'init-complete') {
                console.log('Web AI Ready (ONNX)');
                setIsWorkerReady(true);
                setIsLoading(false);
                setIsInitializing(false);
                setInitStatus('AI 准备就绪');
                initializingRef.current = false; // Unlock (Done)
                
                // Process pending if any (rare case for lazy load but possible)
                if (pendingRequestRef.current && workerRef.current) {
                   // ... (Existing pending logic below)
                   const pending = pendingRequestRef.current;
                    pendingRequestRef.current = null;
                    workerRef.current.postMessage({
                        type: 'compute',
                        data: {
                            board: pending.board,
                            history: pending.history,
                            color: pending.playerColor,
                            size: boardSize,
                            simulations: pending.simulations,
                            komi: pending.komi ?? 7.5,
                            difficulty: pending.difficulty
                        }
                    });
                    setIsThinking(true);
                    expectingResponseRef.current = true;
                }
            } else if (msg.type === 'ai-response') {
                // ... (Existing logic)
                if (!expectingResponseRef.current) return;
                setIsThinking(false);
                expectingResponseRef.current = false;
                const { move, winRate } = msg.data;
                setAiWinRate(winRate);
                if (move) onAiMove(move.x, move.y);
                else onAiPass();
            } else if (msg.type === 'status') {
                // [Optional] Support worker sending detailed status updates
                setInitStatus(msg.message);
            } else if (msg.type === 'error') {
                console.error('[WebAI Error]', msg.message);
                setIsThinking(false);
                setIsLoading(false);
                setIsInitializing(false);
                initializingRef.current = false; // Unlock
                setInitStatus(`错误: ${msg.message}`);
                expectingResponseRef.current = false;
                pendingRequestRef.current = null;
            }
        };

        // --- 3. Hardware Concurrency ---
        // Optimization for Mobile: Cap at 2 threads to prevent overheating
        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
        const cores = navigator.hardwareConcurrency || 2;
        // Desktop: Max 4. Mobile: Max 2.
        const numThreads = isMobile ? Math.min(2, cores) : Math.min(4, cores);
        console.log(`[WebAI] Configured Threads: ${numThreads} (Mobile: ${isMobile})`); 

        // --- 4. Send Init Message ---
        const modelParts = [
            modelUrl + '.part1',
            modelUrl + '.part2',
            modelUrl + '.part3',
            modelUrl + '.part4'
        ];



        setInitStatus('正在下载 AI 模型 (20MB)...');
        
        // Timeout Watchdog
        const watchdog = setTimeout(() => {
            if (initializingRef.current && !isWorkerReady) {
                 setInitStatus(prev => {
                     // Check if we passed the "Worker Alive" stage
                     if (prev.includes('启动 AI 引擎') && !prev.includes('Worker 线程')) {
                         return 'AI 引擎响应超时 (可能脚本加载失败，请刷新)';
                     }
                     if (prev.includes('下载')) {
                         return prev + ' (如果长时间无响应，请尝试刷新)';
                     }
                     return prev;
                 });
            }
        }, 8000); // 8s warning

        worker.postMessage({ 
            type: 'init',
            payload: { 
                modelPath: modelUrl,
                modelParts: modelParts,
                wasmPath: wasmUrl,
                numThreads: numThreads
            }
        });

    }, [boardSize, onAiMove, onAiPass, isWorkerReady, isInitializing]);

    // Cleanup Effect
    useEffect(() => {
        return () => {
            console.log("[WebAI] Cleaning up worker...");
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            initializingRef.current = false;
        };
    }, []);

    const requestWebAiMove = useCallback((
        board: BoardState,
        playerColor: Player,
        history: any[],
        simulations: number = 45,
        komi: number = 7.5, 
        difficulty: 'Easy' | 'Medium' | 'Hard' = 'Hard'
    ) => {
        // [Lazy Load Warning]
        if (!isWorkerReady) {
            console.warn("AI requested but not ready. Call initializeAI() first.");
            return;
        }

        if (!workerRef.current || isThinking) return;

        logEvent('ai_request');
        
        if (!isWorkerReady) {
            console.log("Worker not ready, queuing request...");
            pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty }; // Add difficulty
            setIsThinking(true); 
            expectingResponseRef.current = true;
            return;
        }

        setIsThinking(true);
        expectingResponseRef.current = true;
        workerRef.current.postMessage({
            type: 'compute',
            data: {
                board, 
                history, 
                color: playerColor,
                size: boardSize,
                simulations,
                komi,
                difficulty
            }
        });
    }, [boardSize, isThinking, isWorkerReady]);

    const stopThinking = useCallback(() => {
        setIsThinking(false);
        pendingRequestRef.current = null;
        expectingResponseRef.current = false;
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    }, []);

    // --- Page Visibility Handler (Save Battery) ---
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log("[PowerSave] App sent to background, stopping AI...");
                stopThinking();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [stopThinking]);

    return {
        isWorkerReady,
        isLoading,
        isThinking,
        isInitializing, // Export
        initStatus,    // Export
        aiWinRate,
        requestWebAiMove,
        stopThinking,
        initializeAI   // Export
    };
};