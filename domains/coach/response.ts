import { getLocalCoachMessage, labelCoachPoint, type CoachEvidence, type CoachPoint } from './evidence';
import { curriculumConcepts } from './curriculumDrafts';

export interface CoachTeachingChoice {
  id: string;
  kind: 'position' | 'concept' | 'course-concept';
  variants: string[];
  /** Additional points verified locally for this specific cited fact. */
  coordinates?: string[];
}

export function getCoachResponseLimits() {
  return { maxTextChars: 50, maxSentences: 1, maxRefs: 3, maxBoardPoints: 3 };
}

function normalizeBoardCoordinates(text: string): string {
  // Normalize ASCII width only: NFKC would turn invented circled marks into
  // ordinary numbers before validation could reject them.
  return text.replace(/[Ａ-Ｚａ-ｚ０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\b[a-z]\d+\b/gi, coordinate => coordinate.toUpperCase());
}

// Authored, rule-verified material uses coordinates internally. Bind the final
// selected prose to board marks only after ordering and combining its parts.
export function renderCoachBoardReferences(text: string, boardSize: number): { text: string; hintPoints: CoachPoint[] } {
  text = normalizeBoardCoordinates(text);
  const positions = new Map<string, CoachPoint>();
  for (let y = 0; y < boardSize; y++) for (let x = 0; x < boardSize; x++) {
    const point = labelCoachPoint({ x, y }, boardSize);
    positions.set(point.label, point);
  }
  const coordinates = /[ \t]*\b([A-HJ-Z][1-9]\d?)\b[ \t]*/g;
  const hintPoints: CoachPoint[] = [];
  for (const [, label] of text.matchAll(coordinates)) {
    const point = positions.get(label);
    if (point && !hintPoints.some(item => item.label === label)) hintPoints.push(point);
  }
  return { hintPoints, text: text.replace(coordinates, (matched, label: string) => {
    const index = hintPoints.findIndex(point => point.label === label);
    return index < 0 ? matched : hintPoints.length === 1 ? '这里' : String.fromCodePoint(0x2460 + index);
  }) };
}

export function renderCoachReviewSummary(text: string, hintPoints: CoachPoint[], boardSize: number): { text: string; hintPoints: CoachPoint[] } {
  const paragraph = (text.split(/\r?\n/).find(part => part.trim())?.trim() ?? '').replace(/^-\s+/, '');
  const restored = paragraph.replace(/圈出的这里|这里|[①-⑳]/g, reference => {
    const index = reference.endsWith('这里') ? (hintPoints.length === 1 ? 0 : -1) : reference.charCodeAt(0) - 0x2460;
    return hintPoints[index]?.label ?? reference;
  });
  // A teaching part can include several sentences of conditions and limits.
  // Keep its short sentences intact, then bind only this part's references.
  return renderCoachBoardReferences(restored, boardSize);
}

// These bounded rule concepts describe conditions, not a verdict about a group.
// Course definitions below reuse the curriculum rather than model-written prose.
const concepts = [
  ['liberties', '气是棋块上下左右相邻的空点。连在一起的棋子共用气，同一个空点只数一次。', '数气要看整块棋旁边的空点，重复的只算一次。斜对角不算相邻。'],
  ['connection', '上下左右相连才算一块棋。斜对角相邻不算连接。'],
  ['capture', '合法占住对方棋块的最后一口气，就能整块提走。'],
  ['suicide', '先提走对方的无气棋块，再看自己的整块棋有没有气。仍没气就不能下。'],
  ['ko', '立即提回若使棋盘回到上一手之前，劫规则不允许这样下。先在别处下一手，等对方回应后再看。'],
  ['pass', '停着是放弃这次落子，不等于认输。双方连续停着后结束落子，再按规则确认死子和计分。'],
  ['territory', '计分要看围住的空点、提子和贴目。死子未确认前，局中估计不能当作终局结果。'],
  ['atari', '只剩一口气就叫打吃。先检查能否接长或吃子解围。'],
  ['opening', '可以从空旷角部开始，借两条边围空。别贴边太近。'],
  ['reading', '在试下中比较提子和气的变化。也要考虑对手的其他应法。'],
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
      `${anchor}的${color}有${liberties}口气。`,
      `${anchor}的${color}共用${liberties}口气。重复的空点只算一次。`,
    ] });
  }
  for (const candidate of evidence.candidates) {
    const point = candidate.point;
    const color = evidence.toPlay === 'black' ? '黑棋' : '白棋';
    const effect = [candidate.savedStones ? '让被打吃的棋多出气' : '',
      candidate.capturedStones ? `提走${candidate.capturedStones}颗${evidence.toPlay === 'black' ? '白棋' : '黑棋'}` : ''].filter(Boolean).join('，');
    choices.push({ id: `candidate.${point.label}`, kind: 'position', variants: [
      `${color}下在${point.label}，能${effect}。${candidate.libertiesAfter === 1 ? '新落子所在的棋块也只剩一口气，要留意反提。' : ''}`,
    ] });
  }
  for (const [id, ...variants] of concepts) choices.push({ id: `concept.${id}`,
    kind: 'concept', variants: [...variants] });
  // Original course drafts are general explanations, not proofs about this board.
  // Keep examples, hints and exercise answers out of a normal teaching request.
  // Unbound concepts avoid “这里”, which review reserves for a single board mark.
  for (const lesson of curriculumConcepts) choices.push({ id: `course.${lesson.id}`,
    kind: 'course-concept', variants: [
      lesson.concept,
      `${lesson.concept}\n${lesson.misconception}`,
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

/** Keep cloud prose intact; refs identify sources, while the renderer checks presentation and board bounds. */
function renderSynthesis(value: Record<string, unknown>, choices: CoachTeachingChoice[], boardSize: number) {
  const limits = getCoachResponseLimits();
  if (!exactKeys(value, ['kind', 'text', 'refs']) || typeof value.text !== 'string' || !Array.isArray(value.refs)
    || value.refs.length < 1 || value.refs.length > limits.maxRefs || new Set(value.refs).size !== value.refs.length) return null;
  if (value.refs.some(id => !choices.some(choice => choice.id === id))) return null;
  const text = normalizeBoardCoordinates(value.text.replace(/\r\n?|\n/g, ' ').trim());
  if (!text || text.length > limits.maxTextChars
    || text.split(/[。！？!?]+|(?<!\d)\.|\.(?!\d)/).filter(part => part.trim()).length > limits.maxSentences
    || /[<>①-⑳❶-❿⓵-⓾]|这里|此处|https?:/i.test(text)) return null;
  const coordinates: string[] = text.match(/\b[A-Z]\d+\b/g) ?? [];
  const rendered = renderCoachBoardReferences(text, boardSize);
  // Every detected coordinate must bind to this board; the prompt point budget is advisory for new prose.
  return rendered.hintPoints.length !== new Set(coordinates).size
    ? null : { kind: 'explain' as const, ...rendered };
}

/** Legacy selections retain their authored-material contract; new prose uses the presentation boundary above. */
export function renderCoachResponse(
  text: string, choices: CoachTeachingChoice[], proactive: boolean, boardSize: number, maxParts: 1 | 3 = 3,
): CoachRenderedResponse | null {
  if (text === '[SILENT]') return proactive ? { kind: 'silent' } : null;
  let value: unknown;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  try { value = JSON.parse(fenced ? fenced[1] : trimmed); } catch { return null; }
  if (!record(value)) return null;
  if (value.kind === 'silent' && exactKeys(value, ['kind'])) return proactive ? { kind: 'silent' } : null;
  if (value.kind === 'unavailable' && exactKeys(value, ['kind'])) return {
    kind: 'unavailable', text: '现有证据还无法确认，可以在试下中比较变化。',
  };
  if (value.kind === 'explain' && Object.prototype.hasOwnProperty.call(value, 'text')) return renderSynthesis(value, choices, boardSize);
  if (value.kind !== 'explain' || !exactKeys(value, ['kind', 'parts']) || !Array.isArray(value.parts)
    || value.parts.length < 1 || value.parts.length > maxParts) return null;
  const seen = new Set<string>();
  const paragraphs: string[] = [];
  for (const part of value.parts as unknown[]) {
    if (!record(part) || !exactKeys(part, ['id', 'variant']) || typeof part.id !== 'string'
      || typeof part.variant !== 'number' || !Number.isInteger(part.variant) || seen.has(part.id)) return null;
    const choice = choices.find(item => item.id === part.id);
    if (!choice || part.variant < 0 || part.variant >= choice.variants.length) return null;
    // One selected item stays one paragraph, including any authored list of
    // conditions. Review must not mistake its later lines for unrelated items.
    const paragraph = choice.variants[part.variant].split(/\r?\n/)
      .map(line => line.trim().replace(/^-\s+/, '')).join('');
    if (!paragraph) return null;
    seen.add(part.id);
    if (!paragraphs.includes(paragraph)) paragraphs.push(paragraph);
  }
  const rendered = renderCoachBoardReferences(paragraphs.join('\n'), boardSize);
  // Add list spacing after coordinate binding, which trims coordinate padding.
  if (paragraphs.length > 1) rendered.text = rendered.text.split('\n').map(paragraph => `- ${paragraph}`).join('\n');
  // Never truncate marks while leaving their references in the explanation.
  return rendered.hintPoints.length > getCoachResponseLimits().maxBoardPoints ? null : { kind: 'explain', ...rendered };
}
