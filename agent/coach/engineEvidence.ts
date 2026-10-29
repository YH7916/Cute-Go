import { getBoardHash, getGroup } from '../../core/board';
import { attemptMove } from '../../core/go/rules';
import { coachPositionKey, labelCoachPoint, type CoachPoint } from '../../domains/coach/evidence';
import type { CoachTeachingChoice } from '../../domains/coach/response';
import type { CoachAgentInput } from './contract';

const bounded = (value: number | undefined, maximum: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum;

const regions = ['upper-left', 'upper-center', 'upper-right', 'middle-left', 'center', 'middle-right',
  'lower-left', 'lower-center', 'lower-right'] as const;
const regionLabels = ['左上', '上方中央', '右上', '左侧中央', '中央', '右侧中央', '左下', '下方中央', '右下'];

function summarizeOwnership(values: Float32Array | null | undefined, size: number) {
  if (!(values instanceof Float32Array) || values.length !== size * size
    || !values.every(value => Number.isFinite(value) && value >= -1 && value <= 1)) return undefined;
  const sums = Array<number>(9).fill(0), counts = Array<number>(9).fill(0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = Math.floor(y * 3 / size) * 3 + Math.floor(x * 3 / size);
    sums[index] += values[y * size + x]; counts[index]++;
  }
  return { aggregation: 'search-visited-node-mean' as const,
    regions: regions.map((region, index) => ({ region, meanBlack: Number((sums[index] / counts[index]).toFixed(3)) })) };
}

export function verifiedCoachEngine(input: CoachAgentInput, komi: number) {
  const { engineEvidence: engine, position } = input;
  if (!engine || engine.source !== 'local-katago' || engine.perspective !== 'black'
    || engine.positionKey !== coachPositionKey(position, position.currentPlayer, komi)
    || !Number.isSafeInteger(engine.visits) || engine.visits < 1 || engine.visits > 32
    || !Array.isArray(engine.candidates)) return undefined;
  const size = position.board.length;
  const previous = position.history[position.history.length - 1];
  const previousHash = previous ? getBoardHash(previous.board) : null;
  const candidates: { point: CoachPoint; visits: number; prior?: number; winRateBlack?: number;
    variation?: CoachPoint[]; effects: { capturedStones: number; libertiesAfter: number } }[] = [];
  for (const candidate of engine.candidates.slice(0, 32)) {
    const point = candidate?.point;
    if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)
      || point.x < 0 || point.y < 0 || point.x >= size || point.y >= size
      || !Number.isSafeInteger(candidate.visits) || candidate.visits < 0 || candidate.visits > engine.visits
      || candidates.some(item => item.point.x === point.x && item.point.y === point.y)) continue;
    const moved = attemptMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash);
    if (!moved) continue;
    let variation: CoachPoint[] | undefined;
    if (Array.isArray(candidate.variation) && candidate.variation.length <= 4
      && candidate.variation[0]?.x === point.x && candidate.variation[0]?.y === point.y) {
      let board = position.board, hash = previousHash, player = position.currentPlayer;
      const verified: CoachPoint[] = [];
      for (const step of candidate.variation) {
        if (!step || !Number.isInteger(step.x) || !Number.isInteger(step.y)) break;
        const next = attemptMove(board, step.x, step.y, player, 'Go', hash);
        if (!next) break;
        verified.push(labelCoachPoint(step, size));
        hash = getBoardHash(board); board = next.newBoard;
        player = player === 'black' ? 'white' : 'black';
      }
      if (verified.length === candidate.variation.length) variation = verified;
    }
    candidates.push({ point: labelCoachPoint(point, size), visits: candidate.visits,
      ...(bounded(candidate.prior, 1) ? { prior: candidate.prior } : {}),
      ...(candidate.visits > 0 && bounded(candidate.winRateBlack, 100) ? { winRateBlack: candidate.winRateBlack } : {}),
      ...(variation?.length ? { variation } : {}),
      effects: { capturedStones: moved.captured, libertiesAfter: getGroup(moved.newBoard, point)?.liberties ?? 0 } });
    if (candidates.length === 3) break;
  }
  const ownership = summarizeOwnership(engine.ownership, size);
  const pass = engine.pass && Number.isSafeInteger(engine.pass.visits) && engine.pass.visits >= 0 && engine.pass.visits <= engine.visits
    ? { visits: engine.pass.visits,
      ...(bounded(engine.pass.prior, 1) ? { prior: engine.pass.prior } : {}),
      ...(engine.pass.visits > 0 && bounded(engine.pass.winRateBlack, 100) ? { winRateBlack: engine.pass.winRateBlack } : {}) } : undefined;
  return { source: engine.source, perspective: engine.perspective, visits: engine.visits,
    ...(bounded(engine.winRateBlack, 100) ? { winRateBlack: engine.winRateBlack } : {}),
    ...(typeof engine.estimatedBlackLead === 'number' && Number.isFinite(engine.estimatedBlackLead)
      ? { estimatedBlackLead: engine.estimatedBlackLead } : {}), candidates,
    ...(ownership ? { ownership } : {}), ...(pass ? { pass } : {}),
    limits: ['浅搜候选与示例变化不证明最优或死活。', 'estimatedBlackLead是规则软估计，不是官方scoreLead、目损或终局分数。',
      'ownership是搜索访问节点的黑方视角平均归属估计，正值偏黑、负值偏白；不是候选终局，不据此判断棋块死活。',
      'pass仅记录实际搜索停着分支；没有访问就没有价值估计，不能据此建议停着。'] };
}

export function engineTeachingChoices(engine: ReturnType<typeof verifiedCoachEngine>): CoachTeachingChoice[] {
  if (!engine) return [];
  const choices: CoachTeachingChoice[] = engine.candidates.map(candidate => ({ id: `engine.${candidate.point.label}`, kind: 'position',
    coordinates: [...new Set([candidate.point.label, ...(candidate.variation ?? []).map(point => point.label)])],
    variants: [`${candidate.point.label}是本地搜索候选，落子后所在棋块有${candidate.effects.libertiesAfter}口气`
      + (candidate.effects.capturedStones ? `，可提走${candidate.effects.capturedStones}颗对方棋子` : '')
      + (candidate.effects.libertiesAfter === 1 ? '，仍须留意反提' : '')
      + '；这只说明当前一步，后续安全仍需检查。'] }));
  if (engine.winRateBlack !== undefined || engine.estimatedBlackLead !== undefined) {
    const value = engine.winRateBlack !== undefined ? engine.winRateBlack - 50 : engine.estimatedBlackLead!;
    const threshold = engine.winRateBlack !== undefined ? 5 : 2;
    const direction = Math.abs(value) < threshold ? '暂未显示明显偏向' : `粗略偏向${value > 0 ? '黑' : '白'}棋`;
    choices.push({ id: 'engine.root-value', kind: 'position',
      variants: [`本地浅搜对当前形势的估计${direction}；这只是粗略方向，不能据此宣布胜负。`] });
  }
  const prominent = [...engine.ownership?.regions ?? []].filter(region => Math.abs(region.meanBlack) >= 0.5)
    .sort((a, b) => Math.abs(b.meanBlack) - Math.abs(a.meanBlack)).slice(0, 2);
  for (const region of prominent) choices.push({ id: `engine.ownership.${region.region}`, kind: 'position',
    variants: [`搜索访问局面的平均归属估计中，${regionLabels[regions.indexOf(region.region)]}区域更偏向${region.meanBlack > 0 ? '黑' : '白'}棋；这不是候选终局，也不能据此判断死活。`] });
  if (engine.pass) choices.push({ id: 'engine.pass', kind: 'position', variants: [engine.pass.visits > 0
    ? '本地浅搜实际访问过停着分支；这不表示应该停着，仍须检查棋盘上是否还有需要处理的地方。'
    : `本地搜索${engine.pass.prior !== undefined ? '记录了停着的先验，但' : '包含停着分支，但'}尚未实际访问该分支；不能据此判断停着是否合适。`] });
  const compared = engine.candidates.flatMap(candidate => candidate.visits > 0 && candidate.winRateBlack !== undefined
    ? [{ candidate, value: candidate.winRateBlack }] : []).sort((a, b) => b.value - a.value);
  for (let first = 0; first < compared.length; first++) for (let second = first + 1; second < compared.length; second++) {
    const higher = compared[first], lower = compared[second];
    if (higher.value - lower.value < 5) continue;
    const a = higher.candidate.point.label, b = lower.candidate.point.label;
    choices.push({ id: `engine.compare.${a}.${b}`, kind: 'position', coordinates: [a, b],
      variants: [`这次浅搜中，${a}的价值估计比${b}更偏向黑棋；只比较了已访问结果，仍须继续试下。`] });
  }
  return choices;
}
