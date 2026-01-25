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
            // Configure session options
            // Detect Mobile to avoid WebGPU crashes if not explicitly requested
            const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
            
            // [Memory Fix] Low-End Device Protection (All Mobile)
            // Jetsam (iOS) and Low-Memory Killers (Android Wechat/H5) are strict.
            // Disabling SIMD/Proxy reduces memory footprint significantly at cost of speed.
            if (isMobile) {
                console.log("[OnnxEngine] Mobile detected: Disabling SIMD and Proxy for max stability.");
                ort.env.wasm.simd = false;
                ort.env.wasm.proxy = false; 
                ort.env.wasm.numThreads = 1; // Force 1 thread here too
                
                // [CRITICAL FIX] Use CDN for Mobile WASM
                // The local package seems to be missing 'ort-wasm.wasm' (Vanilla Lite version).
                // We force mobile to fetch the lightweight binary (~3MB) from jsdelivr to avoid the 11MB+ SIMD binary.
                console.log("[OnnxEngine] Mobile: Switching WASM path to CDN for lightweight binary...");
                ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
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
        console.log(`[OnnxEngine] Starting analysis...`); // Reduced logging

        // 1. Prepare Input Tensors (NCHW)
        // [Batch, Channels, Height, Width] -> [1, 22, 19, 19]
        const binInputData = new Float32Array(22 * size * size);
        const globalInputData = new Float32Array(19);

        this.fillBinInput(board, color, komi, history, binInputData, size);
        this.fillGlobalInput(history, komi, color, globalInputData);

        // Keep track of tensors to dispose
        const tensorsToDispose: ort.Tensor[] = [];

        let binInputTensor: ort.Tensor | null = null;
        let globalInputTensor: ort.Tensor | null = null;
        let results: ort.InferenceSession.OnnxValueMapType | null = null;

        try {
            binInputTensor = new ort.Tensor('float32', binInputData, [1, 22, size, size]);
            globalInputTensor = new ort.Tensor('float32', globalInputData, [1, 19]);
            
            tensorsToDispose.push(binInputTensor);
            tensorsToDispose.push(globalInputTensor);

            // 2. Run Inference
            const feeds: Record<string, ort.Tensor> = {};
            feeds['bin_input'] = binInputTensor;
            feeds['global_input'] = globalInputTensor;

            results = await this.session.run(feeds);
            if (!isMobile) console.timeEnd('[OnnxEngine] Inference');

            // Process Results
            const policy = results.policy ? results.policy.data as Float32Array : null;
            const value = results.value ? results.value.data as Float32Array : null;
            const misc = results.miscvalue ? results.miscvalue.data as Float32Array : null;
            // [New] Ownership (Territory)
            const ownership = results.ownership ? results.ownership.data as Float32Array : null;

            if (!policy || !value || !misc) {
                throw new Error('Model output missing policy, value, or miscvalue');
            }

            // Handle multi-channel policy (e.g. [1, 6, 82])
            // We only need the first channel (Move Probabilities)
            const numMoves = size * size + 1;
            let finalPolicy = policy;
            
            if (results.policy.dims && results.policy.dims.length > 2 && results.policy.dims[1] > 1) {
                 // Assuming format [Batch, Channels, Moves]
                 // Take the first channel
                 finalPolicy = policy.subarray(0, numMoves);
            }

            // Parse outputs
            const moveInfos = this.extractMoves(finalPolicy, size, board, color, options.temperature ?? 0);
            const winrate = this.processWinrate(value);
            const lead = misc[0] * 20;

            // [Memory Fix] Reduce IPC payload on mobile
            // We only need the best move. Sending 360 move objects kills the message channel or GC.
            const resultMoves = isMobile ? moveInfos.slice(0, 1) : moveInfos;

            // Log detailed results (Desktop Only)
            if (!isMobile) {
                console.log(`[OnnxEngine] Analysis Complete. (Temp: ${options.temperature ?? 0})`);
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
                    scoreStdev: 0,
                    ownership: ownership ? new Float32Array(ownership) : null // Clone or pass ref? Pass ref usually fine if we don't dispose buffer immediately.
                    // Wait, output buffers are views of WASM memory?
                    // If we dispose `results`, does the data become invalid?
                    // ort-web: yes, likely. We should copy it specifically if we plan to use it after session run?
                    // Actually, `results.ownership.data` is likely a TypedArray view.
                    // It is safest to copy it because we might not control when WASM memory is reclaimed.
                    // COPY IT: new Float32Array(ownership)
                },
                moves: resultMoves
            };
        } catch (e) {
            console.timeEnd('[OnnxEngine] Inference');
            console.error('[OnnxEngine] Inference Failed:', e);
            throw e;
        } finally {
            // [Cleanup] Explicitly dispose input tensors
            for (const t of tensorsToDispose) {
                if(t && typeof (t as any).dispose === 'function') {
                    (t as any).dispose();
                }
            }
            
            // [Cleanup] Explicitly dispose output tensors
            if (results) {
                for (const key in results) {
                    const val = results[key];
                    if (val && typeof (val as any).dispose === 'function') {
                        (val as any).dispose();
                    }
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
        size: number
    ) {
        const opp: Sign = pla === 1 ? -1 : 1;
        
        // Reference Implementation (Kaya) Layout:
        // 0: Ones
        // 1: Pla
        // 2: Opp
        
        // Helper to set NCHW: Channel, Y, X
        const set = (c: number, y: number, x: number, val: number) => {
             data[c * size * size + y * size + x] = val;
        };

        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // Feature 0: Ones (Restored)
                set(0, y, x, 1.0);

                const c = board.get(x, y);
                // Model expects [Ones, Pla, Opp]
                if (c === pla) set(1, y, x, 1.0);      // Pla -> Ch 1
                else if (c === opp) set(2, y, x, 1.0); // Opp -> Ch 2

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
        // Revert to "Move Location" based on saturation hypothesis and reference.
        // Ch 9 = Last Move, Ch 10 = 2nd Last Move...
        const len = history.length;
        const setHistory = (turnsAgo: number, channel: number) => {
            if (len >= turnsAgo) {
                const h = history[len - turnsAgo];
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
        
        // DEBUG: Force fill with dummy data to test model stability
        // console.warn("DEBUG: Overwriting input with 0.1");
        // for(let i=0; i<data.length; i++) data[i] = 0.1;
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
