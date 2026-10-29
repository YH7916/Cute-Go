import { COACH_PROVIDERS, parseCoachModel, validateCoachApiKey, type CoachCloudReply } from '../../shared/coach';
import { createPiCoachRunner } from './runtime';
import { PiCoachError, type PiCoachExecutionRequest } from './types';

/** Every user request owns its provider, key and Pi agent; no credential cache or URL override. */
export async function runPiCoachReply(request: PiCoachExecutionRequest, signal?: AbortSignal): Promise<CoachCloudReply> {
  if (signal?.aborted) throw new PiCoachError('aborted', '讲解已取消。');
  let model: ReturnType<typeof parseCoachModel>;
  let apiKey: string;
  try { model = parseCoachModel(request); apiKey = validateCoachApiKey(request.apiKey); }
  catch { throw new PiCoachError('invalid_request', '模型配置不正确。'); }
  const provider = COACH_PROVIDERS.find(provider => provider.id === model.provider);
  if (!provider) throw new PiCoachError('invalid_request', '模型服务不受支持。');
  const run = createPiCoachRunner({ model: model.model, apiKey, baseUrl: provider.baseUrl, timeoutMs: 24000 });
  return run({ evidence: request.evidence, question: request.question }, signal);
}
