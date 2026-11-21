/* KUROKAZE Online — Low-Latency WebSocket Netcode Client (v2)
 * Matches /api/ws (api/ws.ts v2) with volatile backpressure, reliable queue,
 * automatic 300s/mobile reconnect, and live region/path/RTT telemetry.
 */
(function (global) {
  'use strict';

  const CID_KEY = 'kurokaze_cid_v2';
  const WS_OVERRIDE_KEY = 'kurokaze_ws_override_v2';
  const MAX_VOLATILE_BUFFER = 4096;
  const MAX_RELIABLE_QUEUE = 20;
  const PING_INTERVAL_MS = 2500;
  const CONNECT_TIMEOUT_MS = 10000;
  const BACKOFF_MS = [450, 1000, 1800, 3000];

  function getClientId() {
    try {
      let id = sessionStorage.getItem(CID_KEY);
      if (!id) {
        id = 'kz_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
        sessionStorage.setItem(CID_KEY, id);
      }
      return id;
    } catch {
      return 'kz_' + Math.random().toString(36).slice(2, 12);
    }
  }

  function cleanCode(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  }

  function normalizeWsUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return '';
    let url = trimmed;
    if (/^https:\/\//i.test(url)) url = 'wss://' + url.slice(8);
    else if (/^http:\/\//i.test(url)) url = 'ws://' + url.slice(7);
    else if (!/^wss?:\/\//i.test(url)) url = 'wss://' + url;

    // Append /api/ws if user pasted a bare Vercel host
    try {
      const u = new URL(url);
      if (!u.pathname || u.pathname === '/') u.pathname = '/api/ws';
      return u.toString();
    } catch {
      return url;
    }
  }

  function defaultWsUrl() {
    if (location.protocol === 'https:' || location.protocol === 'http:') {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${location.host}/api/ws`;
    }
    return '';
  }

  const listeners = {
    status: new Set(),
    room: new Set(),
    peer: new Set(),
    relay: new Set(),
    error: new Set(),
  };

  function emit(ev, a, b) {
    const set = listeners[ev];
    if (!set) return;
    for (const fn of set) {
      try {
        fn(a, b);
      } catch (err) {
        console.error('[KuroNet listener error]', ev, err);
      }
    }
  }

  const state = {
    clientId: getClientId(),
    status: 'offline', // offline | connecting | waiting | connected | reconnecting
    role: null,        // 'host' | 'guest' | null
    code: '',
    peerPresent: false,
    ping: 0,
    rawPing: 0,
    halfRtt: 25,
    region: '',
    path: 'idle',      // 'ram' | 'redis' | 'idle'
    redis: false,
    droppedLocal: 0,
    lastErr: '',
    serverUrl: '',
  };

  // Load optional custom server override (?ws=... or localStorage)
  (function initOverride() {
    let override = '';
    try {
      const params = new URLSearchParams(location.search);
      const fromQuery = params.get('ws');
      if (fromQuery) {
        override = normalizeWsUrl(fromQuery);
        localStorage.setItem(WS_OVERRIDE_KEY, override);
      } else {
        override = normalizeWsUrl(localStorage.getItem(WS_OVERRIDE_KEY) || '');
      }
    } catch {}
    state.serverUrl = override;
  })();

  let ws = null;
  let pingTimer = null;
  let connectTimer = null;
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let explicitLeave = true;
  let pendingAction = null; // { t: 'create' } | { t: 'join', code }
  let reliableQueue = [];
  let txStateSeq = 0;
  let lastRxStateSeq = 0;
  let lastStateSentAt = 0;

  function clearTimers() {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function snapshotTelemetry() {
    return {
      status: state.status,
      role: state.role,
      code: state.code,
      peerPresent: state.peerPresent,
      ping: state.ping,
      rawPing: state.rawPing,
      halfRtt: state.halfRtt,
      region: state.region,
      path: state.path,
      redis: state.redis,
      droppedLocal: state.droppedLocal,
      lastErr: state.lastErr,
      wsUrl: getActiveWsUrl(),
    };
  }

  function setStatus(next, errMsg) {
    state.status = next;
    if (errMsg !== undefined) state.lastErr = errMsg;
    emit('status', snapshotTelemetry());
  }

  function getActiveWsUrl() {
    return state.serverUrl || defaultWsUrl();
  }

  function rawSend(obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    obj.clientId = state.clientId;
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch {
      return false;
    }
  }

  function flushReliableQueue() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !state.code) return;
    while (reliableQueue.length > 0) {
      const payload = reliableQueue.shift();
      rawSend({ t: 'relay', p: payload });
    }
  }

  function startPingLoop() {
    if (pingTimer) clearInterval(pingTimer);
    const sendPing = () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        rawSend({ t: 'ping', ts: Math.round(performance.now()) });
      }
    };
    sendPing();
    pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
  }

  function scheduleReconnect() {
    if (explicitLeave || !state.code) return;
    if (reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(reconnectAttempt, BACKOFF_MS.length - 1)];
    reconnectAttempt++;
    setStatus('reconnecting', `Reconnecting to ${state.code}...`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (explicitLeave || !state.code) return;
      pendingAction = { t: 'join', code: state.code };
      openSocket();
    }, delay);
  }

  function closeSocketSilent() {
    clearTimers();
    if (ws) {
      const old = ws;
      ws = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {}
    }
  }

  function handleMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    switch (msg.t) {
      case 'pong': {
        const now = Math.round(performance.now());
        const rtt = Math.max(1, Math.min(2000, now - Number(msg.ts || now)));
        state.rawPing = rtt;
        state.ping = state.ping ? Math.round(state.ping * 0.65 + rtt * 0.35) : rtt;
        state.halfRtt = Math.max(10, Math.min(140, state.ping * 0.5));
        if (msg.region) state.region = String(msg.region);
        if (msg.path) state.path = String(msg.path);
        emit('status', snapshotTelemetry());
        break;
      }

      case 'created': {
        reconnectAttempt = 0;
        state.code = cleanCode(msg.code);
        state.role = 'host';
        state.peerPresent = false;
        state.redis = Boolean(msg.redis);
        if (msg.region) state.region = String(msg.region);
        state.path = 'idle';
        lastRxStateSeq = 0;
        setStatus('waiting', '');
        emit('room', snapshotTelemetry());
        break;
      }

      case 'joined': {
        reconnectAttempt = 0;
        state.code = cleanCode(msg.code);
        state.role = msg.role === 'host' ? 'host' : 'guest';
        state.peerPresent = Boolean(msg.peerPresent);
        state.redis = Boolean(msg.redis);
        if (msg.region) state.region = String(msg.region);
        if (msg.path) state.path = String(msg.path);
        lastRxStateSeq = 0;
        setStatus(state.peerPresent ? 'connected' : 'waiting', '');
        emit('room', snapshotTelemetry());
        flushReliableQueue();
        break;
      }

      case 'peer_joined': {
        state.peerPresent = true;
        lastRxStateSeq = 0;
        setStatus('connected', '');
        emit('peer', { type: 'joined', role: msg.role });
        flushReliableQueue();
        break;
      }

      case 'peer_reconnecting': {
        emit('peer', { type: 'reconnecting', role: msg.role });
        break;
      }

      case 'peer_left': {
        state.peerPresent = false;
        state.path = 'idle';
        setStatus('waiting', 'Opponent left the room.');
        emit('peer', { type: 'left', role: msg.role });
        break;
      }

      case 'relay': {
        const p = msg.p;
        if (Array.isArray(p) && p[0] === 's') {
          const seq = Number(p[1] || 0);
          // Drop stale out-of-order state packets (allow reset if seq wrapped/restarted)
          if (seq <= lastRxStateSeq && lastRxStateSeq - seq < 500) return;
          lastRxStateSeq = seq;
        }
        emit('relay', p, msg.from);
        break;
      }

      case 'err': {
        const errText = String(msg.msg || 'Room error.');
        state.lastErr = errText;
        if (!state.code) setStatus('offline', errText);
        else emit('status', snapshotTelemetry());
        emit('error', errText);
        break;
      }

      default:
        break;
    }
  }

  function openSocket() {
    closeSocketSilent();

    const url = getActiveWsUrl();
    if (!url) {
      const msg = 'Open this game from your Vercel URL (or set Server URL) to play online.';
      setStatus('offline', msg);
      emit('error', msg);
      return;
    }

    setStatus(state.code ? 'reconnecting' : 'connecting', '');

    let sock;
    try {
      sock = new WebSocket(url);
    } catch (err) {
      setStatus('offline', 'Invalid WebSocket URL.');
      emit('error', 'Invalid WebSocket URL.');
      return;
    }
    ws = sock;

    connectTimer = setTimeout(() => {
      if (ws === sock && sock.readyState !== WebSocket.OPEN) {
        try {
          sock.close();
        } catch {}
        if (state.code && !explicitLeave) {
          scheduleReconnect();
        } else {
          const msg = 'Could not reach /api/ws. Make sure you are on your Vercel domain.';
          setStatus('offline', msg);
          emit('error', msg);
        }
      }
    }, CONNECT_TIMEOUT_MS);

    sock.onopen = () => {
      if (ws !== sock) return;
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      startPingLoop();
      if (pendingAction) {
        const act = pendingAction;
        pendingAction = null;
        rawSend(act);
      }
    };

    sock.onmessage = (ev) => {
      if (ws !== sock) return;
      handleMessage(ev);
    };

    sock.onerror = () => {
      // onclose handles cleanup / reconnect
    };

    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      clearTimers();
      if (!explicitLeave && state.code) {
        scheduleReconnect();
      } else if (state.status !== 'offline') {
        const msg = state.lastErr || 'Disconnected from server.';
        setStatus('offline', msg);
      }
    };
  }

  // Wake up quickly when mobile players switch back to the browser tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (explicitLeave || !state.code) return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      reconnectAttempt = 0;
      pendingAction = { t: 'join', code: state.code };
      openSocket();
    } else if (ws.readyState === WebSocket.OPEN) {
      rawSend({ t: 'ping', ts: Math.round(performance.now()) });
    }
  });

  window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN && state.code) {
      rawSend({ t: 'leave' });
    }
  });

  const KuroNet = {
    on(ev, fn) {
      if (listeners[ev]) listeners[ev].add(fn);
      return () => KuroNet.off(ev, fn);
    },
    off(ev, fn) {
      if (listeners[ev]) listeners[ev].delete(fn);
    },
    getState() {
      return snapshotTelemetry();
    },
    setServerUrl(url) {
      state.serverUrl = normalizeWsUrl(url);
      try {
        if (state.serverUrl) localStorage.setItem(WS_OVERRIDE_KEY, state.serverUrl);
        else localStorage.removeItem(WS_OVERRIDE_KEY);
      } catch {}
      emit('status', snapshotTelemetry());
    },
    createRoom() {
      explicitLeave = false;
      reconnectAttempt = 0;
      state.code = '';
      state.role = null;
      state.peerPresent = false;
      state.droppedLocal = 0;
      reliableQueue = [];
      txStateSeq = 0;
      lastRxStateSeq = 0;
      pendingAction = { t: 'create' };
      if (ws && ws.readyState === WebSocket.OPEN) {
        rawSend(pendingAction);
        pendingAction = null;
      } else {
        openSocket();
      }
    },
    joinRoom(rawCode) {
      const code = cleanCode(rawCode);
      if (code.length < 4) {
        emit('error', 'Enter a 4-letter room code.');
        return;
      }
      explicitLeave = false;
      reconnectAttempt = 0;
      state.code = code;
      state.role = null;
      state.peerPresent = false;
      state.droppedLocal = 0;
      reliableQueue = [];
      txStateSeq = 0;
      lastRxStateSeq = 0;
      pendingAction = { t: 'join', code };
      if (ws && ws.readyState === WebSocket.OPEN) {
        rawSend(pendingAction);
        pendingAction = null;
      } else {
        openSocket();
      }
    },
    leaveRoom() {
      explicitLeave = true;
      pendingAction = null;
      reliableQueue = [];
      if (ws && ws.readyState === WebSocket.OPEN && state.code) {
        rawSend({ t: 'leave' });
      }
      closeSocketSilent();
      state.code = '';
      state.role = null;
      state.peerPresent = false;
      state.path = 'idle';
      state.ping = 0;
      state.lastErr = '';
      setStatus('offline', '');
    },
    /**
     * Send compact volatile movement/pose array: ['s', seq, ...]
     * Automatically skips if socket buffer is congested or throttled (unless force=true).
     */
    sendState(fields, force) {
      if (!state.peerPresent || !state.code) return false;
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      const now = performance.now();
      if (!force && now - lastStateSentAt < 32) return false; // ~31Hz cap
      if (ws.bufferedAmount > MAX_VOLATILE_BUFFER) {
        state.droppedLocal++;
        return false;
      }
      lastStateSentAt = now;
      txStateSeq++;
      return rawSend({ t: 'relay', v: 1, p: ['s', txStateSeq, ...fields] });
    },
    /**
     * Send critical event array (lobby, hit_req, hit_res, act, go, ko, rm).
     * Queues briefly if reconnecting so round/combat state never drops.
     */
    sendReliable(payload) {
      if (!state.code) return false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        return rawSend({ t: 'relay', p: payload });
      }
      if (!explicitLeave && reliableQueue.length < MAX_RELIABLE_QUEUE) {
        reliableQueue.push(payload);
        return true;
      }
      return false;
    },
    getInviteUrl() {
      if (!state.code) return location.href;
      try {
        const u = new URL(location.href);
        u.searchParams.set('room', state.code);
        return u.toString();
      } catch {
        return `${location.origin}${location.pathname}?room=${state.code}`;
      }
    },
    getQrUrl(size) {
      const s = Math.max(120, Math.min(240, size || 156));
      return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&margin=6&color=0b0b0c&bgcolor=f2eee5&data=${encodeURIComponent(KuroNet.getInviteUrl())}`;
    },
    readRoomFromUrl() {
      try {
        return cleanCode(new URLSearchParams(location.search).get('room') || '');
      } catch {
        return '';
      }
    },
  };

  global.KuroNet = KuroNet;
})(window);