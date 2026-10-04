import type { AnalysisResponse, RequestIdentity, WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';
import type { BoardState, Point } from '../types';

type ComputeData = Extract<WorkerInMessage, { type: 'compute' }>['data'];
type InitConfig = Extract<WorkerInMessage, { type: 'init' }>['payload'];
type ResponseData = Extract<WorkerOutMessage, { type: 'ai-response' }>['data'];
const copyBoard = (board: BoardState) => board.map(row => row.map(stone => stone ? { ...stone } : null));
const snapshot = (data: ComputeData): ComputeData => ({
  ...data, board: copyBoard(data.board), history: data.history.map(item => ({
    ...item, board: copyBoard(item.board),
    move: item.move ? { ...item.move } : item.move,
    lastMove: item.lastMove ? { ...item.lastMove } : item.lastMove,
  })),
});
interface WorkerConnection { postMessage(message: WorkerInMessage): void; terminate(): void }
interface ActiveRequest extends RequestIdentity { mode: 'play' | 'analyze'; purpose?: 'coach' }
export interface AiState {
  isWorkerReady: boolean; isLoading: boolean; isThinking: boolean; isInitializing: boolean;
  initStatus: string; aiWinRate: number; aiLead: number | null; aiScoreStdev: number | null;
  aiTerritory: Float32Array | null;
}
export const initialAiState = (): AiState => ({
  isWorkerReady: false, isLoading: false, isThinking: false, isInitializing: false,
  initStatus: '', aiWinRate: 50, aiLead: null, aiScoreStdev: null, aiTerritory: null,
});
interface Dependencies {
  createWorker(onMessage: (message: WorkerOutMessage) => void, onError: (message: string) => void): WorkerConnection;
  initConfig(needModel: boolean): InitConfig;
  beginnerMove(data: ComputeData): Point | null;
  onState(state: AiState): void;
  onMove(move: Point | null): void;
  onAnalysis(data: AnalysisResponse): void;
  onError(message: string): void;
  onRequest(): void;
}

// Owns correlation, timers and worker resources. React supplies current callbacks;
// no asynchronous closure owns a game callback.
export class AiRequestLifecycle {
  private state = initialAiState();
  private worker: WorkerConnection | null = null;
  private workerEpoch = 0;
  private generation = 0;
  private nextRequest = 0;
  private failed = false;
  private phase: 'idle' | 'initializing' | 'ready' | 'releasing' = 'idle';
  private thin = false;
  private pending: ComputeData | null = null;
  private pendingInit: boolean | null = null;
  private active: ActiveRequest | null = null;
  private requestTimer: ReturnType<typeof setTimeout> | null = null;
  private lifecycleTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: Dependencies) {}
  private update(patch: Partial<AiState>) {
    this.state = { ...this.state, ...patch };
    this.deps.onState(this.state);
  }
  private clearRequest() {
    if (this.requestTimer !== null) clearTimeout(this.requestTimer);
    this.requestTimer = null;
    this.active = null;
    this.pending = null;
  }
  private clearLifecycleTimer() {
    if (this.lifecycleTimer !== null) clearTimeout(this.lifecycleTimer);
    this.lifecycleTimer = null;
  }
  private destroyWorker() {
    this.workerEpoch++;
    this.worker?.terminate();
    this.worker = null;
    this.phase = 'idle';
    this.clearLifecycleTimer();
    if (this.statusTimer !== null) clearTimeout(this.statusTimer);
    this.statusTimer = null;
  }
  private fail(message: string) {
    this.failed = true;
    this.generation++;
    this.clearRequest();
    this.pendingInit = null;
    this.destroyWorker();
    this.update({ isWorkerReady: false, isLoading: false, isInitializing: false, isThinking: false, initStatus: message });
    this.deps.onError(message);
  }
  private watchdog(milliseconds: number, message: string) {
    this.clearLifecycleTimer();
    const epoch = this.workerEpoch;
    this.lifecycleTimer = setTimeout(() => {
      if (this.workerEpoch === epoch) this.fail(message);
    }, milliseconds);
  }
  private matches(identity: RequestIdentity) {
    return this.active?.requestId === identity.requestId && this.active.generation === identity.generation;
  }
  private receive(message: WorkerOutMessage) {
    if (message.generation !== this.generation) return;
    if (message.type === 'ai-response') {
      if (this.matches(message)) this.complete(message, message.data);
    } else if (message.type === 'init-complete' && this.phase === 'initializing') {
      this.clearLifecycleTimer();
      this.phase = 'ready';
      this.update({ isWorkerReady: true, isInitializing: false, isLoading: false, initStatus: this.thin ? '规则引擎就绪' : 'AI 引擎就绪' });
      if (this.statusTimer !== null) clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => this.update({ initStatus: '' }), 2000);
      this.drain();
    } else if (message.type === 'released' && this.phase === 'releasing') {
      this.clearLifecycleTimer();
      this.phase = 'idle';
      const needModel = this.pending ? this.needsModel(this.pending) : this.pendingInit;
      this.pendingInit = null;
      if (needModel !== null) this.initializeAI({ needModel });
    } else if (message.type === 'status' && this.phase === 'initializing') {
      this.update({ initStatus: message.message });
    } else if (message.type === 'error') {
      if (message.requestId !== undefined && !this.matches({ requestId: message.requestId, generation: message.generation })) return;
      this.fail(message.message);
    }
  }
  initializeAI = ({ needModel = true }: { needModel?: boolean } = {}) => {
    if (this.failed) return;
    if (this.phase === 'releasing') { this.pendingInit = needModel; return; }
    if ((this.phase === 'ready' || this.phase === 'initializing') && (!needModel || !this.thin)) return;
    const upgrade = !!this.worker && this.thin && needModel;
    if (upgrade) this.destroyWorker();
    this.thin = !needModel;
    this.phase = 'initializing';
    this.update({ isWorkerReady: false, isInitializing: true, isLoading: needModel, initStatus: needModel ? '正在启动 AI 引擎...' : '正在启动规则引擎...' });
    try {
      if (!this.worker) {
        const epoch = ++this.workerEpoch;
        this.worker = this.deps.createWorker(
          message => { if (this.workerEpoch === epoch) this.receive(message); },
          message => { if (this.workerEpoch === epoch) this.fail(message); },
        );
        this.worker.postMessage({ type: 'init', generation: this.generation, payload: this.deps.initConfig(needModel) });
      } else {
        this.worker.postMessage({ type: 'reinit', generation: this.generation });
      }
      this.watchdog(needModel ? 60000 : 15000, needModel ? 'AI 启动超时，请重试' : '规则引擎启动超时，请重试');
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'AI 启动失败');
    }
  };
  private needsModel(data: ComputeData) {
    return data.gameType !== 'Gomoku' && !(data.difficulty === 'Fun' && data.mode !== 'analyze');
  }
  request(data: ComputeData): boolean {
    if (this.failed || this.active || this.pending) return false;
    this.pending = snapshot(data);
    this.update({ isThinking: true, ...(data.mode === 'analyze' ? { aiTerritory: null } : {}) });
    if (data.difficulty === 'Fun' && data.gameType !== 'Gomoku' && data.mode !== 'analyze') {
      this.drain(true);
    } else if (this.phase === 'ready' && (!this.needsModel(data) || !this.thin)) {
      this.drain();
    } else {
      this.initializeAI({ needModel: this.needsModel(data) });
    }
    return true;
  }
  private drain(local = false) {
    const data = this.pending;
    if (!data) return;
    this.pending = null;
    const identity: ActiveRequest = { requestId: ++this.nextRequest, generation: this.generation, mode: data.mode ?? 'play', purpose: data.purpose };
    this.active = identity;
    this.deps.onRequest();
    if (local) {
      this.update({ aiWinRate: 50, aiLead: null, aiScoreStdev: null, aiTerritory: null });
      this.requestTimer = setTimeout(() => {
        if (!this.matches(identity)) return;
        try { this.complete(identity, { move: this.deps.beginnerMove(data), winRate: 50 }); }
        catch (error) { this.fail(error instanceof Error ? error.message : 'AI 计算失败'); }
      }, 180);
      return;
    }
    this.requestTimer = setTimeout(() => {
      if (this.matches(identity)) this.fail('AI 计算超时，请重试');
    }, 25000);
    try { this.worker?.postMessage({ type: 'compute', ...identity, data }); }
    catch (error) { this.fail(error instanceof Error ? error.message : 'AI 请求失败'); }
  }
  private complete(identity: RequestIdentity, data: ResponseData) {
    if (!this.matches(identity)) return;
    const mode = this.active!.mode;
    const purpose = this.active!.purpose;
    this.clearRequest();
    const ownership = data.ownership ? new Float32Array(data.ownership) : null;
    this.update({ isThinking: false, aiTerritory: ownership, ...(mode === 'play' ? {
      aiWinRate: data.winRate, aiLead: data.lead ?? null, aiScoreStdev: data.scoreStdev ?? null,
    } : {}) });
    if (mode === 'play') this.deps.onMove(data.move);
    else this.deps.onAnalysis({ winRate: data.winRate, lead: data.lead ?? 0, ownership,
      ...(purpose === 'coach' ? { purpose, visits: data.visits, candidates: data.candidates,
        estimatedBlackLead: data.estimatedBlackLead } : {}) });
  }
  stopThinking = () => {
    this.generation++;
    this.clearRequest();
    this.pendingInit = null;
    if (this.statusTimer !== null) clearTimeout(this.statusTimer);
    this.statusTimer = null;
    if (this.phase === 'initializing' || this.phase === 'releasing') this.destroyWorker();
    else this.worker?.postMessage({ type: 'stop', generation: this.generation });
    this.update({ isThinking: false, isInitializing: false, isLoading: false, isWorkerReady: this.phase === 'ready' });
  };
  terminateAI = () => {
    this.failed = false;
    this.generation++;
    this.clearRequest();
    this.pendingInit = null;
    this.destroyWorker();
    this.update({ isWorkerReady: false, isLoading: false, isInitializing: false, isThinking: false, initStatus: '' });
  };
  resetAI = () => {
    this.failed = false;
    this.stopThinking();
    this.update({ ...initialAiState() });
    if (this.worker) {
      this.phase = 'releasing';
      this.worker.postMessage({ type: 'release', generation: this.generation });
      this.watchdog(15000, 'AI 资源释放超时，请重试');
    }
  };
  dispose() {
    this.generation++;
    this.clearRequest();
    this.pendingInit = null;
    this.destroyWorker();
  }
}
