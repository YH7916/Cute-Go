import type { Player } from '../../types';
import type { PlatformOpponentSummary } from '../../services/platform';
import { parseNativeMatchMessage } from '../../services/platform/nativeMatchMessages';
import type { NativeMatchMessage } from '../../services/platform/nativeMatchMessages';
import type { OnlineRoomRequest } from './sessionLifecycle';
import type { UseOnlineMatchOptions } from './types';

interface RoomMessageEffects {
  options(): UseOnlineMatchOptions;
  isCurrent(): boolean;
  color(value: Player): void;
  opponent(value: PlatformOpponentSummary): void;
  connected(): void;
  failed(): void;
}

// Handshake and protocol state belong to one room request, never to the render
// that happened to create its callbacks. Board mutations still use existing refs.
export class OnlineRoomMessages {
  private hostStarted = false;
  private synchronized = false;
  private peerAway = false;
  private gameReady = false;
  private handshake = 0;
  private sequence = 0;
  private readonly stream = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  private readonly received = new Set<string>();

  constructor(private readonly request: OnlineRoomRequest, private readonly effects: RoomMessageEffects) {}

  async send(message: NativeMatchMessage, isCurrent = this.effects.isCurrent): Promise<boolean> {
    const room = this.request.room;
    if (!room || !isCurrent()) return false;
    const id = `${this.stream}:${++this.sequence}`;
    this.received.add(id); // Ignore a room-wide echo of our own outgoing message.
    try {
      // Older clients ignore this optional field; legacy messages remain accepted.
      const sent = await room.send({ ...message, __cuteGoMessageId: id });
      if (!isCurrent()) return false;
      if (!sent) this.effects.options().setToastMsg('联机消息发送失败，请检查网络');
      return sent;
    } catch (error) {
      console.warn('[Online] Failed to send room message:', error);
      if (isCurrent()) this.effects.options().setToastMsg('联机消息发送失败，请检查网络');
      return false;
    }
  }

  receive(payload: unknown): void {
    if (!this.effects.isCurrent()) return;
    const options = this.effects.options();
    const message = parseNativeMatchMessage(payload, options.boardSizeRef.current);
    if (!message) return;
    const id = payload && typeof payload === 'object' && '__cuteGoMessageId' in payload
      ? payload.__cuteGoMessageId : undefined;
    if (id !== undefined) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 160 || this.received.has(id)) return;
      this.received.add(id);
    }
    if (message.type === 'MOVE' || message.type === 'PASS') {
      if (!this.gameReady) return;
      if (options.myColorRef.current === null || options.currentPlayerRef.current === options.myColorRef.current) return;
      if (message.type === 'MOVE') options.executeMoveRef.current(message.x, message.y, true);
      else options.handlePassRef.current(true);
    } else if (message.type === 'SYNC') {
      if (this.request.room?.isHost) return;
      if (!this.synchronized) {
        this.synchronized = true;
        this.peerAway = false;
        this.handshake++;
        this.gameReady = true;
        this.configure(message.boardSize, message.gameType, message.startColor);
        if (message.opponentInfo) this.effects.opponent(message.opponentInfo);
        options.resetGameRef.current(true, message.boardSize, false);
        options.vibrate(20);
        this.effects.connected();
      }
      const handshake = this.handshake;
      if (options.session) void this.send({ type: 'SYNC_REPLY', opponentInfo: { id: options.session.user.id } },
        () => this.effects.isCurrent() && handshake === this.handshake);
    } else if (message.type === 'SYNC_REPLY') {
      if (this.request.room?.isHost && message.opponentInfo) this.effects.opponent(message.opponentInfo);
    } else if (message.type === 'RESTART') {
      if (this.gameReady) options.resetGameRef.current(true, undefined, false);
    }
  }

  peerJoined(peer: PlatformOpponentSummary): void {
    if (!this.effects.isCurrent()) return;
    if (peer.id === this.request.room?.playerId) {
      this.effects.options().setToastMsg('检测到同一 TapTap 玩家进入房间，请换一个账号测试联机。');
      return;
    }
    this.peerAway = false;
    this.effects.opponent(peer);
    if (this.request.room?.isHost) void this.startHost();
  }

  async startHost(): Promise<void> {
    if (this.peerAway || this.hostStarted || !this.request.room?.isHost || !this.effects.isCurrent()) return;
    const options = this.effects.options();
    if (!options.session) return;
    this.hostStarted = true;
    this.gameReady = true;
    const handshake = ++this.handshake;
    const isCurrent = () => this.effects.isCurrent() && handshake === this.handshake;
    const { boardSize, gameType } = this.request.config;
    this.configure(boardSize, gameType, 'white');
    options.resetGameRef.current(true, boardSize, false);
    const sent = await this.send({ type: 'SYNC', boardSize, gameType, startColor: 'black',
      opponentInfo: { id: options.session.user.id } }, isCurrent);
    if (!isCurrent()) return;
    if (sent) this.effects.connected(); else this.effects.failed();
  }

  peerDeparted(): boolean {
    if (this.peerAway) return false;
    this.peerAway = true;
    this.handshake++;
    this.gameReady = false;
    this.hostStarted = false;
    this.synchronized = false;
    return true;
  }

  private configure(
    boardSize: UseOnlineMatchOptions['settings']['boardSize'],
    gameType: UseOnlineMatchOptions['settings']['gameType'], color: Player,
  ): void {
    const options = this.effects.options();
    options.settings.setBoardSize(boardSize);
    options.boardSizeRef.current = boardSize;
    options.settings.setGameType(gameType);
    options.gameTypeRef.current = gameType;
    options.settings.setGameMode('PvP');
    options.myColorRef.current = color;
    this.effects.color(color);
  }
}
