import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Redis } from 'ioredis';

type Role = 'host' | 'guest';

interface ClientMeta {
  ws: WebSocket;
  clientId: string;
  roomCode: string | null;
  role: Role | null;
  lastTouch: number;
  closed: boolean;
}

interface RoomRecord {
  hostId: string;
  hostSeen: number;
  guestId: string;
  guestSeen: number;
}

interface BusEnvelope {
  origin: string;
  senderId: string;
  payload: Record<string, unknown>;
}

const INSTANCE_ID = crypto.randomBytes(6).toString('hex');
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SEC = 7200;
const STALE_SLOT_MS = 25_000;
const MAX_FRAME_BYTES = 16_384;

const localRooms = new Map<string, Set<ClientMeta>>();
const memoryMeta = new Map<string, RoomRecord>();

const redisUrl = process.env.REDIS_URL?.trim() || '';
let pub: Redis | null = null;
let sub: Redis | null = null;
let redisReady = false;

const roomChannel = (code: string) => `kurokaze:room:${code}`;
const metaKey = (code: string) => `kurokaze:meta:${code}`;

if (redisUrl) {
  const opts = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 3000),
  };

  pub = new Redis(redisUrl, opts);
  sub = new Redis(redisUrl, opts);

  pub.on('ready', () => {
    redisReady = true;
  });
  pub.on('error', (err) => {
    console.error('[kurokaze-ws] redis pub error:', err.message);
  });
  sub.on('error', (err) => {
    console.error('[kurokaze-ws] redis sub error:', err.message);
  });

  // Re-subscribe active rooms if Redis briefly reconnects
  sub.on('ready', () => {
    for (const code of localRooms.keys()) {
      sub?.subscribe(roomChannel(code)).catch(() => {});
    }
  });

  sub.on('message', (channel, raw) => {
    if (!channel.startsWith('kurokaze:room:')) return;
    const code = channel.slice('kurokaze:room:'.length);
    const peers = localRooms.get(code);
    if (!peers || peers.size === 0) return;

    let env: BusEnvelope;
    try {
      env = JSON.parse(raw) as BusEnvelope;
    } catch {
      return;
    }
    if (env.origin === INSTANCE_ID) return;

    const encoded = JSON.stringify(env.payload);
    for (const peer of peers) {
      if (peer.clientId !== env.senderId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(encoded);
      }
    }
  });
}

function sendJson(ws: WebSocket, data: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function cleanCode(input: unknown): string {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function cleanId(input: unknown): string {
  const cleaned = String(input ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 36);
  return cleaned || crypto.randomBytes(8).toString('hex');
}

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ROOM_CHARS[crypto.randomInt(0, ROOM_CHARS.length)];
  }
  return out;
}

function rawToString(data: RawData): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}

async function getRoomMeta(code: string): Promise<RoomRecord> {
  if (pub) {
    const h = await pub.hgetall(metaKey(code));
    return {
      hostId: h.hostId || '',
      hostSeen: Number(h.hostSeen || 0),
      guestId: h.guestId || '',
      guestSeen: Number(h.guestSeen || 0),
    };
  }
  return (
    memoryMeta.get(code) || {
      hostId: '',
      hostSeen: 0,
      guestId: '',
      guestSeen: 0,
    }
  );
}

async function saveRoomMeta(code: string, rec: RoomRecord): Promise<void> {
  if (pub) {
    await pub
      .multi()
      .hset(metaKey(code), {
        hostId: rec.hostId,
        hostSeen: String(rec.hostSeen),
        guestId: rec.guestId,
        guestSeen: String(rec.guestSeen),
      })
      .expire(metaKey(code), ROOM_TTL_SEC)
      .exec();
  } else {
    memoryMeta.set(code, rec);
  }
}

async function touchSlot(meta: ClientMeta): Promise<void> {
  if (!meta.roomCode || !meta.role) return;
  const now = Date.now();
  if (now - meta.lastTouch < 10_000) return;
  meta.lastTouch = now;

  const field = meta.role === 'host' ? 'hostSeen' : 'guestSeen';
  if (pub) {
    pub
      .multi()
      .hset(metaKey(meta.roomCode), field, String(now))
      .expire(metaKey(meta.roomCode), ROOM_TTL_SEC)
      .exec()
      .catch(() => {});
  } else {
    const rec = memoryMeta.get(meta.roomCode);
    if (rec) rec[field] = now;
  }
}

function hasLocalRole(code: string, role: Role, exceptId?: string): boolean {
  const peers = localRooms.get(code);
  if (!peers) return false;
  for (const p of peers) {
    if (p.role === role && p.clientId !== exceptId && p.ws.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

async function addLocalPeer(code: string, meta: ClientMeta): Promise<void> {
  let peers = localRooms.get(code);
  const firstLocal = !peers || peers.size === 0;
  if (!peers) {
    peers = new Set();
    localRooms.set(code, peers);
  }

  // Replace any stale local socket with the same clientId
  for (const existing of peers) {
    if (existing.clientId === meta.clientId && existing !== meta) {
      peers.delete(existing);
      try {
        existing.ws.close(4000, 'Replaced by reconnect');
      } catch {}
    }
  }
  peers.add(meta);

  if (firstLocal && sub) {
    await sub.subscribe(roomChannel(code)).catch(() => {});
  }
}

async function broadcastToPeer(
  code: string,
  senderId: string,
  payload: Record<string, unknown>,
  alwaysPublishToRedis = false
): Promise<void> {
  const peers = localRooms.get(code);
  const encoded = JSON.stringify(payload);
  let deliveredLocally = 0;

  if (peers) {
    for (const peer of peers) {
      if (peer.clientId !== senderId && peer.ws.readyState === WebSocket.OPEN) {
        peer.ws.send(encoded);
        deliveredLocally++;
      }
    }
  }

  // Skip Redis publish for gameplay relay frames if opponent is already on this same instance
  if (pub && (alwaysPublishToRedis || deliveredLocally === 0)) {
    const env: BusEnvelope = { origin: INSTANCE_ID, senderId, payload };
    pub.publish(roomChannel(code), JSON.stringify(env)).catch(() => {});
  }
}

async function detachClient(meta: ClientMeta, explicitLeave: boolean): Promise<void> {
  if (!meta.roomCode) return;
  const code = meta.roomCode;
  const role = meta.role;
  meta.roomCode = null;
  meta.role = null;

  const peers = localRooms.get(code);
  if (peers) {
    peers.delete(meta);
    if (peers.size === 0) {
      localRooms.delete(code);
      if (sub) {
        sub.unsubscribe(roomChannel(code)).catch(() => {});
      }
    }
  }

  if (explicitLeave && role) {
    const rec = await getRoomMeta(code);
    if (role === 'host' && rec.hostId === meta.clientId) {
      rec.hostId = '';
      rec.hostSeen = 0;
    } else if (role === 'guest' && rec.guestId === meta.clientId) {
      rec.guestId = '';
      rec.guestSeen = 0;
    }
    await saveRoomMeta(code, rec);
    await broadcastToPeer(code, meta.clientId, { t: 'peer_left', role }, true);
  } else if (role) {
    // Unexpected disconnect (e.g. 300s Hobby timeout or mobile backgrounding) — keep slot for quick reconnect
    await broadcastToPeer(code, meta.clientId, { t: 'peer_reconnecting', role }, true);
  }
}

async function handleCreate(meta: ClientMeta): Promise<void> {
  if (meta.roomCode) await detachClient(meta, true);

  let code = randomCode();
  for (let i = 0; i < 6; i++) {
    const existing = await getRoomMeta(code);
    const active =
      (existing.hostId && Date.now() - existing.hostSeen < STALE_SLOT_MS) ||
      (existing.guestId && Date.now() - existing.guestSeen < STALE_SLOT_MS);
    if (!active) break;
    code = randomCode();
  }

  const now = Date.now();
  await saveRoomMeta(code, {
    hostId: meta.clientId,
    hostSeen: now,
    guestId: '',
    guestSeen: 0,
  });

  meta.roomCode = code;
  meta.role = 'host';
  meta.lastTouch = now;
  await addLocalPeer(code, meta);

  sendJson(meta.ws, {
    t: 'created',
    code,
    role: 'host',
    redis: Boolean(pub),
  });
}

async function handleJoin(meta: ClientMeta, rawCode: unknown): Promise<void> {
  const code = cleanCode(rawCode);
  if (code.length < 4) {
    sendJson(meta.ws, { t: 'err', msg: 'Enter a valid 4-letter room code.' });
    return;
  }

  if (meta.roomCode && meta.roomCode !== code) {
    await detachClient(meta, true);
  }

  const now = Date.now();
  const rec = await getRoomMeta(code);
  const hostFresh =
    Boolean(rec.hostId) &&
    (now - rec.hostSeen < STALE_SLOT_MS || hasLocalRole(code, 'host', meta.clientId));
  const guestFresh =
    Boolean(rec.guestId) &&
    (now - rec.guestSeen < STALE_SLOT_MS || hasLocalRole(code, 'guest', meta.clientId));

  let assigned: Role | null = null;
  let peerPresent = false;

  if (rec.hostId === meta.clientId) {
    assigned = 'host';
    rec.hostSeen = now;
    peerPresent = guestFresh;
  } else if (rec.guestId === meta.clientId) {
    assigned = 'guest';
    rec.guestSeen = now;
    peerPresent = hostFresh;
  } else if (!hostFresh) {
    assigned = 'host';
    rec.hostId = meta.clientId;
    rec.hostSeen = now;
    peerPresent = guestFresh;
  } else if (!guestFresh) {
    assigned = 'guest';
    rec.guestId = meta.clientId;
    rec.guestSeen = now;
    peerPresent = hostFresh;
  } else {
    sendJson(meta.ws, { t: 'err', msg: `Room ${code} is full (2/2 players).` });
    return;
  }

  await saveRoomMeta(code, rec);
  meta.roomCode = code;
  meta.role = assigned;
  meta.lastTouch = now;
  await addLocalPeer(code, meta);

  sendJson(meta.ws, {
    t: 'joined',
    code,
    role: assigned,
    peerPresent,
    redis: Boolean(pub),
  });

  await broadcastToPeer(
    code,
    meta.clientId,
    { t: 'peer_joined', role: assigned, clientId: meta.clientId },
    true
  );
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify({
      ok: true,
      service: 'kurokaze-ws',
      mode: pub ? (redisReady ? 'redis-connected' : 'redis-connecting') : 'memory-only',
      activeLocalRooms: localRooms.size,
      url: req.url,
    })
  );
});

const wss = new WebSocketServer({ server, maxPayload: MAX_FRAME_BYTES });

wss.on('connection', (ws) => {
  const meta: ClientMeta = {
    ws,
    clientId: crypto.randomBytes(8).toString('hex'),
    roomCode: null,
    role: null,
    lastTouch: 0,
    closed: false,
  };

  const cleanup = () => {
    if (meta.closed) return;
    meta.closed = true;
    detachClient(meta, false).catch(() => {});
  };

  // Attach listeners synchronously so the client's very first frame is never dropped
  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(rawToString(raw)) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.clientId) {
      meta.clientId = cleanId(msg.clientId);
    }

    switch (msg.t) {
      case 'ping':
        sendJson(ws, { t: 'pong', ts: msg.ts });
        touchSlot(meta).catch(() => {});
        break;
      case 'create':
        handleCreate(meta).catch(() =>
          sendJson(ws, { t: 'err', msg: 'Failed to create room.' })
        );
        break;
      case 'join':
        handleJoin(meta, msg.code).catch(() =>
          sendJson(ws, { t: 'err', msg: 'Failed to join room.' })
        );
        break;
      case 'relay':
        if (meta.roomCode && msg.p !== undefined) {
          touchSlot(meta).catch(() => {});
          broadcastToPeer(
            meta.roomCode,
            meta.clientId,
            { t: 'relay', from: meta.role, p: msg.p },
            false
          ).catch(() => {});
        }
        break;
      case 'leave':
        detachClient(meta, true).catch(() => {});
        break;
      default:
        break;
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

export default server;
