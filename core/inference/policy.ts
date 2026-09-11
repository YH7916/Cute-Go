import { MicroBoard, type Sign } from '../../utils/micro-board';

// Keep every legal candidate on every device. Difficulty sampling happens in the worker.
export function extractPolicyMoves(policy: Float32Array, size: number, board: MicroBoard, color: Sign, temperature: number) {
  const candidates = [];
  for (let i = 0; i <= size * size; i++) {
    const logit = policy[i];
    if (!Number.isFinite(logit)) continue;
    const pass = i === size * size;
    const x = pass ? -1 : i % size;
    const y = pass ? -1 : Math.floor(i / size);
    if (!pass && !board.isLegal(x, y, color)) continue;
    candidates.push({ x, y, logit, prior: 0, weight: 0, winrate: 0, vists: 0, u: 0, scoreMean: 0, scoreStdev: 0, lead: 0 });
  }
  const max = Math.max(...candidates.map(m => m.logit));
  let sum = 0;
  for (const move of candidates) {
    move.prior = Math.exp(move.logit - max);
    move.weight = Math.exp((move.logit - max) / (temperature > 0 ? temperature : 1));
    sum += move.prior;
  }
  for (const move of candidates) move.prior /= sum;
  return candidates.sort((a, b) => b.prior - a.prior);
}

// A policy pass in the opening must not discard all playable alternatives.
// Respect a player's pass and allow normal endgame passes after sufficient play.
export const canPass = (size: number, moveCount: number, opponentPassed: boolean) =>
  opponentPassed || moveCount >= Math.floor(size * size * 0.5);
