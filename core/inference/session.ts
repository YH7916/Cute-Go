import * as ort from 'onnxruntime-web';

export interface OnnxEngineConfig {
    modelPath: string;
    modelParts?: string[];
    wasmPath?: string;
    numThreads?: number;
    debug?: boolean;
    gpuBackend?: 'webgpu' | 'wasm';
}

export const isMobileDevice = () => typeof navigator !== 'undefined'
    && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// Avoid AbortSignal.throwIfAborted(), which is absent from older Android WebViews.
export function checkModelLoadActive(signal: AbortSignal) {
    if (signal.aborted) throw new Error('Engine initialization aborted');
}

function supportsThreadedSimd(): boolean {
    try {
        if (typeof MessageChannel !== 'undefined') {
            const channel = new MessageChannel();
            try { channel.port1.postMessage(new SharedArrayBuffer(1)); }
            finally { channel.port1.close(); channel.port2.close(); }
        }
        // ORT 1.18.0 wasm-factory.ts capability probes (Microsoft, MIT).
        // We ship vanilla and SIMD-threaded only, so both capabilities are required.
        return WebAssembly.validate(new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 5,
            4, 1, 3, 1, 1, 10, 11, 1, 9, 0, 65, 0, 254, 16, 2, 0, 26, 11,
        ])) && WebAssembly.validate(new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 30, 1, 28, 0, 65, 0,
            253, 15, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 253, 186, 1, 26, 11,
        ]));
    } catch {
        return false;
    }
}

async function loadModelParts(parts: string[], signal: AbortSignal, onProgress?: (msg: string) => void) {
    let completed = 0;
    onProgress?.(`正在下载模型 (0/${parts.length})...`);
    const buffers: (ArrayBuffer | null)[] = await Promise.all(parts.map(async url => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`Failed to fetch model part (${response.status}): ${url}`);
        const buffer = await response.arrayBuffer();
        checkModelLoadActive(signal);
        if (!buffer.byteLength) throw new Error(`Empty model part: ${url}`);
        onProgress?.(`正在下载模型 (${++completed}/${parts.length})...`);
        return buffer;
    }));
    checkModelLoadActive(signal);
    onProgress?.('正在合并模型数据...');
    const merged = new Uint8Array(buffers.reduce((length, buffer) => length + (buffer?.byteLength ?? 0), 0));
    let offset = 0;
    for (let index = 0; index < buffers.length; index++) {
        const buffer = buffers[index];
        if (!buffer) continue;
        merged.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
        buffers[index] = null;
    }
    return merged;
}

// The overloads in ORT 1.18.0 do not accept a string | Uint8Array union.
function createSession(data: string | Uint8Array, options: ort.InferenceSession.SessionOptions) {
    return typeof data === 'string'
        ? ort.InferenceSession.create(data, options)
        : ort.InferenceSession.create(data, options);
}

export async function createEngineSession(
    config: OnnxEngineConfig, signal: AbortSignal, onProgress?: (msg: string) => void,
): Promise<ort.InferenceSession> {
    if (config.wasmPath) {
        const prefix = config.wasmPath.endsWith('/') ? config.wasmPath : `${config.wasmPath}/`;
        const version = encodeURIComponent(ort.env.versions.web ?? ort.env.versions.common);
        ort.env.wasm.wasmPaths = Object.fromEntries(
            ['ort-wasm.wasm', 'ort-wasm-simd-threaded.wasm']
                .map(name => [name, `${prefix}${name}?ort=${version}`]),
        );
    }
    const mobile = isMobileDevice();
    const isolated = typeof self !== 'undefined' && self.crossOriginIsolated === true;
    const canThread = !mobile && isolated && typeof SharedArrayBuffer !== 'undefined' && supportsThreadedSimd();
    const requested = config.numThreads;
    const cores = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1;
    const defaultThreads = Math.min(4, Math.ceil(cores / 2)); // ORT 1.18.0 browser default.
    // Web ORT reads the global flag; intra/interOpNumThreads are native-only options.
    ort.env.wasm.numThreads = canThread
        ? (typeof requested === 'number' && Number.isInteger(requested) && requested > 0 ? requested : defaultThreads)
        : 1;
    // Keep the established mobile/non-isolated vanilla-WASM path. Only vanilla and
    // SIMD-threaded binaries are shipped, so explicitly single-threaded also uses vanilla.
    if (!canThread || ort.env.wasm.numThreads === 1) ort.env.wasm.simd = false;
    // A conservative fallback persists in this Worker; do not request the unshipped
    // non-SIMD threaded binary when the same engine is reinitialized afterwards.
    if (ort.env.wasm.simd === false) ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const backend = config.gpuBackend ?? (mobile ? 'wasm' : 'webgpu');
    const options: ort.InferenceSession.SessionOptions = {
        executionProviders: backend === 'wasm' ? ['wasm'] : [backend, 'wasm'],
        graphOptimizationLevel: mobile ? 'basic' : 'all',
        enableCpuMemArena: true,
        enableMemPattern: true,
        executionMode: 'sequential',
    };
    const data = config.modelParts?.length
        ? await loadModelParts(config.modelParts, signal, onProgress)
        : config.modelPath;
    checkModelLoadActive(signal);
    onProgress?.('正在启动 AI 引擎 (首次需编译，请稍候)...');
    try {
        return await createSession(data, options);
    } catch (error) {
        checkModelLoadActive(signal);
        console.warn(`[OnnxEngine] ${backend} failed; retrying conservative WASM`, error);
        ort.env.wasm.simd = false;
        ort.env.wasm.proxy = false;
        ort.env.wasm.numThreads = 1;
        // Exactly one fallback, with the SAME bytes when a split model was loaded.
        // A failed WASM runtime initialization may still require a fresh Worker.
        return createSession(data, {
            executionProviders: ['wasm'], graphOptimizationLevel: 'disabled',
            enableCpuMemArena: false, enableMemPattern: false, executionMode: 'sequential',
        });
    }
}

export async function releaseSession(session: ort.InferenceSession): Promise<void> {
    try {
        await session.release();
    } catch (error) {
        console.warn('[OnnxEngine] Failed to release session:', error);
    }
}
