import { useState, useEffect, useRef, useCallback } from 'react';
import { BoardState, Player, BoardSize } from '../types';
import { logEvent } from '../utils/logger';

interface UseWebKataGoProps {
    boardSize: BoardSize;
    onAiMove: (x: number, y: number) => void;
    onAiPass: () => void;
    onAiResign: () => void;
    onAiError?: (error: string) => void;
}

export const useWebKataGo = ({ boardSize, onAiMove, onAiPass, onAiResign, onAiError }: UseWebKataGoProps) => {
    const [isWorkerReady, setIsWorkerReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isInitializing, setIsInitializing] = useState(false);
    const [initStatus, setInitStatus] = useState<string>('');
    const [aiWinRate, setAiWinRate] = useState(50);
    const [aiLead, setAiLead] = useState<number | null>(null);
    const [aiScoreStdev, setAiScoreStdev] = useState<number | null>(null);
    const [aiTerritory, setAiTerritory] = useState<Float32Array | null>(null);
    
    const workerRef = useRef<Worker | null>(null);
    const isWorkerReadyRef = useRef(false); // [New] Synchronous check
    const isThinWorkerRef = useRef(false); // [New] Track if worker is rule-only
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[]; simulations: number; komi?: number; difficulty?: string; temperature?: number } | null>(null);
    const expectingResponseRef = useRef(false);
    const initializingRef = useRef(false); 
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const releaseTimeoutRef = useRef<NodeJS.Timeout | null>(null); // [New] Deferred Release
    const isReleasingRef = useRef(false); // [Fix] Race Condition Lock

    // Initialization Function
    const initializeAI = useCallback((options: { needModel: boolean } = { needModel: true }) => {
        if (initializingRef.current || workerRef.current) {
            // If already initialized as 'thin' but now need model, we proceed to 'upgrade'
            if (options.needModel && isThinWorkerRef.current && !isLoading) {
                 console.log("[WebAI] Upgrading existing Thin worker to Full Model mode...");
            } else {
                 return;
            }
        }
        
        // Only run in non-Electron environment
        if ((window as any).electronAPI) return;

        console.log("[WebAI] Starting Initialization...");
        initializingRef.current = true; // Lock immediately
        setIsLoading(options.needModel);
        setIsInitializing(true);
        if (options.needModel) setInitStatus('正在启动 AI 引擎...');
        else setInitStatus('正在启动规则引擎...');

        // --- 1. Paths ---
        let baseUrl = window.location.origin + window.location.pathname;
        if (!baseUrl.endsWith('/')) {
            baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        }

        const modelUrl = new URL('models/kata1_b6.onnx', baseUrl).href;
        const wasmUrl = new URL('wasm/', baseUrl).href;

        // --- 2. Worker config ---
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        const isIsolated = typeof window !== 'undefined' && window.crossOriginIsolated;
        
        // [Fix] If not crossOriginIsolated (missing COOP/COEP headers), SharedArrayBuffer is unavailable.
        // We MUST force numThreads = 1 to avoid crashing/hanging in standard H5 environments.
        const numThreads = (isMobile || !isIsolated) ? 1 : Math.min(2, navigator.hardwareConcurrency || 2);
        
        console.log(`[WebAI] Worker Config: Threads=${numThreads} Mobile=${isMobile} Isolated=${isIsolated}`);

        try {
            const worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;

            // Watchdog for Init
            const watchdogTime = options.needModel ? 60000 : 15000; // 15s for Rule Engine, 60s for Full AI
            const initWatchdog = setTimeout(() => {
                if (initializingRef.current && !isWorkerReadyRef.current) {
                    console.warn(`[WebAI] Worker Init Timeout! (after ${watchdogTime}ms)`);
                    setInitStatus(options.needModel ? "AI 启动超时 (网络/设备过慢)" : "规则引擎启动超时");
                    setIsInitializing(false);
                    setIsLoading(false);
                    initializingRef.current = false; // [Fix] Unlock
                    
                    // Terminate the stuck worker if it's really dead
                    if (workerRef.current) {
                         workerRef.current.terminate();
                         workerRef.current = null;
                    }
                }
            }, watchdogTime);

            worker.onerror = (err) => {
                console.error("Worker Error:", err);
                const errMsg = "AI 线程崩溃或加载失败";
                setInitStatus('AI 出错');
                setIsThinking(false);
                setIsLoading(false);
                setIsInitializing(false);
                initializingRef.current = false;
                expectingResponseRef.current = false;
                if (onAiError) onAiError(errMsg);
                clearTimeout(initWatchdog);
            };

            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'init-complete') {
                    console.log('[WebAI] Init Complete.');
                    clearTimeout(initWatchdog);
                    setIsWorkerReady(true);
                    isWorkerReadyRef.current = true;
                    setIsLoading(false);
                    setIsInitializing(false);
                    setInitStatus(isThinWorkerRef.current ? '规则引擎就绪' : 'AI 引擎就绪');
                    initializingRef.current = false;
                    
                    // Execute Pending
                    if (pendingRequestRef.current) {
                        const pending = pendingRequestRef.current;
                        pendingRequestRef.current = null; // Clear
                        console.log("[WebAI] Processing pending request after init-complete...");
                        requestWebAiMove(
                            pending.board, pending.playerColor, pending.history, 
                            pending.simulations, pending.komi, 
                            pending.difficulty as any, pending.temperature
                        );
                    }
                } else if (msg.type === 'ai-response') {
                    if (!expectingResponseRef.current) return;
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);
                    
                    const { move, winRate, lead, scoreStdev, ownership } = msg.data;
                    setAiWinRate(winRate);
                    setAiLead(lead ?? null);
                    setAiScoreStdev(scoreStdev ?? null);
                    if (ownership) setAiTerritory(new Float32Array(ownership));
                    setIsThinking(false);
                    expectingResponseRef.current = false;

                    if (move) onAiMove(move.x, move.y);
                    else onAiPass();
                    


                } else if (msg.type === 'released') {
                    console.log("[WebAI] Worker memory released (Suspended).");
                    isReleasingRef.current = false;
                    setIsWorkerReady(false); 
                    isWorkerReadyRef.current = false;
                    
                } else if (msg.type === 'status') {
                    setInitStatus(msg.message);
                } else if (msg.type === 'error') {
                    setInitStatus(`错误: ${msg.message}`);
                    setIsThinking(false);
                    setIsLoading(false);
                    setIsInitializing(false);
                    initializingRef.current = false;
                    expectingResponseRef.current = false;
                    if (onAiError) onAiError(msg.message);
                }
            };

            // Send Init
            isThinWorkerRef.current = !options.needModel;

            worker.postMessage({ 
                type: 'init',
                payload: { 
                    modelPath: modelUrl,
                    // modelParts removed
                    wasmPath: wasmUrl,
                    numThreads: numThreads,
                    onlyRules: isThinWorkerRef.current
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
            isReleasingRef.current = false;
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
        const isReadyNow = isWorkerReadyRef.current && !isReleasingRef.current;
        if (!isReadyNow) {
            console.warn(`AI requested but not ready (isReadyNow=${isReadyNow}, isInitializing=${isInitializing})`);
            
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
                 // [Fix] AI mode always needs model for analysis. 
                 // Tsumego hints also need model for search.
                 const needModel = true; 
                 initializeAI({ needModel });
            } else if (isInitializing) {
                 // Just Queue
                 pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty, temperature };
            }
            return;
        }

        // [Upgrade] If worker is ready but only in 'Thin' mode and we now need a model
        const needFullModel = true; 
        if (isWorkerReadyRef.current && needFullModel && isThinWorkerRef.current && !isLoading) {
             console.log("[WebAI] Upgrading from Thin to Full Mode (Model Required for Difficulty)...");
             pendingRequestRef.current = { board, playerColor, history, simulations, komi, difficulty, temperature };
             setIsWorkerReady(false); 
             isWorkerReadyRef.current = false; // Mark as not ready to trigger full init
             initializeAI({ needModel: true });
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

    const resetAI = useCallback(() => {
        setAiWinRate(50);
        setAiLead(null);
        setAiScoreStdev(null);
        setAiTerritory(null);
        setIsThinking(false);
        setIsLoading(false);
        setInitStatus('');
        expectingResponseRef.current = false;
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
        aiLead,
        aiScoreStdev,
        aiTerritory,
        requestWebAiMove,
        stopThinking,
        initializeAI,
        resetAI // [New]
    };
};