import type { Difficulty, FighterId, PlayerInput, StageId } from '../core/types';
import { packPlayerInput, unpackPlayerInput } from '../input/inputEncoding';
import type { BattleStateSnapshot } from '../simulation/BattleSimulation';

export type RoomRole = 'host' | 'guest';

export interface LobbyState {
  p1: FighterId;
  p2: FighterId;
  stage: StageId;
  difficulty: Difficulty;
}

export interface NetEvents {
  onPeerJoined?: () => void;
  onLobby?: (lobby: Partial<LobbyState>) => void;
  onStart?: (lobby: LobbyState, seed: number) => void;
  onRemoteInput?: (tick: number, input: PlayerInput) => void;
  onSnapshot?: (snap: BattleStateSnapshot) => void;
  onRematch?: () => void;
  onAway?: (away: boolean) => void;
  onEnd?: (reason: string) => void;
}

export function normalizeCodeInput(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function isAllowedRoomCode(raw: string): boolean {
  return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/.test(normalizeCodeInput(raw));
}

export class NetClient {
  role: RoomRole | null = null;
  code = '';
  peerConnected = false;
  rttMs = 0;

  private ws: WebSocket | null = null;
  private pingTimer: number | null = null;
  private readonly ev: NetEvents;

  constructor(ev: NetEvents = {}) {
    this.ev = ev;
  }

  async hostRoom(): Promise<string> {
    this.close();
    const res = await fetch('/api/room', { method: 'POST' });
    if (!res.ok) throw new Error('Could not create room on server.');
    const data = (await res.json()) as { code: string };
    this.role = 'host';
    this.code = data.code;
    await this.connectWs(data.code, 'host');
    return data.code;
  }

  async joinRoom(rawCode: string): Promise<{ code: string; lobby: LobbyState }> {
    this.close();
    const code = normalizeCodeInput(rawCode);
    if (!isAllowedRoomCode(code)) {
      throw new Error('Enter a valid 4-character room code (e.g. ABCD).');
    }
    const res = await fetch(`/api/room/${encodeURIComponent(code)}`);
    const body = (await res.json()) as { error?: string; lobby?: LobbyState };
    if (!res.ok) {
      throw new Error(body.error ?? `Could not join room ${code}.`);
    }
    this.role = 'guest';
    this.code = code;
    await this.connectWs(code, 'guest');
    this.peerConnected = true;
    return {
      code,
      lobby: body.lobby ?? { p1: 'modi', p2: 'rahul', stage: 'sansad', difficulty: 'normal' },
    };
  }

  private connectWs(code: string, role: RoomRole): Promise<void> {
    return new Promise((resolve, reject) => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?code=${encodeURIComponent(code)}&role=${role}`;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      let settled = false;
      ws.onopen = () => {
        this.pingTimer = window.setInterval(() => {
          this.sendJson({ t: 'ping', ts: performance.now() });
        }, 2500);
      };

      ws.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) {
          const view = new DataView(e.data);
          if (view.byteLength >= 6) {
            const tick = view.getUint32(0, true);
            const mask = view.getUint16(4, true);
            this.ev.onRemoteInput?.(tick, unpackPlayerInput(mask));
          }
          return;
        }
        try {
          const msg = JSON.parse(String(e.data)) as Record<string, unknown>;
          if (msg.t === 'joined') {
            this.peerConnected = Boolean(msg.peerConnected);
            if (!settled) {
              settled = true;
              resolve();
            }
          } else if (msg.t === 'err') {
            const err = new Error(String(msg.message ?? 'Connection failed.'));
            if (!settled) {
              settled = true;
              reject(err);
            } else {
              this.ev.onEnd?.(err.message);
            }
          } else if (msg.t === 'pong') {
            const ts = Number(msg.ts ?? 0);
            this.rttMs = Math.max(0, Math.round(performance.now() - ts));
          } else if (msg.t === 'peerJoined') {
            this.peerConnected = true;
            this.ev.onPeerJoined?.();
          } else if (msg.t === 'lobby') {
            this.ev.onLobby?.(msg.lobby as Partial<LobbyState>);
          } else if (msg.t === 'start') {
            this.ev.onStart?.(msg.lobby as LobbyState, Number(msg.seed ?? 2026));
          } else if (msg.t === 'input') {
            this.ev.onRemoteInput?.(Number(msg.tick ?? 0), unpackPlayerInput(Number(msg.mask ?? 0)));
          } else if (msg.t === 'snapshot') {
            this.ev.onSnapshot?.(msg.snap as BattleStateSnapshot);
          } else if (msg.t === 'rematch') {
            this.ev.onRematch?.();
          } else if (msg.t === 'away') {
            this.ev.onAway?.(Boolean(msg.on));
          } else if (msg.t === 'bye') {
            const reason = String(msg.reason ?? 'Friend left the room.');
            this.close(false);
            this.ev.onEnd?.(reason);
          }
        } catch {
          // Ignore invalid JSON message
        }
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket connection failed.'));
        }
      };

      ws.onclose = () => {
        if (this.pingTimer !== null) {
          window.clearInterval(this.pingTimer);
          this.pingTimer = null;
        }
        if (this.ws === ws) {
          this.ws = null;
          if (settled) {
            this.ev.onEnd?.('Disconnected from room.');
          }
        }
      };
    });
  }

  sendJson(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendLobby(lobby: Partial<LobbyState>): void {
    this.sendJson({ t: 'lobby', lobby });
  }

  sendStart(lobby: LobbyState, seed: number): void {
    this.sendJson({ t: 'start', lobby, seed });
  }

  sendInput(tick: number, input: PlayerInput): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const buf = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint32(0, tick >>> 0, true);
    view.setUint16(4, packPlayerInput(input), true);
    this.ws.send(buf);
  }

  sendSnapshot(snap: BattleStateSnapshot): void {
    this.sendJson({ t: 'snapshot', snap });
  }

  sendAway(on: boolean): void {
    this.sendJson({ t: 'away', on });
  }

  sendRematch(): void {
    this.sendJson({ t: 'rematch' });
  }

  close(notify = true): void {
    if (notify && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ t: 'bye', reason: 'Friend left the room.' }));
    }
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) ws.close();
    this.peerConnected = false;
    this.role = null;
    this.code = '';
  }
}
