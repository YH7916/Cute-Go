/**
 * Engine Factory
 *
 * Provides a unified way to create the appropriate AI engine based on the environment:
 * - Tauri Desktop: Uses native ONNX Runtime via TauriEngine (faster)
 * - Web Browser: Uses ONNX Runtime Web via WorkerEngine (WASM/WebGPU)
 *
 * This abstraction allows the UI to be agnostic about which engine is being used.
 */

import { type Engine, type OnnxEngineConfig } from '@kaya/ai-engine';
import { TauriEngine } from '@kaya/ai-engine/tauri-engine';
import { WorkerEngine } from './WorkerEngine';

/**
 * Check if we're in a Tauri environment
 * This is a safe check that works in any context (main thread, workers, etc.)
 */
function isTauriContext(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window !== null &&
      ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
    );
  } catch {
    return false;
  }
}

export interface CreateEngineOptions {
  /** Model buffer (ArrayBuffer) */
  modelBuffer?: ArrayBuffer;

  /** Model file path (for Tauri native) */
  modelPath?: string;

  /** Model ID for caching (for Tauri native) */
  modelId?: string;

  /** Execution provider for native engine ('auto' | 'cpu') */
  executionProvider?: 'auto' | 'cpu';

  /** Path to WASM files (for web) */
  wasmPath?: string;

  /** Execution providers for ONNX Runtime Web */
  executionProviders?: string[];

  /** Number of threads for WASM backend */
  numThreads?: number;

  /** Enable caching */
  enableCache?: boolean;

  /** Maximum moves to suggest */
  maxMoves?: number;

  /** Enable debug logging */
  debug?: boolean;

  /**
   * Force using a specific engine type
   * - 'native': Use TauriEngine (only works in Tauri)
   * - 'web': Use WorkerEngine (works everywhere)
   * - 'auto': Auto-detect based on environment (default)
   */
  engineType?: 'native' | 'web' | 'auto';

  /** Progress callback for native engine model upload (Tauri only) */
  onProgress?: (progress: { stage: string; progress: number; message: string }) => void;
}

/**
 * Create the appropriate AI engine based on environment and options
 *
 * @param options Engine configuration options
 * @param workerFactory Optional factory function to create the Worker (for web engine)
 * @returns Promise that resolves to an initialized Engine
 */
export async function createEngine(
  options: CreateEngineOptions,
  workerFactory?: () => Worker
): Promise<Engine> {
  const engineType = options.engineType ?? 'auto';

  // Determine which engine to use
  const useNative = engineType === 'native' || (engineType === 'auto' && isTauriContext());

  if (useNative) {
    // Use native Tauri engine - dynamically import to avoid loading in workers
    if (!isTauriContext()) {
      throw new Error('TauriEngine is only available in Tauri desktop apps');
    }

    console.log('[createEngine] Using native TauriEngine');

    const engine = new TauriEngine({
      modelBuffer: options.modelBuffer,
      modelPath: options.modelPath,
      modelId: options.modelId,
      executionProvider: options.executionProvider ?? 'auto',
      enableCache: options.enableCache ?? true,
      maxMoves: options.maxMoves ?? 10,
      debug: options.debug,
      onProgress: options.onProgress,
    });

    await engine.initialize();
    return engine;
  } else {
    // Use web worker engine
    if (!workerFactory && !options.modelBuffer) {
      throw new Error('WorkerEngine requires a workerFactory or modelBuffer');
    }

    console.log('[createEngine] Using WorkerEngine (ONNX Runtime Web)');

    // Create worker
    const worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('./ai.worker.js', import.meta.url), { type: 'module' });

    const config: OnnxEngineConfig = {
      modelBuffer: options.modelBuffer,
      wasmPath: options.wasmPath ?? '/wasm/',
      executionProviders: options.executionProviders ?? ['webgpu', 'wasm'],
      numThreads: options.numThreads ?? Math.min(8, navigator.hardwareConcurrency || 4),
      enableCache: options.enableCache ?? true,
      maxMoves: options.maxMoves ?? 10,
      debug: options.debug,
    };

    const engine = new WorkerEngine(worker, config);
    await engine.initialize();
    return engine;
  }
}

/**
 * Check if native engine is available
 */
export function isNativeEngineAvailable(): boolean {
  return isTauriContext();
}

/**
 * Get a description of the current engine type
 */
export function getEngineDescription(): string {
  if (isTauriContext()) {
    return 'Native ONNX Runtime (GPU accelerated)';
  }
  return 'ONNX Runtime Web';
}
