import { extractPolicyMoves } from './policy';
import { createEngineSession, releaseSession, isMobileDevice, checkModelLoadActive, type OnnxEngineConfig } from './session';
import { readModelOutputs, processWinrate, normalizeOwnership } from './outputs';
import { getDefaultKomi } from '../../core/go/config';

import * as ort from 'onnxruntime-web';
import { MicroBoard, type Sign } from '../../utils/micro-board';

export type { OnnxEngineConfig } from './session';

export interface EngineAnalysisOptions {
    komi?: number;
    history?: { color: Sign; x: number; y: number }[];
    parent?: { color: Sign; x: number; y: number }[];
    difficulty?: 'Fun' | 'Easy' | 'Medium' | 'Hard'; // kept for logging
    temperature?: number; // [New] Softmax scaling
}

export interface AnalysisResult {
    rootInfo: {
        winrate: number;
        lead: number;
        scoreStdev: number;
        ownership: Float32Array | null; // [New] Territory layout (-1 to 1)
    };
    moves: {
        x: number;
        y: number;
        u: number;
        prior: number;
        winrate: number;
        scoreMean: number;
        scoreStdev: number;
        lead: number;
        vists: number;
    }[];
}

export class OnnxEngine {
    private session: ort.InferenceSession | null = null;
    private config: OnnxEngineConfig;
    private initialization: Promise<void> | null = null;
    private initializationAbort: AbortController | null = null;
    private disposal: Promise<void> = Promise.resolve();
    private generation = 0;
    private activeRuns = new Set<Promise<AnalysisResult>>();

    constructor(config: OnnxEngineConfig) {
        this.config = config;
    }

    initialize(onProgress?: (msg: string) => void): Promise<void> {
        if (this.session) return Promise.resolve();
        if (this.initialization) return this.initialization;
        const generation = this.generation;
        const controller = new AbortController();
        this.initializationAbort = controller;
        const pending = (async () => {
            await this.disposal;
            checkModelLoadActive(controller.signal);
            const session = await createEngineSession(this.config, controller.signal, onProgress);
            if (generation !== this.generation) {
                await releaseSession(session);
                throw new Error('Engine initialization cancelled by dispose');
            }
            this.session = session;
        })();
        const initialization = pending.finally(() => {
            // Also cancel unfinished sibling downloads when a model part fails.
            controller.abort();
            if (this.initialization === initialization) {
                this.initialization = null;
                this.initializationAbort = null;
            }
        });
        this.initialization = initialization;
        return initialization;
    }

    analyze(board: MicroBoard, color: Sign, options: EngineAnalysisOptions = {}): Promise<AnalysisResult> {
        const session = this.session;
        if (!session) return Promise.reject(new Error('Engine not initialized'));
        const run = this.analyzeSession(session, board, color, options);
        this.activeRuns.add(run);
        return run.finally(() => { this.activeRuns.delete(run); });
    }
    private async analyzeSession(session: ort.InferenceSession, board: MicroBoard, color: Sign, options: EngineAnalysisOptions): Promise<AnalysisResult> {
        const size = board.size;

        const komi = options.komi ?? getDefaultKomi(board.size);
        const history = options.history || [];

        const isMobile = isMobileDevice();

        if (!isMobile) console.time('[OnnxEngine] Inference');
        // console.log(`[OnnxEngine] Starting analysis (Size: ${size}x${size})...`);

        // 1. 准备输入 Tensor (NCHW)
        // [Dynamic] 现在的模型支持动态尺寸，所以直接用 board.size
        const inputChannels = 22;
        const binInputData = new Float32Array(inputChannels * size * size);
        const globalInputData = new Float32Array(19);

        // 填充数据 (不再需要传递 modelBoardSize，因为 modelSize 就是 actualSize)
        this.fillBinInput(board, color, history, binInputData, size);
        this.fillGlobalInput(history, komi, color, globalInputData);

        const tensorsToDispose: ort.Tensor[] = [];
        let results: ort.InferenceSession.OnnxValueMapType | null = null;

        try {
            // 创建 Tensor: [1, 22, size, size]
            const binInputTensor = new ort.Tensor('float32', binInputData, [1, inputChannels, size, size]);
            tensorsToDispose.push(binInputTensor);
            const globalInputTensor = new ort.Tensor('float32', globalInputData, [1, 19]);
            tensorsToDispose.push(globalInputTensor);

            // 2. 运行推理
            const feeds: Record<string, ort.Tensor> = {};
            feeds['input_binary'] = binInputTensor;
            feeds['input_global'] = globalInputTensor;

            results = await session.run(feeds);

            // 3. 处理结果
            const { policy: policyData, value, misc, ownership: ownershipRaw } = readModelOutputs(results, size);

            const finalOwnership = normalizeOwnership(ownershipRaw, color === 1 ? 1 : -1);

            // KataGo's misc head is a 4-float vector.
            // The official PyTorch export order is:
            // [scoreMeanRaw, scoreStdevRaw, leadRaw, varianceTimeRaw]
            // We only consume lead/stdev here, and they are still uncalibrated raw values.
            const winrate = processWinrate(value);
            const lead = misc[2] ?? 0;
            const scoreStdev = misc[1] ?? 0;

            // 提取最佳着手
            // 直接传入 policyData，它已经是正确的大小了
            const moveInfos = extractPolicyMoves(policyData, size, board, color, options.temperature ?? 0);

            const resultMoves = moveInfos;

            // Log detailed results (Desktop Only)
            if (!isMobile) {
                console.log(`[OnnxEngine] Analysis Complete. (Size: ${size}x${size}, Temp: ${options.temperature ?? 0})`);
                console.log(`  - Win Rate: ${winrate.toFixed(1)}%`);
                console.log(`  - Misc Raw: [${Array.from(misc).map(v => v.toFixed(3)).join(', ')}]`);
                console.log(`  - Lead Raw: ${lead.toFixed(3)}`);
                console.log(`  - Top 3 Moves:`);
                moveInfos.slice(0, 3).forEach((m, i) => {
                    const moveStr = m.x === -1 ? 'Pass' : `(${m.x},${m.y})`;
                    console.log(`    ${i + 1}. ${moveStr} (Prob: ${(m.prior * 100).toFixed(1)}%)`);
                });
            }

            return {
                rootInfo: {
                    winrate: winrate,
                    lead: lead,
                    scoreStdev: scoreStdev,
                    ownership: finalOwnership
                },
                moves: resultMoves
            };

        } catch (e) {
            console.error('[OnnxEngine] Inference Failed:', e);
            throw e;
        } finally {
            if (!isMobile) console.timeEnd('[OnnxEngine] Inference');
            // 清理 Tensor
            for (const t of tensorsToDispose) t.dispose();
            if (results) {
                for (const key in results) {
                    const val = results[key];
                    val.dispose();
                }
            }
        }
    }

    private fillBinInput(
        board: MicroBoard,
        pla: Sign,
        history: { color: Sign; x: number; y: number }[],
        data: Float32Array,
        size: number // 只需要 actualSize
    ) {
        const opp: Sign = pla === 1 ? -1 : 1;

        // Helper: 设置 NCHW (Channel, Y, X)
        // 因为 tensor 大小就是 size*size，所以直接计算 offset
        const set = (c: number, y: number, x: number, val: number) => {
             data[c * size * size + y * size + x] = val;
        };

        // 1. Feature 0: Ones (整个棋盘都是 1，不再需要边缘 Moat)
        // 我们可以用 fill 快速填充第一个 Channel
        const planeSize = size * size;
        data.fill(1.0, 0, planeSize);

        // 2. 遍历棋盘设置石子特征
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const c = board.get(x, y);
                // Feature 1: Player Stones
                if (c === pla) set(1, y, x, 1.0);
                // Feature 2: Opponent Stones
                else if (c === opp) set(2, y, x, 1.0);

                // Feature 3-5: Liberties (只有存在石子时才计算)
                if (c !== 0) {
                    const libs = board.getLiberties(x, y);
                    if (libs === 1) set(3, y, x, 1.0);
                    if (libs === 2) set(4, y, x, 1.0);
                    if (libs === 3) set(5, y, x, 1.0);
                }
            }
        }

        // Feature 6: Ko
        if (board.ko !== -1) {
            const k = board.xy(board.ko);
            set(6, k.y, k.x, 1.0);
        }

        // Feature 9-13: History (Moves)
        const len = history.length;
        const setHistory = (turnsAgo: number, channel: number) => {
            if (len >= turnsAgo) {
                const h = history[len - turnsAgo];
                // 确保坐标在当前棋盘范围内 (比如刚从 19路 切到 9路，历史记录可能残留大坐标)
                if (h.x >= 0 && h.x < size && h.y >= 0 && h.y < size) {
                     set(channel, h.y, h.x, 1.0);
                }
            }
        };

        setHistory(1, 9);
        setHistory(2, 10);
        setHistory(3, 11);
        setHistory(4, 12);
        setHistory(5, 13);
    }

    private fillGlobalInput(
        history: { color: Sign; x: number; y: number }[],
        komi: number,
        pla: Sign,
        data: Float32Array
    ) {
        // Global features: 19 floats
        // 0-4: Pass history (if recent moves were passes)
        // 5: Komi / 20.0
        // ...

        const len = history.length;
        const setGlobal = (idx: number, val: number) => {
            data[idx] = val;
        };

        // Pass history: check if moves were pass (x < 0)
        if (len >= 1 && history[len - 1].x < 0) setGlobal(0, 1.0);
        if (len >= 2 && history[len - 2].x < 0) setGlobal(1, 1.0);
        if (len >= 3 && history[len - 3].x < 0) setGlobal(2, 1.0);
        if (len >= 4 && history[len - 4].x < 0) setGlobal(3, 1.0);
        if (len >= 5 && history[len - 5].x < 0) setGlobal(4, 1.0);

        // Komi Direction:
        // KataGo expects Komi relative to the *current player*.
        // If White (Color -1) is playing: Komi is 7.5 -> Input 7.5
        // If Black (Color 1) is playing: Komi is 7.5 (favors White) -> Input -7.5
        // So: if pla === -1 (White), use komi. If pla === 1 (Black), use -komi.

        const relativeKomi = (pla === -1) ? komi : -komi;
        setGlobal(5, relativeKomi / 20.0);
        setGlobal(9, 1.0); // Territory scoring, no tax (KataGo input v7).
    }

    dispose(): Promise<void> {
        this.generation++;
        this.initializationAbort?.abort();
        const initialization = this.initialization;
        this.initialization = null;
        this.initializationAbort = null;
        const session = this.session;
        this.session = null;
        const previousDisposal = this.disposal;
        const activeRuns = [...this.activeRuns];
        this.disposal = (async () => {
            await Promise.allSettled([previousDisposal, initialization, ...activeRuns]);
            if (session) await releaseSession(session);
        })();
        return this.disposal;
    }
}
