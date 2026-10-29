import type { CoachCloudRequest } from '../../shared/coach';

export interface PiCoachConfig {
  model: string;
  apiKey: string;
  baseUrl: string;
  /** May shorten the production deadline, but never extend it past 30 seconds. */
  timeoutMs?: number;
}

export interface PiCoachRequest {
  evidence: unknown;
  question: string;
}

/** Per-request model credentials extracted from HTTP headers, never from JSON. */
export interface PiCoachExecutionRequest extends CoachCloudRequest { apiKey: string }

export type PiCoachErrorCode = 'invalid_request' | 'upstream_error' | 'timeout'
  | 'aborted' | 'limit_exceeded' | 'invalid_response';

export class PiCoachError extends Error {
  constructor(public readonly code: PiCoachErrorCode, message: string) {
    super(message);
    this.name = 'PiCoachError';
  }
}
