import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { Redis } from 'ioredis';

type Role = 'host' | 'guest';
type RelayPath = 'ram' | 'redis' | 'idle';

interface ClientMeta {
  ws: WebSocket;
  clientId: string;
  roomCode: string | null;
  role: Role | null;
  lastTouch: number;
  lastRx: number;
  peerPresent: boolean;
  relayPath: RelayPath;
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
  volatile: boolean;
  payload: Record<string, unknown>;
}

const INSTANCE_ID = crypto.randomBytes(6).toString('hex');
const REGION = process.env.VERCEL_REGION || 'local';
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SEC = 7200;
const STALE_SLOT_MS = 25_000;
const IDLE_TIMEOUT_MS = 35_000;
const MAX_FRAME_BYTES = 16_384;
const MAX_VOLATILE_BUFFER = 4096;

const localRooms = new Map<string, Set<ClientMeta>>();
const memoryMeta = new Map<string, RoomRecord>();
let activeClients = 0;
let droppedVolatileFrames = 0;

const redisUrl = process.env.REDIS_URL?.trim() || '';
let pub: Redis | null = null;
let sub: Redis | null = null;
let redisReady = false;

const roomChannel = (code: string) => `kurokaze:room:${code}`;
const metaKey = (code: string) => `kurokaze:meta:${code}`;

if (redisUrl) {
  const opts = {
    noDelay: true,
    keepAlive: 10_000,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 3000),
  };

  pub = new Redis(redisUrl, opts);
  sub = new Redis(redisUrl, opts);

  pub.on('ready', () => {
    redisReady = true;
  });
  pub.on('close', () => {
    redisReady = false;
  });
  pub.on('error', (err) => {
    console.error('[kurokaze-ws] redis pub error:', err.message);
  });
  sub.on('error', (err) => {
    console.error('[kurokaze-ws] redis sub error:', err.message);
  });

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
      if (peer.clientId === env.senderId || peer.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (env.payload.t === 'peer_joined') {
        peer.peerPresent = true;
        peer.relayPath = 'redis';
      } else if (env.payload.t === 'peer_left') {
        peer.peerPresent = false;
        peer.relayPath = 'idle';
      } else if (env.payload.t === 'relay') {
        peer.peerPresent = true;
        peer.relayPath = 'redis';
      }

      if (env.volatile && peer.ws.bufferedAmount > MAX_VOLATILE_BUFFER) {
        droppedVolatileFrames++;
        continue;
      }
      peer.ws.send(encoded);
    }
  });
}

// Reap zombie sockets (e.g. mobile devices dropping off network silently)
const reaper = setInterval(() => {
  const now = Date.now();
  for (const peers of localRooms.values()) {
    for (const peer of peers) {
      if (now - peer.lastRx > IDLE_TIMEOUT_MS) {
        try {
          peer.ws.terminate();
        } catch {}
      }
    }
  }
}, 15_000);
reaper.unref();

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
  if (pub && redisReady) {
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
  if (pub && redisReady) {
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

function touchSlot(meta: ClientMeta): void {
  if (!meta.roomCode || !meta.role) return;
  const now = Date.now();
  if (now - meta.lastTouch < 10_000) return;
  meta.lastTouch = now;

  const field = meta.role === 'host' ? 'hostSeen' : 'guestSeen';
  if (pub && redisReady) {
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

function broadcastToPeer(
  sender: ClientMeta,
  code: string,
  payload: Record<string, unknown>,
  opts: { alwaysRedis?: boolean; volatile?: boolean } = {}
): void {
  const volatile = Boolean(opts.volatile);
  const alwaysRedis = Boolean(opts.alwaysRedis);
  const peers = localRooms.get(code);
  const encoded = JSON.stringify(payload);
  let deliveredLocally = 0;

  if (peers) {
    for (const peer of peers) {
      if (peer.clientId === sender.clientId || peer.ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      if (payload.t === 'peer_joined') {
        peer.peerPresent = true;
        peer.relayPath = 'ram';
      } else if (payload.t === 'peer_left') {
        peer.peerPresent = false;
        peer.relayPath = 'idle';
      }

      if (volatile && peer.ws.bufferedAmount > MAX_VOLATILE_BUFFER) {
        droppedVolatileFrames++;
        deliveredLocally++;
        continue;
      }

      peer.ws.send(encoded);
      deliveredLocally++;
    }
  }

  if (deliveredLocally > 0) {
    sender.peerPresent = payload.t !== 'peer_left';
    sender.relayPath = 'ram';
  }

  // Publish to Redis only when needed (control events or cross-instance opponent)
  const needsRedis =
    Boolean(pub && redisReady) &&
    (alwaysRedis || (deliveredLocally === 0 && (!volatile || sender.peerPresent)));

  if (needsRedis && pub) {
    if (deliveredLocally === 0 && payload.t === 'relay') {
      sender.relayPath = 'redis';
    }
    const env: BusEnvelope = {
      origin: INSTANCE_ID,
      senderId: sender.clientId,
      volatile,
      payload,
    };
    pub.publish(roomChannel(code), JSON.stringify(env)).catch(() => {});
  }
}

async function detachClient(meta: ClientMeta, explicitLeave: boolean): Promise<void> {
  if (!meta.roomCode) return;
  const code = meta.roomCode;
  const role = meta.role;
  meta.roomCode = null;
  meta.role = null;
  meta.peerPresent = false;
  meta.relayPath = 'idle';

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
    broadcastToPeer(meta, code, { t: 'peer_left', role }, { alwaysRedis: true });
  } else if (role) {
    broadcastToPeer(meta, code, { t: 'peer_reconnecting', role }, { alwaysRedis: true });
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
  meta.peerPresent = false;
  meta.relayPath = 'idle';
  await addLocalPeer(code, meta);

  sendJson(meta.ws, {
    t: 'created',
    code,
    role: 'host',
    redis: Boolean(pub && redisReady),
    region: REGION,
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
  meta.peerPresent = peerPresent;

  const otherRole: Role = assigned === 'host' ? 'guest' : 'host';
  const localPeer = hasLocalRole(code, otherRole, meta.clientId);
  meta.relayPath = localPeer ? 'ram' : peerPresent ? 'redis' : 'idle';

  await addLocalPeer(code, meta);

  sendJson(meta.ws, {
    t: 'joined',
    code,
    role: assigned,
    peerPresent,
    redis: Boolean(pub && redisReady),
    region: REGION,
    path: meta.relayPath,
  });

  broadcastToPeer(
    meta,
    code,
    { t: 'peer_joined', role: assigned, clientId: meta.clientId },
    { alwaysRedis: true }
  );
}

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(
    JSON.stringify({
      ok: true,
      service: 'kurokaze-ws',
      version: 2,
      region: REGION,
      instance: INSTANCE_ID,
      mode: pub ? (redisReady ? 'redis-connected' : 'redis-connecting') : 'memory-only',
      activeLocalRooms: localRooms.size,
      activeClients,
      droppedVolatileFrames,
      url: req.url,
    })
  );
});

const wss = new WebSocketServer({
  server,
  maxPayload: MAX_FRAME_BYTES,
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  // Disable Nagle's algorithm so small game packets flush immediately
  req.socket?.setNoDelay?.(true);
  req.socket?.setKeepAlive?.(true, 15_000);

  activeClients++;
  const now = Date.now();
  const meta: ClientMeta = {
    ws,
    clientId: crypto.randomBytes(8).toString('hex'),
    roomCode: null,
    role: null,
    lastTouch: 0,
    lastRx: now,
    peerPresent: false,
    relayPath: 'idle',
    closed: false,
  };

  const cleanup = () => {
    if (meta.closed) return;
    meta.closed = true;
    activeClients = Math.max(0, activeClients - 1);
    detachClient(meta, false).catch(() => {});
  };

  ws.on('message', (raw) => {
    meta.lastRx = Date.now();
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
        sendJson(ws, {
          t: 'pong',
          ts: msg.ts,
          srv: Date.now(),
          region: REGION,
          path: meta.relayPath,
        });
        touchSlot(meta);
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
          touchSlot(meta);
          const volatile = msg.v === 1 || msg.v === true;
          broadcastToPeer(
            meta,
            meta.roomCode,
            { t: 'relay', from: meta.role, p: msg.p },
            { volatile }
          );
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
