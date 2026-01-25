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
    const [isInitializing, setIsInitializing] = useState(false);
    const [initStatus, setInitStatus] = useState<string>('');
    const [aiWinRate, setAiWinRate] = useState(50);
    
    const workerRef = useRef<Worker | null>(null);
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[]; simulations: number; komi?: number; difficulty?: string; temperature?: number } | null>(null);
    const expectingResponseRef = useRef(false);
    const initializingRef = useRef(false); 
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const releaseTimeoutRef = useRef<NodeJS.Timeout | null>(null); // [New] Deferred Release

    // Initialization Function
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
        let baseUrl = window.location.origin + window.location.pathname;
        if (!baseUrl.endsWith('/')) {
            baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        }

        const modelUrl = new URL('models/kata1-b18c384nbt-s9996604416-d4316597426.uint8.onnx', baseUrl).href;
        const wasmUrl = new URL('wasm/', baseUrl).href;

        // --- 2. Worker config ---
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        const numThreads = isMobile ? 1 : Math.min(2, navigator.hardwareConcurrency || 2);
        
        console.log(`[WebAI] Worker Config: Threads=${numThreads} Mobile=${isMobile}`);

        try {
            const worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;

            // Watchdog for Init
            const initWatchdog = setTimeout(() => {
                if (initializingRef.current && !isWorkerReady) {
                    console.warn("[WebAI] Worker Init Timeout!");
                    setInitStatus("AI 启动超时 (网络/设备过慢)");
                    setIsInitializing(false);
                }
            }, 60000); // 60s watchdog (Mobile can be slow)

            worker.onerror = (err) => {
                console.error("Worker Error:", err);
                setInitStatus('AI 出错');
                setIsThinking(false);
                setIsLoading(false);
                setIsInitializing(false);
                initializingRef.current = false;
                expectingResponseRef.current = false;
                clearTimeout(initWatchdog);
            };

            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'init-complete') {
                    console.log('[WebAI] Worker Ready (or Re-Initialized).');
                    clearTimeout(initWatchdog);
                    setIsWorkerReady(true);
                    setIsLoading(false);
                    setIsInitializing(false);
                    setInitStatus('AI 就绪');
                    initializingRef.current = false;
                    
                    // Execute Pending
                    if (pendingRequestRef.current) {
                        const pending = pendingRequestRef.current;
                        pendingRequestRef.current = null; // Clear
                        
                        // Send compute
                        worker.postMessage({
                            type: 'compute',
                            data: {
                                board: pending.board,
                                history: pending.history,
                                color: pending.playerColor,
                                size: boardSize,
                                simulations: pending.simulations,
                                komi: pending.komi ?? 7.5,
                                difficulty: pending.difficulty,
                                temperature: pending.temperature
                            }
                        });
                        
                        setIsThinking(true);
                        expectingResponseRef.current = true;
                    }
                } else if (msg.type === 'ai-response') {
                    if (!expectingResponseRef.current) return;
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    
                    const { move, winRate } = msg.data;
                    setAiWinRate(winRate);
                    setIsThinking(false);
                    expectingResponseRef.current = false;

                    if (move) onAiMove(move.x, move.y);
                    else onAiPass();
                    
                    // [Memory Saving] Deferred Release on Mobile (15s delay)
                    // If user moves again within 15s, we clear this timeout.
                    if (isMobile) {
                        if (releaseTimeoutRef.current) clearTimeout(releaseTimeoutRef.current);
                        
                        // Log only
                        // console.log("[WebAI] Scheduling memory release in 15s...");
                        
                        releaseTimeoutRef.current = setTimeout(() => {
                             console.log("[WebAI] Idle timeout: Releasing memory now.");
                             worker.postMessage({ type: 'release' });
                             releaseTimeoutRef.current = null;
                        }, 15000);
                    }

                } else if (msg.type === 'released') {
                    console.log("[WebAI] Worker memory released (Suspended).");
                    setIsWorkerReady(false); // Mark as not ready so next req triggers re-init
                    
                } else if (msg.type === 'status') {
                    setInitStatus(msg.message);
                } else if (msg.type === 'error') {
                    setInitStatus(`错误: ${msg.message}`);
                    setIsThinking(false);
                    setIsLoading(false);
                    setIsInitializing(false);
                    initializingRef.current = false; // Reset lock
                    expectingResponseRef.current = false;
                }
            };

            // Send Init
            const modelParts = [
                modelUrl + '.part1',
                modelUrl + '.part2',
                modelUrl + '.part3',
                modelUrl + '.part4'
            ];

            worker.postMessage({ 
                type: 'init',
                payload: { 
                    modelPath: modelUrl,
                    modelParts: modelParts,
                    wasmPath: wasmUrl,
                    numThreads: numThreads
                }
            });

        } catch (e) {
            console.error("Failed to crate worker", e);
            setInitStatus("启动失败");
            setIsLoading(false);
            setIsInitializing(false);
            initializingRef.current = false;
        }

    }, [boardSize, onAiMove, onAiPass, isWorkerReady, isInitializing]);

    // Cleanup
    useEffect(() => {
        return () => {
            console.log("[WebAI] Cleaning up worker...");
            if (releaseTimeoutRef.current) clearTimeout(releaseTimeoutRef.current);
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
        difficulty: 'Easy' | 'Medium' | 'Hard' = 'Hard',
        temperature: number = 0
    ) => {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        // Cancel any pending release since we are active again!
        if (releaseTimeoutRef.current) {
            clearTimeout(releaseTimeoutRef.current);
            releaseTimeoutRef.current = null;
        }

        // [Lazy Load / Re-Init Logic]
        if (!isWorkerReady) {
            console.warn("AI requested but not ready.");
            
            // If worker exists but is 'released' (memory saved), re-init it.
            if (workerRef.current && !isInitializing) {
                 console.log("[WebAI] Worker exists but suspended. Re-Initializing...");
                 pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty, temperature };
                 // Silent Re-init: Treat as "Thinking" to user, so no popup appears.
                 setInitStatus(""); 
                 setIsThinking(true); 
                 expectingResponseRef.current = true;
                 workerRef.current.postMessage({ type: 'reinit' });
                 return;
            }

            // If not initialized at all, try initializing?
            if (!isInitializing && !workerRef.current) {
                 console.log("[WebAI] Auto-initializing for request...");
                 pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty, temperature };
                 initializeAI();
            } else if (isInitializing) {
                 // Just Queue
                 pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty, temperature };
            }
            return;
        }

        if (!workerRef.current || isThinking) return;

        logEvent('ai_request');
        
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
                difficulty,
                temperature
            }
        });
        
        // Timeout Watchdog for Computation
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (expectingResponseRef.current) {
                console.warn('[WebAI] Timeout! Resetting...');
                setInitStatus('AI 响应超时');
                setIsThinking(false);
                expectingResponseRef.current = false;
            }
        }, 20000); // 20s

    }, [boardSize, isThinking, isWorkerReady, isInitializing, initializeAI]);

    const stopThinking = useCallback(() => {
        setIsThinking(false);
        expectingResponseRef.current = false;
        pendingRequestRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    }, []);

    // Page Visibility (Battery Save)
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
        isInitializing, 
        initStatus,    
        aiWinRate,
        requestWebAiMove,
        stopThinking,
        initializeAI
    };
};