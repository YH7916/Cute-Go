import type { CoachIntent, CoachPoint, CoachEngineCandidate, CoachEngineMoveEvaluation } from '../../domains/coach/evidence';
import type { GamePosition } from '../../domains/game/positionState';
import type { CoachConfig } from '../../services/coach/types';
import type { Difficulty, Player, Point } from '../../types';
import type { CoachConversationTurn } from '../../domains/coach/conversation';

export type { CoachIntent } from '../../domains/coach/evidence';
export type { CoachConversationTurn } from '../../domains/coach/conversation';
export interface CoachEngineEvidence {
  /** Full local identity; never forwarded to the language-model provider. */
  positionKey: string;
  source: 'local-katago';
  perspective: 'black';
  visits: number;
  winRateBlack?: number;
  estimatedBlackLead?: number;
  candidates: CoachEngineCandidate[];
  pass?: CoachEngineMoveEvaluation;
  /** Black-positive normalized ownership, averaged across visited search nodes. */
  ownership?: Float32Array | null;
}
export interface CoachAgentInput {
  kind: 'inspect' | 'ask';
  position: GamePosition;
  userColor: Player;
  difficulty?: Difficulty;
  intent: CoachIntent;
  /** Unsolicited commentary is gated by a verified teaching moment. Manual requests default to false. */
  proactive?: boolean;
  question?: string;
  history?: CoachConversationTurn[];
  attemptedPoint?: Point;
  config: CoachConfig;
  engineEvidence?: CoachEngineEvidence;
}
export interface CoachAgentResult {
  text: string;
  source: 'local' | 'cloud';
  error?: string;
  /** Rejected cloud content falls back locally without blocking a manual retry. */
  cacheable?: false;
  configured: boolean;
  hintPoints: CoachPoint[];
  moveNumber: number;
  /** True only when a verified change warrants automatic commentary. */
  shouldAutoExplain?: boolean;
}
export interface CoachAgentRequest { type: 'run'; requestId: number; input: CoachAgentInput }
export type CoachAgentResponse =
  | { type: 'ready' }
  | { type: 'result'; requestId: number; result: CoachAgentResult }
  | { type: 'error'; requestId: number };
