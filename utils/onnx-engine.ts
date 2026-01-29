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
        console.log(`[OnnxEngine] Starting analysis...`); // Reduced logging

        // 1. Prepare Input Tensors (NCHW)
        // [Batch, Channels, Height, Width] -> Always use 19x19 for this fixed model
        const modelBoardSize = 19;
        const binInputData = new Float32Array(22 * modelBoardSize * modelBoardSize);
        const globalInputData = new Float32Array(19);

        // Fill with padding if size < 19
        this.fillBinInput(board, color, komi, history, binInputData, size, modelBoardSize);
        this.fillGlobalInput(history, komi, color, globalInputData);

        // Keep track of tensors to dispose
        const tensorsToDispose: ort.Tensor[] = [];

        let binInputTensor: ort.Tensor | null = null;
        let globalInputTensor: ort.Tensor | null = null;
        let results: ort.InferenceSession.OnnxValueMapType | null = null;

        try {
            binInputTensor = new ort.Tensor('float32', binInputData, [1, 22, modelBoardSize, modelBoardSize]);
            globalInputTensor = new ort.Tensor('float32', globalInputData, [1, 19]);
            
            tensorsToDispose.push(binInputTensor);
            tensorsToDispose.push(globalInputTensor);

            // 2. Run Inference
            const feeds: Record<string, ort.Tensor> = {};
            feeds['input_binary'] = binInputTensor;
            feeds['input_global'] = globalInputTensor;

            results = await this.session.run(feeds);
            if (!isMobile) console.timeEnd('[OnnxEngine] Inference');

            // Process Results
            // Map ONNX output names from the model (b6)
            const policyTensor = results['output_policy'];
            const valueTensor = results['output_value'];
            const miscTensor = results['output_miscvalue'];
            const ownershipTensor = results['output_ownership'];

            const policyData = policyTensor ? policyTensor.data as Float32Array : null;
            const value = valueTensor ? valueTensor.data as Float32Array : null;
            const misc = miscTensor ? miscTensor.data as Float32Array : null;
            const ownershipRaw = ownershipTensor ? ownershipTensor.data as Float32Array : null;
            
            if (!policyData || !value || !misc) {
                throw new Error('Model output missing required tensors');
            }

            // [Masking Fix] Map 19x19 Policy/Ownership back to Actual Board Size
            // Model (19x19) -> Pass is at 361.
            // Actual (Size) -> Pass is at Size*Size.
            const modelPassIndex = modelBoardSize * modelBoardSize;
            const actualPassIndex = board.size * board.size;
            
            // 1. Remap Policy
            // Create policy for actual size + 1 (Pass)
            const finalPolicy = new Float32Array(actualPassIndex + 1);
            
            // Helper to get index
            const getModelIdx = (x: number, y: number) => y * modelBoardSize + x;
            const getActualIdx = (x: number, y: number) => y * board.size + x;

            // Copy valid spots
            for (let y = 0; y < board.size; y++) {
                for (let x = 0; x < board.size; x++) {
                    const mIdx = getModelIdx(x, y);
                    const aIdx = getActualIdx(x, y);
                    finalPolicy[aIdx] = policyData[mIdx];
                }
            }
            // Copy Pass
            finalPolicy[actualPassIndex] = policyData[modelPassIndex];


            // [DEBUG] Find Global Max in Raw Policy
            let maxRaw = -Infinity;
            let maxRawIdx = -1;
            for(let i=0; i<361; i++) {
                if (policyData[i] > maxRaw) {
                    maxRaw = policyData[i];
                    maxRawIdx = i;
                }
            }
            const rX = maxRawIdx % 19;
            const rY = Math.floor(maxRawIdx / 19);
            console.log(`[OnnxEngine] RAW BEST MOVE: (${rX}, ${rY}) Val=${maxRaw}`);
            if (rX >= board.size || rY >= board.size) {
                 // Common when mapping 9x9 -> 19x19 model with padding
                 if (this.config.debug) console.log("[OnnxEngine] AI predicted move outside board (likely padding artifact). Ignored.");
            }

            // [DEBUG] Check if we have valid policy data for small board
            let nonzero = 0;
            let sum = 0;
            for(let i=0; i<finalPolicy.length; i++) {
                if (finalPolicy[i] > -1000) nonzero++; // Check for non-masked values (log space, so small negative or positive)
                // Actually ONNX policy is usually logits, so they can be negative. 
                // But usually we check if they are not ridiculously low if softmaxed? 
                // Wait, output_policy is logits or probs? 
                // KataGo usually outputs logits.
                // Let's just count.
            }
            console.log(`[OnnxEngine] 9x9 Mapping Debug: PassIndex=${actualPassIndex} (Model=${modelPassIndex}).`);
            console.log(`[OnnxEngine] FinalPolicy (Size ${finalPolicy.length}): First few=${finalPolicy.slice(0,5).join(',')}`);
            console.log(`[OnnxEngine] ModelPolicy (Size ${policyData.length}): First few=${policyData.slice(0,5).join(',')}`);


            // 2. Remap Ownership (if exists) -> NCHW or NHW? Usually [1, 1, 19, 19] or [19*19]
            let finalOwnership: Float32Array | null = null;
            if (ownershipRaw) {
                 finalOwnership = new Float32Array(board.size * board.size);
                 for (let y = 0; y < board.size; y++) {
                    for (let x = 0; x < board.size; x++) {
                        const mIdx = getModelIdx(x, y);
                        const aIdx = getActualIdx(x, y);
                        // Flip color if needed (Relative -> Absolute)
                        // If Color=Black(1), Raw is Absolute. If Color=White(-1), Raw is Inverted.
                        const rawVal = ownershipRaw[mIdx];
                        finalOwnership[aIdx] = (color === 1) ? rawVal : -rawVal;
                    }
                }
            }

            // Parse outputs
            const moveInfos = this.extractMoves(finalPolicy, size, board, color, options.temperature ?? 0);
            
            // [KataGo Internal Analysis]
            // 2. Extract Winrate and Lead directly from model output!
            // value: [log_win, log_loss, log_no_result]
            // misc: [score_mean, score_stdev, lead, ...]
            let winrate = this.processWinrate(value);
            let lead = misc[0]; // Score Mean
            const scoreStdev = misc[1] || 0;

            // Note: We still keep finalOwnership for territory visualization but no longer derive stats from it.
            // This is "Winrate Direct Integration" as requested.



            // Fallback if ownership missing? (Rare)
            // lead/winrate initialized to 0/50 above.

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
                    scoreStdev: scoreStdev,
                    ownership: finalOwnership // Return Normalized Absolute Data
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
        actualSize: number,
        modelSize: number
    ) {
        const opp: Sign = pla === 1 ? -1 : 1;
        
        // Helper to set NCHW: Channel, Y, X in the Model's coordinate system (19x19)
        const set = (c: number, y: number, x: number, val: number) => {
             data[c * modelSize * modelSize + y * modelSize + x] = val;
        };

        // [Fix] MOAT STRATEGY (2-Pixel Gap).
        // Strict Masking (all 0s) kills the Global Pooling signal -> AI Passes.
        // Full Padding (all 1s) hides the edge -> AI plays 4-4 (thinks it's 19x19).
        // Solution: A 2-pixel wide "Moat" of 0s to define the edge, followed by 1s.
        // This gives the ConvNet a clear "End of Board" signal while keeping ample "Ones"
        // in the far background to satisfy global activation thresholds.
        for (let y = 0; y < modelSize; y++) {
            for (let x = 0; x < modelSize; x++) {
                 // Check if on actual board
                 if (x < actualSize && y < actualSize) {
                     set(0, y, x, 1.0);
                     continue;
                 }

                 // Calculate distance from board edge
                 const dx = x < actualSize ? 0 : x - actualSize + 1;
                 const dy = y < actualSize ? 0 : y - actualSize + 1;
                 const dist = Math.max(dx, dy);

                 // Moat Width 2: Indices size and size+1 are 0.0. Further is 1.0.
                 if (dist <= 2) {
                     set(0, y, x, 0.0);
                 } else {
                     set(0, y, x, 1.0); 
                 }
            }
        }

        // Only iterate over the ACTUAL board area for stones/libs
        for (let y = 0; y < actualSize; y++) {
            for (let x = 0; x < actualSize; x++) {
                // Feature 0: Ones (Already set above)

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
                if (h.x >= 0 && h.x < actualSize && h.y >= 0 && h.y < actualSize) {
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
