export interface GomokuSearchProfile {
  readonly mode: 'synchronous' | 'worker';
  readonly maxDepth: number;
  readonly rootWidth: number;
  readonly deepBranchWidth: number;
  readonly shallowBranchWidth: number;
  readonly candidateRange: number;
  readonly seedLandmarks: boolean;
  readonly strictRootOrdering: boolean;
  readonly rootCenterBias: boolean;
  readonly reuseRootAlpha: boolean;
  readonly immediateWinCutoff: boolean;
  readonly timeLimitMs: number | null;
}

// These profiles preserve the two historical callers' strength and tie ordering.
// Changing their budgets or positional biases is a separate gameplay change.
export function getGomokuSearchProfile(
  mode: GomokuSearchProfile['mode'],
  difficulty?: string,
): GomokuSearchProfile {
  let normalized = difficulty ?? (mode === 'worker' ? 'Easy' : 'Medium');
  if (mode === 'synchronous' && !['Easy', 'Medium', 'Hard'].includes(normalized)) {
    normalized = normalized.includes('k') ? 'Easy' : normalized.includes('d') ? 'Hard' : 'Medium';
  }
  const hard = normalized === 'Hard';
  const medium = normalized === 'Medium';
  const worker = mode === 'worker';
  return {
    mode,
    maxDepth: worker ? (hard ? 8 : medium ? 4 : 2) : (hard ? 4 : medium ? 3 : 2),
    rootWidth: worker ? (hard ? 12 : medium ? 8 : 5) : (hard ? 8 : medium ? 6 : 4),
    deepBranchWidth: worker ? 6 : 8,
    shallowBranchWidth: worker ? 10 : 12,
    candidateRange: 2,
    seedLandmarks: worker,
    strictRootOrdering: !worker,
    rootCenterBias: !worker,
    reuseRootAlpha: worker,
    immediateWinCutoff: worker,
    timeLimitMs: worker ? (hard ? 3000 : medium ? 800 : 100) : null,
  };
}
