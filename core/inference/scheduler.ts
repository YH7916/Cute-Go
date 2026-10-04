import type { WorkerInMessage, WorkerOutMessage, WorkerReply } from './protocol';

export class CancelledAiRequest extends Error {
  constructor() { super('AI request cancelled'); }
}

export interface AiTaskContext {
  assertCurrent(): void;
  reply(message: WorkerReply): void;
}

// ONNX runs are not interruptible. Cancellation invalidates immediately, while
// the queue holds the session until the current run has actually settled.
export function createAiScheduler(
  process: (message: WorkerInMessage, task: AiTaskContext) => Promise<void>,
  post: (message: WorkerOutMessage) => void,
) {
  let generation = 0;
  let computeSequence = 0;
  let tail = Promise.resolve();
  return (message: WorkerInMessage): Promise<void> => {
    if (message.generation < generation) return Promise.resolve();
    generation = message.generation;
    if (message.type === 'compute' || message.type === 'stop' || message.type === 'release') computeSequence++;
    const sequence = computeSequence;
    const current = () => message.generation === generation &&
      (message.type !== 'compute' || sequence === computeSequence);
    if (message.type === 'stop') return Promise.resolve();
    const task: AiTaskContext = {
      assertCurrent() { if (!current()) throw new CancelledAiRequest(); },
      reply(reply) {
        if (!current()) return;
        if (reply.type === 'ai-response') {
          if (message.type === 'compute') post({ ...reply, generation, requestId: message.requestId });
        } else {
          post({ ...reply, generation, ...(message.type === 'compute' ? { requestId: message.requestId } : {}) });
        }
      },
    };
    const operation = tail.then(async () => {
      if (message.type === 'compute' && !current()) return;
      try { await process(message, task); }
      catch (error) {
        if (!(error instanceof CancelledAiRequest)) {
          task.reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    });
    tail = operation.catch(() => {});
    return operation;
  };
}
