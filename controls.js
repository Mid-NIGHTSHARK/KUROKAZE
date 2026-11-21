/* KUROKAZE IV — Custom Controls, Mouse/Keyboard Rebinding & Fullscreen Landscape Manager
 * Loaded before weapons.js, fx.js, render.js, and game.js.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'kurokaze_iv_binds_v2';

  const ACTIONS = [
    { id: 'left',   label: 'Move Left',        hint: 'Walk / run left' },
    { id: 'right',  label: 'Move Right',       hint: 'Walk / run right' },
    { id: 'jump',   label: 'Jump / Up',        hint: 'Jump, double-jump, hold + Slash for Rising Cut' },
    { id: 'down',   label: 'Crouch / Sweep',   hint: 'Hold + Slash for Low Leg Sweep, fast-fall in air' },
    { id: 'atk',    label: 'Slash / Attack',   hint: 'Weapon combo, Air Slash, Execution (殺)' },
    { id: 'guard',  label: 'Guard & Parry',    hint: 'Tap right before impact for Perfect Parry' },
    { id: 'dash',   label: 'Flash-Step Dash',  hint: 'Invulnerable ink dash through strikes' },
    { id: 'skillQ', label: 'Weapon Art I',     hint: '30 Ki — Unique Q technique per weapon' },
    { id: 'skillE', label: 'Weapon Art II',    hint: '40 Ki — Unique E technique per weapon' },
    { id: 'skillR', label: 'Ultimate Art',     hint: '100 Ki — Weapon signature Ultimate' },
    { id: 'taunt',  label: 'Sheathe / Focus',  hint: 'Sheathe blade to build calm Ki' },
  ];

  const DEFAULT_BINDS = {
    left:   ['KeyA', 'ArrowLeft'],
    right:  ['KeyD', 'ArrowRight'],
    jump:   ['KeyW', 'Space'],
    down:   ['KeyS', 'ArrowDown'],
    atk:    ['Mouse0', 'KeyJ'],
    guard:  ['Mouse2', 'KeyK'],
    dash:   ['ShiftLeft', 'KeyL'],
    skillQ: ['KeyQ', 'Digit1'],
    skillE: ['KeyE', 'Digit2'],
    skillR: ['KeyR', 'Digit3'],
    taunt:  ['KeyV', 'KeyC'],
  };

  let isTouch =
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    'ontouchstart' in global;

  let binds = loadBinds();
  const changeListeners = new Set();

  // Live hardware states
  const heldCodes = Object.create(null);
  const p1Edge = Object.create(null);
  const p2Edge = Object.create(null);

  // Touch bridge states
  const touchState = {
    axisX: 0,
    axisY: 0,
    guard: false,
    down: false,
    up: false,
  };

  let lastTouchAt = 0;
  let canvasEl = null;
  let canAttackCheck = () => true;
  let pauseHandler = null;
  let audioUnlockFn = null;

  // Interactive keybind capture state
  let capture = null;

  function cloneDefaults() {
    const out = {};
    for (const k in DEFAULT_BINDS) out[k] = DEFAULT_BINDS[k].slice();
    return out;
  }

  function loadBinds() {
    const base = cloneDefaults();
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        for (const a of ACTIONS) {
          if (Array.isArray(raw[a.id])) {
            const p = typeof raw[a.id][0] === 'string' ? raw[a.id][0] : base[a.id][0];
            const s = typeof raw[a.id][1] === 'string' ? raw[a.id][1] : '';
            base[a.id] = [p, s];
          }
        }
      }
    } catch {}
    return base;
  }

  function saveBinds() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
    } catch {}
    for (const fn of changeListeners) {
      try {
        fn(KuroControls.getBinds());
      } catch {}
    }
  }

  function formatCode(code) {
    if (!code) return '—';
    const map = {
      Mouse0: 'L-CLICK',
      Mouse1: 'M-CLICK',
      Mouse2: 'R-CLICK',
      Mouse3: 'MOUSE 4',
      Mouse4: 'MOUSE 5',
      Space: 'SPACE',
      ShiftLeft: 'L-SHIFT',
      ShiftRight: 'R-SHIFT',
      ControlLeft: 'L-CTRL',
      ControlRight: 'R-CTRL',
      AltLeft: 'L-ALT',
      AltRight: 'R-ALT',
      ArrowLeft: '←',
      ArrowRight: '→',
      ArrowUp: '↑',
      ArrowDown: '↓',
      Tab: 'TAB',
      Enter: 'ENTER',
      Backspace: 'BKSP',
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
    return code.toUpperCase().slice(0, 8);
  }

  function findActionForCode(code) {
    for (const a of ACTIONS) {
      const pair = binds[a.id];
      if (pair && (pair[0] === code || pair[1] === code)) return a.id;
    }
    return null;
  }

  function isActionHeld(actionId) {
    const pair = binds[actionId];
    if (!pair) return false;
    return Boolean((pair[0] && heldCodes[pair[0]]) || (pair[1] && heldCodes[pair[1]]));
  }

  function clearAll() {
    for (const k in heldCodes) heldCodes[k] = false;
    for (const k in p1Edge) p1Edge[k] = 0;
    for (const k in p2Edge) p2Edge[k] = 0;
    touchState.axisX = 0;
    touchState.axisY = 0;
    touchState.guard = false;
    touchState.down = false;
    touchState.up = false;
  }

  function triggerCodeDown(code, isLocal2P) {
    if (isLocal2P) {
      // Dedicated Local 2P split keyboard layout so both players never clash
      if (code === 'KeyW') p1Edge.jump = 1;
      if (code === 'KeyF') p1Edge.atk = 1;
      if (code === 'KeyG') p1Edge.parry = 1;
      if (code === 'KeyH') p1Edge.dash = 1;
      if (code === 'KeyR') p1Edge.skillQ = 1;
      if (code === 'KeyT') p1Edge.skillE = 1;
      if (code === 'KeyY') p1Edge.skillR = 1;
      if (code === 'KeyV') p1Edge.taunt = 1;

      if (code === 'ArrowUp') p2Edge.jump = 1;
      if (code === 'KeyJ' || code === 'Digit1' || code === 'Numpad1') p2Edge.atk = 1;
      if (code === 'KeyK' || code === 'Digit2' || code === 'Numpad2') p2Edge.parry = 1;
      if (code === 'KeyL' || code === 'Digit3' || code === 'Numpad3') p2Edge.dash = 1;
      if (code === 'KeyU' || code === 'Digit4' || code === 'Numpad4') p2Edge.skillQ = 1;
      if (code === 'KeyI' || code === 'Digit5' || code === 'Numpad5') p2Edge.skillE = 1;
      if (code === 'KeyO' || code === 'Digit6' || code === 'Numpad6') p2Edge.skillR = 1;
      return;
    }

    const act = findActionForCode(code);
    if (!act) return;
    if (act === 'jump') p1Edge.jump = 1;
    else if (act === 'atk') p1Edge.atk = 1;
    else if (act === 'guard') p1Edge.parry = 1;
    else if (act === 'dash') p1Edge.dash = 1;
    else if (act === 'skillQ') p1Edge.skillQ = 1;
    else if (act === 'skillE') p1Edge.skillE = 1;
    else if (act === 'skillR') p1Edge.skillR = 1;
    else if (act === 'taunt') p1Edge.taunt = 1;
  }

  /* ==================== INTERACTIVE KEYBIND CAPTURE ==================== */
  function finishCapture(code) {
    if (!capture) return;
    const { actionId, slot, onDone } = capture;
    cleanupCapture();
    KuroControls.setBind(actionId, slot, code);
    if (onDone) onDone(code);
  }

  function cancelCapture() {
    if (!capture) return;
    const cb = capture.onCancel;
    cleanupCapture();
    if (cb) cb();
  }

  function cleanupCapture() {
    if (!capture) return;
    global.removeEventListener('keydown', capture.onKey, true);
    global.removeEventListener('mousedown', capture.onMouse, true);
    global.removeEventListener('contextmenu', capture.onCtx, true);
    capture = null;
  }

  /* ==================== HARDWARE EVENT LISTENERS ==================== */
  let listenersAttached = false;
  let modeGetter = () => 'menu';

  function attachGlobalListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    global.addEventListener(
      'touchstart',
      () => {
        lastTouchAt = performance.now();
        isTouch = true;
      },
      { passive: true }
    );

    global.addEventListener('blur', clearAll);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') clearAll();
    });

    global.addEventListener('keydown', (e) => {
      if (capture) return;
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const c = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) {
        e.preventDefault();
      }
      if (e.repeat) return;

      if (audioUnlockFn) audioUnlockFn();
      heldCodes[c] = true;

      if (c === 'Escape' || c === 'KeyP') {
        if (pauseHandler) pauseHandler();
        return;
      }

      triggerCodeDown(c, modeGetter() === 'local2p');
    });

    global.addEventListener('keyup', (e) => {
      heldCodes[e.code] = false;
    });

    global.addEventListener('mouseup', (e) => {
      const mCode = 'Mouse' + e.button;
      heldCodes[mCode] = false;
    });
  }

  /* ==================== FULLSCREEN & ORIENTATION HELPERS ==================== */
  async function enterMobileFullscreen() {
    const docEl = document.documentElement;
    try {
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen({ navigationUI: 'hide' }).catch(() => docEl.requestFullscreen());
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        }
      }
    } catch {}

    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch {}
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        await enterMobileFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch {}
  }

  /* ==================== PUBLIC API ==================== */
  const KuroControls = {
    ACTIONS,

    get IS_TOUCH() {
      return isTouch;
    },

    formatCode,

    getBinds() {
      const copy = {};
      for (const k in binds) copy[k] = binds[k].slice();
      return copy;
    },

    getLabel(actionId, slot = 0) {
      const pair = binds[actionId];
      if (!pair) return '—';
      const code = pair[slot] || pair[0] || '';
      return formatCode(code);
    },

    getShortKey(actionId) {
      const pair = binds[actionId];
      if (!pair) return '?';
      // Prefer keyboard code for HUD badge if secondary is keyboard and primary is mouse
      const preferred =
        pair[0] && !pair[0].startsWith('Mouse')
          ? pair[0]
          : pair[1] && !pair[1].startsWith('Mouse')
            ? pair[1]
            : pair[0];
      return formatCode(preferred);
    },

    setBind(actionId, slot, code) {
      if (!binds[actionId] || !code) return;
      const idx = slot === 1 ? 1 : 0;

      // Remove same code from any other slot to avoid conflicts
      for (const a of ACTIONS) {
        const pair = binds[a.id];
        for (let s = 0; s < 2; s++) {
          if (a.id === actionId && s === idx) continue;
          if (pair[s] === code) {
            // If removing another action's only primary key, swap with its alt if available
            if (s === 0 && pair[1]) {
              pair[0] = pair[1];
              pair[1] = '';
            } else {
              pair[s] = '';
            }
          }
        }
      }

      binds[actionId][idx] = code;
      // If primary became empty, promote secondary
      if (!binds[actionId][0] && binds[actionId][1]) {
        binds[actionId][0] = binds[actionId][1];
        binds[actionId][1] = '';
      }
      saveBinds();
    },

    clearBind(actionId, slot) {
      if (!binds[actionId]) return;
      if (slot === 1) {
        binds[actionId][1] = '';
        saveBinds();
      } else if (slot === 0 && binds[actionId][1]) {
        binds[actionId][0] = binds[actionId][1];
        binds[actionId][1] = '';
        saveBinds();
      }
    },

    resetDefaults() {
      binds = cloneDefaults();
      saveBinds();
    },

    onChange(fn) {
      changeListeners.add(fn);
      return () => changeListeners.delete(fn);
    },

    startCapture(actionId, slot, onDone, onCancel) {
      cancelCapture();

      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape') {
          cancelCapture();
          return;
        }
        finishCapture(e.code);
      };

      const onMouse = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button >= 0 && e.button <= 4) {
          finishCapture('Mouse' + e.button);
        }
      };

      const onCtx = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };

      capture = { actionId, slot, onDone, onCancel, onKey, onMouse, onCtx };
      // Defer attachment by 1 tick so the triggering click doesn't immediately bind Mouse0
      setTimeout(() => {
        if (!capture) return;
        global.addEventListener('keydown', onKey, true);
        global.addEventListener('mousedown', onMouse, true);
        global.addEventListener('contextmenu', onCtx, true);
      }, 30);
    },

    cancelCapture,

    bindCanvas(el, opts = {}) {
      attachGlobalListeners();
      canvasEl = el;
      if (opts.canAttack) canAttackCheck = opts.canAttack;
      if (opts.getMode) modeGetter = opts.getMode;
      if (opts.onPause) pauseHandler = opts.onPause;
      if (opts.onAudioUnlock) audioUnlockFn = opts.onAudioUnlock;

      if (!canvasEl) return;
      canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());
      canvasEl.addEventListener('mousedown', (e) => {
        if (capture) return;
        if (performance.now() - lastTouchAt < 450) return;
        if (audioUnlockFn) audioUnlockFn();
        if (!canAttackCheck()) return;

        const mCode = 'Mouse' + e.button;
        heldCodes[mCode] = true;
        triggerCodeDown(mCode, modeGetter() === 'local2p');
      });
    },

    setTouchAxis(x, y = 0) {
      touchState.axisX = Math.max(-1, Math.min(1, Number(x) || 0));
      touchState.axisY = Math.max(-1, Math.min(1, Number(y) || 0));
      touchState.down = touchState.axisY > 0.45;
      touchState.up = touchState.axisY < -0.45;
    },

    setTouchButton(name, down) {
      lastTouchAt = performance.now();
      isTouch = true;
      if (audioUnlockFn) audioUnlockFn();

      if (name === 'guard') {
        if (down && !touchState.guard) p1Edge.parry = 1;
        touchState.guard = Boolean(down);
        return;
      }
      if (name === 'down') {
        touchState.down = Boolean(down);
        return;
      }
      if (!down) return;
      if (name === 'jump') p1Edge.jump = 1;
      else if (name === 'slash' || name === 'atk') p1Edge.atk = 1;
      else if (name === 'dash') p1Edge.dash = 1;
      else if (name === 'q' || name === 'skillQ') p1Edge.skillQ = 1;
      else if (name === 'e' || name === 'skillE') p1Edge.skillE = 1;
      else if (name === 'r' || name === 'skillR') p1Edge.skillR = 1;
      else if (name === 'taunt') p1Edge.taunt = 1;
    },

    readP1(mode) {
      const isLocal2P = mode === 'local2p';
      let l, r, up, down, guard;

      if (isLocal2P) {
        l = Boolean(heldCodes.KeyA);
        r = Boolean(heldCodes.KeyD);
        up = Boolean(heldCodes.KeyW);
        down = Boolean(heldCodes.KeyS);
        guard = Boolean(heldCodes.KeyG);
      } else {
        l = isActionHeld('left') || touchState.axisX < -0.18;
        r = isActionHeld('right') || touchState.axisX > 0.18;
        up = isActionHeld('jump') || Boolean(heldCodes.ArrowUp) || touchState.up;
        down = isActionHeld('down') || touchState.down;
        guard = isActionHeld('guard') || touchState.guard;
      }

      const out = {
        l,
        r,
        up,
        down,
        guard,
        jump: Boolean(p1Edge.jump),
        atk: Boolean(p1Edge.atk),
        dash: Boolean(p1Edge.dash),
        parryTap: Boolean(p1Edge.parry),
        q: Boolean(p1Edge.skillQ),
        e: Boolean(p1Edge.skillE),
        rSkill: Boolean(p1Edge.skillR),
        taunt: Boolean(p1Edge.taunt),
      };
      for (const k in p1Edge) p1Edge[k] = 0;
      return out;
    },

    readP2Local() {
      const out = {
        l: Boolean(heldCodes.ArrowLeft),
        r: Boolean(heldCodes.ArrowRight),
        up: Boolean(heldCodes.ArrowUp),
        down: Boolean(heldCodes.ArrowDown),
        guard: Boolean(heldCodes.KeyK || heldCodes.Digit2 || heldCodes.Numpad2),
        jump: Boolean(p2Edge.jump),
        atk: Boolean(p2Edge.atk),
        dash: Boolean(p2Edge.dash),
        parryTap: Boolean(p2Edge.parry),
        q: Boolean(p2Edge.skillQ),
        e: Boolean(p2Edge.skillE),
        rSkill: Boolean(p2Edge.skillR),
        taunt: false,
      };
      for (const k in p2Edge) p2Edge[k] = 0;
      return out;
    },

    clearAll,
    enterMobileFullscreen,
    toggleFullscreen,
  };

  global.KuroControls = KuroControls;
})(window);
