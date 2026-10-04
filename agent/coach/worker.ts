import { executeCoachAgent } from './runtime';
import type { CoachAgentRequest, CoachAgentResponse } from './contract';

// The bridge creates a fresh dedicated Worker per request, so terminating it
// cancels its fetch and drops that request's key without touching Go inference.
const scope = globalThis as unknown as {
  postMessage(message: CoachAgentResponse): void;
  onmessage: ((event: MessageEvent<CoachAgentRequest>) => void) | null;
};
let used = false;
scope.onmessage = async ({ data }) => {
  if (used || data?.type !== 'run' || !Number.isSafeInteger(data.requestId)) return;
  used = true;
  try {
    const result = await executeCoachAgent(data.input);
    scope.postMessage({ type: 'result', requestId: data.requestId, result });
  } catch {
    // Do not echo an exception or input: either could contain a user credential.
    scope.postMessage({ type: 'error', requestId: data.requestId });
  }
};
scope.postMessage({ type: 'ready' });
