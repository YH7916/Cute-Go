import { getDefaultKomi } from '../../core/go/config';
import { buildCoachEvidence, getLocalCoachMessage, shouldExplainCoachPosition } from '../../domains/coach/evidence';
import { explainPosition, explainRejectedMove } from '../../domains/coach/teaching';
import { buildCoachTeachingChoices, renderCoachBoardReferences, renderCoachResponse } from '../../domains/coach/response';
import { buildCompactCoachContext } from '../../domains/coach/context';
import { engineTeachingChoices, verifiedCoachEngine } from './engineEvidence';
import { requestCoachReply } from '../../services/coach/client';
import { validateCoachConfig } from '../../services/coach/settings';
import type { CoachAgentInput, CoachAgentResult } from './contract';

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('讲解已取消', 'AbortError');
}

// This single execution path runs in the teaching Worker and in older browsers
// without module Worker support. It never owns or changes the playing engine.
export async function executeCoachAgent(input: CoachAgentInput, signal?: AbortSignal): Promise<CoachAgentResult> {
  checkCancellation(signal);
  const { position, userColor, intent, config, kind } = input;
  const komi = getDefaultKomi(position.board.length);
  const evidence = buildCoachEvidence(position, userColor, komi);
  const nextTurnHint = input.proactive === true && intent === 'hint';
  // Reassess the board the learner can act on, including a danger that survived
  // an ordinary opponent reply. Never suggest the opponent's legal candidates.
  const shouldAutoExplain = nextTurnHint
    ? evidence.toPlay === userColor && evidence.atariGroups.length > 0 : shouldExplainCoachPosition(evidence);
  const speak = !input.proactive || shouldAutoExplain;
  const engineAnalysis = verifiedCoachEngine(input, komi);
  let configured = false;
  try { validateCoachConfig(config, true); configured = true; } catch { /* Offline teaching stays available. */ }
  if (intent === 'explain-illegal-move') {
    checkCancellation(signal);
    return { ...explainRejectedMove(position, input.attemptedPoint), source: 'local', configured,
      moveNumber: position.history.length, shouldAutoExplain: false };
  }
  let localText = speak ? intent === 'explain-position'
    ? explainPosition(evidence, engineAnalysis?.estimatedBlackLead) : getLocalCoachMessage(evidence, intent) : '';
  // A concrete rule-verified escape/capture teaches more than an unexplained
  // engine suggestion. Keep its marker and reason together.
  if (speak && intent === 'hint' && !evidence.candidates.length && engineAnalysis?.candidates.length) {
    // A queried comparison point may arrive first; requested focus is not a recommendation.
    const recommended = engineAnalysis.candidates.reduce((best, candidate) => candidate.visits > best.visits ? candidate : best);
    localText = `可以试下${recommended.point.label}，比较落子前后的气。`;
  }
  const local: CoachAgentResult = {
    ...renderCoachBoardReferences(localText, position.board.length), source: 'local', configured,
    moveNumber: position.history.length, shouldAutoExplain,
  };
  checkCancellation(signal);
  if (kind === 'inspect' || !configured || !speak) return local;
  const teachingChoices = [...buildCoachTeachingChoices(evidence, { text: localText }), ...engineTeachingChoices(engineAnalysis)]
    .filter(choice => !nextTurnHint || choice.id !== 'last-action');
  const maxParts = input.question?.trim() ? 3 : 1;
  try {
    const context = buildCompactCoachContext({ evidence, choices: teachingChoices, question: input.question,
      history: input.history, secret: config.apiKey, difficulty: input.difficulty, engineAnalysis,
      proactive: input.proactive, intent, hintPoints: local.hintPoints });
    const reply = await requestCoachReply({
      config, evidence: context.payload,
      question: input.question?.trim().slice(0, 500) || (intent === 'explain-position'
        ? '只讲当前最需要理解的一点及原因。' : intent === 'hint'
        ? '给一个下一步观察重点，说明为什么。' : '解释上一手的关键变化及原因。'),
      signal,
    });
    checkCancellation(signal);
    const rendered = renderCoachResponse(reply.text, context.choices, input.proactive === true, position.board.length, maxParts);
    if (!rendered) return { ...local, cacheable: false };
    if (rendered.kind === 'silent') return { ...local, text: '', hintPoints: [], source: 'cloud', shouldAutoExplain: false };
    return { ...local, text: rendered.text, hintPoints: rendered.kind === 'explain' ? rendered.hintPoints : [], source: 'cloud' };
  } catch (error) {
    checkCancellation(signal);
    return { ...local, error: error instanceof Error ? error.message : '讲解暂时不可用，仍可继续下棋。' };
  }
}
