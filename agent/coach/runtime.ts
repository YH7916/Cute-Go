import { getDefaultKomi } from '../../core/go/config';
import { getBoardHash } from '../../core/board';
import { attemptMove } from '../../core/go/rules';
import { buildCoachEvidence, coachPositionKey, getLocalCoachMessage, labelCoachPoint, shouldExplainCoachPosition, type CoachPoint } from '../../domains/coach/evidence';
import { explainPosition, explainRejectedMove } from '../../domains/coach/teaching';
import { buildCoachTeachingChoices, renderCoachBoardReferences, renderCoachResponse } from '../../domains/coach/response';
import { coachConversationContext } from '../../domains/coach/conversation';
import { requestCoachReply } from '../../services/coach/client';
import { validateCoachConfig } from '../../services/coach/settings';
import type { CoachAgentInput, CoachAgentResult } from './contract';

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('讲解已取消', 'AbortError');
}

function verifiedEngine(input: CoachAgentInput, komi: number) {
  const engine = input.engineEvidence;
  const { position } = input;
  if (!engine || engine.source !== 'local-katago' || engine.perspective !== 'black'
    || engine.positionKey !== coachPositionKey(position, position.currentPlayer, komi)
    || !Number.isSafeInteger(engine.visits) || engine.visits < 1 || engine.visits > 32
    || !Array.isArray(engine.candidates)) return undefined;
  const candidates: { point: CoachPoint; visits: number }[] = [];
  const size = position.board.length;
  const previous = position.history[position.history.length - 1];
  const previousHash = previous ? getBoardHash(previous.board) : null;
  // Never trust a suggested coordinate, even when it came from our own engine.
  for (const candidate of engine.candidates.slice(0, 32)) {
    const point = candidate?.point;
    if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)
      || point.x < 0 || point.y < 0 || point.x >= size || point.y >= size
      || !Number.isSafeInteger(candidate.visits) || candidate.visits < 0 || candidate.visits > engine.visits
      || candidates.some(item => item.point.x === point.x && item.point.y === point.y)
      || !attemptMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash)) continue;
    candidates.push({ point: labelCoachPoint(point, size), visits: candidate.visits });
    if (candidates.length === 3) break;
  }
  const winRateBlack = typeof engine.winRateBlack === 'number' && Number.isFinite(engine.winRateBlack)
    && engine.winRateBlack >= 0 && engine.winRateBlack <= 100 ? engine.winRateBlack : undefined;
  const estimatedBlackLead = typeof engine.estimatedBlackLead === 'number' && Number.isFinite(engine.estimatedBlackLead)
    ? engine.estimatedBlackLead : undefined;
  return { source: engine.source, perspective: engine.perspective, visits: engine.visits,
    ...(winRateBlack !== undefined ? { winRateBlack } : {}),
    ...(estimatedBlackLead !== undefined ? { estimatedBlackLead } : {}), candidates,
    limits: ['少量搜索给出的候选与估计，不证明某手最优或后续死活。', 'estimatedBlackLead 是本程序规则的软估计，不是官方 scoreLead 或终局分数。'] };
}

// This single execution path runs in the teaching Worker and in older browsers
// without module Worker support. It never owns or changes the playing engine.
export async function executeCoachAgent(input: CoachAgentInput, signal?: AbortSignal): Promise<CoachAgentResult> {
  checkCancellation(signal);
  const { position, userColor, intent, config, kind } = input;
  const komi = getDefaultKomi(position.board.length);
  const evidence = buildCoachEvidence(position, userColor, komi);
  const shouldAutoExplain = shouldExplainCoachPosition(evidence);
  const speak = !input.proactive || shouldAutoExplain;
  const engineAnalysis = verifiedEngine(input, komi);
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
    localText = `先看 ${engineAnalysis.candidates[0].point.label}：落下后，这块棋还能向哪些空点伸出去？先找出口，再决定要不要走。`;
  }
  const local: CoachAgentResult = {
    ...renderCoachBoardReferences(localText, position.board.length), source: 'local', configured,
    moveNumber: position.history.length, shouldAutoExplain,
  };
  checkCancellation(signal);
  if (kind === 'inspect' || !configured || !speak) return local;
  const teachingChoices = buildCoachTeachingChoices(evidence, { text: localText });
  try {
    const reply = await requestCoachReply({
      config, evidence: { ...Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'positionKey')),
        // Labels already identify points; avoid repeating x/y in every group and
        // liberty so full boards still leave room for the six-turn conversation.
        groups: evidence.groups.map(group => ({ color: group.color,
          stones: group.stones.map(point => point.label), liberties: group.liberties.map(point => point.label) })),
        atariGroups: evidence.atariGroups.map(group => group.stones[0].label),
        ...(engineAnalysis ? { engineAnalysis } : {}),
        teachingRequest: { proactive: input.proactive === true, intent },
        teachingChoices: teachingChoices.map(({ id, kind: choiceKind, variants }) => ({ id, kind: choiceKind, variants })),
        conversation: coachConversationContext(input.history, evidence.positionKey, config.apiKey),
        boardGuide: {
          ...(evidence.lastAction.kind === 'move'
            ? { lastMove: { marker: 'red-dot', point: evidence.lastAction.point } } : {}),
          markers: local.hintPoints.map((point, index) => ({ number: local.hintPoints.length > 1 ? index + 1 : null, point })),
        },
      },
      question: input.question?.trim().slice(0, 500) || (intent === 'explain-position'
        ? '讲清当前最需要理解的一点：有紧急弱棋先照顾它；否则，上一手有经证据确认的提子、解围、连接或停着时，解释这次变化的原因；没有这类变化，再讲当前开局发展或双方围空。若有当前局面引擎软估计，只说粗略方向并按执子说明你与对手；没有估计就不判断谁领先，不报精确目数或终局结论。不要逐手复述或拼接重复解释。'
        : intent === 'hint'
        ? '给零基础玩家一个接下来可以观察的重点，说明为什么；只提出证据支持的观察或落点，不声称最优，不重复解释引擎限制。'
        : '像老师一样挑出上一手最值得理解的一个变化，说清为什么，再指出下一步该观察什么。不复述落子或提子结果，不硬凑教学点；主动提醒若没有新见解可以保持安静，手动询问则简短回应。'),
      signal,
    });
    checkCancellation(signal);
    const rendered = renderCoachResponse(reply.text, teachingChoices, input.proactive === true, position.board.length);
    if (!rendered) return { ...local, error: '讲解内容未通过校验，已保留本地提示。' };
    if (rendered.kind === 'silent') return { ...local, text: '', hintPoints: [], source: 'cloud', shouldAutoExplain: false };
    return { ...local, text: rendered.text, hintPoints: rendered.kind === 'explain' ? rendered.hintPoints : [], source: 'cloud' };
  } catch (error) {
    checkCancellation(signal);
    return { ...local, error: error instanceof Error ? error.message : '讲解暂时不可用，仍可继续下棋。' };
  }
}
