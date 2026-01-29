import { OnnxEngine, type AnalysisResult } from '../utils/onnx-engine';
import { MicroBoard, type Sign } from '../utils/micro-board';


// Define message types
type WorkerMessage = 
    | { type: 'init'; payload: { 
        modelPath: string; 
        modelParts?: string[]; 
        wasmPath?: string; 
        numThreads?: number;
        onlyRules?: boolean; // [New]
    } }
    | { type: 'compute'; data: { 
            board: any[][]; // BoardState
            history: any[]; // HistoryItem[]
            color: 'black' | 'white';
            size: number;
            simulations?: number;
            komi?: number;
            difficulty?: 'Easy' | 'Medium' | 'Hard';
            temperature?: number; // [New]
      } }
    | { type: 'stop' }
    | { type: 'release' }
    | { type: 'reinit' };

let engine: OnnxEngine | null = null;
let initPromise: Promise<void> | null = null;
let initWatchdog: any = null;
const WATCHDOG_TIMEOUT = 30000; // 30s safety net

const clearWatchdog = () => {
    if (initWatchdog) {
        clearTimeout(initWatchdog);
        initWatchdog = null;
    }
};

const ctx: Worker = self as any;

// [Fix] Catch global script errors (e.g. Import failures)
ctx.onerror = (e) => {
    const msg = e instanceof ErrorEvent ? e.message : 'Unknown Worker Error';
    ctx.postMessage({ type: 'error', message: `脚本加载失败: ${msg}` });
};

// [Fix] Signal that worker script loaded successfully
ctx.postMessage({ type: 'status', message: 'Worker 线程已启动...' });

ctx.onmessage = async (e: MessageEvent<WorkerMessage>) => {
    const msg = e.data;

    try {
        if (msg.type === 'init') {
            const { modelPath, modelParts, wasmPath, numThreads, onlyRules } = msg.payload;
            
            // Cache config for Re-Init
            (self as any).aiConfig = msg.payload;

            // Dispose existing engine if any
            if (engine) engine.dispose();
            engine = null;

            if (onlyRules) {
                console.log("[AI Worker] Initialization Start (Rule-only Mode)");
                // Minor delay to ensure message order
                setTimeout(() => {
                    console.log("[AI Worker] Initialization Complete (Rule-only Mode)");
                    ctx.postMessage({ type: 'init-complete' });
                }, 50);
                return;
            }

            console.log("[AI Worker] Initializing OnnxEngine...");
            clearWatchdog();
            initWatchdog = setTimeout(() => {
                console.error("[AI Worker] Initialization Watchdog Triggered (Timeout)");
                ctx.postMessage({ type: 'error', message: 'Worker 初始化超时 (30s)' });
                initPromise = null;
            }, WATCHDOG_TIMEOUT);

            engine = new OnnxEngine({
                modelPath: modelPath,
                modelParts: modelParts, // Pass split parts
                wasmPath: wasmPath,
                numThreads: numThreads,
                debug: true // Enable debug for now
            });
            
            // [Lock] Prevent race conditions
            initPromise = engine.initialize((statusMsg) => {
                ctx.postMessage({ type: 'status', message: statusMsg });
            });
            
            await initPromise;
            initPromise = null; // Unlock
            clearWatchdog();

            console.log("[AI Worker] Initialization Completed successfully.");
            ctx.postMessage({ type: 'init-complete' });

        } else if (msg.type === 'release') {
            if (engine) {
                console.log("[AI Worker] Releasing engine memory...");
                engine.dispose();
                engine = null;
            }
            ctx.postMessage({ type: 'released' });

        } else if (msg.type === 'reinit') {
            // [Lock] If already initializing, just wait!
            if (initPromise) {
                console.log("[AI Worker] Already initializing, waiting...");
                await initPromise;
                ctx.postMessage({ type: 'init-complete' });
                return;
            }

            const config = (self as any).aiConfig;
            if (!config) {
                 ctx.postMessage({ type: 'error', message: 'No cached config for reinit' });
                 return;
            }
            
            if (config.onlyRules) {
                 console.log("[AI Worker] Re-Initialized (Rule-only Mode)");
                 ctx.postMessage({ type: 'init-complete' });
                 return;
            }

            if (!engine) {
                console.log("[AI Worker] Re-Initializing engine...");
                engine = new OnnxEngine({
                    modelPath: config.modelPath,
                    modelParts: config.modelParts,
                    wasmPath: config.wasmPath,
                    numThreads: config.numThreads,
                    debug: true
                });
                
                clearWatchdog();
                initWatchdog = setTimeout(() => {
                    ctx.postMessage({ type: 'error', message: 'Worker 重新初始化超时' });
                    initPromise = null;
                }, WATCHDOG_TIMEOUT);

                initPromise = engine.initialize((statusMsg) => {
                     // Be less verbose on re-init
                     if (statusMsg.includes('启动')) ctx.postMessage({ type: 'status', message: statusMsg });
                });
                await initPromise;
                initPromise = null;
                clearWatchdog();
            }
            // If engine exists and no promise, we assume it is ready.
            ctx.postMessage({ type: 'init-complete' });

        } else if (msg.type === 'compute') {
            const { board: boardState, history: gameHistory, color, size, komi, difficulty, temperature } = msg.data;
            
            if (!engine) {
                // [Fix] If engine is missing, we cannot analyze.
                // We should check if we can auto-recover or if we should fail.
                const config = (self as any).aiConfig;
                if (config && !config.onlyRules) {
                     console.warn("[AI Worker] Engine missing for compute. Attempting Auto-recovery...");
                     engine = new OnnxEngine({
                        modelPath: config.modelPath,
                        modelParts: config.modelParts,
                        wasmPath: config.wasmPath,
                        numThreads: config.numThreads,
                        debug: true
                    });
                    await engine.initialize();
                } else {
                    const mode = config?.onlyRules ? "Rule-only Mode" : "Engine NOT initialized";
                    throw new Error(`AI Engine unavailable (${mode}). Cannot compute move.`);
                }
            }

            const pla: Sign = color === 'black' ? 1 : -1;

            // 1. Reconstruct MicroBoard with Perfect Ko Detection
            // Logic: Replaying the entire history is the only way to ensure the internal 'ko' 
            // and group states of MicroBoard are perfectly synced. 
            // This is extremely fast (< 0.5ms for hundreds of moves).
            const board = new MicroBoard(size);
            const historyMoves: { color: Sign; x: number; y: number }[] = [];

            for (const item of gameHistory) {
                if (item.lastMove) {
                    const moveColor = item.currentPlayer === 'black' ? 1 : -1; 
                    // Use .play() to ensure captures and ko points are calculated
                    const ok = board.play(item.lastMove.x, item.lastMove.y, moveColor);
                    if (!ok) console.warn(`[AI Worker] Move replay failed: (${item.lastMove.x}, ${item.lastMove.y}) color=${moveColor}`);
                    
                    historyMoves.push({
                         color: moveColor,
                         x: item.lastMove.x,
                         y: item.lastMove.y
                    });
                } else {
                    // It was a PASS move in history
                    historyMoves.push({
                        color: item.currentPlayer === 'black' ? 1 : -1,
                        x: -1,
                        y: -1
                    });
                    // Reset ko on pass as per rules
                    board.ko = -1;
                }
            }
            
            // 3. Run Analysis
                const result = await engine.analyze(board, pla, {
                    history: historyMoves,
                    komi: komi ?? 7.5,
                    difficulty: difficulty,
                    temperature: temperature
                });

            // 4. Send Response
            // Select best move
            if (result.moves.length > 0) {
                 const best = result.moves[0];
                     // If best is pass (-1, -1)
                 if (best.x === -1) {
                      ctx.postMessage({ 
                          type: 'ai-response', 
                          data: { 
                              move: null, 
                              winRate: result.rootInfo.winrate,
                              lead: result.rootInfo.lead,
                              ownership: result.rootInfo.ownership
                          } 
                      });
                 } else {
                      ctx.postMessage({ 
                          type: 'ai-response', 
                          data: { 
                              move: { x: best.x, y: best.y }, 
                              winRate: result.rootInfo.winrate,
                              lead: result.rootInfo.lead,
                              ownership: result.rootInfo.ownership
                          } 
                      });
                 }
            } else {
                 // No moves? Pass.
                 ctx.postMessage({ 
                     type: 'ai-response', 
                     data: { 
                         move: null, 
                         winRate: result.rootInfo.winrate,
                         lead: result.rootInfo.lead,
                         ownership: result.rootInfo.ownership
                     } 
                 });
            }
        } else if (msg.type === 'stop') {
            // No-op for now as ONNX run is atomicish. 
            // We could set a flag if we had a loop.
        }
    } catch (err: any) {
        console.error('[AI Worker] Error:', err);
        // [Fix] Critical: If init failed, we must clear the engine instance so retry can work.
        // Otherwise 'reinit' thinks we are ready but session is null.
        if (engine) {
             console.error('[AI Worker] Resetting broken engine instance.');
             try { engine.dispose(); } catch (e) {}
             engine = null;
        }
        ctx.postMessage({ type: 'error', message: err.message });
    }
};

export {};
