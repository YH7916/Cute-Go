import { labelCoachPoint, type CoachPoint } from './evidence';

export interface CoachConversationTurn {
  positionKey: string;
  question: string;
  answer: string;
  /** Actual displayed marks; absent on old or purely conceptual answers. */
  hintPoints?: CoachPoint[];
}

export const COACH_HISTORY_ANSWER_LIMIT = 200;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function cleanText(value: string, limit: number, secret?: string): string {
  const safe = secret ? value.split(secret).join('[密钥已隐藏]') : value;
  return Array.from(safe).filter(char => char === '\n' || char === '\t' || char.charCodeAt(0) >= 32)
    .join('').trim().slice(0, limit);
}

/** Provider-only legend preserves displayed references without changing UI history. */
export function coachHistoryAnswer(answer: string, hintPoints: readonly CoachPoint[], secret?: string): string {
  const references = hintPoints.slice(0, 20).map((point, index) =>
    `${hintPoints.length === 1 ? '这里' : String.fromCodePoint(0x2460 + index)}=${point.label}`);
  const legend = references.length ? `\n标记：${references.join('，')}` : '';
  return cleanText(answer, COACH_HISTORY_ANSWER_LIMIT - legend.length, secret) + legend;
}

function historyPoints(value: unknown): CoachPoint[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 20) return undefined;
  const points: CoachPoint[] = [];
  for (const item of value) {
    if (!record(item) || typeof item.x !== 'number' || typeof item.y !== 'number'
      || !Number.isInteger(item.x) || !Number.isInteger(item.y) || item.x < 0 || item.x > 18 || item.y < 0 || item.y > 18
      || typeof item.label !== 'string' || !/^[A-HJ-T](?:[1-9]|1\d)$/.test(item.label)
      || points.some(point => point.x === item.x && point.y === item.y)) return undefined;
    points.push({ x: item.x, y: item.y, label: item.label });
  }
  return points;
}

/** History is conversation context, never a source of verified board facts. */
export function sanitizeCoachHistory(value: unknown, secret?: string): CoachConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).flatMap((item: unknown) => {
    if (!record(item) || typeof item.positionKey !== 'string' || !item.positionKey
      || item.positionKey.length > 1_000_000 || typeof item.question !== 'string'
      || typeof item.answer !== 'string') return [];
    const question = cleanText(item.question, 500, secret);
    const answer = cleanText(item.answer, 1200, secret);
    const hintPoints = historyPoints(item.hintPoints);
    return question && answer ? [{ positionKey: item.positionKey, question, answer, ...(hintPoints ? { hintPoints } : {}) }] : [];
  }).slice(-6);
}

interface CoachQuestionReference {
  reference: string;
  point: CoachPoint;
  position: 'current' | 'earlier';
}

/** Resolve only actual displayed marks; historical prose never supplies current facts. */
export function resolveCoachQuestionReferences(question: string, history: unknown, boardSize: number, positionKey: string) {
  const references: CoachQuestionReference[] = [];
  const source = sanitizeCoachHistory(history).reverse().find(turn => turn.hintPoints?.length);
  const points = source?.hintPoints;
  if (!source || !points || points.some(point => point.x >= boardSize || point.y >= boardSize
    || labelCoachPoint(point, boardSize).label !== point.label)) return { references, previousQuestion: '' };
  const explicitPoint = /\b[A-HJ-Z][1-9]\d?\b/i.test(question);
  for (const [reference] of question.matchAll(/[①-⑳]|[这那]里|此处|[这那][颗块]/g)) {
    const numbered = reference.length === 1;
    const index = numbered ? (points.length > 1 ? reference.charCodeAt(0) - 0x2460 : -1)
      : (!explicitPoint && points.length === 1 ? 0 : -1);
    const point = points[index];
    if (!point || references.some(item => item.point.label === point.label)) continue;
    references.push({ reference, point: { ...point }, position: source.positionKey === positionKey ? 'current' : 'earlier' });
    if (references.length === 3) break;
  }
  return { references, previousQuestion: references.length ? source.question : '' };
}

/** Do not forward full position identities/history to a language-model provider. */
export function coachConversationContext(value: unknown, positionKey: string, secret?: string) {
  return sanitizeCoachHistory(value, secret).map(({ positionKey: key, question, answer }) => ({
    position: key === positionKey ? 'current' as const : 'earlier' as const, question, answer,
  }));
}
