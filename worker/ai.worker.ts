import { OnnxEngine, type AnalysisResult } from '../utils/onnx-engine';
import { MicroBoard, type Sign } from '../utils/micro-board';

// Define message types
type WorkerMessage = 
    | { type: 'init'; payload: { modelPath: string; modelParts?: string[]; wasmPath?: string; numThreads?: number } }
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
            const { modelPath, modelParts, wasmPath, numThreads } = msg.payload;
            
            // Cache config for Re-Init
            (self as any).aiConfig = msg.payload;

            // Dispose existing engine if any
            if (engine) engine.dispose();

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
            
            if (!engine) {
                console.log("[AI Worker] Re-Initializing engine...");
                engine = new OnnxEngine({
                    modelPath: config.modelPath,
                    modelParts: config.modelParts,
                    wasmPath: config.wasmPath,
                    numThreads: config.numThreads,
                    debug: true
                });
                
                initPromise = engine.initialize((statusMsg) => {
                     // Be less verbose on re-init
                     if (statusMsg.includes('启动')) ctx.postMessage({ type: 'status', message: statusMsg });
                });
                await initPromise;
                initPromise = null;
            }
            // If engine exists and no promise, we assume it is ready.
            ctx.postMessage({ type: 'init-complete' });

        } else if (msg.type === 'compute') {
            if (!engine) {
                // [Fix] Auto-recover if engine is missing (Race Condition safety)
                const config = (self as any).aiConfig;
                if (config) {
                     console.warn("[AI Worker] Engine missing for compute (Race Condition detected). Auto-recovering...");
                     engine = new OnnxEngine({
                        modelPath: config.modelPath,
                        modelParts: config.modelParts,
                        wasmPath: config.wasmPath,
                        numThreads: config.numThreads,
                        debug: true
                    });
                    await engine.initialize();
                } else {
                    throw new Error('Engine not initialized');
                }
            }

            const { board: boardState, history: gameHistory, color, size, komi, difficulty, temperature } = msg.data;
            const pla: Sign = color === 'black' ? 1 : -1;

            // 1. Reconstruct MicroBoard with Ko Detection
            const board = new MicroBoard(size);
            
            // Logic: To detect Ko, we need to replay the last move to set the 'ko' property on the board.
            // If we just load the current board state, 'ko' will be -1 (unknown).
            // So we go back one step (State Before Last Move) and replay the Last Move.
            
            const len = gameHistory.length;
            
            if (len > 0) {
                const lastItem = gameHistory[len - 1]; // This item contains the state BEFORE the last move, and the move itself.
                
                // 1. Load the board state BEFORE the last move
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const cell = lastItem.board[y][x];
                        if (cell) board.set(x, y, cell.color === 'black' ? 1 : -1);
                    }
                }
                
                // 2. Play the last move to reach CURRENT state with calculated Ko
                if (lastItem.lastMove) {
                     // App.tsx stores the MOVER in `currentPlayer`.
                     const moverColor = lastItem.currentPlayer === 'black' ? 1 : -1;
                     board.play(lastItem.lastMove.x, lastItem.lastMove.y, moverColor);
                }
            } else {
                // No history (Start of game). Just load current board state.
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
                        const cell = boardState[y][x];
                        if (cell) board.set(x, y, cell.color === 'black' ? 1 : -1);
                    }
                }
            }

            // 2. Reconstruct History
            // HistoryItem[] -> { color, x, y }[]
            const historyMoves: { color: Sign; x: number; y: number }[] = [];
            
            for (const item of gameHistory) {
                if (item.lastMove) {
                    const moveColor = item.currentPlayer === 'black' ? 1 : -1; 
                    historyMoves.push({
                         color: moveColor,
                         x: item.lastMove.x,
                         y: item.lastMove.y
                    });
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
