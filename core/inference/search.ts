import { MicroBoard, type Sign } from '../../utils/micro-board';
import type { OnnxEngine, AnalysisResult } from './engine';
import type { Point } from '../../types';
import type { AnalysisMoveEvaluation } from './protocol';
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
    analysis: AnalysisResult,
    focusPoints: readonly Point[] = []
) => {
    node.expanded = true;
    node.analysis = analysis;

    const sortedMoves = [...analysis.moves]
        .filter((move) => move.x >= 0 && move.y >= 0)
        .sort((a, b) => b.prior - a.prior);

    const limitedMoves = sortedMoves.slice(0, MAX_ANALYSIS_BRANCH);
    for (const point of focusPoints) {
        const move = sortedMoves.find(item => item.x === point.x && item.y === point.y);
        if (move && !limitedMoves.includes(move)) limitedMoves.push(move);
    }
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

// Only visited nodes justify a searched continuation. Replay from the root so
// every reported move keeps its color, captures and ko; pass ends this preview.
function coachVariation(root: SearchNode, child: SearchNode): Point[] {
    const board = root.board.clone();
    const variation: Point[] = [];
    let node: SearchNode | undefined = child;
    let toPlay = root.toPlay;
    while (node?.move && node.visits > 0 && variation.length < 4) {
        if (!board.play(node.move.x, node.move.y, toPlay)) break;
        variation.push({ ...node.move });
        toPlay = toPlay === 1 ? -1 : 1;
        node = [...node.children].sort((a, b) => b.visits - a.visits)[0];
    }
    return variation;
}

export const runOwnershipSearch = async (
    engine: Pick<OnnxEngine, 'analyze'>,
    rootBoard: MicroBoard,
    rootToPlay: Sign,
    historyMoves: SearchHistoryMove[],
    boardSize: number,
    komi: number,
    difficulty: 'Fun' | 'Easy' | 'Medium' | 'Hard' | undefined,
    temperature: number | undefined,
    requestedVisits: number | undefined,
    coachFocusPoints: readonly Point[] = []
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
    const focusPoints = coachFocusPoints.filter((point, index, points) =>
        Number.isInteger(point.x) && Number.isInteger(point.y)
        && point.x >= 0 && point.y >= 0 && point.x < boardSize && point.y < boardSize
        && points.findIndex(other => other.x === point.x && other.y === point.y) === index
        && rootBoard.isLegal(point.x, point.y, rootToPlay)).slice(0, 3);

    let ownershipSum: Float32Array | null = null;
    let ownershipCount = 0;

    const deadline = performance.now() + 12000;
    for (let visit = 0; visit < visitBudget; visit++) {
        if (visit > 0 && performance.now() >= deadline) break;
        let node = root;

        while (node.expanded && node.children.length > 0) {
            // A coach comparison must actually evaluate requested candidates,
            // including legal low-prior points outside the ordinary search beam.
            const focused = node === root ? node.children.find(child => child.visits < 2
                && focusPoints.some(point => child.move?.x === point.x && child.move.y === point.y)) : undefined;
            const next = focused ?? selectSearchChild(node);
            if (!next) break;
            node = next;
        }

        const analysis = await engine.analyze(node.board, node.toPlay, {
            history: node.history,
            komi,
            difficulty,
            temperature
        });

        expandSearchNode(node, analysis, node === root ? focusPoints : []);

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

    const evaluateChild = (child: SearchNode) => {
        const probability = child.visits > 0 ? child.valueSum / child.visits : undefined;
        const policyMove = fallbackAnalysis.moves.find(move => child.move
            ? move.x === child.move.x && move.y === child.move.y : move.x === -1 && move.y === -1);
        return { visits: child.visits, prior: policyMove?.prior ?? 0,
            ...(probability !== undefined ? { winRateBlack: 100 * (child.toPlay === 1 ? probability : 1 - probability) } : {}),
        } satisfies AnalysisMoveEvaluation;
    };
    const passChild = rootChildren.find(child => child.move === null);

    return {
        move: bestChild?.move ?? null,
        winRate: root.visits > 0 ? (root.valueSum / root.visits) * 100 : fallbackAnalysis.rootInfo.winrate,
        lead: fallbackAnalysis.rootInfo.lead,
        scoreStdev: fallbackAnalysis.rootInfo.scoreStdev,
        ownership: averagedOwnership,
        visits: root.visits,
        rootAnalysis: fallbackAnalysis,
        ...(passChild ? { coachPass: evaluateChild(passChild) } : {}),
        coachCandidates: rootChildren.filter(child => child.move !== null).map(child => {
            return {
                point: { ...child.move! }, ...evaluateChild(child),
                variation: coachVariation(root, child),
            };
        }),
        rankedMoves: rootChildren.map(child => ({
            ...fallbackAnalysis.moves.find(m => child.move ? m.x === child.move.x && m.y === child.move.y : m.x === -1)!,
            vists: child.visits
        }))
    };
};


