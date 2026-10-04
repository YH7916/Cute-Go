import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDefaultKomi } from '../core/go/config';
import { getBoardHash } from '../core/board';
import { attemptMove } from '../core/go/rules';
import { recordMove, recordPass, undoPosition, type GamePosition, type PositionAccess } from '../domains/game/positionState';
import { selectReviewPosition } from '../domains/game/reviewPosition';
import type { GameType } from '../types';
import type { useGameState } from './useGameState';
import type { useWebKataGo } from './useWebKataGo';

interface Options {
  gameState: ReturnType<typeof useGameState>;
  gameType: GameType;
  showTerritory: boolean;
  ownerScopeId?: string;
  engine: Pick<ReturnType<typeof useWebKataGo>, 'requestAnalysis' | 'stopThinking' | 'isThinking' | 'aiTerritory'>;
}

interface Variation {
  ownerScopeId: string;
  source: GamePosition;
  cursor: number;
  root: GamePosition;
  position: GamePosition;
}

export function useGameReview({ gameState, gameType, showTerritory, engine, ownerScopeId = 'local:guest' }: Options) {
  const { appMode, reviewIndex, readPosition: readGamePosition } = gameState;
  const current = readGamePosition();
  const selected = useMemo(() => appMode === 'review'
    ? selectReviewPosition(current, reviewIndex) : current,
  [appMode, reviewIndex, current]);
  const [variation, setVariation] = useState<Variation | null>(null);
  const [error, setError] = useState('');
  const variationRef = useRef(variation);
  const valid = appMode === 'review' && variation?.source === current && variation.cursor === reviewIndex
    && variation.ownerScopeId === ownerScopeId;
  const position = valid ? variation.position : selected;
  const latest = useRef({ current, selected, appMode, reviewIndex, ownerScopeId });
  latest.current = { current, selected, appMode, reviewIndex, ownerScopeId };
  const readPosition = useCallback(() => {
    const snapshot = latest.current;
    const live = readGamePosition();
    if (live !== snapshot.current || snapshot.ownerScopeId !== ownerScopeId) return live;
    const branch = variationRef.current;
    return snapshot.appMode === 'review' && branch?.source === live && branch.cursor === snapshot.reviewIndex && branch.ownerScopeId === ownerScopeId
      ? branch.position : snapshot.selected;
  }, [readGamePosition, ownerScopeId]);
  const writePosition = useCallback<PositionAccess['writePosition']>(next => {
    const branch = variationRef.current;
    const snapshot = latest.current;
    if (!branch || branch.ownerScopeId !== ownerScopeId || snapshot.ownerScopeId !== ownerScopeId
      || branch.source !== readGamePosition() || snapshot.appMode !== 'review'
      || branch.cursor !== snapshot.reviewIndex) return;
    const updated = { ...branch, position: typeof next === 'function' ? next(branch.position) : next };
    variationRef.current = updated;
    setVariation(updated);
    setError('');
  }, [readGamePosition, ownerScopeId]);
  const exitVariation = useCallback(() => {
    if (latest.current.ownerScopeId !== ownerScopeId) return;
    variationRef.current = null;
    setVariation(null);
    setError('');
  }, [ownerScopeId]);
  const startVariation = useCallback(() => {
    const snapshot = latest.current;
    if (snapshot.ownerScopeId !== ownerScopeId || snapshot.appMode !== 'review' || snapshot.current !== readGamePosition()) return;
    if (snapshot.selected.consecutivePasses >= 2) {
      setError('这一局已连续停着结束。请先回到终局前的一手，再开始试下。');
      return;
    }
    const branch = { ownerScopeId, source: snapshot.current, cursor: snapshot.reviewIndex,
      root: snapshot.selected, position: snapshot.selected };
    variationRef.current = branch;
    setVariation(branch);
    setError('');
  }, [readGamePosition, ownerScopeId]);
  const inspectPosition = useCallback((snapshot: GamePosition) => {
    if (latest.current.ownerScopeId !== ownerScopeId) return;
    const game = readGamePosition();
    const moveNumber = snapshot.history.length;
    const fromCurrentRecord = snapshot === game || (game.history[moveNumber]?.board === snapshot.board
      && snapshot.history.every((entry, index) => game.history[index] === entry));
    const cursor = fromCurrentRecord ? moveNumber : latest.current.reviewIndex;
    const branch = { ownerScopeId, source: game, cursor, root: snapshot, position: snapshot };
    variationRef.current = branch;
    setVariation(branch);
    gameState.setReviewIndex(cursor);
    gameState.setAppMode('review');
    setError(snapshot.consecutivePasses >= 2 ? '这是已结束的局面，可查看；继续试下请返回终局前。' : '');
  }, [readGamePosition, gameState.setAppMode, gameState.setReviewIndex, ownerScopeId]);
  const playVariation = useCallback((x: number, y: number) => {
    if (latest.current.ownerScopeId !== ownerScopeId) return;
    const branch = variationRef.current;
    if (!branch || readPosition() !== branch.position) return;
    const before = readPosition();
    if (before.consecutivePasses >= 2) { setError('试下已结束，可以悔棋或返回原谱。'); return; }
    const previous = before.history.at(-1);
    const move = attemptMove(before.board, x, y, before.currentPlayer, gameType,
      previous ? getBoardHash(previous.board) : null);
    if (!move) { setError('这里不能落子，请检查占位、禁入点和劫。'); return; }
    writePosition(recordMove(before, move.newBoard, { x, y }, move.captured, false));
  }, [readPosition, writePosition, gameType, ownerScopeId]);
  const passVariation = useCallback(() => {
    if (latest.current.ownerScopeId !== ownerScopeId) return;
    const branch = variationRef.current;
    if (branch && readPosition() === branch.position && branch.position.consecutivePasses < 2) {
      writePosition(recordPass(branch.position));
    }
  }, [readPosition, writePosition, ownerScopeId]);
  const undoVariation = useCallback(() => {
    if (latest.current.ownerScopeId !== ownerScopeId) return;
    const branch = variationRef.current;
    if (branch && readPosition() === branch.position && branch.position.history.length > branch.root.history.length) {
      writePosition(undoPosition(branch.position, 1));
    }
  }, [readPosition, writePosition, ownerScopeId]);
  useEffect(() => { if (!valid && variationRef.current) exitVariation(); }, [valid, exitVariation]);
  const { requestAnalysis, stopThinking } = engine;
  useEffect(() => {
    if (appMode !== 'review' || !showTerritory || gameType !== 'Go') return;
    stopThinking();
    requestAnalysis(position.board, position.currentPlayer, position.history, getDefaultKomi(position.board.length), gameType);
    return stopThinking;
  }, [appMode, showTerritory, gameType, position, requestAnalysis, stopThinking]);

  return { position, readPosition, writePosition, inVariation: Boolean(valid),
    variationMoves: valid ? position.history.length - variation.root.history.length : 0,
    startVariation, inspectPosition, exitVariation, playVariation, passVariation, undoVariation, error,
    territory: engine.isThinking || (variation && variation.ownerScopeId !== ownerScopeId) ? null : engine.aiTerritory };
}
