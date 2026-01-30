import * as ort from 'onnxruntime-web';
import { MicroBoard, type Sign, type Point } from './micro-board';

export interface OnnxEngineConfig {
    modelPath: string;
    modelParts?: string[]; // [New] Optional split parts for large models
    wasmPath?: string; // [New] Path to directory containing WASM files
    numThreads?: number;
    debug?: boolean;
    gpuBackend?: 'webgpu' | 'wasm'; // [New] Force backend
}

export interface EngineAnalysisOptions {
    komi?: number;
    history?: { color: Sign; x: number; y: number }[];
    parent?: { color: Sign; x: number; y: number }[]; 
    difficulty?: 'Easy' | 'Medium' | 'Hard'; // kept for logging
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
    private boardSize: number = 19;

    constructor(config: OnnxEngineConfig) {
        this.config = config;
    }

    async initialize(onProgress?: (msg: string) => void) {
        if (this.session) return;

        try {
            // Configure WASM paths if provided
            if (this.config.wasmPath) {
                console.log(`[OnnxEngine] Setting WASM path to: ${this.config.wasmPath}`);
                ort.env.wasm.wasmPaths = this.config.wasmPath;
            }

            // Configure simple session options
            // Note: WASM files must be served correctly.
            // Detect Mobile to avoid WebGPU crashes if not explicitly requested
            const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

            // [CRITICAL CHECK] Detect if SharedArrayBuffer is available
            const isIsolated = typeof self !== 'undefined' && (self as any).crossOriginIsolated;
            
            // [Fix] If running in non-isolated environment (standard H5 without headers),
            // the local 'ort-wasm-simd-threaded.wasm' WILL FAIL to load.
            // We successfully downloaded 'ort-wasm.wasm' (Vanilla) to 'public/wasm/'.
            // So we just disable SIMD/Threading and let it load the local Vanilla file.
            if (!isIsolated && !isMobile) {
                 console.warn("[OnnxEngine] ⚠️ No crossOriginIsolated detected! Multithreading disabled.");
                 console.warn("[OnnxEngine] Using local vanilla WASM (ort-wasm.wasm) for compatibility.");
                 
                 ort.env.wasm.simd = false;
                 ort.env.wasm.proxy = false;
                 ort.env.wasm.numThreads = 1;
                 // ort.env.wasm.wasmPaths = ... (Default to local)
            }

            // [Memory Fix] Low-End Device Protection (All Mobile)
            // Jetsam (iOS) and Low-Memory Killers (Android Wechat/H5) are strict.
            // Disabling SIMD/Proxy reduces memory footprint significantly at cost of speed.
            if (isMobile) {
                console.log("[OnnxEngine] Mobile detected: Disabling SIMD and Proxy for max stability.");
                ort.env.wasm.simd = false;
                ort.env.wasm.proxy = false; 
                ort.env.wasm.numThreads = 1; // Force 1 thread here too
                
                // [CRITICAL FIX] Use Local Vanilla WASM
                // We downloaded ort-wasm.wasm to public/wasm, so no need for CDN.
                console.log("[OnnxEngine] Mobile: Using local vanilla WASM...");
                // ort.env.wasm.wasmPaths = ... (Default to local)
            }

            const preferredBackend = this.config.gpuBackend || (isMobile ? 'wasm' : 'webgpu');

            // [Memory Fix] Graph Optimization consumes huge RAM during compile time.
            // On low-end mobile, we MUST disable it to prevent OOM.
            // 'disabled' = fastest startup, lowest memory, slightly slower inference.
            // [Update] 60s timeout allows us to use 'basic' again for better inference speed.
            const graphOptLevel = isMobile ? 'basic' : 'all';

            const options: ort.InferenceSession.SessionOptions = {
                executionProviders: [preferredBackend, 'wasm'], 
                graphOptimizationLevel: graphOptLevel,
                enableCpuMemArena: true, 
                enableMemPattern: true,
                executionMode: 'sequential', // Force sequential
            };
            
            if (this.config.numThreads) {
                options.intraOpNumThreads = this.config.numThreads;
                options.interOpNumThreads = this.config.numThreads;
            }

            console.log(`[OnnxEngine] Loading model...`);
            
            let modelData: string | Uint8Array = this.config.modelPath;

            // Handle Split Models (Cloudflare Pages 25MB limit workaround)
            if (this.config.modelParts && this.config.modelParts.length > 0) {
                 // ... (Splitting logic remains same, just logging)
                 // Keeping existing split logic but ensuring we log clearly
                console.log(`[OnnxEngine] Loading model from ${this.config.modelParts.length} parts...`);
                
                try {
                    let completed = 0;
                    const total = this.config.modelParts.length;
                    onProgress?.(`正在下载模型 (${completed}/${total})...`);

                    const buffers = await Promise.all(this.config.modelParts.map(async (partUrl, idx) => {
                        const res = await fetch(partUrl);
                        if (!res.ok) throw new Error(`Failed to fetch part: ${partUrl}`);
                        const buf = await res.arrayBuffer();
                        completed++;
                        onProgress?.(`正在下载模型 (${completed}/${total})...`);
                        return buf;
                    }));
                    
                    onProgress?.(`正在合并模型数据...`);
                    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
                    const merged = new Uint8Array(totalLength);
                    let offset = 0;
                    
                    // Copy and immediately try to dereference (fake) by looping
                    for (let i = 0; i < buffers.length; i++) {
                        merged.set(new Uint8Array(buffers[i]), offset);
                        offset += buffers[i].byteLength;
                        // @ts-ignore
                        buffers[i] = null; // Help GC
                    }

                    console.log(`[OnnxEngine] Merged model parts. Total size: ${(totalLength / 1024 / 1024).toFixed(2)} MB`);
                    modelData = merged;
                    onProgress?.(`正在启动 AI 引擎 (首次需编译，请稍候)...`); 
                } catch (e) {
                    console.error('[OnnxEngine] Failed to load model parts:', e);
                    throw e;
                }
            } else {
                 console.log(`[OnnxEngine] Loading model from ${this.config.modelPath}...`);
            }

            try {
                console.log(`[OnnxEngine] Creating InferenceSession with provider: ${preferredBackend}`);
                console.log(`[OnnxEngine] Env State:`, JSON.stringify(ort.env.wasm));
                
                // @ts-ignore
                this.session = await ort.InferenceSession.create(modelData, options);

                // [Memory Fix] IMMEDIATELY release the JS copy of the model
                // The WASM runtime now has its own copy. We don't need this duplicate 20MB in JS heap.
                (modelData as any) = null; 

                console.log(`[OnnxEngine] Model loaded successfully (${preferredBackend})`);
                console.log(`[OnnxEngine] Inputs: ${this.session.inputNames.join(', ')}`);
                console.log(`[OnnxEngine] Outputs: ${this.session.outputNames.join(', ')}`);
            } catch (e) {
                console.warn(`[OnnxEngine] ${preferredBackend} failed, falling back to WASM... Error: ${(e as Error).message}`);
                
                // Fallback to WASM only (Safest)
                const wasmOptions: ort.InferenceSession.SessionOptions = {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'disabled', // Strongest fallback
                    enableCpuMemArena: false,
                    enableMemPattern: false,
                    executionMode: 'sequential'
                };
                
                // Disable SIMD/Threads for fallback purely
                ort.env.wasm.simd = false;
                ort.env.wasm.proxy = false;
                ort.env.wasm.numThreads = 1;

                console.log("[OnnxEngine] Retrying with basic WASM (No SIMD/Threads)...");
                this.session = await ort.InferenceSession.create(this.config.modelPath, wasmOptions); // Fallback usually expects path? or can take buffer too
                // Actually where modelData was used, we might need to recreate it if it was nulled?
                // Wait, if create failed, modelData SHOULD be intact.. but wait.
                // The previous logic didn't null model data until success.
                // But my fix above does.
                // If create throws, we are in catch block. modelData is still valid (unless I nulled it in try? No, I nulled it AFTER await).
                // So modelData is safe to use here.

                if (typeof modelData !== 'string' && modelData) {
                     this.session = await ort.InferenceSession.create(modelData, wasmOptions);
                } else {
                     this.session = await ort.InferenceSession.create(this.config.modelPath, wasmOptions);
                }
                
                console.log('[OnnxEngine] Model loaded successfully (WASM Fallback)');
            }
        } catch (e) {
            console.error('[OnnxEngine] Failed to initialize:', e);
            throw e;
        }
    }

    async analyze(board: MicroBoard, color: Sign, options: EngineAnalysisOptions = {}): Promise<AnalysisResult> {
        if (!this.session) throw new Error('Engine not initialized');

        const size = board.size;
        this.boardSize = size;
        const komi = options.komi ?? 7.5;
        const history = options.history || [];

        const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

        if (!isMobile) console.time('[OnnxEngine] Inference');
        // console.log(`[OnnxEngine] Starting analysis (Size: ${size}x${size})...`);

        // 1. 准备输入 Tensor (NCHW)
        // [Dynamic] 现在的模型支持动态尺寸，所以直接用 board.size
        const inputChannels = 22;
        const binInputData = new Float32Array(inputChannels * size * size);
        const globalInputData = new Float32Array(19);

        // 填充数据 (不再需要传递 modelBoardSize，因为 modelSize 就是 actualSize)
        this.fillBinInput(board, color, komi, history, binInputData, size);
        this.fillGlobalInput(history, komi, color, globalInputData);

        const tensorsToDispose: ort.Tensor[] = [];
        let results: ort.InferenceSession.OnnxValueMapType | null = null;

        try {
            // 创建 Tensor: [1, 22, size, size]
            const binInputTensor = new ort.Tensor('float32', binInputData, [1, inputChannels, size, size]);
            const globalInputTensor = new ort.Tensor('float32', globalInputData, [1, 19]);
            
            tensorsToDispose.push(binInputTensor);
            tensorsToDispose.push(globalInputTensor);

            // 2. 运行推理
            const feeds: Record<string, ort.Tensor> = {};
            feeds['input_binary'] = binInputTensor;
            feeds['input_global'] = globalInputTensor;

            results = await this.session.run(feeds);
            if (!isMobile) console.timeEnd('[OnnxEngine] Inference');

            // 3. 处理结果
            const policyTensor = results['output_policy'];
            const valueTensor = results['output_value'];
            const miscTensor = results['output_miscvalue'];
            const ownershipTensor = results['output_ownership'];

            if (!policyTensor || !valueTensor || !miscTensor) {
                throw new Error('Model output missing required tensors');
            }

            const policyData = policyTensor.data as Float32Array; // 长度应该正好是 size*size + 1
            const value = valueTensor.data as Float32Array;
            const misc = miscTensor.data as Float32Array;
            const ownershipRaw = ownershipTensor ? ownershipTensor.data as Float32Array : null;

            // [Simplify] 因为模型是动态的，输出直接对应当前棋盘，不需要重映射！
            // policyData 的最后一个值是 Pass
            
            // 4. 处理 Ownership (如果存在)
            // 所有权也是直接对应的，不需要翻转或映射索引
            let finalOwnership: Float32Array | null = null;
            if (ownershipRaw) {
                 finalOwnership = new Float32Array(size * size);
                 for (let i = 0; i < size * size; i++) {
                     // 只需要根据颜色翻转数值符号
                     // 模型输出: 绝对值 (黑正白负) 还是 相对值? KataGo ownership通常是绝对值(黑+, 白-)
                     // 但我们原来的逻辑里有 (color === 1 ? raw : -raw)，这取决于模型训练时的target。
                     // 通常 b6 ownership 是相对于视角的。如果是相对于当前玩家：
                     // 我们假设模型输出是：正数代表当前玩家占有，负数代表对手占有。
                     // 如果 ownershipRaw 是绝对的（黑正白负），则逻辑如下：
                     const rawVal = ownershipRaw[i];
                     finalOwnership[i] = (color === 1) ? rawVal : -rawVal;
                 }
            }

            // 解析胜率等信息
            let winrate = this.processWinrate(value);
            let lead = misc[0];
            const scoreStdev = misc[1] || 0;

            // 提取最佳着手
            // 直接传入 policyData，它已经是正确的大小了
            const moveInfos = this.extractMoves(policyData, size, board, color, options.temperature ?? 0);
            
            const resultMoves = isMobile ? moveInfos.slice(0, 1) : moveInfos;

            // Log detailed results (Desktop Only)
            if (!isMobile) {
                console.log(`[OnnxEngine] Analysis Complete. (Size: ${size}x${size}, Temp: ${options.temperature ?? 0})`);
                console.log(`  - Win Rate: ${winrate.toFixed(1)}%`);
                console.log(`  - Score Lead: ${lead.toFixed(1)}`);
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
            // 清理 Tensor
            for (const t of tensorsToDispose) t.dispose();
            if (results) {
                for (const key in results) {
                    const val = results[key];
                    if (val && typeof (val as any).dispose === 'function') (val as any).dispose();
                }
            }
        }
    }

    private fillBinInput(
        board: MicroBoard,
        pla: Sign,
        komi: number,
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

        if (len >= 5 && history[len - 5].x < 0) setGlobal(4, 1.0);

        // Komi Direction:
        // KataGo expects Komi relative to the *current player*.
        // If White (Color -1) is playing: Komi is 7.5 -> Input 7.5
        // If Black (Color 1) is playing: Komi is 7.5 (favors White) -> Input -7.5
        // So: if pla === -1 (White), use komi. If pla === 1 (Black), use -komi.
        
        const relativeKomi = (pla === -1) ? komi : -komi;
        setGlobal(5, relativeKomi / 20.0);
    }

    private processWinrate(valueData: Float32Array): number {
        // valueData typically has 3 values: [win, loss, noresult] (or specialized)
        // Reference:
        // expValue = [exp(v[0]), exp(v[1]), exp(v[2])]
        // winrate = expValue[0] / sum
        
        // We'll follow the reference implementation
        const v0 = valueData[0];
        const v1 = valueData[1];
        const v2 = valueData[2] || 0; // fallback if only 2

        const e0 = Math.exp(v0);
        const e1 = Math.exp(v1);
        const e2 = Math.exp(v2);
        const sum = e0 + e1 + e2;
        
        return (e0 / sum) * 100; // Return percentage
    }

    private calculateTerritoryScore(ownership: Float32Array, komi: number, size: number, playerColor: Sign): number {
        // Ownership Logic: Normalized to ABSOLUTE (+1=Black, -1=White)
        
        let blackPoints = 0;
        let whitePoints = 0;

        // Use constant for threshold (defined at top of file, or here for now)
        const TERRITORY_THRESHOLD = 0.3; 

        for (let i = 0; i < ownership.length; i++) {
            const val = ownership[i];
            if (val > TERRITORY_THRESHOLD) blackPoints += 1;
            else if (val < -TERRITORY_THRESHOLD) whitePoints += 1;
        }
        
        // Absolute Score: (Black - White) - Komi
        const absoluteScore = (blackPoints - whitePoints) - komi;
        
        // Return Lead relative to CURRENT PLAYER
        // If Black (1): return Abs; If White (-1): return -Abs.
        return playerColor === 1 ? absoluteScore : -absoluteScore;
    }

    private deriveWinRateFromScore(scoreLead: number): number {
        // Logistic Function.
        // Hard Scoring reduces the magnitude of the lead compared to Soft Scoring (which includes 0.4s).
        // A "Current Form" lead of 10 points is significant.
        // T=8: 10pts -> ~78% (Conservative)
        // T=5: 10pts -> ~88% (Reasonable)
        const T = 5.0; 
        const winProbability = 1 / (1 + Math.exp(-scoreLead / T));
        return winProbability * 100;
    }

    private extractMoves(policy: Float32Array, size: number, board: MicroBoard, color: Sign, temperature: number) {
        // Policy is just a flat array of logits?
        
        // Find max for stability
        let maxLogit = -Infinity;
        for (let i = 0; i < policy.length; i++) {
            if (policy[i] > maxLogit) maxLogit = policy[i];
        }

        const probs = new Float32Array(policy.length);
        let sumProbs = 0;
        for (let i = 0; i < policy.length; i++) {
            probs[i] = Math.exp(policy[i] - maxLogit);
            sumProbs += probs[i];
        }
        // Normalize
        for (let i = 0; i < policy.length; i++) {
            probs[i] /= sumProbs;
        }

        const moves: any[] = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const idx = y * size + x;
                const p = probs[idx];
                
                // Only return legal moves with some probability
                if (p > 0.0001) { // Lower threshold to allow checking more moves
                     // Use isLegal to check for Suicides and Ko
                     if (board.isLegal(x, y, color)) { 
                          moves.push({
                             x, y,
                             prior: p,
                             logit: policy[idx], // Save Logit for temperature
                             winrate: 0,
                             vists: 0,
                             u: 0, scoreMean: 0, scoreStdev: 0, lead: 0
                          });
                     } else {
                         // console.log(`[Debug] Illegal move skipped: ${x},${y} (Prob: ${p})`);
                     }
                 }
            }
        }
        
        // Pass move
        const passIdx = size * size;
        if (probs.length > passIdx) {
             const passProb = probs[passIdx];
             if (passProb > 0.001) {
                 moves.push({ x: -1, y: -1, prior: passProb, winrate: 0, lead: 0, vists: 0, u: 0, scoreMean: 0, scoreStdev: 0 });
             }
        }

        // Sort by prob (Argmax)
        moves.sort((a, b) => b.prior - a.prior);

        // [Fix] Force Pass if it's the best move
        // If the AI thinks Passing is the best move (highest probability), 
        // we should respect it immediately and not let Temperature sample a stupid move (like filling own territory).
        // Refusing to pass when the game is done is "Broken", not "Weak".
        if (moves.length > 0 && moves[0].x === -1) {
            return [moves[0]];
        }

        // Temperature Sampling
        if (temperature > 0) {
            // Re-calculate probabilities using softmax with temperature
            // P = exp(logit / T) / Sum
            
            // 1. Find max (for numerical stability)
            let maxL = -Infinity;
            for (const m of moves) maxL = Math.max(maxL, m.logit);
            
            // 2. Sum Exponentials
            let sumExp = 0;
            const weightedMoves = moves.map(m => {
                const w = Math.exp((m.logit - maxL) / temperature);
                sumExp += w;
                return { ...m, weight: w };
            });

            // 3. Sample
            let r = Math.random() * sumExp;
            for (const m of weightedMoves) {
                r -= m.weight;
                if (r <= 0) {
                    return [m];
                }
            }
            return weightedMoves.length > 0 ? [weightedMoves[weightedMoves.length - 1]] : []; // Fallback
        }

        return moves;
    }

    dispose() {
        if (this.session) {
            try {
                // @ts-ignore - 'release' is available in recent ort-web but might be missing in types
                if (typeof this.session.release === 'function') {
                    // @ts-ignore
                    this.session.release();
                    console.log("[OnnxEngine] Session released.");
                }
            } catch (e) {
                console.warn("[OnnxEngine] Failed to release session:", e);
            }
            this.session = null;
        }
    }
}
