import { getLocalCoachMessage, labelCoachPoint, type CoachEvidence, type CoachPoint } from './evidence';
import { curriculumConcepts } from './curriculum';

export interface CoachTeachingChoice {
  id: string;
  kind: 'position' | 'concept' | 'course-concept';
  variants: string[];
}

// Authored, rule-verified material uses coordinates internally. Bind the final
// selected prose to board marks only after ordering and combining its parts.
export function renderCoachBoardReferences(text: string, boardSize: number): { text: string; hintPoints: CoachPoint[] } {
  const positions = new Map<string, CoachPoint>();
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
    const point = labelCoachPoint({ x, y }, boardSize);
    positions.set(point.label, point);
  }
  const coordinates = /\b[A-HJ-Z][1-9]\d?\b/g;
  const hintPoints: CoachPoint[] = [];
  for (const [label] of text.matchAll(coordinates)) {
    const point = positions.get(label);
    if (point && !hintPoints.some(item => item.label === label)) hintPoints.push(point);
  }
  return { hintPoints, text: text.replace(coordinates, label => {
    const index = hintPoints.findIndex(point => point.label === label);
    return index < 0 ? label : hintPoints.length === 1 ? '圈出的这里' : String.fromCodePoint(0x2460 + index);
  }) };
}

export function renderCoachReviewSummary(text: string, hintPoints: CoachPoint[], boardSize: number): { text: string; hintPoints: CoachPoint[] } {
  const paragraph = text.split(/\r?\n/).find(part => part.trim())?.trim() ?? '';
  const restored = paragraph.replace(/圈出的这里|[①②③]/g, reference => {
    const index = reference === '圈出的这里' ? 0 : reference.charCodeAt(0) - 0x2460;
    return hintPoints[index]?.label ?? reference;
  });
  // A teaching part can include several sentences of conditions and limits.
  // Keep all of them, then bind only this part's references to the review board.
  const sentence = restored.split(/[。！？!?]+/).map(part => part.trim()).filter(Boolean).join('；');
  return renderCoachBoardReferences(sentence ? `${sentence}。` : '', boardSize);
}

// These bounded rule concepts describe conditions, not a verdict about a group.
// Course definitions below reuse the curriculum rather than model-written prose.
const concepts = [
  ['liberties', '气是棋块上下左右相邻的空点；连在一起的棋子共用气，同一个空点只数一次。', '数气要看整块棋旁边的空点；斜对角不算相邻，重复的空点只算一次。'],
  ['connection', '上下左右连在一起才是一块棋，共用气；斜对角相邻还没有连成一块。'],
  ['capture', '对方整块棋的最后一口气被合法占住时，整块都要提走；不是只拿走紧贴落子的那一颗。'],
  ['suicide', '先检查新落子能否提走对方的无气棋块，再看自己的整块棋有没有气；能先提子获得气就不是禁入点。'],
  ['ko', '立即提回若使棋盘回到上一手之前，这一步受劫规则禁止；先在别处下一手，等对方回应后再看。'],
  ['pass', '停着是放弃这次落子，不等于认输；双方连续停着后结束落子，再按规则确认死子和计分。'],
  ['territory', '本程序按围住的空点、提子和贴目计分；局中的软估计不是终局结果，死子尚未确认时不能据此宣布胜负。'],
  ['atari', '只剩一口气叫打吃。可以检查接长、连接或吃子能否解围；多出气不等于做活，一口气也不一定能被合法吃掉。'],
  ['opening', '开局可以从空旷角部附近发展，借两条边较容易围空；别紧贴边线，留出向外发展的空间。'],
  ['reading', '先在试下中检查每一步是否合法，再看提子和气的变化；一条变化成立，不证明对手只能这样应对。'],
] as const;

export function buildCoachTeachingChoices(
  evidence: CoachEvidence, current: { text: string },
): CoachTeachingChoice[] {
  const choices: CoachTeachingChoice[] = [{ id: 'current', kind: 'position',
    variants: [current.text] }];
  if (evidence.lastAction.kind === 'move' || evidence.lastAction.kind === 'pass') {
    choices.push({ id: 'last-action', kind: 'position',
      variants: [getLocalCoachMessage(evidence, 'explain-last-move')] });
  }
  // All groups remain selectable: asking about a quiet group must not fabricate
  // an answer merely because that group was absent from a tactical top-N list.
  for (const group of evidence.groups) {
    const anchor = group.stones[0].label;
    const color = group.color === 'black' ? '黑棋' : '白棋';
    const liberties = group.liberties.length;
    choices.push({ id: `group.${anchor}`, kind: 'position', variants: [
      `${anchor} 这块${color}有${group.stones.length}颗棋子，共有${liberties}口气；气数描述当前出口，不能单凭它判断死活。`,
      `看 ${anchor} 这块${color}，整块共用${liberties}口气；数的是相邻空点，重复的空点只算一次。`,
    ] });
  }
  for (const candidate of evidence.candidates) {
    const point = candidate.point;
    const color = evidence.toPlay === 'black' ? '黑棋' : '白棋';
    const effect = [candidate.savedStones ? `让原先被打吃的${candidate.savedStones}颗己方棋多出气` : '',
      candidate.capturedStones ? `提走${candidate.capturedStones}颗对方棋子` : ''].filter(Boolean).join('，');
    choices.push({ id: `candidate.${point.label}`, kind: 'position', variants: [
      `若${color}在 ${point.label} 落子，可${effect}；新落下这块有${candidate.libertiesAfter}口气，这只验证当前一步，不证明已活。`,
    ] });
  }
  for (const [id, ...variants] of concepts) choices.push({ id: `concept.${id}`,
    kind: 'concept', variants: [...variants] });
  // Original course drafts are general explanations, not proofs about this board.
  // Keep examples, hints and exercise answers out of a normal teaching request.
  for (const lesson of curriculumConcepts) choices.push({ id: `course.${lesson.id}`,
    kind: 'course-concept', variants: [
      `通用概念：${lesson.concept}`,
      `通用概念：${lesson.concept}容易混淆的是：${lesson.misconception}`,
    ] });
  return choices;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

export type CoachRenderedResponse =
  | { kind: 'explain'; text: string; hintPoints: CoachPoint[] }
  | { kind: 'silent' }
  | { kind: 'unavailable'; text: string };

/** A provider selects verified material; its arbitrary prose is never published. */
export function renderCoachResponse(
  text: string, choices: CoachTeachingChoice[], proactive: boolean, boardSize: number,
): CoachRenderedResponse | null {
  if (text === '[SILENT]') return proactive ? { kind: 'silent' } : null;
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!record(value)) return null;
  if (value.kind === 'silent' && exactKeys(value, ['kind'])) return proactive ? { kind: 'silent' } : null;
  if (value.kind === 'unavailable' && exactKeys(value, ['kind'])) return {
    kind: 'unavailable', text: '这个问题还缺少可验证的依据。可以先点选棋子看气，或在试下中逐步比较变化。',
  };
  if (value.kind !== 'explain' || !exactKeys(value, ['kind', 'parts']) || !Array.isArray(value.parts)
    || value.parts.length < 1 || value.parts.length > 3) return null;
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const part of value.parts as unknown[]) {
    if (!record(part) || !exactKeys(part, ['id', 'variant']) || typeof part.id !== 'string'
      || typeof part.variant !== 'number' || !Number.isInteger(part.variant) || seen.has(part.id)) return null;
    const choice = choices.find(item => item.id === part.id);
    if (!choice || part.variant < 0 || part.variant >= choice.variants.length) return null;
    const paragraph = choice.variants[part.variant];
    if (!paragraph) return null;
    seen.add(part.id);
    if (!paragraphs.includes(paragraph)) paragraphs.push(paragraph);
  }
  const rendered = renderCoachBoardReferences(paragraphs.join('\n'), boardSize);
  // Never truncate marks while leaving their references in the explanation.
  return rendered.hintPoints.length > 3 ? null : { kind: 'explain', ...rendered };
}
