import { runOwnershipSearch } from '../core/inference/search';
import { selectMoveByDifficulty } from '../core/inference/selection';
import { canPass } from '../core/inference/policy';
import { getDefaultKomi } from '../core/go/config';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { OnnxEngine, type AnalysisResult } from '../utils/onnx-engine';
import type { Sign } from '../utils/micro-board';
import { replayHistoryForInference } from '../core/inference/history';
import {
    getCandidateMoves,
    getGomokuScore,
    checkGomokuWin,
    GOMOKU_SCORES,
    attemptMove,
    getBoardHash,
    calculateModelScore,
    getBeginnerAIMove,
} from '../utils/goLogic';
import { BoardState, HistoryItem, Player, Point } from '../types';


// Define message types
type WorkerMessage =
    | {
        type: 'init'; payload: {
            modelPath: string;
            modelParts?: string[];
            wasmPath?: string;
            numThreads?: number;
            onlyRules?: boolean; // [New]
        }
    }
    | {
        type: 'compute'; data: {
            board: any[][]; // BoardState
            history: HistoryItem[];
            color: 'black' | 'white';
            size: number;
            gameType?: 'Go' | 'Gomoku'; // [New]
            simulations?: number;
            komi?: number;
            difficulty?: 'Fun' | 'Easy' | 'Medium' | 'Hard';
            temperature?: number;
            mode?: 'play' | 'analyze';
        }
    }
    | { type: 'stop' }
    | { type: 'release' }
    | { type: 'reinit' };

type RankedMove = AnalysisResult['moves'][number] & {
    weight?: number;
    logit?: number;
};

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

const clampPercent = (value: number) => {
    if (!Number.isFinite(value)) return 50;
    return Math.max(0, Math.min(100, value));
};

const toBlackPerspectiveWinRate = (winRate: number, toPlay: Player) =>
    toPlay === 'black' ? clampPercent(winRate) : clampPercent(100 - winRate);

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
            const { board: boardState, history: gameHistory, color, size, gameType = 'Go', komi, difficulty, temperature, mode = 'play', simulations } = msg.data;
            console.log(`[AI Worker] Compute Request Received. Type=${gameType}, Size=${size}, Diff=${difficulty}`);

            // ============================================================
            // === GOMOKU SECTION — 五子棋逻辑（minimax + 启发式评估）===
            // ============================================================
            if (gameType === 'Gomoku') {
                const board = boardState as BoardState;
                // [Fix] Defensive: ensure `size` matches actual board dimensions.
                // If they mismatch (e.g. stale boardSize from closure), use board.length.
                const safeSize = board.length;
                if (safeSize !== size) {
                    console.warn(`[AI Worker] Board size mismatch! size=${size}, board.length=${safeSize}. Using board.length.`);
                }
                const player = color;
                const opColor = player === 'black' ? 'white' : 'black';

                // 1. Initial Candidates & Safety Check
                // Fast path: if board is empty, play center
                let hasStone = false;
                for (let r = 0; r < safeSize; r++) for (let c = 0; c < safeSize; c++) if (board[r][c]) { hasStone = true; break; }
                if (!hasStone) {
                    const center = Math.floor(safeSize / 2);
                    ctx.postMessage({ type: 'ai-response', data: { move: { x: center, y: center }, winRate: 0.5, lead: 0 } });
                    return;
                }

                // 2. Iterative Deepening Setup
                const isHard = difficulty === 'Hard';
                const isMedium = difficulty === 'Medium';

                let maxDepth = isHard ? 8 : (isMedium ? 4 : 2); // Depth limit
                // Time limit: prevent UI freeze (or pure worker lag)
                // Worker can run longer. 
                // Easy: 100ms, Medium: 800ms, Hard: 3000ms
                const timeLimit = isHard ? 3000 : (isMedium ? 800 : 100);
                const startTime = performance.now();

                // Get Initial Candidates
                const candidates = getCandidateMoves(board, safeSize, 2);

                // Pre-Sort candidates by static score for Iterative Deepening efficiency
                // This gives us a good move ordering for Alpha-Beta
                const rootMoves = candidates.map(pt => ({
                    pt,
                    score: getGomokuScore(board, pt.x, pt.y, player, opColor, false)
                })).sort((a, b) => b.score - a.score);

                // Check Instant Win (Depth 0)
                if (rootMoves.length > 0 && rootMoves[0].score >= GOMOKU_SCORES.WIN) {
                    ctx.postMessage({ type: 'ai-response', data: { move: rootMoves[0].pt, winRate: 1.0, lead: 100 } });
                    return;
                }

                // Top K Pruning for Root
                const searchWidth = isHard ? 12 : (isMedium ? 8 : 5);
                const movesToSearch = rootMoves.slice(0, searchWidth).map(m => m.pt);

                let bestMove = movesToSearch[0];
                // --- Helper: Minimax (Local Recurse) ---
                const performSearch = (depth: number) => {
                    let alpha = -Infinity; // Root Alpha
                    const beta = Infinity;
                    let iterationBestMove = bestMove;
                    let iterationBestScore = -Infinity;

                    for (const move of movesToSearch) {
                        if (performance.now() - startTime > timeLimit) break;

                        // Do Move
                        board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };

                        // Recurse
                        // Next is Min (Opponent)
                        const score = minimaxGomokuRecursive(
                            board, depth - 1, alpha, beta, false, player, move
                        );

                        // Undo Move
                        board[move.y][move.x] = null;

                        if (score > iterationBestScore) {
                            iterationBestScore = score;
                            iterationBestMove = move;
                        }

                        // Alpha Update (Root)
                        if (score > alpha) {
                            alpha = score;
                        }
                        // No beta cutoff at root (we want to find best)
                    }
                    return { bestM: iterationBestMove, bestS: iterationBestScore };
                };

                // Iterative Deepening Loop
                for (let d = 2; d <= maxDepth; d += 2) {
                    const { bestM, bestS } = performSearch(d);

                    // If we found a forced win, stop immediately
                    if (bestS >= GOMOKU_SCORES.WIN * 0.9) {
                        bestMove = bestM;
                        break;
                    }

                    if (performance.now() - startTime > timeLimit) {
                        // Don't update bestMove with partial search results if we timed out mid-iteration?
                        // Or trust the previous iteration.
                        // Ideally we only update if we finished the iteration or if the partial result is amazing.
                        // For simplicity, we just keep the previous completed iteration's best, 
                        // UNLESS we finished this iteration's loop?
                        // The loop above breaks if timeout.
                        // We should probably NOT update bestMove if d > 2 and we timed out early.
                        break;
                    }

                    bestMove = bestM;
                }

                // Add slight randomness for Easy/Medium to vary play?
                // Or deterministic high quality? User requested "Difficulty".
                // Keep it deterministic.

                ctx.postMessage({
                    type: 'ai-response',
                    data: {
                        move: bestMove,
                        winRate: 0.5, // We don't have real winrate from heuristics
                        lead: 0
                    }
                });
                return;
            }

            // ============================================================
            // === GO SECTION — 围棋逻辑（ONNX推理 + MCTS搜索）===
            // ============================================================

            // Fun 模式：用手写初学者 AI，不走 ONNX 模型
            if (difficulty === 'Fun' && gameType === 'Go') {
                const boardState2 = boardState as BoardState;
                let prevHash: string | null = null;
                if (gameHistory.length > 0) {
                    const last = gameHistory[gameHistory.length - 1];
                    if (last?.board) prevHash = getBoardHash(last.board);
                }
                const beginnerMove = getBeginnerAIMove(boardState2, color, prevHash);
                ctx.postMessage({
                    type: 'ai-response',
                    data: { move: beginnerMove, winRate: 50, lead: 0, ownership: null }
                });
                return;
            }

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
            const { board, historyMoves, failures } = replayHistoryForInference(gameHistory, size);
            for (const failure of failures) {
                console.warn(
                    `[AI Worker] Move replay failed at history[${failure.index}]: ` +
                    `(${failure.x}, ${failure.y}) color=${failure.color}`
                );
            }

            // 3. Run Analysis
            console.log("[AI Worker] Calling engine.analyze...");
            const effectiveKomi = komi ?? getDefaultKomi(size);
            const last = gameHistory[gameHistory.length - 1];
            const captures = { black: last?.blackCaptures ?? 0, white: last?.whiteCaptures ?? 0 };
            if (last?.move) {
                const previousOpponent = last.board.flat().filter(s => s && s.color !== last.currentPlayer).length;
                const currentOpponent = boardState.flat().filter(s => s && s.color !== last.currentPlayer).length;
                captures[last.currentPlayer] += Math.max(0, previousOpponent - currentOpponent);
            }

            if (mode === 'analyze') {
                console.log("[AI Worker] Analysis Mode: Running Kaya-style root search...");
                const analyzed = await runOwnershipSearch(
                    engine, board,
                    pla,
                    historyMoves,
                    size,
                    effectiveKomi,
                    difficulty,
                    temperature,
                    simulations
                );

                const blackLead = (() => {
                    const score = calculateModelScore(boardState as BoardState, analyzed.ownership ?? null, effectiveKomi, captures);
                    return score.black - score.white;
                })();
                // 直接用模型输出的真实胜率，不用 lead 推算
                const blackWinRate = toBlackPerspectiveWinRate(analyzed.winRate, color);

                ctx.postMessage({
                    type: 'ai-response',
                    data: {
                        move: null, // No move
                        winRate: blackWinRate,
                        lead: blackLead,
                        scoreStdev: analyzed.scoreStdev,
                        ownership: analyzed.ownership
                    }
                });
                return;
            }

            const searched = difficulty === 'Hard'
                ? await runOwnershipSearch(engine, board, pla, historyMoves, size, effectiveKomi, difficulty, 0, simulations)
                : null;
            const result = searched ? {
                ...searched.rootAnalysis,
                moves: [...searched.rankedMoves, ...searched.rootAnalysis.moves.filter(m =>
                    !searched.rankedMoves.some(r => r.x === m.x && r.y === m.y))]
            } : await engine.analyze(board, pla, {
                history: historyMoves, komi: effectiveKomi, difficulty, temperature
            });
            console.log("[AI Worker] Analysis returned.");

            // 4. Send Response

            // Normal Move Selection
            let selectedMove: any = null;

            if (result.moves.length > 0) {
                const validationBoard = boardState as BoardState;

                // Reconstruct prevHash (Simple Ko Check)
                let prevHash: string | null = null;
                if (gameHistory.length > 0) {
                    const lastItem = gameHistory[gameHistory.length - 1];
                    if (lastItem && lastItem.board) prevHash = getBoardHash(lastItem.board);
                }

                // Candidates list
                let candidates = [...result.moves];

                const passAllowed = canPass(size, gameHistory.length, gameHistory[gameHistory.length - 1]?.move === null);
                if (!passAllowed) candidates = candidates.filter(m => m.x >= 0);
                // Ownership predicts the outcome, not move legality; never delete tactical replies.
                if (passAllowed && candidates[0]?.x === -1) {
                    selectedMove = null;
                } else if (difficulty === 'Easy' || difficulty === 'Medium') {
                    selectedMove = selectMoveByDifficulty(candidates as RankedMove[], validationBoard, color, prevHash, difficulty);
                } else if (temperature && temperature > 0) {
                    selectedMove = selectMoveByDifficulty(candidates as RankedMove[], validationBoard, color, prevHash, difficulty);
                } else {
                    // Argmax (Iterate filtered+sorted candidates)
                    for (const m of candidates) {
                        if (m.x === -1) { selectedMove = null; break; }
                        if (attemptMove(validationBoard, m.x, m.y, color, 'Go', prevHash)) {
                            selectedMove = { x: m.x, y: m.y };
                            break;
                        }
                    }
                }
            } else {
                selectedMove = null; // Pass
            }

            if (selectedMove == null && !canPass(size, gameHistory.length, gameHistory[gameHistory.length - 1]?.move === null)) {
                const prevHash = gameHistory.length ? getBoardHash(gameHistory[gameHistory.length - 1].board) : null;
                outer: for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    if (attemptMove(boardState as BoardState, x, y, color, 'Go', prevHash)) {
                        selectedMove = { x, y };
                        break outer;
                    }
                }
            }

            if (selectedMove === undefined) selectedMove = null; // Safety

            const isPass = selectedMove === null;
            const blackLead = (() => {
                const score = calculateModelScore(boardState as BoardState, result.rootInfo.ownership ?? null, effectiveKomi, captures);
                return score.black - score.white;
            })();
            // 直接用模型输出的真实胜率，不用 lead 推算
            const blackWinRate = toBlackPerspectiveWinRate(result.rootInfo.winrate, color);

            // Only log if not null or valid object
            const moveStr = isPass ? 'Pass' : `(${selectedMove.x},${selectedMove.y})`;
            console.log(`[AI Worker] Best Move: ${moveStr} Win=${blackWinRate.toFixed(1)}% BlackLead=${blackLead.toFixed(2)}`);

            ctx.postMessage({
                type: 'ai-response',
                data: {
                    move: selectedMove,
                    winRate: blackWinRate,
                    lead: blackLead,
                    scoreStdev: result.rootInfo.scoreStdev,
                    ownership: result.rootInfo.ownership
                }
            });
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
            try { engine.dispose(); } catch {}
            engine = null;
        }
        ctx.postMessage({ type: 'error', message: err.message });
    }
};

const minimaxGomokuRecursive = (
    board: BoardState,
    depth: number,
    alpha: number,
    beta: number,
    isMaximizing: boolean,
    player: Player,
    lastMove: Point | null
): number => {
    // Check Terminal (Win/Loss)
    if (lastMove && checkGomokuWin(board, lastMove)) {
        // If the *current* player just moved and won, that's great for them.
        // But minimax is called *after* the move.
        // So this means the PREVIOUS mover won. 
        // If isMaximizing=true, it means "Turn for Maximizer". 
        // So the previous mover was Minimizer. Minimizer won.
        // Return -Infinity
        return isMaximizing ? -100000000 : 100000000;
    }

    if (depth === 0) return 0;

    const size = board.length;
    // Optimization: Only search neighborhood of existing stones?
    // standard getCandidateMoves handles it (range=2)
    const candidates = getCandidateMoves(board, size, 2);
    if (candidates.length === 0) return 0;

    const opColor = player === 'black' ? 'white' : 'black';
    // Current Mover Color
    const currentColor = isMaximizing ? player : opColor;
    // const nextColor    = isMaximizing ? opColor : player;

    // Heuristic Sort (Move Ordering)
    const scoredMoves = candidates.map(pt => {
        // Evaluate based on Current Mover's View
        const score = getGomokuScore(board, pt.x, pt.y, currentColor, isMaximizing ? opColor : player, false);
        return { pt, score };
    });

    scoredMoves.sort((a, b) => b.score - a.score);

    // Pruning
    const branching = depth > 2 ? 6 : 10;
    const movesToSearch = scoredMoves.slice(0, branching);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const { pt } of movesToSearch) {
            // Check immediate win (Optimization)
            if (getGomokuScore(board, pt.x, pt.y, player, opColor, false) >= GOMOKU_SCORES.WIN) {
                return 100000000;
            }

            board[pt.y][pt.x] = { color: player, x: pt.x, y: pt.y, id: 'sim' };

            const evalScore = minimaxGomokuRecursive(board, depth - 1, alpha, beta, false, player, pt);

            board[pt.y][pt.x] = null; // Backtrack

            // Soft positional bonus
            const bonus = pt.x === Math.floor(size / 2) && pt.y === Math.floor(size / 2) ? 10 : 0;
            const total = evalScore + bonus * 0.01;

            maxEval = Math.max(maxEval, total);
            alpha = Math.max(alpha, total);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const { pt } of movesToSearch) {
            // Check immediate win for Opponent (Optimization)
            if (getGomokuScore(board, pt.x, pt.y, opColor, player, false) >= GOMOKU_SCORES.WIN) {
                return -100000000;
            }

            board[pt.y][pt.x] = { color: opColor, x: pt.x, y: pt.y, id: 'sim' };

            const evalScore = minimaxGomokuRecursive(board, depth - 1, alpha, beta, true, player, pt);

            board[pt.y][pt.x] = null; // Backtrack

            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

export { };
