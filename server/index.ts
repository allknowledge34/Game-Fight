import path from 'node:path';
import { createRoomServer } from './roomServer';

const port = Number(process.env.PORT ?? 8787);
const staticDir = path.resolve(process.cwd(), 'dist');

createRoomServer({ port, staticDir }).then((handle) => {
  console.log(`[room-server] listening on http://127.0.0.1:${handle.port}`);
});
