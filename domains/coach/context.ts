import type { Difficulty } from '../../types';
import { coachConversationContext, COACH_HISTORY_ANSWER_LIMIT, resolveCoachQuestionReferences, type CoachConversationTurn } from './conversation';
import type { CoachEvidence, CoachGroup, CoachIntent, CoachPoint } from './evidence';
import { getCoachResponseLimits, type CoachTeachingChoice } from './response';

export interface CompactCoachContextInput {
  evidence: CoachEvidence;
  choices: CoachTeachingChoice[];
  question?: string;
  history?: CoachConversationTurn[];
  secret?: string;
  difficulty?: Difficulty;
  // Already validated against the complete request position by the agent.
  engineAnalysis?: unknown;
  proactive?: boolean;
  intent: CoachIntent;
  hintPoints: CoachPoint[];
}

const MAX_CONTEXT_CHARS = 6000;
const MAX_CHOICES = 12;
const coordinates = (text: string): string[] => [...new Set(
  Array.from(text.toUpperCase().matchAll(/\b([A-HJ-Z][1-9]\d?)\b/g), match => match[1]),
)];

function relevantGroups(evidence: CoachEvidence, question: string, hintPoints: CoachPoint[]) {
  const asked = new Set(coordinates(question).slice(0, 3));
  if (!asked.size && /这[颗块]|这.*棋|几口气|多少.*气/.test(question)) {
    const blackOnly = question.includes('黑棋') && !question.includes('白棋');
    const whiteOnly = question.includes('白棋') && !question.includes('黑棋');
    const matching = evidence.groups.filter(group => !blackOnly && !whiteOnly
      || group.color === (blackOnly ? 'black' : 'white'));
    // Resolve a demonstrative only when the specified color has one group.
    if (matching.length === 1) asked.add(matching[0].stones[0].label);
  }
  const focused = new Set([...hintPoints.map(point => point.label),
    ...evidence.candidates.map(candidate => candidate.point.label)]);
  const lastPoint = evidence.lastAction.kind === 'move' ? evidence.lastAction.point.label : undefined;
  const rank = (group: CoachGroup) => group.stones.some(point => asked.has(point.label)) ? 5
    : group.liberties.some(point => asked.has(point.label)) ? 4
    : group.liberties.length === 1 ? 3
    : group.stones.some(point => point.label === lastPoint) ? 2
    : [...group.stones, ...group.liberties].some(point => focused.has(point.label)) ? 1 : 0;
  return evidence.groups.map(group => ({ group, priority: rank(group) }))
    .filter(item => item.priority > 0).sort((a, b) => b.priority - a.priority).slice(0, 6)
    .map(({ group, priority }) => ({ group, priority, context: {
      anchor: group.stones[0].label, color: group.color, stoneCount: group.stones.length,
      libertyCount: group.liberties.length,
      // Examples are explicitly partial; counts always describe the full group.
      libertyExamples: [...group.liberties.filter(point => asked.has(point.label)),
        ...group.liberties.filter(point => !asked.has(point.label))].slice(0, 6).map(point => point.label),
      focusPoints: group.stones.filter(point => asked.has(point.label)).map(point => point.label),
    } }));
}

function relevantConcepts(choices: CoachTeachingChoice[], question: string, directOnly = false) {
  const normalized = question.replaceAll('双眼', '两眼');
  const preferred = new Set(([
    [/气|数气/, 'liberties'], [/连接|断开|斜/, 'connection'], [/提子|吃子|提走|吃掉/, 'capture'],
    [/自杀|禁入|无气/, 'suicide'], [/劫/, 'ko'], [/停着|虚手/, 'pass'],
    [/数地|算分|计分|贴目|围地|领地/, 'territory'], [/打吃|解围/, 'atari'],
    [/开局|角部|从哪里下/, 'opening'], [/试下|读棋|推演/, 'reading'],
  ] as const).filter(([pattern]) => pattern.test(normalized)).map(([, id]) => `concept.${id}`));
  if (directOnly) return choices.filter(choice => preferred.has(choice.id));
  const terms = ['假眼', '真眼', '两眼', '眼位', '做眼', '做活', '死活', '活棋', '劫', '打吃', '解围',
    '气', '提子', '吃子', '自杀', '禁入', '连接', '断开', '斜', '停着', '虚手', '贴目', '计分',
    '围地', '围空', '领地', '开局', '角', '征子', '倒扑', '双打吃', '对杀', '移动', '挪动', '轮流', '交叉点', '格子'];
  const matched = terms.filter(term => normalized.includes(term));
  // Synonyms retrieve authored concepts, never infer a verdict on this board.
  if (/眼|做活|死活|活棋/.test(normalized)) matched.push('眼');
  if (/吃子/.test(normalized)) matched.push('提子');
  if (/自杀|禁入/.test(normalized)) matched.push('无气');
  if (/虚手/.test(normalized)) matched.push('停着');
  if (/断开/.test(normalized)) matched.push('连接');
  if (/挪|移动/.test(normalized)) matched.push('移动', '交叉点');
  if (/数地|算分|棋子.*分/.test(normalized)) matched.push('数目法', '盘上棋子', '计分');
  return choices.filter(choice => choice.kind !== 'position').map(choice => ({ choice,
    score: matched.reduce((score, term) => score + (choice.variants.join('').includes(term) ? term.length ** 2 : 0),
      preferred.has(choice.id) ? 100 : 0),
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(item => item.choice);
}

function compactLastAction(action: CoachEvidence['lastAction']) {
  if (action.kind !== 'move') return action;
  return { kind: action.kind, color: action.color, globalMoveNumber: action.globalMoveNumber,
    point: action.point.label, location: action.location, capturedCount: action.captured.length,
    capturedExamples: action.captured.slice(0, 6).map(point => point.label), libertiesAfter: action.libertiesAfter,
    effects: { ...action.effects, pressuredGroups: action.effects.pressuredGroups.map(group => ({
      point: group.point.label, libertiesBefore: group.libertiesBefore, libertiesAfter: group.libertiesAfter,
    })) } };
}

function compactConversation(input: CompactCoachContextInput) {
  if (!input.question?.trim()) return undefined;
  const turns = coachConversationContext(input.history?.slice(-3), input.evidence.positionKey, input.secret)
    .map(turn => ({ ...turn, question: turn.question.slice(0, 100), answer: turn.answer.slice(0, COACH_HISTORY_ANSWER_LIMIT) }));
  while (JSON.stringify(turns).length > 1200) turns.shift();
  return turns.length ? turns : undefined;
}

function relevantEngineChoices(choices: CoachTeachingChoice[], question: string, intent: CoachIntent) {
  const asked = new Set(coordinates(question));
  const rank = (choice: CoachTeachingChoice) => {
    if (choice.id === 'engine.pass' && /停着|虚手/.test(question)) return 50;
    if (choice.id.startsWith('engine.compare.')) {
      if ((choice.coordinates ?? []).filter(point => asked.has(point)).length >= 2) return 60;
      if (/比较|哪个好|哪[手个点].*好/.test(question)) return 45;
    }
    if ((choice.coordinates ?? coordinates(choice.variants.join(''))).some(point => asked.has(point))) return 40;
    if (choice.id === 'engine.root-value') return intent === 'explain-position' ? 25 : 8;
    if (choice.id.startsWith('engine.ownership.')) return /形势|领地|围地|哪[边方].*好/.test(question) ? 20 : 6;
    return /^engine\.[A-HJ-Z][1-9]\d?$/.test(choice.id) ? 10 : 1;
  };
  return choices.filter(choice => choice.id.startsWith('engine.'))
    .sort((a, b) => rank(b) - rank(a)).slice(0, 5);
}

/** Provider context is bounded by the current board, not game or chat length. */
export function buildCompactCoachContext(input: CompactCoachContextInput) {
  const { evidence, intent } = input;
  const question = input.question?.trim().slice(0, 500) ?? '';
  const { references, previousQuestion } = resolveCoachQuestionReferences(question, input.history, evidence.boardSize, evidence.positionKey);
  const focusedQuestion = `${question} ${references.map(reference => reference.point.label).join(' ')}`;
  const askedPoints = new Set(coordinates(focusedQuestion).slice(0, 3));
  const groups = relevantGroups(evidence, focusedQuestion, input.hintPoints);
  const byId = new Map(input.choices.map(choice => [choice.id, choice]));
  const selected: CoachTeachingChoice[] = [];
  const add = (choice: CoachTeachingChoice | undefined) => {
    if (!choice || selected.length >= MAX_CHOICES || selected.some(item => item.id === choice.id)) return;
    const group = groups.find(item => choice.id === `group.${item.context.anchor}`)?.group;
    const references = group ? [...group.stones, ...group.liberties].filter(point => askedPoints.has(point.label)) : [];
    selected.push(references.length ? { ...choice,
      coordinates: [...new Set([...(choice.coordinates ?? []), ...references.map(point => point.label)])] } : choice);
  };
  add(byId.get('current'));
  groups.filter(item => item.priority >= 4).forEach(item => add(byId.get(`group.${item.context.anchor}`)));
  // Keep the resolved subject and its explicit teaching topic even if old prose
  // is removed for budget. Only current rule choices supply the actual facts.
  if (previousQuestion) relevantConcepts(input.choices, previousQuestion, true).forEach(add);
  const requiredChoices = selected.length;
  if (question) relevantConcepts(input.choices, question).forEach(add);
  relevantEngineChoices(input.choices, focusedQuestion, intent).forEach(add);
  evidence.candidates.slice(0, 3).forEach(candidate => add(byId.get(`candidate.${candidate.point.label}`)));
  if (!(input.proactive && intent === 'hint')) add(byId.get('last-action'));
  groups.forEach(item => add(byId.get(`group.${item.context.anchor}`)));

  const board = Array.from({ length: evidence.boardSize }, () => Array<string>(evidence.boardSize).fill('.'));
  for (const { color, point } of evidence.stones) board[point.y][point.x] = color === 'black' ? 'B' : 'W';
  const conversation = compactConversation(input);
  const payload = {
    boardSize: evidence.boardSize, toPlay: evidence.toPlay, userColor: evidence.userColor, komi: evidence.komi,
    ...(input.difficulty ? { difficulty: input.difficulty } : {}),
    moveNumber: evidence.moveNumber, moveNumberMeaning: '黑白双方落子与停着合计的全局手数。',
    captures: evidence.captures, boardRows: board.map(row => row.join('')),
    coordinateSystem: 'boardRows自上向下：B黑/W白/.空；字母列从左到右跳过I，数字行从下到上；双方不翻转坐标。',
    lastAction: compactLastAction(evidence.lastAction), groups: groups.map(item => item.context),
    candidates: evidence.candidates.slice(0, 3).map(candidate => ({ ...candidate, point: candidate.point.label })),
    ...(input.engineAnalysis ? { engineAnalysis: input.engineAnalysis } : {}),
    limits: ['规则仅验证当前局面和一步变化；候选不证明最佳手或后续死活。',
      'conversation仅供理解提问；历史回答不是当前局面事实。'],
    teachingRequest: { proactive: input.proactive === true, intent, maxParts: question ? 3 : 1,
      ...getCoachResponseLimits() },
    teachingChoices: selected,
    ...(references.length ? { questionReferences: references.map(({ reference, point, position }) => ({ reference, point: point.label, position })) } : {}),
    ...(conversation ? { conversation } : {}),
    boardGuide: {
      ...(evidence.lastAction.kind === 'move'
        ? { lastMove: { marker: 'red-dot', point: evidence.lastAction.point } } : {}),
      markers: input.hintPoints.slice(0, 3).map((point, index) => ({ number: input.hintPoints.length > 1 ? index + 1 : null, point })),
    },
  };
  const fits = () => JSON.stringify(payload).length <= MAX_CONTEXT_CHARS;
  // Drop complete optional units, never cut the board, a condition in authored
  // prose, or a trusted engine structure into a misleading partial assertion.
  while (!fits() && payload.conversation?.length) payload.conversation.shift();
  while (!fits() && selected.length > requiredChoices) selected.pop();
  while (!fits() && payload.groups.length > 1 && groups[payload.groups.length - 1].priority < 4) payload.groups.pop();
  if (!fits()) throw new Error('讲解上下文超出预算，保留本地分析。');
  return { payload, choices: selected };
}
