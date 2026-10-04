import { OnnxEngine } from '../core/inference/engine';
import type { WorkerInMessage } from '../core/inference/protocol';
import type { AiTaskContext } from '../core/inference/scheduler';

type InitConfig = Extract<WorkerInMessage, { type: 'init' }>['payload'];

// Called only by the serialized Worker scheduler. Main-thread watchdogs terminate
// an unresponsive Worker; never unlock a running session merely because time elapsed.
export class WorkerEngineLifecycle {
  private engine: OnnxEngine | null = null;
  private config: InitConfig | null = null;

  async release() {
    const engine = this.engine;
    this.engine = null;
    await engine?.dispose();
  }

  async initialize(config: InitConfig, task: AiTaskContext) {
    this.config = config;
    await this.release();
    await this.ready(task);
  }

  async ready(task: AiTaskContext) {
    if (!this.config) throw new Error('No cached config for reinit');
    if (!this.config.onlyRules && !this.engine) {
      const engine = new OnnxEngine({ ...this.config, debug: true });
      this.engine = engine;
      try {
        await engine.initialize(message => task.reply({ type: 'status', message }));
      } catch (error) {
        await this.release();
        throw error;
      }
    }
    task.reply({ type: 'init-complete' });
  }

  forTask(task: AiTaskContext): Pick<OnnxEngine, 'analyze'> {
    const engine = this.engine;
    if (!engine) throw new Error('AI Engine unavailable. Initialize the model before computing.');
    return {
      analyze: async (...args) => {
        task.assertCurrent();
        const result = await engine.analyze(...args);
        // Single-threaded WASM may settle only through microtasks. Yield a task
        // so queued stop/release messages run before the next visit or reply.
        // The completed run stays serialized; this cannot interrupt WASM mid-run.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        task.assertCurrent();
        return result;
      },
    };
  }
}
