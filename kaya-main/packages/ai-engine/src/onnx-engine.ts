/**
 * ONNX Runtime Web engine for KataGo analysis
 *
 * Uses the 'all' bundle which has JSEP enabled for proper WebGPU support.
 * NOTE: Requires ort-wasm-simd-threaded.jsep.wasm + .mjs to be served from /wasm/
 */
import * as ort from 'onnxruntime-web/all';
import { GoBoard, type Sign, type SignMap } from '@kaya/goboard';
import {
  Engine,
  type BaseEngineConfig,
  type EngineAnalysisOptions,
  type EngineCapabilities,
  type EngineRuntimeInfo,
} from './base-engine';
import type { AnalysisResult, MoveSuggestion } from './types';

export interface OnnxEngineConfig extends BaseEngineConfig {
  /** ArrayBuffer of the ONNX model */
  modelBuffer?: ArrayBuffer;

  /** URL to the ONNX model */
  modelUrl?: string;

  /** Execution providers to try (default: ['webgpu', 'wasm']) */
  executionProviders?: string[];

  /** Number of threads for WASM backend (default: 4) */
  numThreads?: number;

  /** Path to WASM files (default: '/wasm/') */
  wasmPath?: string;

  /** Enable verbose debug logging */
  debug?: boolean;
}

export class OnnxEngine extends Engine {
  private session: ort.InferenceSession | null = null;
  private boardSize: number = 19;
  private debugEnabled = false;
  private usedProviders: string[] = [];
  private requestedProviders: string[] = [];
  private inputDataType: 'float32' | 'float16' = 'float32';
  private didFallback: boolean = false;

  constructor(config: OnnxEngineConfig = {}) {
    super(config);
    this.debugEnabled = Boolean(config.debug);
  }

  private debugLog(message: string, payload?: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    if (payload) {
      console.log('[OnnxEngine][debug]', message, payload);
    } else {
      console.log('[OnnxEngine][debug]', message);
    }
  }

  private validateTensorData(buffer: Float32Array, label: string): void {
    for (let i = 0; i < buffer.length; i++) {
      const value = buffer[i];
      if (!Number.isFinite(value)) {
        throw new Error(`[OnnxEngine] Invalid ${label} value at index ${i}: ${value}`);
      }
    }
  }

  /**
   * Convert Float32Array to Float16 (stored as Uint16Array).
   * Uses the standard IEEE 754 half-precision format.
   */
  private float32ToFloat16(float32Array: Float32Array): Uint16Array {
    const float16Array = new Uint16Array(float32Array.length);
    const view = new DataView(new ArrayBuffer(4));

    for (let i = 0; i < float32Array.length; i++) {
      const val = float32Array[i];
      view.setFloat32(0, val, true);
      const f32 = view.getUint32(0, true);

      // Extract components from float32
      const sign = (f32 >>> 31) & 0x1;
      const exp = (f32 >>> 23) & 0xff;
      const frac = f32 & 0x7fffff;

      let f16: number;
      if (exp === 0) {
        // Zero or denormalized - map to zero in fp16
        f16 = sign << 15;
      } else if (exp === 255) {
        // Infinity or NaN
        f16 = (sign << 15) | 0x7c00 | (frac ? 0x200 : 0);
      } else {
        // Normalized number
        const newExp = exp - 127 + 15;
        if (newExp >= 31) {
          // Overflow to infinity
          f16 = (sign << 15) | 0x7c00;
        } else if (newExp <= 0) {
          // Underflow to zero or denorm
          if (newExp >= -10) {
            // Denormalized
            const mant = (frac | 0x800000) >> (1 - newExp + 13);
            f16 = (sign << 15) | (mant >> 10);
          } else {
            f16 = sign << 15;
          }
        } else {
          // Normal case
          f16 = (sign << 15) | (newExp << 10) | (frac >> 13);
        }
      }
      float16Array[i] = f16;
    }
    return float16Array;
  }

  /**
   * Create an ONNX tensor with the appropriate data type for this model.
   */
  private createTensor(data: Float32Array, dims: readonly number[]): ort.Tensor {
    if (this.inputDataType === 'float16') {
      const float16Data = this.float32ToFloat16(data);
      return new ort.Tensor('float16', float16Data, dims);
    }
    return new ort.Tensor('float32', data, dims);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const config = this.config as OnnxEngineConfig;

    try {
      // Check cross-origin isolation (required for SharedArrayBuffer/threads)
      const isCrossOriginIsolated = typeof self !== 'undefined' && self.crossOriginIsolated;

      const numThreads = isCrossOriginIsolated
        ? config.numThreads ||
          Math.min(8, typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4)
        : 1;

      this.debugLog('Initializing session', {
        requestedProviders: config.executionProviders,
        wasmPath: config.wasmPath,
        numThreads,
        crossOriginIsolated: isCrossOriginIsolated,
      });

      // Configure ONNX Runtime
      ort.env.wasm.numThreads = numThreads;
      ort.env.wasm.simd = true;
      ort.env.wasm.proxy = false;

      const wasmBasePath = config.wasmPath || '/wasm/';
      ort.env.wasm.wasmPaths = wasmBasePath;

      // Check WebGPU availability
      let webgpuAvailable = false;
      let webgpuAdapter: any = null;

      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          webgpuAdapter = await (navigator as any).gpu.requestAdapter({
            powerPreference: 'high-performance',
          });
          if (webgpuAdapter) {
            webgpuAvailable = true;
            // Pass adapter to ONNX Runtime
            // @ts-ignore
            ort.env.webgpu = ort.env.webgpu || {};
            // @ts-ignore
            ort.env.webgpu.adapter = webgpuAdapter;
            // @ts-ignore
            ort.env.webgpu.powerPreference = 'high-performance';
          }
        } catch {
          // WebGPU not available
        }
      }

      // Disable debug logging
      ort.env.debug = false;
      ort.env.logLevel = 'warning';

      // Build provider list
      let providers = config.executionProviders || ['webgpu', 'wasm'];
      providers = providers.filter(p => p !== 'webgl'); // WebGL doesn't work in workers

      // Store the originally requested providers for fallback detection
      this.requestedProviders = [...providers];

      if (!webgpuAvailable) {
        providers = providers.filter(p => p !== 'webgpu');
      }

      const sessionOptions: ort.InferenceSession.SessionOptions = {
        executionProviders: providers,
        graphOptimizationLevel: 'all',
        logSeverityLevel: 2,
        intraOpNumThreads: numThreads,
        interOpNumThreads: numThreads,
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: 'sequential',
      };

      // WebGPU optimization: keep outputs on GPU
      if (providers.includes('webgpu')) {
        sessionOptions.preferredOutputLocation = 'gpu-buffer';
      }

      const createStart = performance.now();
      let usedProviders = providers;

      const createSession = async (opts: ort.InferenceSession.SessionOptions) => {
        if (config.modelBuffer) {
          return await ort.InferenceSession.create(config.modelBuffer, opts);
        } else if (config.modelUrl) {
          return await ort.InferenceSession.create(config.modelUrl, opts);
        }
        throw new Error('No model provided');
      };

      try {
        this.session = await createSession(sessionOptions);
      } catch (initialError) {
        // Fallback to WASM if WebGPU fails
        if (providers.includes('webgpu') && providers.length > 1) {
          console.warn('[OnnxEngine] WebGPU failed, falling back to WASM');
          usedProviders = providers.filter(p => p !== 'webgpu');
          this.didFallback = true;
          this.session = await createSession({
            ...sessionOptions,
            executionProviders: usedProviders,
          });
        } else {
          throw initialError;
        }
      }

      const createTime = performance.now() - createStart;
      this.initialized = true;
      this.usedProviders = usedProviders;

      // Check if we fell back from WebGPU due to it not being available
      if (this.requestedProviders.includes('webgpu') && !usedProviders.includes('webgpu')) {
        this.didFallback = true;
      }

      // Detect input data type from model metadata
      // ONNX Runtime Web exposes input metadata through the handler
      let detectedFp16 = false;
      try {
        // Try to access input metadata through handler (internal API)
        const handler = (this.session as any).handler;
        if (handler?.inputMetadata) {
          const binInputMeta = handler.inputMetadata.find(
            (m: any) => m.name === 'bin_input' || m.name === this.session!.inputNames[0]
          );
          if (binInputMeta?.type === 'float16') {
            detectedFp16 = true;
          }
        }
      } catch {
        // Fallback: we'll detect at runtime if needed
      }

      if (detectedFp16) {
        this.inputDataType = 'float16';

        // Warn if using FP16 on CPU/WASM - it's not well supported
        const isWasmOnly = usedProviders.every(p => p === 'wasm' || p === 'cpu');
        if (isWasmOnly) {
          console.warn(
            '[OnnxEngine] FP16 model detected on CPU/WASM backend. ' +
              'FP16 is not fully supported on CPU - you may experience errors. ' +
              'Consider using an FP32 model or WebGPU backend for better compatibility.'
          );
        }
      } else {
        this.inputDataType = 'float32';
      }

      // Log model loaded info (always visible)
      const backendInfo = usedProviders.join('/').toUpperCase();
      const threadInfo = numThreads > 1 ? ` (${numThreads} threads)` : '';
      const dtypeInfo = this.inputDataType === 'float16' ? ' [FP16]' : '';
      const timeStr =
        createTime >= 1000 ? `${(createTime / 1000).toFixed(1)}s` : `${createTime.toFixed(0)}ms`;
      console.log(`[AI] Model loaded: ${backendInfo}${threadInfo}${dtypeInfo} in ${timeStr}`);

      this.debugLog('Session ready', {
        providers: usedProviders,
        createTimeMs: createTime,
        numThreads,
      });
    } catch (e) {
      console.error('[OnnxEngine] Failed to initialize:', e);
      throw e;
    }
  }

  getCapabilities(): EngineCapabilities {
    return {
      name: 'KataGo (ONNX)',
      version: '1.0.0',
      supportedBoardSizes: [],
      supportsParallel: false,
      providesPV: false,
      providesWinRate: false,
      providesScoreLead: true,
    };
  }

  /**
   * Get runtime information about the engine, including fallback status
   */
  getRuntimeInfo(): EngineRuntimeInfo {
    // Determine the actual backend used
    let backend = 'wasm';
    if (this.usedProviders.includes('webgpu')) {
      backend = 'webgpu';
    } else if (this.usedProviders.includes('wasm')) {
      backend = 'wasm';
    } else if (this.usedProviders.length > 0) {
      backend = this.usedProviders[0];
    }

    // Determine what was originally requested
    let requestedBackend: string | undefined;
    if (this.didFallback && this.requestedProviders.length > 0) {
      if (this.requestedProviders.includes('webgpu')) {
        requestedBackend = 'webgpu';
      } else {
        requestedBackend = this.requestedProviders[0];
      }
    }

    return {
      backend,
      inputDataType: this.inputDataType,
      didFallback: this.didFallback,
      requestedBackend,
    };
  }

  protected async analyzePosition(
    signMap: SignMap,
    options: EngineAnalysisOptions
  ): Promise<AnalysisResult> {
    if (!this.session) throw new Error('Engine not initialized');

    const analysisStart = performance.now();
    const board = new GoBoard(signMap);
    // Always use the actual board size from signMap, not cached value
    const size = board.width;
    this.boardSize = size;

    // Determine current player
    let nextPla: Sign = 1;
    if (options.nextToPlay) {
      nextPla = options.nextToPlay === 'W' ? -1 : 1;
    } else {
      let blackStones = 0,
        whiteStones = 0;
      for (let y = 0; y < this.boardSize; y++) {
        for (let x = 0; x < this.boardSize; x++) {
          const s = board.get([x, y]);
          if (s === 1) blackStones++;
          else if (s === -1) whiteStones++;
        }
      }
      nextPla = blackStones === whiteStones ? 1 : -1;
    }

    const komi = options.komi ?? 7.5;
    const history = options.history || [];

    // Featurize and run inference
    const { bin_input, global_input } = this.featurize(board, nextPla, komi, history, size);
    this.validateTensorData(bin_input, 'bin_input');
    this.validateTensorData(global_input, 'global_input');
    this.debugLog('Single analysis prepared', {
      nextPla,
      komi,
      historyLength: history.length,
      boardSize: size,
    });

    let binTensor = this.createTensor(bin_input, [1, 22, size, size]);
    let globalTensor = this.createTensor(global_input, [1, 19]);

    const inferenceStart = performance.now();
    let results: ort.InferenceSession.OnnxValueMapType;

    try {
      results = await this.session.run({
        bin_input: binTensor,
        global_input: globalTensor,
      });
    } catch (error) {
      // Check for FP16 mismatch error and retry with correct type
      const errorMsg = String(error);
      if (errorMsg.includes('expected: (tensor(float16))') && this.inputDataType === 'float32') {
        console.warn('[OnnxEngine] Detected FP16 model at runtime, switching input type');
        this.inputDataType = 'float16';

        // Warn about FP16 on CPU
        const isWasmOnly = this.usedProviders.every(p => p === 'wasm' || p === 'cpu');
        if (isWasmOnly) {
          console.warn(
            '[OnnxEngine] FP16 model on CPU/WASM backend - this may not work correctly. ' +
              'Consider using an FP32 model.'
          );
        }

        // Dispose old tensors and create new ones with FP16
        binTensor.dispose();
        globalTensor.dispose();
        binTensor = this.createTensor(bin_input, [1, 22, size, size]);
        globalTensor = this.createTensor(global_input, [1, 19]);

        results = await this.session.run({
          bin_input: binTensor,
          global_input: globalTensor,
        });
      } else {
        throw error;
      }
    }

    const inferenceTime = performance.now() - inferenceStart;
    this.debugLog('Single analysis inference complete', { inferenceTime });

    binTensor.dispose();
    globalTensor.dispose();

    const analysisResult = await this.processResults(results, nextPla, this.boardSize);
    const totalTime = performance.now() - analysisStart;

    this.debugLog('Single analysis complete', {
      totalTimeMs: totalTime,
      inferenceTimeMs: inferenceTime,
    });

    return analysisResult;
  }

  async analyzeBatch(
    inputs: { signMap: SignMap; options?: EngineAnalysisOptions }[]
  ): Promise<AnalysisResult[]> {
    if (!this.initialized || !this.session) {
      throw new Error('Engine not initialized');
    }

    if (inputs.length === 0) return [];

    // Always use the actual board size from the first input's signMap
    const size = inputs[0].signMap.length;
    this.boardSize = size;
    const numPlanes = 22;

    // Check cache
    const results: (AnalysisResult | null)[] = new Array(inputs.length).fill(null);
    const uncachedInputs: {
      originalIndex: number;
      signMap: SignMap;
      options: EngineAnalysisOptions;
    }[] = [];

    const useCache = this.config.enableCache;
    for (let i = 0; i < inputs.length; i++) {
      const { signMap, options = {} } = inputs[i];
      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        const cached = this.cache.get(cacheKey);
        if (cached) {
          results[i] = cached;
          continue;
        }
      }
      uncachedInputs.push({ originalIndex: i, signMap, options });
    }

    if (uncachedInputs.length === 0) {
      this.debugLog('Batch request resolved from cache', { requested: inputs.length });
      return results as AnalysisResult[];
    }

    const actualBatchSize = uncachedInputs.length;
    // Pad batch size to minimum of 8 to avoid WebGPU issues with small batches
    // WebGPU can hang when batch size differs from warmup size on some hardware
    // const MIN_BATCH_SIZE = 8;
    const batchSize = actualBatchSize; // Math.max(actualBatchSize, MIN_BATCH_SIZE);
    const batchStart = performance.now();

    // Prepare batch tensors (including padding slots)
    const bin_input = new Float32Array(batchSize * numPlanes * size * size);
    const global_input = new Float32Array(batchSize * 19);
    const plas: Sign[] = [];

    // Fill real data
    for (let b = 0; b < actualBatchSize; b++) {
      const { signMap, options } = uncachedInputs[b];
      const board = new GoBoard(signMap);
      const komi = options.komi ?? 7.5;
      const nextPla: Sign = options.nextToPlay === 'W' ? -1 : 1;
      plas.push(nextPla);
      const history = options.history || [];
      this.featurizeToBuffer(board, nextPla, komi, history, bin_input, global_input, b, size);
    }

    // Fill padding slots with dummy data (empty board, black to play)
    /*
    if (batchSize > actualBatchSize) {
      const dummyBoard = GoBoard.fromDimensions(size);
      for (let b = actualBatchSize; b < batchSize; b++) {
        plas.push(1); // black to play
        this.featurizeToBuffer(dummyBoard, 1, 7.5, [], bin_input, global_input, b);
      }
    }
    */

    this.validateTensorData(bin_input, 'bin_input(batch)');
    this.validateTensorData(global_input, 'global_input(batch)');

    if (this.debugEnabled) {
      const historyLengths = uncachedInputs.map(item => item.options.history?.length ?? 0);
      const historyStats = historyLengths.reduce(
        (acc, len) => {
          return {
            min: Math.min(acc.min, len),
            max: Math.max(acc.max, len),
            sum: acc.sum + len,
          };
        },
        { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, sum: 0 }
      );
      const avgHistory = historyLengths.length ? historyStats.sum / historyLengths.length : 0;
      const plaCounts = plas.reduce(
        (acc, pla) => {
          if (pla === 1) acc.black += 1;
          else acc.white += 1;
          return acc;
        },
        { black: 0, white: 0 }
      );
      const sampleKeys = uncachedInputs.map(({ signMap, options }) =>
        this.getCacheKey(signMap, options).slice(0, 16)
      );
      this.debugLog('Running batch inference', {
        batchSize,
        boardSize: size,
        providers: this.usedProviders,
        historyStats: {
          min: Number.isFinite(historyStats.min) ? historyStats.min : 0,
          max: Number.isFinite(historyStats.max) ? historyStats.max : 0,
          avg: Number(avgHistory.toFixed(2)),
        },
        plaCounts,
        sampleKeys,
      });
    }

    // Run inference
    const binTensor = this.createTensor(bin_input, [batchSize, 22, size, size]);
    const globalTensor = this.createTensor(global_input, [batchSize, 19]);

    this.debugLog('Starting batch inference', {
      actualBatchSize,
      providers: this.usedProviders,
    });

    const inferenceStart = performance.now();
    const inferenceResults = await this.session.run({
      bin_input: binTensor,
      global_input: globalTensor,
    });
    const inferenceTime = performance.now() - inferenceStart;
    this.debugLog('Batch inference finished', {
      batchSize,
      actualBatchSize,
      inferenceTime,
    });

    binTensor.dispose();
    globalTensor.dispose();

    // Process results (full batch including padding)
    const batchResults = await this.processBatchResults(inferenceResults, plas, size, batchSize);

    // Store in cache (only actual results, not padding)
    for (let b = 0; b < actualBatchSize; b++) {
      const { originalIndex, signMap, options } = uncachedInputs[b];
      const result = batchResults[b];
      results[originalIndex] = result;

      if (useCache) {
        const cacheKey = this.getCacheKey(signMap, options);
        this.cache.set(cacheKey, result);
        if (this.cache.size > (this.config.maxCacheSize ?? 1000)) {
          const firstKey = this.cache.keys().next().value;
          if (firstKey) this.cache.delete(firstKey);
        }
      }
    }

    const totalTime = performance.now() - batchStart;
    const msPerPos = totalTime / actualBatchSize;

    this.debugLog('Batch analysis complete', {
      actualBatchSize,
      totalTimeMs: totalTime,
      msPerPos,
      inferenceTimeMs: inferenceTime,
      paddedTo: batchSize > actualBatchSize ? batchSize : undefined,
    });

    return results as AnalysisResult[];
  }

  private disposeTensors(results: ort.InferenceSession.ReturnType): void {
    for (const key of Object.keys(results)) {
      try {
        results[key]?.dispose?.();
      } catch {
        // Ignore
      }
    }
  }

  private featurize(
    board: GoBoard,
    pla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    size: number
  ) {
    const bin_input = new Float32Array(22 * size * size);
    const global_input = new Float32Array(19);
    this.featurizeToBuffer(board, pla, komi, history, bin_input, global_input, 0, size);
    return { bin_input, global_input };
  }

  private featurizeToBuffer(
    board: GoBoard,
    pla: Sign,
    komi: number,
    history: { color: Sign; x: number; y: number }[],
    bin_input: Float32Array,
    global_input: Float32Array,
    batchIndex: number,
    size: number
  ) {
    const numPlanes = 22;
    const opp: Sign = pla === 1 ? -1 : 1;
    const batchOffset = batchIndex * numPlanes * size * size;

    const set = (c: number, h: number, w: number, val: number) => {
      bin_input[batchOffset + c * size * size + h * size + w] = val;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        set(0, y, x, 1.0); // Ones

        const color = board.get([x, y]);
        if (color === pla) set(1, y, x, 1.0);
        else if (color === opp) set(2, y, x, 1.0);

        if (color !== 0) {
          const libs = board.getLiberties([x, y]).length;
          if (libs === 1) set(3, y, x, 1.0);
          if (libs === 2) set(4, y, x, 1.0);
          if (libs === 3) set(5, y, x, 1.0);
        }
      }
    }

    // Ko
    const koInfo = board._koInfo;
    if (koInfo && koInfo.sign === pla && koInfo.vertex[0] !== -1) {
      set(6, koInfo.vertex[1], koInfo.vertex[0], 1.0);
    }

    // History features (last 5 moves)
    const len = history.length;
    const setHistory = (moveIdx: number, featureIdx: number) => {
      if (len >= moveIdx) {
        const m = history[len - moveIdx];
        if (m.x >= 0 && m.x < size && m.y >= 0 && m.y < size) {
          set(featureIdx, m.y, m.x, 1.0);
        }
      }
    };
    setHistory(1, 9);
    setHistory(2, 10);
    setHistory(3, 11);
    setHistory(4, 12);
    setHistory(5, 13);

    // Global input
    const globalOffset = batchIndex * 19;
    const setGlobal = (idx: number, val: number) => {
      global_input[globalOffset + idx] = val;
    };

    // Pass history
    if (len >= 1 && history[len - 1].x < 0) setGlobal(0, 1.0);
    if (len >= 2 && history[len - 2].x < 0) setGlobal(1, 1.0);
    if (len >= 3 && history[len - 3].x < 0) setGlobal(2, 1.0);
    if (len >= 4 && history[len - 4].x < 0) setGlobal(3, 1.0);
    if (len >= 5 && history[len - 5].x < 0) setGlobal(4, 1.0);

    // Komi
    setGlobal(5, komi / 20.0);
  }

  private async processBatchResults(
    results: ort.InferenceSession.ReturnType,
    plas: Sign[],
    size: number,
    batchSize: number
  ): Promise<AnalysisResult[]> {
    const getData = async (tensor: ort.Tensor): Promise<Float32Array> => {
      if (typeof tensor.getData === 'function') {
        try {
          return (await tensor.getData()) as Float32Array;
        } catch {
          return tensor.data as Float32Array;
        }
      }
      return tensor.data as Float32Array;
    };

    const [policyData, valueData, miscvalueData, ownershipData] = await Promise.all([
      getData(results.policy),
      getData(results.value),
      getData(results.miscvalue),
      results.ownership ? getData(results.ownership) : Promise.resolve(undefined),
    ]);

    this.disposeTensors(results);

    const policyDims = results.policy.dims;
    const numPolicyHeads = policyDims.length === 3 ? Number(policyDims[1]) : 1;
    const numMoves = policyDims.length === 3 ? Number(policyDims[2]) : Number(policyDims[1]);
    const policyStride = numPolicyHeads * numMoves;
    const valueStride = results.value.dims.length > 1 ? Number(results.value.dims[1]) : 3;
    const miscvalueStride =
      results.miscvalue.dims.length > 1 ? Number(results.miscvalue.dims[1]) : 10;
    const ownershipStride = size * size;

    const analysisResults: AnalysisResult[] = [];
    const letters = 'ABCDEFGHJKLMNOPQRST';

    for (let b = 0; b < batchSize; b++) {
      const pla = plas[b];

      // Extract data for this batch item
      const policy = policyData.subarray(b * policyStride, b * policyStride + numMoves);
      const value = valueData.subarray(b * valueStride, (b + 1) * valueStride);
      const miscvalue = miscvalueData.subarray(b * miscvalueStride, (b + 1) * miscvalueStride);
      const ownership = ownershipData
        ? ownershipData.subarray(b * ownershipStride, (b + 1) * ownershipStride)
        : undefined;

      // Win rate from value head (from current player's perspective)
      const expValue = [Math.exp(value[0]), Math.exp(value[1]), Math.exp(value[2])];
      const sumValue = expValue[0] + expValue[1] + expValue[2];
      const winrateCurrentPlayer = expValue[0] / sumValue;

      // Convert to Black's perspective: if Black to play, keep as-is; if White to play, flip
      const blackWinrate = pla === 1 ? winrateCurrentPlayer : 1 - winrateCurrentPlayer;

      // Score values from miscvalue head (from current player's perspective)
      // miscvalue[0] = scoreMean, miscvalue[1] = scoreStdev (pre-softplus), miscvalue[2] = lead
      const leadCurrentPlayer = miscvalue[2] * 20.0;

      // Convert lead to Black's perspective
      const blackLead = leadCurrentPlayer * pla;

      // Policy softmax
      let maxLogit = -Infinity;
      for (let i = 0; i < numMoves; i++) {
        if (policy[i] > maxLogit) maxLogit = policy[i];
      }

      const probs = new Float32Array(numMoves);
      let sumProbs = 0;
      for (let i = 0; i < numMoves; i++) {
        probs[i] = Math.exp(policy[i] - maxLogit);
        sumProbs += probs[i];
      }
      for (let i = 0; i < numMoves; i++) probs[i] /= sumProbs;

      // Top moves
      const indices = Array.from({ length: numMoves }, (_, i) => i);
      indices.sort((a, b) => probs[b] - probs[a]);

      const moveSuggestions: MoveSuggestion[] = [];
      for (let i = 0; i < 10; i++) {
        const idx = indices[i];
        const prob = probs[idx];
        let moveStr = '';

        if (idx === size * size) {
          moveStr = 'PASS';
        } else {
          const y = Math.floor(idx / size);
          const x = idx % size;
          moveStr = `${letters[x]}${size - y}`;
        }

        moveSuggestions.push({ move: moveStr, probability: prob });
      }

      analysisResults.push({
        moveSuggestions,
        // Winrate from Black's perspective
        winRate: blackWinrate,
        // Score lead from Black's perspective (positive = Black ahead)
        scoreLead: blackLead,
        currentTurn: pla === 1 ? 'B' : 'W',
        ownership: ownership ? Array.from(ownership).map(v => v * pla) : undefined,
      });
    }

    return analysisResults;
  }

  private async processResults(
    results: ort.InferenceSession.ReturnType,
    pla: Sign,
    size: number
  ): Promise<AnalysisResult> {
    const batchResults = await this.processBatchResults(results, [pla], size, 1);
    return batchResults[0];
  }

  async dispose(): Promise<void> {
    if (this.session) {
      try {
        // @ts-ignore
        await this.session.release?.();
      } catch {
        // Ignore
      }
      this.session = null;
    }
    await super.dispose();
  }
}
