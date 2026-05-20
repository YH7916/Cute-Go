/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef, useCallback } from 'react';
import { BoardState, Player, BoardSize, GameType } from '../types';
import { logEvent } from '../utils/logger';
import { getBeginnerAIMove, getBoardHash } from '../utils/goLogic';

interface UseWebKataGoProps {
    boardSize: BoardSize;
    onAiMove: (x: number, y: number) => void;
    onAiPass: () => void;
    onAiResign: () => void;
    onAiError?: (error: string) => void;
    onAnalysisComplete?: (data: { winRate: number; lead: number; ownership: Float32Array | null }) => void; // [New] KataGo endgame judgment
}

const KATAGO_MODEL_PATH = 'models/kata_dynamic.onnx';

export const useWebKataGo = ({ boardSize, onAiMove, onAiPass, onAiResign: _onAiResign, onAiError, onAnalysisComplete }: UseWebKataGoProps) => {
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
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[]; gameType?: GameType; simulations: number; komi?: number; difficulty?: string; temperature?: number } | null>(null);
    const expectingResponseRef = useRef(false);
    const initializingRef = useRef(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const releaseTimeoutRef = useRef<NodeJS.Timeout | null>(null); // [New] Deferred Release
    const isReleasingRef = useRef(false); // [Fix] Race Condition Lock

    const requestTypeRef = useRef<'move' | 'analyze'>('move'); // [New] Track request type

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

        const modelUrl = new URL(KATAGO_MODEL_PATH, baseUrl).href;
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
                    const readyMsg = isThinWorkerRef.current ? '规则引擎就绪' : 'AI 引擎就绪';
                    setInitStatus(readyMsg);
                    setTimeout(() => setInitStatus(''), 2000);
                    initializingRef.current = false;
                    expectingResponseRef.current = false; // [Fix] Clear this so pending request can be sent

                    // Execute Pending
                    if (pendingRequestRef.current) {
                        const pending = pendingRequestRef.current;
                        pendingRequestRef.current = null; // Clear
                        console.log("[WebAI] Processing pending request after init-complete...");
                        requestWebAiMove(
                            pending.board, pending.playerColor, pending.history,
                            pending.simulations, pending.komi,
                            pending.difficulty as any, pending.temperature, pending.gameType
                        );
                    }
                } else if (msg.type === 'ai-response') {
                    if (!expectingResponseRef.current) return;
                    if (timeoutRef.current) clearTimeout(timeoutRef.current);

                    const { move, winRate, lead, scoreStdev, ownership } = msg.data;
                    const territory = ownership ? new Float32Array(ownership) : null;
                    setAiTerritory(territory);
                    setIsThinking(false);
                    expectingResponseRef.current = false;

                    if (requestTypeRef.current === 'move') {
                        setAiWinRate(winRate);
                        setAiLead(lead ?? null);
                        setAiScoreStdev(scoreStdev ?? null);
                        if (move) onAiMove(move.x, move.y);
                        else onAiPass();
                    } else {
                        setAiWinRate(winRate);
                        setAiLead(lead ?? null);
                        setAiScoreStdev(scoreStdev ?? null);
                        console.log("[WebAI] Analysis complete.");
                        if (onAnalysisComplete) {
                            onAnalysisComplete({ winRate, lead: lead ?? 0, ownership: territory });
                        }
                    }


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



    // [New] Request Analysis Only
    const requestAnalysis = useCallback((
        board: BoardState,
        playerColor: Player,
        history: any[],
        komi: number = 7.5,
        gameType: GameType = 'Go'
    ) => {
        if (!workerRef.current || !isWorkerReadyRef.current) {
            // If not ready, maybe define pending? 
            // For now, simple return or init. Analysis is less critical than move.
            if (!initializingRef.current) {
                initializeAI({ needModel: true });
            }
            return;
        }

        if (expectingResponseRef.current) return; // Busy

        setIsThinking(true);
        expectingResponseRef.current = true;
        requestTypeRef.current = 'analyze';

        workerRef.current.postMessage({
            type: 'compute',
            data: {
                board,
                history,
                color: playerColor,
                size: board.length,
                simulations: 100, // Low simulations for quick analysis? Or standard?
                komi,
                difficulty: 'Hard',
                temperature: 0,
                gameType,
                mode: 'analyze'
            }
        });

        // Timeout (Same as move)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (expectingResponseRef.current) {
                setIsThinking(false);
                expectingResponseRef.current = false;
            }
        }, 25000);

    }, [isWorkerReady, initializeAI]);

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
        difficulty: 'Fun' | 'Easy' | 'Medium' | 'Hard' = 'Hard',
        temperature: number = 0,
        gameType: GameType = 'Go' // [New]
    ) => {
        // Cancel any pending release since we are active again!
        if (releaseTimeoutRef.current) {
            clearTimeout(releaseTimeoutRef.current);
            releaseTimeoutRef.current = null;
        }

        if (difficulty === 'Fun' && gameType === 'Go') {
            if (expectingResponseRef.current) return;

            logEvent('ai_request');
            setIsThinking(true);
            expectingResponseRef.current = true;
            requestTypeRef.current = 'move';
            setAiWinRate(50);
            setAiLead(null);
            setAiScoreStdev(null);
            setAiTerritory(null);

            window.setTimeout(() => {
                if (!expectingResponseRef.current) return;

                const lastHistoryItem = history.length > 0 ? history[history.length - 1] : null;
                const previousBoardHash = lastHistoryItem?.board ? getBoardHash(lastHistoryItem.board) : null;
                const move = getBeginnerAIMove(board, playerColor, previousBoardHash);

                setIsThinking(false);
                expectingResponseRef.current = false;

                if (move) onAiMove(move.x, move.y);
                else onAiPass();
            }, 180);
            return;
        }

        // 1. Check Readiness
        const isReadyNow = isWorkerReadyRef.current && !isReleasingRef.current;

        // 2. Prepare Payload
        const payload = { board, playerColor, history, simulations, komi, difficulty, temperature, gameType };

        // 3. Handle Not Ready State
        if (!isReadyNow) {
            console.warn(`[WebAI] Request received but worker not ready. (Initializing=${initializingRef.current}, Worker=${!!workerRef.current})`);

            // Case A: Worker exists but is suspended/released -> Wake up (Re-init)
            if (workerRef.current && !initializingRef.current && !isInitializing) {
                console.log("[WebAI] Waking up suspended worker...");
                pendingRequestRef.current = payload;
                setInitStatus("");
                setIsThinking(true);
                expectingResponseRef.current = true;
                workerRef.current.postMessage({ type: 'reinit' });
                return;
            }

            // Case B: Worker does not exist or strictly not initialized -> Full Init
            if (!workerRef.current && !initializingRef.current && !isInitializing) {
                console.log("[WebAI] Auto-initializing for pending request...");
                pendingRequestRef.current = payload;
                // Mark thinking immediately to prevent UI from allowing another move
                setIsThinking(true);
                initializeAI({ needModel: true });
                return;
            }

            // Case C: Already Initializing -> Queue it
            if (initializingRef.current || isInitializing) {
                console.log("[WebAI] Queueing request (already initializing)...");
                pendingRequestRef.current = payload;
                setIsThinking(true); // Ensure UI shows thinking state while waiting for init
                return;
            }


            // Case D: Fallback?
            return;
        }

        // 4. Handle Upgrade (Thin -> Full)
        // If we are in "Thin" mode (Rule only) but receive a "Go" request, we might need to upgrade?
        // Current logic: GameType 'Go' always needs Model.
        if (isThinWorkerRef.current && gameType === 'Go') {
            console.log("[WebAI] Upgrading from Thin to Full Mode for Go game...");
            pendingRequestRef.current = payload;
            setIsWorkerReady(false);
            isWorkerReadyRef.current = false;
            setIsThinking(true);
            initializeAI({ needModel: true });
            return;
        }

        if (!workerRef.current) return;
        if (expectingResponseRef.current) return; // Prevent double request

        logEvent('ai_request');

        setIsThinking(true);
        expectingResponseRef.current = true;

        requestTypeRef.current = 'move'; // [New] Set type

        // Calculate Size
        const actualSize = board.length;

        workerRef.current.postMessage({
            type: 'compute',
            data: {
                board,
                history,
                color: playerColor,
                size: actualSize,
                simulations,
                komi,
                difficulty,
                temperature,
                gameType,
                mode: 'play' // Explicitly set mode
            }
        });

        // Timeout Watchdog for Computation
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (expectingResponseRef.current) {
                console.warn('[WebAI] Computation Timeout! Resetting...');
                // Don't just reset, maybe retry?
                // For now, fail gracefully.
                setInitStatus('AI 响应超时');
                setIsThinking(false);
                expectingResponseRef.current = false;
                if (onAiError) onAiError('AI 计算超时，请刷新重试');
            }
        }, 25000); // Increased to 25s for mobile hiccups

    }, [isWorkerReady, isInitializing, initializeAI, onAiError, onAiMove, onAiPass]);

    const stopThinking = useCallback(() => {
        setIsThinking(false);
        expectingResponseRef.current = false;
        pendingRequestRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'stop' });
        }
    }, []);

    const terminateAI = useCallback(() => {
        if (releaseTimeoutRef.current) clearTimeout(releaseTimeoutRef.current);
        isReleasingRef.current = false;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (workerRef.current) {
            console.log("[WebAI] Terminating worker...");
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setIsWorkerReady(false);
        isWorkerReadyRef.current = false;
        initializingRef.current = false;
        setIsInitializing(false);
        setIsLoading(false);
        setInitStatus('');
    }, []);

    const resetAI = useCallback(() => {
        setAiWinRate(50);
        setAiLead(null);
        setAiScoreStdev(null);
        setAiTerritory(null);

        // [Fix] Full cleanup similar to stopThinking
        setIsThinking(false);
        setIsLoading(false);
        setInitStatus('');
        expectingResponseRef.current = false;
        pendingRequestRef.current = null; // Clear pending
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }

        // [Fix] Immediately mark worker as not ready, don't wait for 'released' ack
        // This prevents race conditions where we might try to use a dying worker
        setIsWorkerReady(false);
        isWorkerReadyRef.current = false;

        // [Performance Fix] Explicitly release AI Engine memory between games.
        // The worker will auto-reinitialize the engine on the next move request.
        if (workerRef.current) {
            console.log("[WebAI] Sending RELEASE command to worker for cleanup.");
            workerRef.current.postMessage({ type: 'release' });
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
        aiLead,
        aiScoreStdev,
        aiTerritory,
        requestWebAiMove,
        requestAnalysis, // [New] Exported
        stopThinking,
        initializeAI,
        resetAI, // [New]
        terminateAI
    };
};
