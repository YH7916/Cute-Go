export interface CoachConfig {
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface CoachRequest {
  config: CoachConfig;
  /** Validated as bounded JSON at the service boundary. No game/domain dependency. */
  evidence: unknown;
  question?: string;
  signal?: AbortSignal;
}

export interface CoachReply { text: string }

export interface StoredCoachSettings { config: CoachConfig; rememberKey: boolean }
