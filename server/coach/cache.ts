import { createHmac, randomBytes } from 'node:crypto';
import { PI_COACH_SYSTEM_PROMPT } from './prompt';

// A routing hint, never a stored conversation. The process-local salt prevents
// the provider-visible ID from becoming a reusable hash of a user's credential.
const routingSalt = randomBytes(32);
export function coachCacheSession(baseUrl: string, model: string, apiKey: string): string | undefined {
  if (new URL(baseUrl).origin !== 'https://api.openai.com') return undefined;
  return createHmac('sha256', routingSalt)
    .update(JSON.stringify([model, PI_COACH_SYSTEM_PROMPT, apiKey])).digest('hex');
}
