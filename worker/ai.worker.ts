import { OnnxEngine, type AnalysisResult } from '../utils/onnx-engine';
import { MicroBoard, type Sign } from '../utils/micro-board';
import {
    getCandidateMoves,
    getGomokuScore,
    checkGomokuWin,
    evaluatePositionStrength,
    GOMOKU_SCORES,
    attemptMove, // [New]
    getBoardHash, // [New]
    calculateModelScore
} from '../utils/goLogic';
import { BoardState, Player, Point } from '../types';


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
            history: any[]; // HistoryItem[]
            color: 'black' | 'white';
            size: number;
            gameType?: 'Go' | 'Gomoku'; // [New]
            simulations?: number;
            komi?: number;
            difficulty?: 'Easy' | 'Medium' | 'Hard';
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

// Ownership threshold for dead stone filtering.
// If a position's ownership magnitude exceeds this value for the opponent,
// it is considered "confirmed enemy territory" and moves there are skipped.
// 0.65 keeps it conservative so only clearly-dead positions are filtered.
const OWNERSHIP_DEAD_THRESHOLD = 0.65;
const WINRATE_TEMPERATURE = 5.0;

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

const toBlackPerspectiveLead = (lead: number, toPlay: Player) =>
    toPlay === 'black' ? lead : -lead;

const toBlackPerspectiveWinRate = (winRate: number, toPlay: Player) =>
    toPlay === 'black' ? clampPercent(winRate) : clampPercent(100 - winRate);

const deriveBlackWinRateFromLead = (blackLead: number) => {
    if (!Number.isFinite(blackLead)) return 50;
    const probability = 1 / (1 + Math.exp(-blackLead / WINRATE_TEMPERATURE));
    return clampPercent(probability * 100);
};

const sampleIndexByWeight = (weights: number[]) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return 0;

    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }
    return weights.length - 1;
};

const getDifficultyPoolSize = (difficulty?: 'Easy' | 'Medium' | 'Hard') => {
    if (difficulty === 'Easy') return 16;
    if (difficulty === 'Medium') return 6;
    return Infinity;
};

type SearchHistoryMove = { color: Sign; x: number; y: number };

type SearchNode = {
    parent: SearchNode | null;
    move: { x: number; y: number } | null;
    board: MicroBoard;
    history: SearchHistoryMove[];
    toPlay: Sign;
    prior: number;
    visits: number;
    valueSum: number;
    children: SearchNode[];
    expanded: boolean;
    analysis: AnalysisResult | null;
};

const MAX_ANALYSIS_VISITS = 32;
const MAX_ANALYSIS_BRANCH = 10;
const ANALYSIS_CPUCT = 1.35;

const cloneOwnership = (ownership: Float32Array | null | undefined) =>
    ownership ? new Float32Array(ownership) : null;

const addOwnershipInPlace = (target: Float32Array, source: Float32Array) => {
    const len = Math.min(target.length, source.length);
    for (let i = 0; i < len; i++) target[i] += source[i];
};

const scaleOwnership = (source: Float32Array, factor: number) => {
    const out = new Float32Array(source.length);
    for (let i = 0; i < source.length; i++) out[i] = source[i] * factor;
    return out;
};

const selectSearchChild = (node: SearchNode) => {
    let bestChild: SearchNode | null = null;
    let bestScore = -Infinity;
    const sqrtVisits = Math.sqrt(Math.max(1, node.visits));

    for (const child of node.children) {
        const q = child.visits > 0 ? 1 - (child.valueSum / child.visits) : 0.5;
        const u = ANALYSIS_CPUCT * child.prior * (sqrtVisits / (1 + child.visits));
        const score = q + u;
        if (score > bestScore) {
            bestScore = score;
            bestChild = child;
        }
    }

    return bestChild;
};

const expandSearchNode = (
    node: SearchNode,
    analysis: AnalysisResult
) => {
    node.expanded = true;
    node.analysis = analysis;

    const sortedMoves = [...analysis.moves]
        .filter((move) => move.x >= 0 && move.y >= 0)
        .sort((a, b) => b.prior - a.prior);

    const limitedMoves = sortedMoves.slice(0, MAX_ANALYSIS_BRANCH);
    const passMove = analysis.moves.find((move) => move.x === -1 && move.y === -1);
    if (passMove) limitedMoves.push(passMove);

    for (const move of limitedMoves) {
        const childBoard = node.board.clone();
        let moveOk = true;

        if (move.x >= 0 && move.y >= 0) {
            moveOk = childBoard.play(move.x, move.y, node.toPlay);
        } else {
            childBoard.ko = -1;
        }

        if (!moveOk) continue;

        const childHistory = [...node.history, {
            color: node.toPlay,
            x: move.x,
            y: move.y
        }];

        node.children.push({
            parent: node,
            move: move.x >= 0 && move.y >= 0 ? { x: move.x, y: move.y } : null,
            board: childBoard,
            history: childHistory,
            toPlay: (node.toPlay === 1 ? -1 : 1),
            prior: Math.max(move.prior, 0.0001),
            visits: 0,
            valueSum: 0,
            children: [],
            expanded: false,
            analysis: null
        });
    }
};

const runOwnershipSearch = async (
    rootBoard: MicroBoard,
    rootToPlay: Sign,
    historyMoves: SearchHistoryMove[],
    boardSize: number,
    komi: number,
    difficulty: 'Easy' | 'Medium' | 'Hard' | undefined,
    temperature: number | undefined,
    requestedVisits: number | undefined
) => {
    if (!engine) throw new Error('AI Engine unavailable for ownership search.');

    const visitBudget = Math.max(1, Math.min(requestedVisits ?? 16, MAX_ANALYSIS_VISITS));
    const root: SearchNode = {
        parent: null,
        move: null,
        board: rootBoard.clone(),
        history: [...historyMoves],
        toPlay: rootToPlay,
        prior: 1,
        visits: 0,
        valueSum: 0,
        children: [],
        expanded: false,
        analysis: null
    };

    let ownershipSum: Float32Array | null = null;
    let ownershipCount = 0;

    for (let visit = 0; visit < visitBudget; visit++) {
        let node = root;

        while (node.expanded && node.children.length > 0) {
            const next = selectSearchChild(node);
            if (!next) break;
            node = next;
        }

        const analysis = await engine.analyze(node.board, node.toPlay, {
            history: node.history,
            komi,
            difficulty,
            temperature
        });

        expandSearchNode(node, analysis);

        const ownership = cloneOwnership(analysis.rootInfo.ownership);
        if (ownership) {
            if (!ownershipSum) ownershipSum = new Float32Array(ownership.length);
            addOwnershipInPlace(ownershipSum, ownership);
            ownershipCount++;
        }

        let value = Math.max(0, Math.min(1, analysis.rootInfo.winrate / 100));
        let current: SearchNode | null = node;
        while (current) {
            current.visits += 1;
            current.valueSum += value;
            value = 1 - value;
            current = current.parent;
        }
    }

    const rootChildren = [...root.children].sort((a, b) => b.visits - a.visits);
    const bestChild = rootChildren[0] ?? null;
    const averagedOwnership = ownershipSum && ownershipCount > 0
        ? scaleOwnership(ownershipSum, 1 / ownershipCount)
        : root.analysis?.rootInfo.ownership ?? null;

    const fallbackAnalysis = root.analysis ?? await engine.analyze(root.board, root.toPlay, {
        history: root.history,
        komi,
        difficulty,
        temperature
    });

    return {
        move: bestChild?.move ?? null,
        winRate: root.visits > 0 ? (root.valueSum / root.visits) * 100 : fallbackAnalysis.rootInfo.winrate,
        lead: fallbackAnalysis.rootInfo.lead,
        scoreStdev: fallbackAnalysis.rootInfo.scoreStdev,
        ownership: averagedOwnership,
        visits: root.visits
    };
};

const getDifficultyRankBias = (difficulty: 'Easy' | 'Medium' | 'Hard' | undefined, rank: number) => {
    if (difficulty === 'Easy') {
        const table = [0.45, 0.72, 0.9, 1.0, 1.0, 0.9, 0.76, 0.62, 0.5, 0.4, 0.31, 0.24, 0.18, 0.13, 0.09, 0.06];
        return table[rank] ?? 0.03;
    }

    if (difficulty === 'Medium') {
        const table = [1.08, 0.82, 0.58, 0.34, 0.18, 0.1];
        return table[rank] ?? 0.05;
    }

    return 1;
};

const selectMoveByDifficulty = (
    candidates: RankedMove[],
    validationBoard: BoardState,
    color: Player,
    previousBoardHash: string | null,
    difficulty?: 'Easy' | 'Medium' | 'Hard'
) => {
    const poolSize = Math.min(candidates.length, getDifficultyPoolSize(difficulty));
    const weightedPool = candidates
        .slice(0, poolSize)
        .map((candidate, rank) => ({ candidate, rank }));

    while (weightedPool.length > 0) {
        const weights = weightedPool.map(({ candidate, rank }) => {
            const baseWeight = Math.max((candidate as any).weight || candidate.prior || 0.0001, 0.0001);
            return baseWeight * getDifficultyRankBias(difficulty, rank);
        });

        const selectedIndex = sampleIndexByWeight(weights);
        const [{ candidate }] = weightedPool.splice(selectedIndex, 1);

        if (candidate.x === -1) {
            if (difficulty === 'Easy' || difficulty === 'Medium') {
                continue;
            }
            return null;
        }

        if (attemptMove(validationBoard, candidate.x, candidate.y, color, 'Go', previousBoardHash)) {
            return { x: candidate.x, y: candidate.y };
        }
    }

    for (const candidate of candidates) {
        if (candidate.x === -1) return null;
        if (attemptMove(validationBoard, candidate.x, candidate.y, color, 'Go', previousBoardHash)) {
            return { x: candidate.x, y: candidate.y };
        }
    }

    return undefined;
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
            const { board: boardState, history: gameHistory, color, size, gameType = 'Go', komi, difficulty, temperature, mode = 'play', simulations } = msg.data;
            console.log(`[AI Worker] Compute Request Received. Type=${gameType}, Size=${size}, Diff=${difficulty}`);

            // === Gomoku Logic ===
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
                let currentBestScore = -Infinity;

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
                        currentBestScore = bestS;
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
                    currentBestScore = bestS;
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

            // === Go Logic (Engine) ===
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
            console.log("[AI Worker] Calling engine.analyze...");
            const effectiveKomi = komi ?? 7.5;

            if (mode === 'analyze') {
                console.log("[AI Worker] Analysis Mode: Running Kaya-style root search...");
                const analyzed = await runOwnershipSearch(
                    board,
                    pla,
                    historyMoves,
                    size,
                    effectiveKomi,
                    difficulty,
                    temperature,
                    simulations
                );

                const blackLead = analyzed.ownership
                    ? (() => {
                        const score = calculateModelScore(boardState as BoardState, analyzed.ownership, effectiveKomi);
                        return score.black - score.white;
                    })()
                    : toBlackPerspectiveLead(analyzed.lead, color);
                const blackWinRate = analyzed.ownership
                    ? deriveBlackWinRateFromLead(blackLead)
                    : toBlackPerspectiveWinRate(analyzed.winRate, color);

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

            const result = await engine.analyze(board, pla, {
                history: historyMoves,
                komi: effectiveKomi,
                difficulty: difficulty,
                temperature: temperature
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

                // --- Dead Stone Filter (Ownership-Based) ---
                // Skip moves inside clearly dead groups using the model's ownership output.
                const ownership = result.rootInfo.ownership;
                if (ownership && ownership.length > 0) {
                    const plaSign = (color === 'black') ? 1 : -1;
                    const filteredCandidates = candidates.filter(m => {
                        if (m.x < 0) return true;
                        const ownerVal = ownership[m.y * size + m.x] ?? 0;
                        const isEnemyTerritory = (plaSign === 1)
                            ? (ownerVal < -OWNERSHIP_DEAD_THRESHOLD)
                            : (ownerVal > OWNERSHIP_DEAD_THRESHOLD);
                        return !isEnemyTerritory;
                    });
                    const skipped = candidates.length - filteredCandidates.length;
                    if (skipped > 0) console.log('[AI Worker] Dead stone filter: skipped ' + skipped + '/' + candidates.length + ' moves.');
                    if (filteredCandidates.length > 0) candidates = filteredCandidates;
                }

                if (difficulty === 'Easy' || difficulty === 'Medium') {
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

            if (selectedMove === undefined) selectedMove = null; // Safety

            const isPass = selectedMove === null;
            const blackLead = result.rootInfo.ownership
                ? (() => {
                    const score = calculateModelScore(boardState as BoardState, result.rootInfo.ownership, effectiveKomi);
                    return score.black - score.white;
                })()
                : toBlackPerspectiveLead(result.rootInfo.lead, color);
            const blackWinRate = result.rootInfo.ownership
                ? deriveBlackWinRateFromLead(blackLead)
                : toBlackPerspectiveWinRate(result.rootInfo.winrate, color);

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
            try { engine.dispose(); } catch (e) { }
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

    const myColor = player;
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
