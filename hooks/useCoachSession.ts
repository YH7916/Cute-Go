import { useCallback, useEffect, useRef, useState } from 'react';
import { runCoachAgent } from '../agent/coach/client';
import type { CoachAgentResult, CoachConversationTurn, CoachEngineEvidence, CoachIntent } from '../agent/coach/contract';
import { coachPositionKey } from '../domains/coach/evidence';
import { renderCoachReviewSummary } from '../domains/coach/response';
import { getDefaultKomi } from '../core/go/config';
import type { GamePosition, PositionAccess } from '../domains/game/positionState';
import type { CoachConfig } from '../services/coach/types';
import type { Player, Point } from '../types';

interface CoachSessionOptions {
  active: boolean;
  playing?: boolean;
  position: GamePosition;
  readPosition: PositionAccess['readPosition'];
  userColor: Player;
  gameOver: boolean;
  config: CoachConfig;
  ownerScopeId?: string;
  conversationRoot?: object;
  analyze?: (position: GamePosition, signal: AbortSignal) => Promise<CoachEngineEvidence | undefined>;
}

interface Answer extends CoachAgentResult {
  position: GamePosition;
  scope: object;
  config: CoachConfig;
  userColor: Player;
  gameOver: boolean;
}

interface Exchange extends CoachConversationTurn {
  id: number;
  position: GamePosition;
}

function followsOpponentReply(before: GamePosition, after: GamePosition, userColor: Player): boolean {
  const reply = after.history.at(-1);
  return before.currentPlayer !== userColor && after.currentPlayer === userColor
    && after.history.length === before.history.length + 1 && reply?.board === before.board
    && reply.currentPlayer === before.currentPlayer
    && before.history.every((entry, index) => after.history[index] === entry);
}

export function useCoachSession({ active, playing = true, position, readPosition, userColor, gameOver, config, analyze,
  ownerScopeId = 'local:guest', conversationRoot }: CoachSessionOptions) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [serviceState, setServiceState] = useState<{ config: CoachConfig; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const askedPosition = useRef<{ position: GamePosition; scope: object } | null>(null);
  const version = useRef(0);
  const root = conversationRoot ?? position.history[0]?.board ?? position.board;
  const scope = useRef({ root, config, userColor, ownerScopeId, turns: [] as Exchange[] });
  if (scope.current.root !== root || scope.current.config !== config || scope.current.userColor !== userColor
    || scope.current.ownerScopeId !== ownerScopeId) scope.current = { root, config, userColor, ownerScopeId, turns: [] };
  const currentScope = scope.current;
  const [, refreshConversation] = useState(0);
  const exchangeId = useRef(0);
  const latest = useRef({ active, playing, position, config, gameOver, userColor, ownerScopeId });
  latest.current = { active, playing, position, config, gameOver, userColor, ownerScopeId };

  const cancel = useCallback(() => {
    version.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setLoading(false);
  }, []);

  const stillCurrent = useCallback((requestVersion: number, signal: AbortSignal) =>
    !signal.aborted && requestVersion === version.current && latest.current.active
      && scope.current === currentScope && latest.current.playing === playing
      && latest.current.gameOver === gameOver && latest.current.config === config
      && latest.current.userColor === userColor && latest.current.ownerScopeId === ownerScopeId && readPosition() === position,
  [playing, gameOver, config, userColor, ownerScopeId, readPosition, position, currentScope]);

  // Keep an already published lesson for the learner's next turn, never a late reply.
  const readable = useCallback((value: Answer | null) => Boolean(active && value?.scope === currentScope
    && value.gameOver === gameOver && (value.position === position
      || (playing && !gameOver && value.text && followsOpponentReply(value.position, position, userColor)))),
  [active, playing, currentScope, gameOver, position, userColor]);

  // Position identity also invalidates identical-looking resets and imports.
  // Inspect is local-only: entering or updating a board never spends API credit.
  useEffect(() => {
    cancel();
    setAnswer(previous => readable(previous) ? previous : null);
    if (!active) return cancel;
    const controller = new AbortController();
    requestRef.current = controller;
    const requestVersion = version.current;
    void runCoachAgent({ kind: 'inspect', proactive: true, position, userColor, intent: 'explain-last-move', config }, controller.signal)
      .then(result => {
        if (stillCurrent(requestVersion, controller.signal)) {
          setAnswer(previous => readable(previous) && previous?.text && (previous.position === position || !result.text) ? previous
            : { ...result, position, scope: currentScope, config, userColor, gameOver,
              ...(gameOver ? { text: '', hintPoints: [], shouldAutoExplain: false } : {}) });
          setServiceState({ config, configured: result.configured });
        }
      }).catch(() => {
        if (stillCurrent(requestVersion, controller.signal)) {
          setAnswer(previous => readable(previous) && previous?.text ? previous : {
            position, scope: currentScope, config, userColor, gameOver, text: '', source: 'local', configured: false,
            hintPoints: [], moveNumber: position.history.length, error: '陪练暂时不可用，仍可继续下棋。' });
        }
      }).finally(() => {
        if (stillCurrent(requestVersion, controller.signal)) requestRef.current = null;
      });
    return cancel;
  }, [active, position, userColor, gameOver, config, cancel, stillCurrent, currentScope, readable]);

  const ask = useCallback(async (nextIntent: CoachIntent, question?: string, attemptedPoint?: Point, proactive = false) => {
    if (!active || readPosition() !== position) return;
    cancel();
    askedPosition.current = { position, scope: currentScope };
    const controller = new AbortController();
    requestRef.current = controller;
    const requestVersion = version.current;
    const requestScope = scope.current;
    const current = () => stillCurrent(requestVersion, controller.signal);
    const remember = (result: CoachAgentResult) => {
      if (proactive || !result.text || !current() || scope.current !== requestScope) return;
      const label = question?.trim() || (nextIntent === 'hint' ? '下一步应该观察什么？'
        : nextIntent === 'explain-position' ? '怎么看这个局面？' : nextIntent === 'explain-illegal-move' ? '这里为什么不能下？' : '请讲解这一手。');
      requestScope.turns = [...requestScope.turns, { id: ++exchangeId.current, position,
        positionKey: coachPositionKey(position, userColor, getDefaultKomi(position.board.length)),
        question: label, answer: result.text }].slice(-6);
      refreshConversation(value => value + 1);
    };
    setLoading(true);
    try {
      const input = { position, userColor, intent: nextIntent, config, question, proactive,
        history: requestScope.turns.map(({ positionKey, question: prompt, answer: text }) => ({ positionKey, question: prompt, answer: text })),
        ...(attemptedPoint ? { attemptedPoint: { ...attemptedPoint } } : {}) };
      const preview = await runCoachAgent({ ...input, kind: 'inspect' }, controller.signal);
      if (!current()) return;
      setAnswer({ ...preview, position, scope: requestScope, config, userColor, gameOver });
      setServiceState({ config, configured: preview.configured });
      if (proactive && !preview.shouldAutoExplain) return;
      if (nextIntent === 'explain-illegal-move' || (!preview.configured && nextIntent !== 'explain-position')) {
        remember(preview); return;
      }
      let engineEvidence: CoachEngineEvidence | undefined;
      try { engineEvidence = await analyze?.(position, controller.signal); }
      catch { /* Agent can explain the verified rules without engine estimates. */ }
      if (!current()) return;
      const reply = await runCoachAgent({ ...input, engineEvidence, kind: 'ask' }, controller.signal);
      if (current()) {
        setAnswer(previous => proactive && !reply.text && readable(previous) && previous?.text ? previous
          : { ...reply, position, scope: requestScope, config, userColor, gameOver });
        setServiceState({ config, configured: reply.configured });
        remember(reply);
      }
    } catch {
      if (current()) setAnswer(previous => ({
        ...(previous?.position === position && previous.config === config && previous.userColor === userColor
          && previous.gameOver === gameOver ? previous : {
            position, scope: requestScope, config, userColor, gameOver, text: '', source: 'local' as const, configured: false,
            hintPoints: [], moveNumber: position.history.length,
          }),
        error: '陪练暂时不可用，仍可继续下棋。',
      }));
    } finally {
      if (current()) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }, [active, gameOver, readPosition, position, config, userColor, analyze, cancel, stillCurrent, readable, currentScope]);

  const explainIllegalMove = useCallback((point: Point, attemptedPosition: GamePosition) => {
    if (!active || attemptedPosition !== position || readPosition() !== attemptedPosition) return Promise.resolve();
    return ask('explain-illegal-move', undefined, point);
  }, [active, gameOver, position, readPosition, ask]);

  const visibleAnswer = readable(answer) ? answer : null;
  const currentAnswer = visibleAnswer?.position === position ? visibleAnswer : null;
  // Service availability belongs to the configuration, not each new board.
  const configured = serviceState?.config === config && serviceState.configured;
  const shouldAutoExplain = currentAnswer?.shouldAutoExplain === true;

  useEffect(() => {
    if (!playing || !shouldAutoExplain || !configured || !active || gameOver
      || (askedPosition.current?.position === position && askedPosition.current.scope === currentScope)
      || position.currentPlayer !== userColor || !position.history.length) return;
    const automaticVersion = version.current;
    const timer = setTimeout(() => {
      if (version.current === automaticVersion) void ask('explain-last-move', undefined, undefined, true);
    }, 700);
    return () => clearTimeout(timer);
  }, [playing, shouldAutoExplain, configured, active, gameOver, position, userColor, ask, currentScope]);

  const reviewSummary = !playing && visibleAnswer
    ? renderCoachReviewSummary(visibleAnswer.text, visibleAnswer.hintPoints, position.board.length) : null;

  return {
    active, loading, cancel,
    text: reviewSummary?.text ?? visibleAnswer?.text ?? '',
    source: visibleAnswer?.source ?? 'local',
    error: visibleAnswer?.error,
    configured,
    ask, explainIllegalMove,
    hintPoints: currentAnswer ? reviewSummary?.hintPoints ?? currentAnswer.hintPoints : [],
    previousPosition: visibleAnswer && !currentAnswer ? visibleAnswer.position : undefined,
    moveNumber: visibleAnswer?.moveNumber ?? position.history.length,
    conversation: scope.current.turns,
  };
}
