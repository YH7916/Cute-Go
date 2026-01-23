/**
 * AI Engine Context
 *
 * Manages the AI engine singleton lifecycle, independent of analysis mode.
 * The engine is initialized when a model is loaded and ready, not when analysis is enabled.
 * This separation allows features like "Suggest Move" to use the engine without
 * triggering analysis behavior (cache updates, win rate graph, overlays).
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { Engine } from '@kaya/ai-engine';
import { useGameTree } from './GameTreeContext';
import { isTauriApp } from '../services/fileSave';
import { loadModelData } from '../services/modelStorage';
import { createEngine, type CreateEngineOptions } from '../workers/engineFactory';

// Global state for singleton engine management
let globalEngineInstance: Engine | null = null;
let globalEnginePromise: Promise<Engine> | null = null;
let globalEngineConfig: { modelName: string; backend: string } | null = null;

export interface AIEngineContextValue {
  /** The AI engine instance, or null if not initialized */
  engine: Engine | null;
  /** Whether the engine is ready to use */
  isEngineReady: boolean;
  /** Whether the engine is currently initializing */
  isInitializing: boolean;
  /** Error message if engine initialization failed */
  error: string | null;
  /** Progress info for native engine upload (Tauri only) */
  nativeUploadProgress: { stage: string; progress: number; message: string } | null;
  /** Message about backend fallback (e.g., WebGPU -> WASM) */
  backendFallbackMessage: string | null;
  /** Manually trigger engine initialization (useful if model wasn't loaded on mount) */
  initializeEngine: () => void;
  /** Dispose the engine and reset state */
  disposeEngine: () => Promise<void>;
}

const AIEngineContext = createContext<AIEngineContextValue | null>(null);

export function useAIEngine(): AIEngineContextValue {
  const context = useContext(AIEngineContext);
  if (!context) {
    throw new Error('useAIEngine must be used within an AIEngineProvider');
  }
  return context;
}

/**
 * Try to use the existing engine context if available (doesn't throw)
 * Useful for optional engine access in components that may be outside provider
 */
export function useAIEngineOptional(): AIEngineContextValue | null {
  return useContext(AIEngineContext);
}

export const AIEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { customAIModel, isModelLoaded, aiSettings, setAISettings, setAIConfigOpen } =
    useGameTree();

  const [engine, setEngine] = useState<Engine | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendFallbackMessage, setBackendFallbackMessage] = useState<string | null>(null);
  const [nativeUploadProgress, setNativeUploadProgress] = useState<{
    stage: string;
    progress: number;
    message: string;
  } | null>(null);

  // Track if initialization is triggered to avoid duplicate requests
  const initializationTriggeredRef = useRef(false);

  // Dispose the current engine instance
  const disposeEngine = useCallback(async () => {
    if (globalEngineInstance) {
      try {
        await globalEngineInstance.dispose();
      } catch (err) {
        console.error('[AIEngine] Failed to dispose engine:', err);
      }
      globalEngineInstance = null;
      globalEnginePromise = null;
      globalEngineConfig = null;
    }
    setEngine(null);
    setError(null);
  }, []);

  // Initialize or reuse the engine
  const initializeEngine = useCallback(async () => {
    // Check if we can reuse the existing global instance
    const currentConfig = {
      modelName: customAIModel?.name || 'default',
      backend: aiSettings.backend,
    };

    const configChanged =
      !globalEngineConfig ||
      globalEngineConfig.modelName !== currentConfig.modelName ||
      globalEngineConfig.backend !== currentConfig.backend;

    // Reuse existing instance if config matches
    if (globalEngineInstance && !configChanged) {
      setEngine(globalEngineInstance);
      setError(null);
      return;
    }

    // Need model to be loaded
    if (!isModelLoaded || !customAIModel) {
      // Open config dialog to prompt download
      setAIConfigOpen(true);
      return;
    }

    // Avoid duplicate initialization
    if (initializationTriggeredRef.current && globalEnginePromise) {
      // Wait for existing promise
      try {
        const existingEngine = await globalEnginePromise;
        setEngine(existingEngine);
        setError(null);
      } catch {
        // Error will be handled by the original initialization
      }
      return;
    }

    initializationTriggeredRef.current = true;
    setIsInitializing(true);
    setError(null);

    try {
      // Dispose existing if config changed
      if (globalEngineInstance && configChanged) {
        await globalEngineInstance.dispose();
        globalEngineInstance = null;
        globalEnginePromise = null;
      }

      if (!globalEnginePromise) {
        globalEnginePromise = (async () => {
          let buffer: ArrayBuffer;
          const modelData = customAIModel.data;

          if (modelData instanceof File) {
            buffer = await modelData.arrayBuffer();
          } else if (modelData instanceof ArrayBuffer) {
            buffer = modelData;
          } else if (typeof modelData === 'string') {
            const storedData = await loadModelData(modelData);
            if (!storedData) {
              throw new Error(`Model not found in storage: ${modelData}`);
            }
            buffer = storedData;
          } else {
            throw new Error('Invalid model data type');
          }

          const isTauri = isTauriApp();

          // Determine engine type based on backend setting
          let engineType: CreateEngineOptions['engineType'] = 'web';
          if (isTauri && (aiSettings.backend === 'native' || aiSettings.backend === 'native-cpu')) {
            engineType = 'native';
          }

          // Compute WASM path for web engine
          // @ts-ignore
          const envPrefix = (import.meta as any).env?.VITE_ASSET_PREFIX;
          let wasmPath: string;
          if (isTauri) {
            wasmPath = '/wasm/';
          } else if (envPrefix && envPrefix !== '/') {
            wasmPath = envPrefix.endsWith('/') ? `${envPrefix}wasm/` : `${envPrefix}/wasm/`;
          } else {
            wasmPath = new URL('wasm/', document.baseURI || window.location.href).href;
          }

          // Determine execution providers for web engine
          let executionProviders: string[];
          if (aiSettings.backend === 'webgpu') {
            executionProviders = ['webgpu', 'wasm'];
          } else {
            executionProviders = ['wasm'];
          }

          const newEngine = await createEngine(
            {
              modelBuffer: buffer,
              modelId: customAIModel?.name?.replace(/[^a-zA-Z0-9-_]/g, '_') ?? 'default',
              executionProvider: aiSettings.backend === 'native-cpu' ? 'cpu' : 'auto',
              engineType,
              wasmPath,
              executionProviders,
              maxMoves: 10,
              enableCache: true,
              numThreads: Math.min(8, navigator.hardwareConcurrency || 4),
              onProgress: progress => {
                setNativeUploadProgress({
                  stage: progress.stage,
                  progress: progress.progress,
                  message: progress.message,
                });
              },
            },
            () =>
              new Worker(new URL('../workers/ai.worker.js', import.meta.url), {
                type: 'module',
              })
          );

          setNativeUploadProgress(null);
          return newEngine;
        })();
      }

      const newEngine = await globalEnginePromise;
      globalEngineInstance = newEngine;
      globalEngineConfig = currentConfig;

      // Check if engine fell back to a different backend
      const runtimeInfo = newEngine.getRuntimeInfo();
      if (runtimeInfo.didFallback && runtimeInfo.requestedBackend) {
        const actualBackend = runtimeInfo.backend;
        const requestedBackend = runtimeInfo.requestedBackend;

        console.log(`[AIEngine] Backend fallback: ${requestedBackend} -> ${actualBackend}`);

        // Update settings to the actually working backend
        setAISettings({ backend: actualBackend as any });
        setBackendFallbackMessage(
          `Backend switched from ${requestedBackend.toUpperCase()} to ${actualBackend.toUpperCase()} for compatibility.`
        );
        // Clear message after 5 seconds
        setTimeout(() => setBackendFallbackMessage(null), 5000);
      }

      setEngine(newEngine);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to initialize AI engine: ${message}`);
      console.error('[AIEngine] Initialization failed:', err);
      globalEnginePromise = null;
      globalEngineConfig = null;
    } finally {
      setIsInitializing(false);
      initializationTriggeredRef.current = false;
    }
  }, [customAIModel, isModelLoaded, aiSettings.backend, setAIConfigOpen, setAISettings]);

  // Auto-initialize when model becomes available
  useEffect(() => {
    if (isModelLoaded && customAIModel && !engine && !isInitializing && !error) {
      initializeEngine();
    }
  }, [isModelLoaded, customAIModel, engine, isInitializing, error, initializeEngine]);

  // Re-initialize when backend changes (if we already have an engine)
  useEffect(() => {
    if (engine && globalEngineConfig) {
      const currentBackend = aiSettings.backend;
      if (globalEngineConfig.backend !== currentBackend) {
        initializeEngine();
      }
    }
  }, [aiSettings.backend, engine, initializeEngine]);

  const value: AIEngineContextValue = {
    engine,
    isEngineReady: engine !== null,
    isInitializing,
    error,
    nativeUploadProgress,
    backendFallbackMessage,
    initializeEngine,
    disposeEngine,
  };

  return <AIEngineContext.Provider value={value}>{children}</AIEngineContext.Provider>;
};
