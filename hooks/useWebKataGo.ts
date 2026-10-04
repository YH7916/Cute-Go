import { useState, useEffect, useRef, useCallback } from 'react';
import { getDefaultKomi } from '../core/go/config';
import { getBeginnerAIMove } from '../core/go/ai';
import { getBoardHash } from '../core/board';
import type { BoardState, Player, BoardSize, Difficulty, GameType, HistoryItem } from '../types';
import { logEvent } from '../utils/logger';
import { AiRequestLifecycle, initialAiState } from './aiRequestLifecycle';
import type { AnalysisResponse } from '../core/inference/protocol';

interface UseWebKataGoProps {
  boardSize: BoardSize;
  onAiMove: (x: number, y: number) => void;
  onAiPass: () => void;
  onAiError?: (error: string) => void;
  onAnalysisComplete?: (data: AnalysisResponse) => void;
}

export const useWebKataGo = (props: UseWebKataGoProps) => {
  const [state, setState] = useState(initialAiState);
  const callbacks = useRef(props);
  callbacks.current = props;
  const lifecycleRef = useRef<AiRequestLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new AiRequestLifecycle({
      createWorker(onMessage, onError) {
        const worker = new Worker(new URL('../worker/ai.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = event => onMessage(event.data);
        worker.onerror = () => onError('AI 线程崩溃或加载失败');
        worker.onmessageerror = () => onError('AI 线程返回的数据无法读取');
        return { postMessage: message => worker.postMessage(message), terminate: () => worker.terminate() };
      },
      initConfig(needModel) {
        const base = new URL('.', window.location.origin + window.location.pathname);
        const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        return {
          modelPath: new URL('models/kata_dynamic.onnx', base).href,
          wasmPath: new URL('wasm/', base).href,
          numThreads: mobile || !window.crossOriginIsolated ? 1 : Math.min(2, navigator.hardwareConcurrency || 2),
          onlyRules: !needModel,
        };
      },
      beginnerMove(data) {
        const last = data.history[data.history.length - 1];
        return getBeginnerAIMove(data.board, data.color, last?.board ? getBoardHash(last.board) : null);
      },
      onState: setState,
      onMove: move => move ? callbacks.current.onAiMove(move.x, move.y) : callbacks.current.onAiPass(),
      onAnalysis: data => callbacks.current.onAnalysisComplete?.(data),
      onError: message => callbacks.current.onAiError?.(message),
      onRequest: () => { void logEvent('ai_request'); },
    });
  }
  const lifecycle = lifecycleRef.current;
  const requestWebAiMove = useCallback((
    board: BoardState, color: Player, history: HistoryItem[], simulations = 45,
    komi = getDefaultKomi(board.length), difficulty: Difficulty = 'Hard', temperature = 0, gameType: GameType = 'Go',
  ) => lifecycle.request({ board, color, history, size: board.length, simulations, komi, difficulty, temperature, gameType, mode: 'play' }), [lifecycle]);
  const requestAnalysis = useCallback((
    board: BoardState, color: Player, history: HistoryItem[], komi = getDefaultKomi(board.length), gameType: GameType = 'Go',
    simulations = 100, purpose?: 'coach',
  ) => lifecycle.request({ board, color, history, size: board.length, simulations, komi, difficulty: 'Hard', temperature: 0, gameType, mode: 'analyze', purpose }), [lifecycle]);

  useEffect(() => {
    const visibilityChanged = () => { if (document.hidden) lifecycle.stopThinking(); };
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => { document.removeEventListener('visibilitychange', visibilityChanged); lifecycle.dispose(); };
  }, [lifecycle]);
  const previousSize = useRef(props.boardSize);
  useEffect(() => {
    if (previousSize.current !== props.boardSize) lifecycle.resetAI();
    previousSize.current = props.boardSize;
  }, [lifecycle, props.boardSize]);

  return { ...state, requestWebAiMove, requestAnalysis, initializeAI: lifecycle.initializeAI,
    stopThinking: lifecycle.stopThinking, resetAI: lifecycle.resetAI, terminateAI: lifecycle.terminateAI };
};
