import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createRoomServer, isValidRoomCode, type RoomServerHandle } from '../../server/roomServer';

let srv: RoomServerHandle;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  srv = await createRoomServer({ port: 0 });
  baseUrl = `http://127.0.0.1:${srv.port}`;
  wsUrl = `ws://127.0.0.1:${srv.port}/ws`;
});

afterAll(async () => {
  await srv.close();
});

function nextJsonMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
  });
}

describe('Room Server HTTP & WebSocket Integration', () => {
  it('validates room creation, lookup, bad codes, full rejection, and live host/guest relay', async () => {
    const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
    expect(health.ok).toBe(true);

    // Reject ambiguous or malformed room codes
    const badRes = await fetch(`${baseUrl}/api/room/0OIL`);
    expect(badRes.status).toBe(400);
    const missingRes = await fetch(`${baseUrl}/api/room/WXYZ`);
    expect(missingRes.status).toBe(404);

    // Host creates room
    const createRes = await fetch(`${baseUrl}/api/room`, { method: 'POST' });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { code: string; role: string };
    expect(isValidRoomCode(created.code)).toBe(true);

    // Connect Host WebSocket
    const hostWs = new WebSocket(`${wsUrl}?code=${created.code}&role=host`);
    const hostJoined = await nextJsonMessage(hostWs);
    expect(hostJoined.t).toBe('joined');
    expect(hostJoined.role).toBe('host');

    // Guest checks room status & joins
    const checkRes = await fetch(`${baseUrl}/api/room/${created.code}`);
    expect(checkRes.status).toBe(200);

    const guestWs = new WebSocket(`${wsUrl}?code=${created.code}&role=guest`);
    const guestJoinedPromise = nextJsonMessage(guestWs);
    const hostPeerPromise = nextJsonMessage(hostWs);
    const [guestJoined, hostPeer] = await Promise.all([guestJoinedPromise, hostPeerPromise]);
    expect(guestJoined.t).toBe('joined');
    expect(guestJoined.role).toBe('guest');
    expect(hostPeer.t).toBe('peerJoined');

    // 3rd player trying to join full room is rejected with 409
    const fullRes = await fetch(`${baseUrl}/api/room/${created.code}`);
    expect(fullRes.status).toBe(409);

    // Host sends lobby selection -> guest receives
    const lobbyWait = nextJsonMessage(guestWs);
    hostWs.send(JSON.stringify({ t: 'lobby', lobby: { stage: 'jantar', p1: 'thor' } }));
    const lobbyMsg = await lobbyWait;
    expect(lobbyMsg.t).toBe('lobby');
    expect((lobbyMsg.lobby as { stage: string }).stage).toBe('jantar');

    // Guest sends binary 6-byte packed input -> host receives binary buffer identically
    const binPromise = new Promise<Buffer>((resolve) => {
      hostWs.once('message', (data) => resolve(Buffer.from(data as ArrayBuffer)));
    });
    const buf = new ArrayBuffer(6);
    const dv = new DataView(buf);
    dv.setUint32(0, 42, true);
    dv.setUint16(4, 0b00010101, true);
    guestWs.send(buf);
    const echoed = await binPromise;
    expect(echoed.readUInt32LE(0)).toBe(42);
    expect(echoed.readUInt16LE(4)).toBe(0b00010101);

    // Guest disconnects -> Host gets 'bye' and room cleans up when host closes
    const byeWait = nextJsonMessage(hostWs);
    guestWs.close();
    const byeMsg = await byeWait;
    expect(byeMsg.t).toBe('bye');

    hostWs.close();
    await new Promise((r) => setTimeout(r, 40));
    expect(srv.rooms.has(created.code)).toBe(false);
  });
});
