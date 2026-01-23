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
    const pendingRequestRef = useRef<{ board: BoardState; playerColor: Player; history: any[]; simulations: number; komi?: number; difficulty?: string } | null>(null);
    const expectingResponseRef = useRef(false);

    useEffect(() => {
        // Only run in non-Electron environment (or if specifically enabled for web mode in Electron)
        if (!(window as any).electronAPI) {
            
            // --- 1. Paths ---
            const pathName = window.location.pathname;
            const directory = pathName.substring(0, pathName.lastIndexOf('/') + 1);
            const baseUrl = `${window.location.origin}${directory}`;
            
            // Using the specific quantized model provided by the user
            const modelUrl = `${baseUrl}models/kata1-b18c384nbt-s9996604416-d4316597426.uint8.onnx`;
            // Calculate WASM path
            const wasmUrl = `${baseUrl}wasm/`;

            console.log("WebAI Model URL:", modelUrl);
            console.log("WebAI WASM URL:", wasmUrl);

            // --- 2. Worker Initialization ---
            // Use Vite's recommended syntax for module workers
            let worker: Worker;
            try {
                worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { 
                    type: 'module'
                });
            } catch (e) {
                console.error("Worker Init Failed:", e);
                return;
            }
            
            workerRef.current = worker;

            worker.onerror = (err) => {
                console.error("CRITICAL: Web Worker Error", err);
                setIsThinking(false);
            };

            worker.onmessage = (e) => {
                const msg = e.data;
                if (msg.type === 'init-complete') {
                    console.log('Web AI Ready (ONNX)');
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
                    if (!expectingResponseRef.current) {
                        console.log("[WebAI] Response ignored (cancelled/stopped)");
                        return;
                    }
                    setIsThinking(false);
                    expectingResponseRef.current = false;
                    const { move, winRate } = msg.data;
                    setAiWinRate(winRate);
                    if (move) onAiMove(move.x, move.y);
                    else onAiPass();
                } else if (msg.type === 'error') {
                    console.error('[WebAI Error]', msg.message);
                    setIsThinking(false);
                    expectingResponseRef.current = false;
                    pendingRequestRef.current = null;
                }
            };

            // --- 3. Hardware Concurrency ---
            // WASM multithreading helps, but extremely unstable on Cloudflare/Mobile without strict headers.
            // Force 1 thread (Single Threaded Mode) to ensure STABILITY.
            const numThreads = 1; 

            // --- 4. Send Init Message ---
            // Cloudflare Pages 25MB Limit Workaround:
            // We load the model from split parts (part1, part2, etc)
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

            return () => {
                worker.terminate();
            };
        }
    }, []);

    const requestWebAiMove = useCallback((
        board: BoardState,
        playerColor: Player,
        history: any[],
        simulations: number = 45,
        komi: number = 7.5, // Default komi
        difficulty: 'Easy' | 'Medium' | 'Hard' = 'Hard'
    ) => {
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
        isThinking,
        aiWinRate,
        requestWebAiMove,
        stopThinking
    };
};