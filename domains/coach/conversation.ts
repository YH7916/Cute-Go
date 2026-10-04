export interface CoachConversationTurn {
  positionKey: string;
  question: string;
  answer: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function cleanText(value: string, limit: number, secret?: string): string {
  const safe = secret ? value.split(secret).join('[密钥已隐藏]') : value;
  return Array.from(safe).filter(char => char === '\n' || char === '\t' || char.charCodeAt(0) >= 32)
    .join('').trim().slice(0, limit);
}

/** History is conversation context, never a source of verified board facts. */
export function sanitizeCoachHistory(value: unknown, secret?: string): CoachConversationTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).flatMap((item: unknown) => {
    if (!record(item) || typeof item.positionKey !== 'string' || !item.positionKey
      || item.positionKey.length > 1_000_000 || typeof item.question !== 'string'
      || typeof item.answer !== 'string') return [];
    const question = cleanText(item.question, 500, secret);
    const answer = cleanText(item.answer, 1200, secret);
    return question && answer ? [{ positionKey: item.positionKey, question, answer }] : [];
  }).slice(-6);
}

/** Do not forward full position identities/history to a language-model provider. */
export function coachConversationContext(value: unknown, positionKey: string, secret?: string) {
  return sanitizeCoachHistory(value, secret).map(({ positionKey: key, question, answer }) => ({
    position: key === positionKey ? 'current' as const : 'earlier' as const, question, answer,
  }));
}
