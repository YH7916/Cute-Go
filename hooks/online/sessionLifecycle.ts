import type { PlatformLiveMatchHandlers, PlatformLiveMatchSession } from '../../services/platform';
import type { OnlineRequestKind, OnlineRoomConfig } from './types';

export interface OnlineRoomRequest {
  kind: OnlineRequestKind;
  config: OnlineRoomConfig;
  room: PlatformLiveMatchSession | null;
  phase: 'pending' | 'active' | 'closed';
  ready: boolean;
  buffered: (() => void)[];
  previousCleanup: Promise<void>;
  cancelWait?: () => void;
}

// Owns the native session and request lifetime. UI timeouts invalidate ownership;
// the underlying SDK promise remains observed until its late room can be left.
export class OnlineSessionLifecycle {
  current: OnlineRoomRequest | null = null;
  private readonly leaving = new WeakMap<PlatformLiveMatchSession, Promise<void>>();
  private cleanup: Promise<void> = Promise.resolve();

  isCurrent(request: OnlineRoomRequest): boolean {
    return this.current === request && request.phase !== 'closed';
  }

  begin(kind: OnlineRequestKind, config: OnlineRoomConfig): OnlineRoomRequest {
    const previousCleanup = this.cancel();
    const request: OnlineRoomRequest = {
      kind, config, room: null, phase: 'pending', ready: false, buffered: [], previousCleanup,
    };
    this.current = request;
    return request;
  }

  cancel(): Promise<void> {
    const request = this.current;
    this.current = null;
    if (!request) return this.cleanup;
    request.phase = 'closed';
    request.buffered = [];
    request.cancelWait?.();
    this.cleanup = request.room ? this.leave(request.room) : request.previousCleanup;
    return this.cleanup;
  }

  private leave(room: PlatformLiveMatchSession): Promise<void> {
    const previous = this.leaving.get(room);
    if (previous) return previous;
    const cleanup = Promise.resolve().then(() => room.leave()).catch(error => {
      console.warn('[Online] Failed to leave room:', error);
    });
    this.leaving.set(room, cleanup);
    return cleanup;
  }

  handlers(request: OnlineRoomRequest, handlers: PlatformLiveMatchHandlers): PlatformLiveMatchHandlers {
    const deliver = (callback: () => void, buffer = true) => {
      if (!this.isCurrent(request)) return;
      if (buffer && !request.ready) request.buffered.push(callback);
      else callback();
    };
    return {
      onMessage: payload => deliver(() => { void handlers.onMessage(payload); }),
      onPeerJoin: peer => deliver(() => { void handlers.onPeerJoin?.(peer); }),
      onPeerLeave: peer => deliver(() => { void handlers.onPeerLeave?.(peer); }, false),
      onPeerOffline: peer => deliver(() => { void handlers.onPeerOffline?.(peer); }, false),
      onDisconnect: () => deliver(() => { void handlers.onDisconnect?.(); }, false),
      onError: error => deliver(() => { void handlers.onError?.(error); }, false),
    };
  }

  flush(request: OnlineRoomRequest): void {
    if (!this.isCurrent(request)) return;
    request.ready = true;
    const buffered = request.buffered;
    request.buffered = [];
    for (const callback of buffered) {
      if (!this.isCurrent(request)) break;
      callback();
    }
  }

  open(
    request: OnlineRoomRequest,
    factory: () => Promise<PlatformLiveMatchSession | null>,
    timeoutMessage: string,
  ): Promise<PlatformLiveMatchSession | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (room: PlatformLiveMatchSession | null, error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.cancelWait = undefined;
        if (error !== undefined) reject(error); else resolve(room);
      };
      request.cancelWait = () => finish(null);
      const timer = setTimeout(() => {
        if (this.isCurrent(request)) {
          request.phase = 'closed';
          request.buffered = [];
          // Retain identity until the hook handles this request's own error.
          finish(null, new Error(timeoutMessage));
        }
      }, 15000);
      const operation = request.previousCleanup.then(() => this.isCurrent(request) ? factory() : null);
      void operation.then(room => {
        if (settled || !this.isCurrent(request)) {
          if (room) void this.leave(room);
          finish(null);
          return;
        }
        request.room = room;
        request.phase = room ? 'active' : 'closed';
        finish(room);
      }, error => {
        if (settled || !this.isCurrent(request)) return;
        request.phase = 'closed';
        request.buffered = [];
        finish(null, error);
      });
    });
  }
}
