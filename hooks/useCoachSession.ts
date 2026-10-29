import { useCallback, useEffect, useRef, useState } from 'react';
import { runCoachAgent } from '../agent/coach/client';
import type { CoachAgentResult, CoachConversationTurn, CoachEngineEvidence, CoachIntent } from '../agent/coach/contract';
import { coachPositionKey, coachQuestionPoints } from '../domains/coach/evidence';
import { coachHistoryAnswer, resolveCoachQuestionReferences } from '../domains/coach/conversation';
import { renderCoachReviewSummary } from '../domains/coach/response';
import { getDefaultKomi } from '../core/go/config';
import type { GamePosition, PositionAccess } from '../domains/game/positionState';
import type { CoachConfig } from '../services/coach/types';
import type { Difficulty, Player, Point } from '../types';

interface CoachSessionOptions {
  active: boolean;
  playing?: boolean;
  position: GamePosition;
  readPosition: PositionAccess['readPosition'];
  userColor: Player;
  difficulty?: Difficulty;
  gameOver: boolean;
  config: CoachConfig;
  ownerScopeId?: string;
  conversationRoot?: object;
  analyze?: (position: GamePosition, signal: AbortSignal, focusPoints?: Point[]) => Promise<CoachEngineEvidence | undefined>;
}

interface Answer extends CoachAgentResult {
  position: GamePosition;
  scope: object;
  config: CoachConfig;
  userColor: Player;
  gameOver: boolean;
  referencesReady?: boolean;
}

interface Exchange extends CoachConversationTurn {
  id: number;
  position: GamePosition;
  hintPoints: CoachAgentResult['hintPoints'];
}
const createConversation = (root: object, config: CoachConfig, userColor: Player, ownerScopeId: string) => ({
  root, config, userColor, ownerScopeId, turns: [] as Exchange[],
  replies: new Map<string, { position: GamePosition; result: CoachAgentResult; analyzed: boolean }>(),
});

function followsOpponentReply(before: GamePosition, after: GamePosition, userColor: Player): boolean {
  const reply = after.history.at(-1);
  return before.currentPlayer !== userColor && after.currentPlayer === userColor
    && after.history.length === before.history.length + 1 && reply?.board === before.board
    && reply.currentPlayer === before.currentPlayer
    && before.history.every((entry, index) => after.history[index] === entry);
}

export function useCoachSession({ active, playing = true, position, readPosition, userColor, gameOver, config, analyze,
  ownerScopeId = 'local:guest', conversationRoot, difficulty }: CoachSessionOptions) {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [serviceState, setServiceState] = useState<{ config: CoachConfig; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const askedPosition = useRef<{ position: GamePosition; scope: object } | null>(null);
  const version = useRef(0);
  const root = conversationRoot ?? position.history[0]?.board ?? position.board;
  const scope = useRef(createConversation(root, config, userColor, ownerScopeId));
  if (scope.current.root !== root || scope.current.config !== config || scope.current.userColor !== userColor
    || scope.current.ownerScopeId !== ownerScopeId) scope.current = createConversation(root, config, userColor, ownerScopeId);
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
    // Intermediate AI-turn positions are not a decision point for the learner.
    if (!active || (playing && !gameOver && position.currentPlayer !== userColor)) return cancel;
    const controller = new AbortController();
    requestRef.current = controller;
    const requestVersion = version.current;
    void runCoachAgent({ kind: 'inspect', proactive: true, position, userColor,
      intent: playing ? 'hint' : 'explain-last-move', config }, controller.signal)
      .then(result => {
        if (stillCurrent(requestVersion, controller.signal)) {
          setAnswer(previous => readable(previous) && previous?.text && (previous.position === position || !result.text) ? previous
            : { ...result, hintPoints: result.hintPoints.map(point => ({ ...point })),
              position, scope: currentScope, config, userColor, gameOver, referencesReady: true,
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
  }, [active, playing, position, userColor, gameOver, config, cancel, stillCurrent, currentScope, readable]);

  const ask = useCallback(async (nextIntent: CoachIntent, question?: string, attemptedPoint?: Point, proactive = false) => {
    if (!active || readPosition() !== position) return;
    cancel();
    askedPosition.current = { position, scope: currentScope };
    const controller = new AbortController();
    requestRef.current = controller;
    const requestVersion = version.current;
    const requestScope = scope.current;
    const prompt = question?.trim().slice(0, 500) ?? '';
    const displayed = !loading && answer?.referencesReady && readable(answer) && answer.hintPoints.length ? answer : null;
    const displayedTurn = displayed ? [...requestScope.turns].reverse().find(turn => turn.position === displayed.position
      && turn.answer === displayed.text && turn.hintPoints.length === displayed.hintPoints.length
      && turn.hintPoints.every((point, index) => point.label === displayed.hintPoints[index].label)) ?? {
      positionKey: coachPositionKey(displayed.position, userColor, getDefaultKomi(displayed.position.board.length)),
      question: '当前显示的讲解', answer: displayed.text, hintPoints: displayed.hintPoints,
    } : undefined;
    // Re-displaying a cached or automatic answer changes the visible reference,
    // without duplicating the user's conversation history.
    const referenceHistory = displayedTurn
      ? [...requestScope.turns.filter(turn => turn !== displayedTurn), displayedTurn].slice(-6) : requestScope.turns;
    // Explicit questions send the latest three conversation turns. Their ids
    // distinguish changed context without copying positions or long answers.
    const replyKey = JSON.stringify([nextIntent, prompt, prompt ? requestScope.turns.slice(-3).map(turn => turn.id) : [],
      prompt && displayedTurn ? [displayedTurn.positionKey, displayedTurn.hintPoints.map(point => point.label)] : []]);
    const cached = requestScope.replies.get(replyKey);
    if (!proactive && !attemptedPoint && cached?.position === position && (!analyze || cached.analyzed)) {
      requestScope.replies.delete(replyKey); requestScope.replies.set(replyKey, cached);
      setAnswer({ ...cached.result, hintPoints: cached.result.hintPoints.map(point => ({ ...point })),
        position, scope: requestScope, config, userColor, gameOver, referencesReady: true });
      requestRef.current = null;
      return;
    }
    const current = () => stillCurrent(requestVersion, controller.signal);
    const remember = (result: CoachAgentResult) => {
      if (proactive || !result.text || !current() || scope.current !== requestScope) return;
      const label = question?.trim() || (nextIntent === 'hint' ? '下一步应该观察什么？'
        : nextIntent === 'explain-position' ? '怎么看这个局面？' : nextIntent === 'explain-illegal-move' ? '这里为什么不能下？' : '请讲解这一手。');
      requestScope.turns = [...requestScope.turns, { id: ++exchangeId.current, position,
        positionKey: coachPositionKey(position, userColor, getDefaultKomi(position.board.length)),
        question: label, answer: result.text, hintPoints: result.hintPoints.map(point => ({ ...point })) }].slice(-6);
      refreshConversation(value => value + 1);
    };
    setLoading(true);
    try {
      const input = { position, userColor, difficulty, intent: nextIntent, config, question, proactive,
        history: referenceHistory.map(({ positionKey, question: prompt, answer: text, hintPoints }) => ({
          positionKey, question: prompt, answer: coachHistoryAnswer(text, hintPoints, config.apiKey),
          hintPoints: hintPoints.map(point => ({ ...point })),
        })),
        ...(attemptedPoint ? { attemptedPoint: { ...attemptedPoint } } : {}) };
      const preview = await runCoachAgent({ ...input, kind: 'inspect' }, controller.signal);
      if (!current()) return;
      setAnswer({ ...preview, hintPoints: preview.hintPoints.map(point => ({ ...point })),
        position, scope: requestScope, config, userColor, gameOver,
        referencesReady: nextIntent === 'explain-illegal-move' });
      setServiceState({ config, configured: preview.configured });
      if (proactive && !preview.shouldAutoExplain) return;
      if (nextIntent === 'explain-illegal-move') {
        remember(preview); return;
      }
      let engineEvidence: CoachEngineEvidence | undefined;
      const { references } = resolveCoachQuestionReferences(question ?? '', referenceHistory, position.board.length,
        coachPositionKey(position, userColor, getDefaultKomi(position.board.length)));
      const focusedQuestion = `${question ?? ''} ${references.map(reference => reference.point.label).join(' ')}`;
      try { engineEvidence = await analyze?.(position, controller.signal, coachQuestionPoints(focusedQuestion, position.board.length)); }
      catch { /* Agent can explain the verified rules without engine estimates. */ }
      if (!current()) return;
      const reply = await runCoachAgent({ ...input, engineEvidence, kind: 'ask' }, controller.signal);
      if (current()) {
        // A busy or loading model may recover without changing the board. Do
        // not turn its temporary rule-only fallback into a permanent cache hit.
        if (!proactive && !reply.error && reply.cacheable !== false && reply.text && (!analyze || engineEvidence)) {
          requestScope.replies.set(replyKey, { position, result: reply, analyzed: Boolean(engineEvidence) });
          if (requestScope.replies.size > 8) requestScope.replies.delete(requestScope.replies.keys().next().value!);
        }
        setAnswer(previous => proactive && !reply.text && readable(previous) && previous?.text ? previous
          : { ...reply, hintPoints: reply.hintPoints.map(point => ({ ...point })),
            position, scope: requestScope, config, userColor, gameOver, referencesReady: true });
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
  }, [active, gameOver, readPosition, position, config, userColor, difficulty, analyze, cancel, stillCurrent, readable, currentScope, answer, loading]);

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
      if (version.current === automaticVersion) void ask('hint', undefined, undefined, true);
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
