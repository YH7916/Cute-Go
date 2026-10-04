import { runOwnershipSearch } from '../core/inference/search';
import { selectMoveByDifficulty } from '../core/inference/selection';
import { canPass } from '../core/inference/policy';
import { getDefaultKomi } from '../core/go/config';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';

import type { AnalysisResult } from '../core/inference/engine';
import { createAiScheduler } from '../core/inference/scheduler';
import { WorkerEngineLifecycle } from './engineLifecycle';
import type { Sign } from '../utils/micro-board';
import { replayHistoryForInference } from '../core/inference/history';
import { searchGomoku, getGomokuSearchProfile } from '../core/gomoku';
import { attemptMove } from '../core/go/rules';
import { getBoardHash } from '../core/board';
import { calculateModelScore } from '../core/go/scoring';
import { estimateLiveLead } from '../core/go/liveEstimate';
import { getBeginnerAIMove } from '../core/go/ai';
import { BoardState, Player, Point } from '../types';

type RankedMove = AnalysisResult['moves'][number] & {
    weight?: number;
    logit?: number;
};

const lifecycle = new WorkerEngineLifecycle();

const clampPercent = (value: number) => {
    if (!Number.isFinite(value)) return 50;
    return Math.max(0, Math.min(100, value));
};

const toBlackPerspectiveWinRate = (winRate: number, toPlay: Player) =>
    toPlay === 'black' ? clampPercent(winRate) : clampPercent(100 - winRate);

const ctx = self as unknown as {
    onerror: ((event: Event | string) => void) | null;
    onmessage: ((event: MessageEvent<WorkerInMessage>) => Promise<void>) | null;
    postMessage: (message: WorkerOutMessage) => void;
};

const schedule = createAiScheduler(async (msg, task) => {
        if (msg.type === 'init') {
            await lifecycle.initialize(msg.payload, task);
        } else if (msg.type === 'release') {
            await lifecycle.release();
            task.reply({ type: 'released' });
        } else if (msg.type === 'reinit') {
            await lifecycle.ready(task);
        } else if (msg.type === 'compute') {
            const { board: boardState, history: gameHistory, color, size, gameType = 'Go', komi, difficulty, temperature, mode = 'play', purpose, simulations } = msg.data;
            console.log(`[AI Worker] Compute Request Received. Type=${gameType}, Size=${size}, Diff=${difficulty}`);

            // ============================================================
            // === GOMOKU SECTION — 五子棋逻辑（minimax + 启发式评估）===
            // ============================================================
            if (gameType === 'Gomoku') {
                if (boardState.length !== size) {
                    console.warn(`[AI Worker] Board size mismatch! size=${size}, board.length=${boardState.length}. Using board.length.`);
                }
                const result = searchGomoku(boardState, color, getGomokuSearchProfile('worker', difficulty));
                task.reply({
                    type: 'ai-response',
                    data: {
                        move: result.move,
                        winRate: result.reason === 'win' ? 1 : 0.5,
                        lead: result.reason === 'win' ? 100 : 0,
                    },
                });
                return;
            }

            // ============================================================
            // === GO SECTION — 围棋逻辑（ONNX推理 + MCTS搜索）===
            // ============================================================

            // Fun 模式：用手写初学者 AI，不走 ONNX 模型
            if (difficulty === 'Fun' && gameType === 'Go' && mode !== 'analyze') {
                const boardState2 = boardState as BoardState;
                let prevHash: string | null = null;
                if (gameHistory.length > 0) {
                    const last = gameHistory[gameHistory.length - 1];
                    if (last?.board) prevHash = getBoardHash(last.board);
                }
                const beginnerMove = getBeginnerAIMove(boardState2, color, prevHash);
                task.reply({
                    type: 'ai-response',
                    data: { move: beginnerMove, winRate: 50, lead: 0, ownership: null }
                });
                return;
            }

            const engine = lifecycle.forTask(task);

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
            if (purpose === 'coach' && (failures.length || boardState.length !== size ||
                !boardState.every((row, y) => row.length === size && row.every((stone, x) =>
                    board.get(x, y) === (stone ? stone.color === 'black' ? 1 : -1 : 0))))) {
                throw new Error('当前局面无法完整重放，继续使用规则讲解。');
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
                const previousHash = last ? getBoardHash(last.board) : null;
                const coachDetails = purpose === 'coach' ? {
                    purpose,
                    visits: analyzed.visits,
                    estimatedBlackLead: estimateLiveLead(boardState, analyzed.ownership, effectiveKomi, captures),
                    candidates: analyzed.rankedMoves.filter(move => Number.isInteger(move.x) && Number.isInteger(move.y)
                        && move.x >= 0 && move.y >= 0 && move.x < size && move.y < size
                        && attemptMove(boardState, move.x, move.y, color, 'Go', previousHash))
                        .slice(0, 3).map(move => ({ point: { x: move.x, y: move.y }, visits: move.vists })),
                } : {};

                task.reply({
                    type: 'ai-response',
                    data: {
                        ...coachDetails,
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
            let selectedMove: Point | null | undefined = null;

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

            const blackLead = estimateLiveLead(boardState, result.rootInfo.ownership, effectiveKomi, captures);
            // 直接用模型输出的真实胜率，不用 lead 推算
            const blackWinRate = toBlackPerspectiveWinRate(result.rootInfo.winrate, color);

            // Only log if not null or valid object
            const moveStr = selectedMove === null ? 'Pass' : `(${selectedMove.x},${selectedMove.y})`;
            console.log(`[AI Worker] Best Move: ${moveStr} Win=${blackWinRate.toFixed(1)}% EstimatedBlackLead=${blackLead?.toFixed(2) ?? 'unavailable'}`);

            task.reply({
                type: 'ai-response',
                data: {
                    move: selectedMove,
                    winRate: blackWinRate,
                    lead: blackLead,
                    scoreStdev: result.rootInfo.scoreStdev,
                    ownership: result.rootInfo.ownership
                }
            });
        }
}, message => ctx.postMessage(message));
ctx.onmessage = event => schedule(event.data);


export {};
