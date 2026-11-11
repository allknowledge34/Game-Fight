import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';

const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 15 * 60 * 1000;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== 4) return false;
  for (const ch of code) {
    if (!ROOM_ALPHABET.includes(ch)) return false;
  }
  return true;
}

function generateRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    if (!existing.has(code)) return code;
  }
  throw new Error('Exhausted room codes');
}

export interface RoomRecord {
  code: string;
  createdAt: number;
  hostWs: WebSocket | null;
  guestWs: WebSocket | null;
  lobby: {
    p1: string;
    p2: string;
    stage: string;
    difficulty: string;
  };
}

export interface RoomServerHandle {
  server: http.Server;
  wss: WebSocketServer;
  port: number;
  rooms: Map<string, RoomRecord>;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export async function createRoomServer(options?: {
  port?: number;
  staticDir?: string;
}): Promise<RoomServerHandle> {
  const rooms = new Map<string, RoomRecord>();

  const pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (!room.hostWs && !room.guestWs && now - room.createdAt > ROOM_TTL_MS) {
        rooms.delete(code);
      }
    }
  }, 60_000);

  const sendJson = (res: http.ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (pathname === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, rooms: rooms.size });
      return;
    }

    if (pathname === '/api/room' && req.method === 'POST') {
      const code = generateRoomCode(new Set(rooms.keys()));
      rooms.set(code, {
        code,
        createdAt: Date.now(),
        hostWs: null,
        guestWs: null,
        lobby: { p1: 'kratos', p2: 'wukong', stage: 'sansad', difficulty: 'normal' },
      });
      sendJson(res, 201, { code, role: 'host' });
      return;
    }

    const joinMatch = pathname.match(/^\/api\/room\/([A-Za-z0-9]+)$/);
    if (joinMatch) {
      const code = normalizeRoomCode(joinMatch[1]);
      if (!isValidRoomCode(code)) {
        sendJson(res, 400, { error: 'Invalid room code format. Use 4 valid characters.' });
        return;
      }
      const room = rooms.get(code);
      if (!room) {
        sendJson(res, 404, { error: `Room ${code} not found.` });
        return;
      }
      if (req.method === 'GET') {
        const full = Boolean(room.guestWs && room.guestWs.readyState === WebSocket.OPEN);
        if (full) {
          sendJson(res, 409, { error: `Room ${code} already has 2 players.` });
          return;
        }
        sendJson(res, 200, { code, role: 'guest', lobby: room.lobby });
        return;
      }
      if (req.method === 'DELETE') {
        if (room.hostWs?.readyState === WebSocket.OPEN) {
          room.hostWs.send(JSON.stringify({ t: 'bye', reason: 'Room closed.' }));
          room.hostWs.close();
        }
        if (room.guestWs?.readyState === WebSocket.OPEN) {
          room.guestWs.send(JSON.stringify({ t: 'bye', reason: 'Room closed.' }));
          room.guestWs.close();
        }
        rooms.delete(code);
        sendJson(res, 200, { closed: true });
        return;
      }
    }

    // Serve built static assets in production
    if (options?.staticDir && fs.existsSync(options.staticDir)) {
      const safePath = pathname === '/' ? '/index.html' : pathname;
      const target = path.join(options.staticDir, safePath);
      if (target.startsWith(options.staticDir) && fs.existsSync(target) && fs.statSync(target).isFile()) {
        const ext = path.extname(target);
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
        fs.createReadStream(target).pipe(res);
        return;
      }
      const indexFile = path.join(options.staticDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexFile).pipe(res);
        return;
      }
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url ?? '/ws', 'http://127.0.0.1');
    const code = normalizeRoomCode(reqUrl.searchParams.get('code') ?? '');
    const role = reqUrl.searchParams.get('role') === 'guest' ? 'guest' : 'host';

    const room = rooms.get(code);
    if (!room) {
      ws.send(JSON.stringify({ t: 'err', message: `Room ${code} does not exist.` }));
      ws.close(4004, 'Room not found');
      return;
    }

    if (role === 'host') {
      if (room.hostWs && room.hostWs.readyState === WebSocket.OPEN) {
        room.hostWs.close(4001, 'Replaced');
      }
      room.hostWs = ws;
      ws.send(JSON.stringify({ t: 'joined', role: 'host', code, peerConnected: !!room.guestWs, lobby: room.lobby }));
    } else {
      if (room.guestWs && room.guestWs.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: 'err', message: 'Room is already full.' }));
        ws.close(4009, 'Room full');
        return;
      }
      room.guestWs = ws;
      ws.send(JSON.stringify({ t: 'joined', role: 'guest', code, peerConnected: !!room.hostWs, lobby: room.lobby }));
      if (room.hostWs?.readyState === WebSocket.OPEN) {
        room.hostWs.send(JSON.stringify({ t: 'peerJoined', code }));
      }
    }

    ws.on('message', (data, isBinary) => {
      const peer = role === 'host' ? room.guestWs : room.hostWs;
      if (isBinary) {
        if (peer?.readyState === WebSocket.OPEN) {
          peer.send(data, { binary: true });
        }
        return;
      }

      const raw = data.toString();
      try {
        const msg = JSON.parse(raw) as Record<string, unknown>;
        if (msg.t === 'ping') {
          ws.send(JSON.stringify({ t: 'pong', ts: msg.ts, serverNow: Date.now() }));
          return;
        }
        if (msg.t === 'lobby' && typeof msg.lobby === 'object' && msg.lobby !== null) {
          Object.assign(room.lobby, msg.lobby);
        }
        if (peer?.readyState === WebSocket.OPEN) {
          peer.send(raw);
        }
      } catch {
        // Ignore malformed JSON frames cleanly
      }
    });

    ws.on('close', () => {
      const peer = role === 'host' ? room.guestWs : room.hostWs;
      if (role === 'host') room.hostWs = null;
      else room.guestWs = null;
      if (peer?.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify({ t: 'bye', reason: role === 'host' ? 'Host left the room.' : 'Friend left the room.' }));
      }
      if (!room.hostWs && !room.guestWs) {
        rooms.delete(code);
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(options?.port ?? 8787, '127.0.0.1', resolve);
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : (options?.port ?? 8787);

  return {
    server,
    wss,
    port: actualPort,
    rooms,
    close: async () => {
      clearInterval(pruneInterval);
      for (const client of wss.clients) {
        client.close();
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
