import type { JsonObject, JsonValue } from '@earendil-works/pi-ai';
import { PiCoachError, type PiCoachRequest } from './types';

export const MAX_EVIDENCE_CHARS = 6000;
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function invalid(): never { throw new PiCoachError('invalid_request', '局面证据格式不正确。'); }
const integer = (value: unknown, minimum = 0, maximum = 100000) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

/** Validate the wire shape and budget, without claiming to rerun client ONNX or rules. */
export function validatePiCoachRequest(request: PiCoachRequest): { evidence: JsonObject; question: string } {
  if (!request || typeof request.question !== 'string' || request.question.length > 500) invalid();
  const seen = new Set<object>();
  let nodes = 0;
  function check(value: unknown, depth: number): void {
    if (++nodes > 3000 || depth > 12) invalid();
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') { if (value.length > MAX_EVIDENCE_CHARS) invalid(); return; }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    if (typeof value !== 'object' || seen.has(value)) invalid();
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null) invalid();
    seen.add(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (descriptor.get || descriptor.set) invalid();
      check(descriptor.value, depth + 1);
    }
    seen.delete(value);
  }
  check(request.evidence, 0);
  if (!isRecord(request.evidence)) invalid();
  const encoded = JSON.stringify(request.evidence);
  if (encoded.length > MAX_EVIDENCE_CHARS) invalid();
  // Detach every tool's snapshot from caller mutation while the model runs.
  const evidence = JSON.parse(encoded) as JsonObject;
  const size = evidence.boardSize;
  if (!integer(size, 5, 19) || !Array.isArray(evidence.boardRows)
    || evidence.boardRows.length !== size || !evidence.boardRows.every(row =>
      typeof row === 'string' && row.length === size && /^[BW.]+$/.test(row))) invalid();
  if (!['black', 'white'].includes(String(evidence.toPlay))
    || !['black', 'white'].includes(String(evidence.userColor))
    || typeof evidence.komi !== 'number' || !integer(evidence.moveNumber)) invalid();
  if (!isRecord(evidence.captures) || !integer(evidence.captures.black) || !integer(evidence.captures.white)) invalid();
  if (!Array.isArray(evidence.teachingChoices) || evidence.teachingChoices.length < 1
    || evidence.teachingChoices.length > 12) invalid();
  const ids = new Set<string>();
  for (const choice of evidence.teachingChoices) {
    if (!isRecord(choice) || typeof choice.id !== 'string' || !/^[\w.-]{1,120}$/.test(choice.id)
      || ids.has(choice.id) || !['position', 'concept', 'course-concept'].includes(String(choice.kind))
      || !Array.isArray(choice.variants) || choice.variants.length < 1 || choice.variants.length > 6
      || !choice.variants.every(text => typeof text === 'string' && text.length <= 1500)
      || (choice.coordinates !== undefined && (!Array.isArray(choice.coordinates)
        || choice.coordinates.length > 20 || !choice.coordinates.every(point =>
          typeof point === 'string' && /^[A-HJ-T][1-9]\d?$/.test(point))))) invalid();
    ids.add(choice.id);
  }
  const limits = evidence.teachingRequest;
  if (!isRecord(limits) || typeof limits.proactive !== 'boolean'
    || !integer(limits.maxTextChars, 1, 50) || !integer(limits.maxSentences, 1, 1)
    || !integer(limits.maxRefs, 1, 3) || !integer(limits.maxBoardPoints, 1, 3)) invalid();
  if (evidence.engineAnalysis !== undefined && !isRecord(evidence.engineAnalysis)) invalid();
  return { evidence, question: request.question.trim() };
}

export function selectTeachingChoices(evidence: JsonObject, ids: string[]): JsonValue {
  const choices = Array.isArray(evidence.teachingChoices) ? evidence.teachingChoices : [];
  return choices.filter(choice => isRecord(choice) && ids.includes(String(choice.id)));
}
