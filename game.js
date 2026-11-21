/* KUROKAZE IV — Ink & Steel (60 FPS Combat & Prediction Engine)
 * Paired with net.js (KuroNet) and kurokaze_online.html.
 */
(function (global) {
  'use strict';

  const W = 1280;
  const H = 720;
  const GROUND_Y = 590;
  const LEFT_WALL = 72;
  const RIGHT_WALL = W - 72;
  const GRAVITY = 2350;
  const BEST_KEY = 'kurokaze_iv_best_v1';

  const IS_TOUCH =
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    'ontouchstart' in global;

  const ST = {
    IDLE: 0,
    RUN: 1,
    JUMP: 2,
    SLASH: 3,
    DASH: 4,
    GUARD: 5,
    PARRY: 6,
    HURT: 7,
    STAGGER: 8,
    IAI: 9,
    WAVE: 10,
    ULT: 11,
    EXEC: 12,
    DEAD: 13,
  };

  const WEAPONS = [
    {
      id: 'katana',
      name: 'Katana',
      jp: '刀',
      desc: 'Balanced 3-hit cadence, generous 220ms parry window, crisp Iaijutsu draw.',
      dmg: 14,
      posDmg: 22,
      reach: 112,
      speed: 1.0,
      maxCombo: 3,
      parryWin: 0.22,
      dashCd: 0.72,
      kiMul: 1.0,
      heavyGuardBreak: false,
      stats: { speed: 78, reach: 70, posture: 68, parry: 88 },
    },
    {
      id: 'odachi',
      name: 'Odachi',
      jp: '大太刀',
      desc: 'Wide crimson cleave that crushes guards and shatters posture in heavy arcs.',
      dmg: 22,
      posDmg: 36,
      reach: 148,
      speed: 0.74,
      maxCombo: 2,
      parryWin: 0.19,
      dashCd: 0.88,
      kiMul: 0.95,
      heavyGuardBreak: true,
      stats: { speed: 46, reach: 94, posture: 96, parry: 68 },
    },
    {
      id: 'naginata',
      name: 'Naginata',
      jp: '薙刀',
      desc: 'Long-range polearm pokes plus an aerial dive-slam shockwave for space control.',
      dmg: 16,
      posDmg: 25,
      reach: 164,
      speed: 0.9,
      maxCombo: 3,
      parryWin: 0.2,
      dashCd: 0.76,
      kiMul: 1.0,
      heavyGuardBreak: false,
      stats: { speed: 72, reach: 100, posture: 76, parry: 76 },
    },
    {
      id: 'dual',
      name: 'Dual Blade',
      jp: '二刀',
      desc: 'Relentless 5-hit flurry, short Flash-Step cooldown, rapid Ki gain, tight parry.',
      dmg: 10,
      posDmg: 16,
      reach: 88,
      speed: 1.32,
      maxCombo: 5,
      parryWin: 0.165,
      dashCd: 0.48,
      kiMul: 1.25,
      heavyGuardBreak: false,
      stats: { speed: 98, reach: 54, posture: 62, parry: 58 },
    },
  ];

  const STAGES = [
    { id: 'bamboo', name: 'Bamboo Rain', jp: '竹雨', skyTop: '#161618', skyBot: '#302f2d', moonY: 165, moonR: 92, rain: true, embers: false, bridge: false },
    { id: 'temple', name: 'Burning Temple', jp: '炎寺', skyTop: '#171111', skyBot: '#3a221f', moonY: 155, moonR: 84, rain: false, embers: true, bridge: false },
    { id: 'bridge', name: 'Blood Moon Bridge', jp: '紅橋', skyTop: '#121215', skyBot: '#29292e', moonY: 170, moonR: 112, rain: true, embers: false, bridge: true },
  ];

  const SCROLLS = [
    { id: 'thunder', name: 'Thunder Parry', jp: '雷弾', desc: 'Perfect Parries unleash a shockwave that damages and staggers nearby foes.' },
    { id: 'clone', name: 'Shadow Clone', jp: '影分身', desc: 'Flash-Step leaves an ink decoy that detonates after 0.45s.' },
    { id: 'drain', name: 'Crimson Drain', jp: '紅吸', desc: 'Restores +12 HP on every enemy kill and +25 HP on Crimson Executions.' },
    { id: 'iron', name: 'Iron Posture', jp: '鉄構', desc: '+40 Max Posture and +35% Posture damage on all blade strikes.' },
    { id: 'swift', name: 'Swift Ki', jp: '疾気', desc: '+45% Ki gain from attacks and parries, and -25% Flash-Step cooldown.' },
  ];

  const FLOW_RANKS = ['D', 'C', 'B', 'A', 'S', '鬼'];
  const FLOW_MUL = [1.0, 1.12, 1.25, 1.4, 1.6, 1.85];

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ==================== PROCEDURAL WEB AUDIO ==================== */
  const SFX = (function () {
    let ctx = null;
    let master = null;
    let vol = 0.7;

    function ensure() {
      if (!ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = vol;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    function noise(dur, hpFreq, gainVal, lpFreq) {
      const c = ensure();
      if (!c) return;
      const len = Math.max(1, Math.floor(c.sampleRate * dur));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buf;
      let node = src;
      if (hpFreq) {
        const hp = c.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = hpFreq;
        node.connect(hp);
        node = hp;
      }
      if (lpFreq) {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lpFreq;
        node.connect(lp);
        node = lp;
      }
      const g = c.createGain();
      const now = c.currentTime;
      g.gain.setValueAtTime(gainVal, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      node.connect(g);
      g.connect(master);
      src.start(now);
    }

    function tone(type, f1, f2, dur, gainVal, delay) {
      const c = ensure();
      if (!c) return;
      const now = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f1, now);
      if (f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(gainVal, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    return {
      unlock: ensure,
      setVolume(v) {
        vol = clamp(Number(v) || 0, 0, 1);
        if (master && ctx) master.gain.setValueAtTime(vol, ctx.currentTime);
      },
      menuDraw() {
        noise(0.08, 2200, 0.09, 6500);
        tone('sine', 1200, 2100, 0.06, 0.05);
      },
      slash(heavy) {
        noise(heavy ? 0.16 : 0.1, heavy ? 550 : 1200, heavy ? 0.24 : 0.15, heavy ? 2400 : 4800);
        tone('triangle', heavy ? 170 : 320, 65, heavy ? 0.15 : 0.08, heavy ? 0.16 : 0.09);
      },
      hit(heavy) {
        noise(heavy ? 0.14 : 0.09, 250, heavy ? 0.3 : 0.2, 2200);
        tone('sine', heavy ? 130 : 180, 38, heavy ? 0.16 : 0.1, heavy ? 0.32 : 0.22);
      },
      guard() {
        tone('square', 920, 680, 0.09, 0.12);
        tone('sine', 1480, 1180, 0.11, 0.1);
      },
      parry() {
        tone('sine', 1680, 2420, 0.28, 0.24);
        tone('triangle', 2520, 1950, 0.32, 0.16);
        tone('sine', 840, 620, 0.22, 0.14);
        noise(0.07, 3000, 0.18);
      },
      dash() {
        noise(0.11, 900, 0.16, 3600);
        tone('sine', 240, 90, 0.1, 0.08);
      },
      iai() {
        tone('sine', 2200, 3100, 0.16, 0.18);
        noise(0.22, 1600, 0.26, 6000);
        tone('sawtooth', 160, 45, 0.2, 0.16, 0.05);
      },
      wave() {
        noise(0.2, 600, 0.22, 2600);
        tone('triangle', 380, 110, 0.22, 0.18);
      },
      ult() {
        tone('sine', 110, 52, 0.75, 0.34);
        tone('sine', 1320, 2640, 0.22, 0.18, 0.05);
        for (let i = 0; i < 6; i++) {
          noise(0.06, 2200, 0.15, 7000);
          tone('triangle', 1500 + i * 180, 600, 0.07, 0.1, 0.14 + i * 0.06);
        }
        // Sheathe click
        tone('square', 2800, 1600, 0.04, 0.24, 0.62);
      },
      exec() {
        tone('sine', 95, 32, 0.42, 0.38);
        tone('sine', 1800, 900, 0.26, 0.2);
        noise(0.24, 400, 0.32, 3000);
      },
      gun() {
        noise(0.18, 300, 0.35, 3200);
        tone('sawtooth', 190, 38, 0.16, 0.28);
      },
      ko() {
        tone('sine', 120, 34, 0.55, 0.35);
        tone('triangle', 440, 220, 0.45, 0.14);
      },
    };
  })();

  function vibrate(pattern) {
    if (IS_TOUCH && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /* ==================== ENGINE STATE ==================== */
  let canvas = null;
  let ctx = null;
  let callbacks = {};
  let rafId = 0;
  let lastTs = 0;

  const settings = {
    volume: 0.7,
    grain: !IS_TOUCH,
    letterbox: true,
    perfMode: 'auto', // auto | high | low
  };

  function isLowFx() {
    if (settings.perfMode === 'low') return true;
    if (settings.perfMode === 'high') return false;
    return IS_TOUCH;
  }

  let mode = 'menu'; // menu | story | endless | local2p | online
  let paused = false;
  let scrollPause = false;
  let stageIdx = 2; // Bridge default for menu backdrop
  let menuWeaponIdx = 0;
  let selectedStageIdx = 0;

  let time = 0;
  let hitstop = 0;
  let invertT = 0;
  let bloodMoonT = 0;
  let shakeMag = 0;
  let shakeX = 0;
  let shakeY = 0;
  let camX = W / 2;
  let camZoom = 1;
  let targetZoom = 1;
  let banner = { title: '', sub: '', t: 0, maxT: 1.8 };

  // Entities
  let p1 = null;
  let p2 = null; // Used in local2p, online, and menu backdrop
  let enemies = [];
  let projectiles = [];
  let slashes = [];
  let particles = [];
  let ghosts = [];
  let clones = [];
  let popups = [];
  let bamboo = [];
  let ambient = [];
  let grainCanvas = null;

  // Progression / Match
  let wave = 1;
  let score = 0;
  let kills = 0;
  let maxCombo = 0;
  let flowPts = 0;
  let flowRank = 0;
  let activeScrolls = new Set();
  let roundNum = 1;
  let p1Wins = 0;
  let p2Wins = 0;
  let roundOverT = 0;
  let matchEnded = false;

  // Online Netcode State
  const netState = {
    active: false,
    role: 'host', // host = P1, guest = P2
    p1Weapon: 0,
    p2Weapon: 0,
    stageIdx: 0,
    localHitSeq: 0,
    pendingHits: new Map(),
    remoteTarget: null,
    lastSentSnap: 0,
    koSent: false,
  };

  // Input State
  const keys = Object.create(null);
  const justPressed = Object.create(null);
  const touchState = {
    axis: 0,
    jump: false,
    slash: false,
    guard: false,
    dash: false,
    q: false,
    e: false,
    r: false,
  };
  const touchJust = Object.create(null);

  // Telemetry
  let fpsFrames = 0;
  let fpsAccum = 0;
  let currentFps = 60;
  let lastTeleEmit = 0;
  let lastSkillEmit = 0;

  /* ==================== FIGHTER FACTORY ==================== */
  function createScarf(x, y) {
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push({ x: x - i * 8, y: y + i * 2 });
    return pts;
  }

  function createFighter(opts) {
    const wep = WEAPONS[opts.weaponIdx || 0] || WEAPONS[0];
    const isBoss = opts.kind === 'boss';
    const maxHp = opts.maxHp || (isBoss ? 260 : 100);
    const maxPos = opts.maxPos || (isBoss ? 140 : 100);
    return {
      id: opts.id || 'f',
      kind: opts.kind || 'player', // player | ronin | spearman | brute | gunner | boss
      team: opts.team || 1,
      weaponIdx: opts.weaponIdx || 0,
      wep,
      x: opts.x || 340,
      y: GROUND_Y,
      vx: 0,
      vy: 0,
      face: opts.face || 1,
      hp: maxHp,
      maxHp,
      ki: opts.ki !== undefined ? opts.ki : 25,
      pos: 0,
      maxPos,
      st: ST.IDLE,
      stT: 0,
      stDur: 0,
      combo: 0,
      comboWin: 0,
      attackId: 0,
      hitTargets: new Set(),
      guarding: false,
      parryT: 0,
      parryCd: 0,
      dashCd: 0,
      invulnT: 0,
      staggerT: 0,
      hurtT: 0,
      dead: false,
      phase: 1,
      aiT: rand(0.35, 0.85),
      aiIntent: 'idle',
      telegraphT: 0,
      unblockable: false,
      aimX: 0,
      aimY: 0,
      sashColor: opts.sashColor || '#c82424',
      rimColor: opts.rimColor || '#f2eee5',
      scarf: createScarf(opts.x || 340, GROUND_Y - 76),
      animPhase: rand(0, 6.28),
      diveSlam: false,
      isRemote: Boolean(opts.isRemote),
      onlineHitSent: false,
      ultTimer: 0,
      ultHitsLeft: 0,
    };
  }

  function getMaxPosture(f) {
    return f.maxPos + (f === p1 && activeScrolls.has('iron') ? 40 : 0);
  }

  /* ==================== STAGE & AMBIENT ==================== */
  function buildStageProps() {
    bamboo = [];
    for (let i = 0; i < 20; i++) {
      bamboo.push({
        x: rand(-60, W + 60),
        w: rand(5, 13),
        depth: rand(0.28, 0.85),
        phase: rand(0, 6.28),
        tilt: rand(-0.04, 0.04),
      });
    }
    ambient = [];
    const count = isLowFx() ? 38 : 90;
    for (let i = 0; i < count; i++) {
      ambient.push({
        x: rand(0, W),
        y: rand(0, H),
        spd: rand(340, 720),
        len: rand(12, 26),
        sz: rand(1.5, 3.8),
        phase: rand(0, 6.28),
      });
    }
  }

  function buildGrainCanvas() {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = 160;
    grainCanvas.height = 90;
    const gctx = grainCanvas.getContext('2d');
    const img = gctx.createImageData(160, 90);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 16;
    }
    gctx.putImageData(img, 0, 0);
  }

  /* ==================== VFX HELPERS ==================== */
  function addShake(mag) {
    shakeMag = Math.max(shakeMag, mag);
  }

  function addBanner(title, sub, dur) {
    banner.title = title;
    banner.sub = sub || '';
    banner.t = dur || 1.75;
    banner.maxT = banner.t;
  }

  function addPopup(x, y, text, color, big) {
    if (popups.length > 24) popups.shift();
    popups.push({ x, y, text, color: color || '#f2eee5', t: 0.85, maxT: 0.85, big: Boolean(big) });
  }

  function spawnParticles(x, y, count, color, spdMin, spdMax, grav) {
    const cap = isLowFx() ? 70 : 180;
    const actual = isLowFx() ? Math.max(2, Math.round(count * 0.5)) : count;
    for (let i = 0; i < actual; i++) {
      if (particles.length >= cap) particles.shift();
      const ang = rand(0, Math.PI * 2);
      const spd = rand(spdMin || 90, spdMax || 380);
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - rand(20, 120),
        sz: rand(2, 5.5),
        color: color || '#0b0b0c',
        t: rand(0.22, 0.55),
        maxT: 0.55,
        grav: grav !== undefined ? grav : 900,
      });
    }
  }

  function addSlashArc(x, y, face, radius, color, thick, angleOff) {
    if (slashes.length > 18) slashes.shift();
    slashes.push({
      x,
      y,
      face,
      r: radius,
      color: color || '#f2eee5',
      thick: thick || 9,
      ang: angleOff || 0,
      t: 0.17,
      maxT: 0.17,
    });
  }

  function addGhost(f) {
    if (ghosts.length > (isLowFx() ? 10 : 22)) ghosts.shift();
    ghosts.push({
      x: f.x,
      y: f.y,
      face: f.face,
      st: f.st,
      wep: f.wep,
      t: 0.24,
      maxT: 0.24,
    });
  }

  /* ==================== BEST RECORD ==================== */
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || '{"wave":0,"score":0}');
    } catch {
      return { wave: 0, score: 0 };
    }
  }

  function saveBest(w, sc) {
    const prev = loadBest();
    const next = { wave: Math.max(prev.wave || 0, w), score: Math.max(prev.score || 0, sc) };
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(next));
    } catch {}
    return next;
  }

  /* ==================== FLOW & KI ==================== */
  function bumpFlow(pts) {
    flowPts = clamp(flowPts + pts, 0, 120);
    flowRank = clamp(Math.floor(flowPts / 20), 0, FLOW_RANKS.length - 1);
  }

  function gainKi(f, base) {
    if (!f || f.dead) return;
    let mul = f.wep.kiMul;
    if (f === p1) {
      mul *= FLOW_MUL[flowRank];
      if (activeScrolls.has('swift')) mul *= 1.45;
    }
    f.ki = clamp(f.ki + base * mul, 0, 100);
  }

  /* ==================== COMBAT ACTIONS ==================== */
  function triggerDash(f, dir) {
    if (f.dead || f.dashCd > 0 || f.st === ST.STAGGER || f.st === ST.ULT || f.st === ST.EXEC) return false;
    const d = dir || f.face;
    f.face = d;
    f.st = ST.DASH;
    f.stDur = 0.2;
    f.stT = 0.2;
    f.invulnT = 0.24;
    f.guarding = false;
    f.vx = d * 880;
    f.vy = Math.min(0, f.vy);
    const cdMul = f === p1 && activeScrolls.has('swift') ? 0.75 : 1.0;
    f.dashCd = f.wep.dashCd * cdMul;
    SFX.dash();
    addGhost(f);
    spawnParticles(f.x, f.y - 12, 8, '#f2eee5', 60, 220, 200);

    if (f === p1 && activeScrolls.has('clone') && (mode === 'story' || mode === 'endless')) {
      clones.push({ x: f.x, y: f.y, face: f.face, t: 0.45, maxT: 0.45 });
    }
    if (netState.active && !f.isRemote) {
      KuroNet.sendReliable(['fx', 'dash', Math.round(f.x), Math.round(f.y), f.face]);
      sendMyNetState(true);
    }
    return true;
  }

  function triggerSlash(f) {
    if (f.dead || f.st === ST.STAGGER || f.st === ST.HURT || f.st === ST.ULT || f.st === ST.EXEC || f.st === ST.IAI) return false;
    if (f.st === ST.SLASH && f.stT > f.stDur * 0.34) return false;

    const wep = f.wep;
    const nextCombo = f.comboWin > 0 ? (f.combo % wep.maxCombo) + 1 : 1;
    f.combo = nextCombo;
    f.comboWin = 0.56;
    f.st = ST.SLASH;
    const isFinisher = nextCombo === wep.maxCombo;
    const dur = (isFinisher ? 0.32 : 0.24) / wep.speed;
    f.stDur = dur;
    f.stT = dur;
    f.guarding = false;
    f.attackId++;
    f.hitTargets.clear();
    f.onlineHitSent = false;

    // Naginata aerial dive-slam
    f.diveSlam = wep.id === 'naginata' && f.y < GROUND_Y - 35;
    if (f.diveSlam) {
      f.vy = 760;
      f.vx = f.face * 260;
    } else {
      f.vx = f.face * (isFinisher ? 260 : 150);
    }

    const color = isFinisher || wep.id === 'odachi' ? '#c82424' : '#f2eee5';
    SFX.slash(isFinisher || wep.id === 'odachi');
    addSlashArc(
      f.x + f.face * (wep.reach * 0.42),
      f.y - 54,
      f.face,
      wep.reach * 0.78,
      color,
      wep.id === 'odachi' ? 14 : isFinisher ? 11 : 8,
      nextCombo % 2 === 0 ? -0.45 : 0.35
    );

    if (netState.active && !f.isRemote) {
      KuroNet.sendReliable(['fx', 'slash', Math.round(f.x), Math.round(f.y), f.face, nextCombo, f.weaponIdx]);
      sendMyNetState(true);
    }
    return true;
  }

  function triggerIai(f) {
    if (f.dead || f.ki < 30 || f.st === ST.STAGGER || f.st === ST.ULT || f.st === ST.EXEC) return false;
    f.ki -= 30;
    const startX = f.x;
    const dist = 285;
    const endX = clamp(f.x + f.face * dist, LEFT_WALL, RIGHT_WALL);
    for (let i = 0; i < 4; i++) {
      ghosts.push({
        x: lerp(startX, endX, i / 4),
        y: f.y,
        face: f.face,
        st: ST.IAI,
        wep: f.wep,
        t: 0.3,
        maxT: 0.3,
      });
    }
    f.x = endX;
    f.vx = f.face * 120;
    f.st = ST.IAI;
    f.stDur = 0.28;
    f.stT = 0.28;
    f.invulnT = 0.28;
    f.attackId++;
    f.hitTargets.clear();
    f.onlineHitSent = false;
    SFX.iai();
    addShake(7);
    addSlashArc((startX + endX) * 0.5, f.y - 52, f.face, Math.abs(endX - startX) * 0.55 + 50, '#c82424', 12, 0);

    // Hit everyone along the teleport line
    const minX = Math.min(startX, endX) - 45;
    const maxX = Math.max(startX, endX) + 45;
    const targets = getTargetsFor(f);
    for (const t of targets) {
      if (!t.dead && t.x >= minX && t.x <= maxX && Math.abs(t.y - f.y) < 110) {
        deliverHit(f, t, 28, 38, 320, f.face, true, false, false);
      }
    }

    if (netState.active && !f.isRemote) {
      KuroNet.sendReliable(['fx', 'iai', Math.round(startX), Math.round(endX), Math.round(f.y), f.face]);
      sendMyNetState(true);
    }
    return true;
  }

  function triggerWave(f) {
    if (f.dead || f.ki < 40 || f.st === ST.STAGGER || f.st === ST.ULT || f.st === ST.EXEC) return false;
    f.ki -= 40;
    f.st = ST.WAVE;
    f.stDur = 0.26;
    f.stT = 0.26;
    f.vx = -f.face * 90;
    SFX.wave();
    addShake(5);
    spawnProjectile({
      owner: f,
      team: f.team,
      kind: 'wave',
      x: f.x + f.face * 54,
      y: f.y - 52,
      vx: f.face * 690,
      vy: 0,
      r: 44,
      dmg: 22,
      posDmg: 30,
      pierce: true,
      t: 1.35,
      color: '#c82424',
    });
    if (netState.active && !f.isRemote) {
      KuroNet.sendReliable(['fx', 'wave', Math.round(f.x + f.face * 54), Math.round(f.y - 52), f.face]);
      sendMyNetState(true);
    }
    return true;
  }

  function triggerUlt(f) {
    if (f.dead || f.ki < 100 || f.st === ST.STAGGER || f.st === ST.ULT) return false;
    f.ki = 0;
    f.st = ST.ULT;
    f.stDur = 0.78;
    f.stT = 0.78;
    f.invulnT = 0.9;
    f.vx = 0;
    bloodMoonT = 1.4;
    invertT = 0.14;
    hitstop = 0.08;
    addShake(14);
    SFX.ult();
    addBanner('ECLIPSE OF A THOUSAND CUTS', '千斬蝕', 1.1);
    vibrate([25, 30, 45]);

    const targets = getTargetsFor(f);
    for (const t of targets) {
      if (!t.dead && Math.abs(t.x - f.x) < 560) {
        deliverHit(f, t, 46, 75, 420, t.x >= f.x ? 1 : -1, true, false, true);
        for (let k = 0; k < 4; k++) {
          addSlashArc(
            t.x + rand(-35, 35),
            t.y - 55 + rand(-35, 35),
            k % 2 ? 1 : -1,
            rand(55, 95),
            k % 2 ? '#c82424' : '#f2eee5',
            8,
            rand(-1.2, 1.2)
          );
        }
      }
    }

    if (netState.active && !f.isRemote) {
      KuroNet.sendReliable(['fx', 'ult', Math.round(f.x), Math.round(f.y), f.face]);
      sendMyNetState(true);
    }
    return true;
  }

  function spawnProjectile(p) {
    p.hitSet = new Set();
    projectiles.push(p);
  }

  function getTargetsFor(attacker) {
    if (mode === 'local2p' || mode === 'online') {
      return attacker === p1 ? (p2 ? [p2] : []) : p1 ? [p1] : [];
    }
    if (attacker.team === 1) return enemies;
    return p1 ? [p1] : [];
  }

  /* ==================== HIT & PARRY RESOLUTION ==================== */
  function deliverHit(att, def, dmg, posDmg, kb, dir, isHeavy, isExec, isUlt) {
    if (!def || def.dead) return;

    // Online: attacker sends hit claim to defender for 0ms defender-validated parries/evades
    if (netState.active && !att.isRemote && def.isRemote) {
      const hitId = ++netState.localHitSeq;
      const fxX = Math.round((att.x + def.x) * 0.5);
      const fxY = Math.round(def.y - 54);
      const isStagExec = def.st === ST.STAGGER || isExec;
      netState.pendingHits.set(hitId, {
        dmg,
        posDmg,
        dir,
        isExec: isStagExec,
        fxX,
        fxY,
      });
      // Instant subtle spark feedback on attacker's swing
      spawnParticles(fxX, fxY, 5, '#f2eee5', 70, 220, 400);
      KuroNet.sendReliable([
        'hit',
        hitId,
        Math.round(dmg),
        Math.round(posDmg),
        Math.round(kb),
        dir,
        isHeavy ? 1 : 0,
        isStagExec ? 1 : 0,
        isUlt ? 1 : 0,
        fxX,
        fxY,
      ]);
      return;
    }

    // Offline / Local 2P direct resolution
    resolveLocalHit(att, def, dmg, posDmg, kb, dir, isHeavy, isExec, isUlt);
  }

  function resolveLocalHit(att, def, dmg, posDmg, kb, dir, isHeavy, isExec, isUlt) {
    if (def.dead) return { outcome: 'none' };
    const fxX = (att ? (att.x + def.x) * 0.5 : def.x);
    const fxY = def.y - 54;

    if (def.invulnT > 0 && !isUlt) {
      addPopup(def.x, def.y - 98, 'EVADE', '#f2eee5');
      spawnParticles(def.x, fxY, 6, '#f2eee5', 60, 180, 100);
      return { outcome: 'evade' };
    }

    // Perfect Parry
    if (def.parryT > 0 && !isUlt) {
      def.parryT = 0;
      def.invulnT = 0.22;
      gainKi(def, 25);
      if (def === p1) bumpFlow(18);
      invertT = 0.085;
      hitstop = 0.075;
      addShake(9);
      SFX.parry();
      vibrate([18, 22, 18]);
      addPopup(def.x, def.y - 108, 'PERFECT PARRY!', '#c82424', true);
      spawnParticles(fxX, fxY, 18, '#f2eee5', 160, 480, 500);
      spawnParticles(fxX, fxY, 8, '#c82424', 120, 340, 400);

      if (att && !att.dead) {
        att.pos = Math.min(getMaxPosture(att), att.pos + 45);
        att.st = ST.STAGGER;
        att.staggerT = 0.95;
        att.stT = 0.95;
        att.vx = -dir * 320;
      }

      // Thunder Parry scroll
      if (def === p1 && activeScrolls.has('thunder') && (mode === 'story' || mode === 'endless')) {
        addSlashArc(def.x, def.y - 54, 1, 165, '#f2eee5', 10, 0);
        for (const e of enemies) {
          if (!e.dead && Math.abs(e.x - def.x) < 190) {
            e.hp = Math.max(1, e.hp - 18);
            e.pos = Math.min(e.maxPos, e.pos + 40);
            e.st = ST.STAGGER;
            e.staggerT = 0.8;
            e.stT = 0.8;
          }
        }
      }
      return { outcome: 'parry' };
    }

    // Regular Guard (blocks non-heavy / non-unblockable from the front)
    const facingAttacker = def.face === -dir;
    const unblockable = Boolean(isUlt || isExec || (att && att.unblockable) || (isHeavy && att && att.wep.heavyGuardBreak));
    if (def.guarding && facingAttacker && !unblockable) {
      const chip = Math.max(1, Math.round(dmg * 0.22));
      const pDmg = Math.round(posDmg * 0.65);
      def.hp = Math.max(0, def.hp - chip);
      def.pos = Math.min(getMaxPosture(def), def.pos + pDmg);
      def.vx = dir * kb * 0.55;
      SFX.guard();
      hitstop = 0.035;
      addShake(3.5);
      spawnParticles(fxX, fxY, 10, '#f2eee5', 120, 320, 550);
      addPopup(def.x, def.y - 96, 'GUARD', '#b8b3a8');

      let broken = false;
      if (def.pos >= getMaxPosture(def)) {
        def.pos = 0;
        def.guarding = false;
        def.st = ST.STAGGER;
        def.staggerT = 1.45;
        def.stT = 1.45;
        broken = true;
        addPopup(def.x, def.y - 118, 'POSTURE BROKEN 殺', '#c82424', true);
        addShake(9);
      }
      if (def.hp <= 0) handleDeath(def, att);
      return { outcome: 'guard', broken, dead: def.dead };
    }

    // Crimson Execution if staggered!
    const wasStaggered = def.st === ST.STAGGER || Boolean(isExec);
    let finalDmg = dmg;
    let finalPos = posDmg * (att === p1 && activeScrolls.has('iron') ? 1.35 : 1.0);

    if (wasStaggered && !isUlt) {
      finalDmg = Math.round(dmg * 2.1 + 18);
      def.staggerT = 0;
      invertT = 0.11;
      hitstop = 0.1;
      targetZoom = 1.18;
      setTimeout(() => {
        targetZoom = 1;
      }, 240);
      addShake(13);
      SFX.exec();
      vibrate([30, 20, 45]);
      addPopup(def.x, def.y - 118, 'CRIMSON EXECUTION 殺', '#c82424', true);
      spawnParticles(fxX, fxY, 26, '#c82424', 140, 520, 820);
      spawnParticles(fxX, fxY, 14, '#0b0b0c', 100, 400, 750);
      if (att && !att.dead) {
        const heal = att === p1 && activeScrolls.has('drain') ? 25 : 15;
        att.hp = Math.min(att.maxHp, att.hp + heal);
        gainKi(att, 20);
        if (att === p1) bumpFlow(22);
      }
    } else {
      hitstop = isHeavy || isUlt ? 0.065 : 0.04;
      addShake(isHeavy || isUlt ? 8 : 4.5);
      SFX.hit(isHeavy || isUlt);
      vibrate(isHeavy ? 20 : 10);
      spawnParticles(fxX, fxY, isHeavy ? 18 : 11, '#c82424', 110, 380, 760);
      spawnParticles(fxX, fxY, 8, '#0b0b0c', 80, 280, 700);
      if (att && !att.dead) {
        gainKi(att, isHeavy ? 12 : 8);
        if (att === p1) bumpFlow(8);
      }
    }

    def.hp = Math.max(0, def.hp - finalDmg);
    def.pos = Math.min(getMaxPosture(def), def.pos + finalPos);
    def.guarding = false;
    def.vx = dir * kb;
    def.vy = Math.min(def.vy, -120);

    if (def === p1) {
      flowPts = Math.max(0, flowPts - 24);
      flowRank = clamp(Math.floor(flowPts / 20), 0, FLOW_RANKS.length - 1);
    }

    let broken = false;
    if (def.hp > 0) {
      if (!wasStaggered && def.pos >= getMaxPosture(def)) {
        def.pos = 0;
        def.st = ST.STAGGER;
        def.staggerT = 1.5;
        def.stT = 1.5;
        broken = true;
        addPopup(def.x, def.y - 116, 'POSTURE BROKEN 殺', '#c82424', true);
        addShake(8);
      } else if (def.kind !== 'brute' || isHeavy || isUlt || wasStaggered) {
        def.st = ST.HURT;
        def.hurtT = wasStaggered ? 0.34 : 0.22;
        def.stT = def.hurtT;
      }
    } else {
      handleDeath(def, att);
    }

    return { outcome: wasStaggered ? 'exec' : 'hit', broken, dead: def.dead };
  }

  function handleDeath(def, killer) {
    if (def.dead) return;
    def.dead = true;
    def.hp = 0;
    def.st = ST.DEAD;
    def.stT = 1.2;
    SFX.ko();
    invertT = 0.09;
    addShake(12);
    spawnParticles(def.x, def.y - 46, 26, '#c82424', 120, 480, 820);
    spawnParticles(def.x, def.y - 46, 16, '#0b0b0c', 80, 340, 760);

    if (mode === 'story' || mode === 'endless') {
      if (def !== p1) {
        kills++;
        score += def.kind === 'boss' ? 1200 : def.kind === 'brute' ? 250 : 150;
        if (killer === p1) {
          maxCombo = Math.max(maxCombo, flowRank + 1);
          if (activeScrolls.has('drain')) p1.hp = Math.min(p1.maxHp, p1.hp + 12);
        }
      } else {
        finishSoloRun(false);
      }
    } else if (mode === 'local2p') {
      const winner = def === p2 ? 1 : 2;
      concludeDuelRound(winner);
    } else if (mode === 'online') {
      if (!netState.koSent) {
        netState.koSent = true;
        const deadSide = def === p1 ? 1 : 2;
        KuroNet.sendReliable(['ko', deadSide]);
        if (netState.role === 'host') {
          const winner = deadSide === 2 ? 1 : 2;
          hostFinalizeOnlineRound(winner);
        }
      }
    }
  }

  /* ==================== ONLINE NETCODE SYNC ==================== */
  function getMyFighter() {
    if (!netState.active) return p1;
    return netState.role === 'host' ? p1 : p2;
  }

  function getRemoteFighter() {
    if (!netState.active) return null;
    return netState.role === 'host' ? p2 : p1;
  }

  function sendMyNetState(force) {
    if (!netState.active || !global.KuroNet) return;
    const f = getMyFighter();
    if (!f) return;
    KuroNet.sendState(
      [
        Math.round(f.x),
        Math.round(f.y),
        Math.round(f.vx),
        Math.round(f.vy),
        f.face,
        f.st,
        Math.round(f.stT * 100),
        f.combo,
        Math.round(f.hp),
        Math.round(f.ki),
        Math.round(f.pos),
        (f.guarding ? 1 : 0) | (f.parryT > 0 ? 2 : 0) | (f.invulnT > 0 ? 4 : 0) | (f.dead ? 8 : 0),
      ],
      Boolean(force)
    );
  }

  function hostFinalizeOnlineRound(winnerSide) {
    if (roundOverT > 0 || matchEnded) return;
    if (winnerSide === 1) p1Wins++;
    else p2Wins++;
    KuroNet.sendReliable(['rnd_end', p1Wins, p2Wins, winnerSide]);
    applyOnlineRoundEnd(p1Wins, p2Wins, winnerSide);
  }

  function applyOnlineRoundEnd(w1, w2, winnerSide) {
    p1Wins = w1;
    p2Wins = w2;
    const iWonRound = (netState.role === 'host' && winnerSide === 1) || (netState.role === 'guest' && winnerSide === 2);
    if (p1Wins >= 2 || p2Wins >= 2) {
      matchEnded = true;
      const iWonMatch = (netState.role === 'host' && p1Wins >= 2) || (netState.role === 'guest' && p2Wins >= 2);
      addBanner(iWonMatch ? 'VICTORY' : 'DEFEAT', `${p1Wins} — ${p2Wins}`, 2.0);
      setTimeout(() => {
        if (mode === 'online' && callbacks.onResult) {
          callbacks.onResult({
            mode: 'online',
            win: iWonMatch,
            title: iWonMatch ? 'DUEL VICTORY' : 'FALLEN IN DUEL',
            sub: `Final Score ${p1Wins} — ${p2Wins} • Best of 3`,
            canRematch: true,
            stats: [
              ['Your Role', netState.role.toUpperCase()],
              ['Rounds', `${p1Wins} — ${p2Wins}`],
              ['Ping', `${KuroNet.getState().ping || 0} ms`],
            ],
          });
        }
      }, 1400);
    } else {
      roundOverT = 2.0;
      addBanner(iWonRound ? 'ROUND WON' : 'ROUND LOST', `Score ${p1Wins} — ${p2Wins}`, 1.8);
    }
  }

  function handleNetRelay(payload) {
    if (!Array.isArray(payload) || !payload.length) return;
    const tag = payload[0];

    if (tag === 'lb' || tag === 'go') {
      if (callbacks.onOnlineLobbyMsg) callbacks.onOnlineLobbyMsg(payload);
      return;
    }

    if (!netState.active || mode !== 'online') return;
    const myF = getMyFighter();
    const opF = getRemoteFighter();

    switch (tag) {
      case 's': {
        // ['s', seq, x, y, vx, vy, face, st, stT100, combo, hp, ki, pos, flags]
        if (!opF) return;
        const flags = payload[13] || 0;
        netState.remoteTarget = {
          x: payload[2],
          y: payload[3],
          vx: payload[4],
          vy: payload[5],
          face: payload[6] || 1,
          st: payload[7] || 0,
          stT: (payload[8] || 0) / 100,
          combo: payload[9] || 0,
          rxAt: performance.now(),
        };
        opF.hp = payload[10];
        opF.ki = payload[11];
        opF.pos = payload[12];
        opF.guarding = Boolean(flags & 1);
        opF.parryT = flags & 2 ? 0.15 : 0;
        opF.invulnT = flags & 4 ? 0.15 : 0;
        opF.dead = Boolean(flags & 8);
        break;
      }

      case 'fx': {
        const fxType = payload[1];
        if (fxType === 'slash') {
          const [, , x, y, face, combo, wepIdx] = payload;
          const w = WEAPONS[wepIdx] || WEAPONS[0];
          const fin = combo === w.maxCombo;
          SFX.slash(fin || w.id === 'odachi');
          addSlashArc(x + face * (w.reach * 0.42), y - 54, face, w.reach * 0.78, fin || w.id === 'odachi' ? '#c82424' : '#f2eee5', w.id === 'odachi' ? 14 : 9, combo % 2 ? 0.35 : -0.45);
        } else if (fxType === 'dash') {
          SFX.dash();
          if (opF) addGhost(opF);
          spawnParticles(payload[2], payload[3] - 12, 7, '#f2eee5', 60, 200, 200);
        } else if (fxType === 'iai') {
          const [, , sx, ex, y, face] = payload;
          SFX.iai();
          addShake(6);
          addSlashArc((sx + ex) * 0.5, y - 52, face, Math.abs(ex - sx) * 0.55 + 50, '#c82424', 12, 0);
          if (opF) {
            for (let i = 0; i < 4; i++) {
              ghosts.push({ x: lerp(sx, ex, i / 4), y, face, st: ST.IAI, wep: opF.wep, t: 0.28, maxT: 0.28 });
            }
          }
        } else if (fxType === 'wave') {
          SFX.wave();
          spawnProjectile({
            owner: opF,
            team: opF ? opF.team : 2,
            kind: 'wave',
            x: payload[2],
            y: payload[3],
            vx: payload[4] * 690,
            vy: 0,
            r: 44,
            dmg: 22,
            posDmg: 30,
            pierce: true,
            t: 1.35,
            color: '#c82424',
            visualOnly: true,
          });
        } else if (fxType === 'ult') {
          SFX.ult();
          bloodMoonT = 1.3;
          invertT = 0.12;
          addShake(12);
          addBanner('ECLIPSE OF A THOUSAND CUTS', '千斬蝕', 1.0);
        }
        break;
      }

      case 'hit': {
        // Defender validates incoming hit against own live state (0ms parry feel)
        if (!myF || myF.dead) return;
        const [, hitId, dmg, posDmg, kb, dir, isHeavy, isExec, isUlt] = payload;
        const res = resolveLocalHit(null, myF, dmg, posDmg, kb, dir, Boolean(isHeavy), Boolean(isExec), Boolean(isUlt));
        KuroNet.sendReliable([
          'res',
          hitId,
          res.outcome,
          Math.round(myF.hp),
          Math.round(myF.ki),
          Math.round(myF.pos),
          res.broken ? 1 : 0,
          res.dead ? 1 : 0,
        ]);
        sendMyNetState(true);
        break;
      }

      case 'res': {
        // Attacker receives defender's confirmed verdict
        const [, hitId, outcome, hp, ki, pos, broken] = payload;
        const pending = netState.pendingHits.get(hitId);
        netState.pendingHits.delete(hitId);
        if (opF) {
          opF.hp = hp;
          opF.ki = ki;
          opF.pos = pos;
        }
        if (!pending || !myF) return;

        if (outcome === 'evade') {
          addPopup(opF ? opF.x : pending.fxX, (opF ? opF.y : pending.fxY) - 96, 'EVADE', '#f2eee5');
        } else if (outcome === 'parry') {
          SFX.parry();
          invertT = 0.085;
          hitstop = 0.075;
          addShake(9);
          myF.st = ST.STAGGER;
          myF.staggerT = 0.9;
          myF.stT = 0.9;
          myF.vx = -pending.dir * 320;
          addPopup(myF.x, myF.y - 110, 'PARRIED!', '#c82424', true);
          spawnParticles(pending.fxX, pending.fxY, 18, '#f2eee5', 150, 440, 500);
          sendMyNetState(true);
        } else if (outcome === 'guard') {
          SFX.guard();
          hitstop = 0.03;
          addShake(3.5);
          spawnParticles(pending.fxX, pending.fxY, 10, '#f2eee5', 120, 300, 520);
          if (broken && opF) addPopup(opF.x, opF.y - 116, 'POSTURE BROKEN 殺', '#c82424', true);
        } else if (outcome === 'hit' || outcome === 'exec') {
          const isEx = outcome === 'exec';
          gainKi(myF, isEx ? 20 : 10);
          if (isEx) {
            myF.hp = Math.min(myF.maxHp, myF.hp + 15);
            SFX.exec();
            invertT = 0.1;
            hitstop = 0.09;
            addShake(12);
            addPopup(pending.fxX, pending.fxY - 60, 'EXECUTION 殺', '#c82424', true);
          } else {
            SFX.hit(false);
            hitstop = 0.04;
            addShake(5);
          }
          spawnParticles(pending.fxX, pending.fxY, isEx ? 22 : 12, '#c82424', 120, 440, 760);
          if (broken && opF) addPopup(opF.x, opF.y - 116, 'POSTURE BROKEN 殺', '#c82424', true);
        }
        break;
      }

      case 'ko': {
        const deadSide = payload[1];
        if (netState.role === 'host') {
          const winner = deadSide === 2 ? 1 : 2;
          hostFinalizeOnlineRound(winner);
        }
        break;
      }

      case 'rnd_end': {
        if (netState.role === 'guest') {
          applyOnlineRoundEnd(payload[1], payload[2], payload[3]);
        }
        break;
      }

      case 'rnd_next': {
        roundNum = payload[1];
        p1Wins = payload[2];
        p2Wins = payload[3];
        setupOnlineRound();
        break;
      }

      case 'rm': {
        roundNum = 1;
        p1Wins = 0;
        p2Wins = 0;
        matchEnded = false;
        setupOnlineRound();
        if (callbacks.onRematchStarted) callbacks.onRematchStarted();
        break;
      }

      default:
        break;
    }
  }

  /* ==================== PLAYER & ENEMY UPDATES ==================== */
  function readP1Input() {
    let move = touchState.axis;
    if (keys['KeyA']) move -= 1;
    if (keys['KeyD']) move += 1;
    if (mode !== 'local2p') {
      if (keys['ArrowLeft']) move -= 1;
      if (keys['ArrowRight']) move += 1;
    }
    move = clamp(move, -1, 1);

    const jump = Boolean(justPressed['KeyW'] || justPressed['Space'] || (mode !== 'local2p' && justPressed['ArrowUp']) || touchJust['jump']);
    const slash = Boolean(justPressed['KeyJ'] || justPressed['KeyZ'] || justPressed['KeyF'] || touchJust['slash']);
    const guardHold = Boolean(keys['KeyK'] || keys['KeyX'] || keys['KeyG'] || touchState.guard);
    const guardTap = Boolean(justPressed['KeyK'] || justPressed['KeyX'] || justPressed['KeyG'] || touchJust['guard']);
    const dash = Boolean(justPressed['KeyL'] || justPressed['ShiftLeft'] || justPressed['ShiftRight'] || justPressed['KeyC'] || justPressed['KeyH'] || touchJust['dash']);
    const q = Boolean(justPressed['KeyQ'] || justPressed['Digit1'] || touchJust['q']);
    const e = Boolean(justPressed['KeyE'] || justPressed['Digit2'] || touchJust['e']);
    const r = Boolean(justPressed['KeyR'] || justPressed['Digit3'] || touchJust['r']);

    return { move, jump, slash, guardHold, guardTap, dash, q, e, r };
  }

  function readP2LocalInput() {
    let move = 0;
    if (keys['ArrowLeft']) move -= 1;
    if (keys['ArrowRight']) move += 1;
    return {
      move,
      jump: Boolean(justPressed['ArrowUp']),
      slash: Boolean(justPressed['KeyJ'] || justPressed['Numpad1']),
      guardHold: Boolean(keys['KeyK'] || keys['Numpad2']),
      guardTap: Boolean(justPressed['KeyK'] || justPressed['Numpad2']),
      dash: Boolean(justPressed['KeyL'] || justPressed['Numpad3']),
      q: Boolean(justPressed['KeyU'] || justPressed['Numpad4']),
      e: Boolean(justPressed['KeyI'] || justPressed['Numpad5']),
      r: Boolean(justPressed['KeyO'] || justPressed['Numpad6']),
    };
  }

  function updateControlledFighter(f, inp, dt) {
    if (f.dead) {
      updatePhysics(f, dt);
      return;
    }

    const prevSt = f.st;
    const prevFace = f.face;

    f.dashCd = Math.max(0, f.dashCd - dt);
    f.parryT = Math.max(0, f.parryT - dt);
    f.parryCd = Math.max(0, f.parryCd - dt);
    f.invulnT = Math.max(0, f.invulnT - dt);
    f.comboWin = Math.max(0, f.comboWin - dt);
    if (f.st !== ST.STAGGER && f.pos > 0) f.pos = Math.max(0, f.pos - 9 * dt);

    if (f.stT > 0) {
      f.stT -= dt;
      if (f.stT <= 0) {
        f.stT = 0;
        if (f.st === ST.STAGGER) f.staggerT = 0;
        if (f.st !== ST.DEAD) f.st = ST.IDLE;
      }
    }

    const locked =
      f.st === ST.STAGGER ||
      f.st === ST.HURT ||
      f.st === ST.DASH ||
      f.st === ST.IAI ||
      f.st === ST.WAVE ||
      f.st === ST.ULT ||
      f.st === ST.EXEC;

    if (!locked) {
      if (inp.r && f.ki >= 100) triggerUlt(f);
      else if (inp.q && f.ki >= 30) triggerIai(f);
      else if (inp.e && f.ki >= 40) triggerWave(f);
      else if (inp.dash) triggerDash(f, inp.move || f.face);
      else if (inp.slash) triggerSlash(f);
      else {
        // Guard & Perfect Parry
        if (inp.guardTap && f.parryCd <= 0) {
          f.parryT = f.wep.parryWin;
          f.parryCd = 0.34;
          f.guarding = true;
          f.st = ST.GUARD;
        } else if (inp.guardHold && f.st !== ST.SLASH) {
          f.guarding = true;
          f.st = ST.GUARD;
          f.vx *= 0.78;
        } else {
          f.guarding = false;
          if (f.st === ST.GUARD) f.st = ST.IDLE;
        }

        // Movement & Jump
        if (!f.guarding && f.st !== ST.SLASH) {
          const speed = f.wep.id === 'dual' ? 430 : f.wep.id === 'odachi' ? 325 : 375;
          if (inp.move !== 0) {
            f.face = inp.move > 0 ? 1 : -1;
            f.vx = lerp(f.vx, inp.move * speed, Math.min(1, 18 * dt));
            if (f.y >= GROUND_Y - 1) f.st = ST.RUN;
          } else {
            f.vx *= Math.pow(0.001, dt);
            if (Math.abs(f.vx) < 8) f.vx = 0;
            if (f.y >= GROUND_Y - 1) f.st = ST.IDLE;
          }

          if (inp.jump && f.y >= GROUND_Y - 2) {
            f.vy = -790;
            f.y = GROUND_Y - 2;
            f.st = ST.JUMP;
            spawnParticles(f.x, GROUND_Y, 6, '#b8b3a8', 40, 150, 300);
          }
        }
      }
    }

    // Active slash hitbox window
    if (f.st === ST.SLASH) {
      const progress = 1 - f.stT / Math.max(0.01, f.stDur);
      if (progress >= 0.22 && progress <= 0.68) {
        const reach = f.wep.reach;
        const isFinisher = f.combo === f.wep.maxCombo;
        const dmg = Math.round(f.wep.dmg * (isFinisher ? 1.35 : 1.0));
        const pDmg = Math.round(f.wep.posDmg * (isFinisher ? 1.4 : 1.0));
        const kb = isFinisher ? 360 : 185;
        const targets = getTargetsFor(f);
        for (const t of targets) {
          if (t.dead || f.hitTargets.has(t)) continue;
          const dx = (t.x - f.x) * f.face;
          const dy = Math.abs(t.y - f.y);
          if (dx >= -26 && dx <= reach && dy < 92) {
            f.hitTargets.add(t);
            deliverHit(f, t, dmg, pDmg, kb, f.face, isFinisher || f.wep.id === 'odachi', false, false);
          }
        }
      }
    }

    // Ghost trail during dash
    if (f.st === ST.DASH && Math.random() < 0.55) addGhost(f);

    const wasInAir = f.y < GROUND_Y - 1;
    updatePhysics(f, dt);

    // Naginata dive-slam landing shockwave
    if (wasInAir && f.y >= GROUND_Y - 1 && f.diveSlam) {
      f.diveSlam = false;
      addShake(8);
      SFX.hit(true);
      spawnParticles(f.x, GROUND_Y, 16, '#f2eee5', 100, 340, 500);
      addSlashArc(f.x, GROUND_Y - 24, f.face, 140, '#c82424', 11, 0);
      for (const t of getTargetsFor(f)) {
        if (!t.dead && Math.abs(t.x - f.x) < 155 && Math.abs(t.y - f.y) < 80) {
          deliverHit(f, t, 20, 32, 300, t.x >= f.x ? 1 : -1, true, false, false);
        }
      }
    }

    if (netState.active && !f.isRemote) {
      const importantChange = f.st !== prevSt || f.face !== prevFace;
      sendMyNetState(importantChange);
    }
  }

  function updateRemoteFighter(f, dt) {
    if (!f) return;
    const rt = netState.remoteTarget;
    if (rt) {
      const halfRttSec = clamp((KuroNet.getState().halfRtt || 20) / 1000, 0.01, 0.085);
      const age = clamp((performance.now() - rt.rxAt) / 1000, 0, 0.14);
      const extrap = Math.min(0.11, halfRttSec + age * 0.55);
      const tx = clamp(rt.x + rt.vx * extrap, LEFT_WALL, RIGHT_WALL);
      const ty = Math.min(GROUND_Y, rt.y + rt.vy * extrap * 0.65);

      const dist = Math.hypot(tx - f.x, ty - f.y);
      if (dist > 170) {
        f.x = tx;
        f.y = ty;
      } else {
        const k = 1 - Math.exp(-24 * dt);
        f.x = lerp(f.x, tx, k);
        f.y = lerp(f.y, ty, k);
      }
      f.vx = rt.vx;
      f.vy = rt.vy;
      f.face = rt.face;
      f.st = rt.st;
      f.stT = Math.max(0, rt.stT - age);
      f.combo = rt.combo;
    }
    f.animPhase += dt * (Math.abs(f.vx) > 25 ? 11 : 3.2);
    updateScarf(f, dt);
  }

  function updatePhysics(f, dt) {
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y < GROUND_Y) {
      f.vy += GRAVITY * dt;
    } else {
      f.y = GROUND_Y;
      f.vy = 0;
    }
    if (f.x < LEFT_WALL) {
      f.x = LEFT_WALL;
      f.vx = Math.max(0, f.vx);
    } else if (f.x > RIGHT_WALL) {
      f.x = RIGHT_WALL;
      f.vx = Math.min(0, f.vx);
    }
    if (f.st === ST.HURT || f.st === ST.STAGGER || f.st === ST.DEAD) {
      f.vx *= Math.pow(0.004, dt);
    }
    f.animPhase += dt * (Math.abs(f.vx) > 25 ? 11 : 3.2);
    updateScarf(f, dt);
  }

  function updateScarf(f, dt) {
    const neckX = f.x - f.face * 5;
    const neckY = f.y - 76;
    const wind = Math.sin(time * 3.1 + f.x * 0.01) * 45 - 65;
    f.scarf[0].x = neckX;
    f.scarf[0].y = neckY;
    for (let i = 1; i < f.scarf.length; i++) {
      const prev = f.scarf[i - 1];
      const cur = f.scarf[i];
      cur.x += (wind - f.vx * 0.28) * dt;
      cur.y += (32 + Math.sin(time * 6 + i) * 18) * dt;
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      const d = Math.hypot(dx, dy) || 1;
      const seg = 9;
      cur.x = prev.x + (dx / d) * seg;
      cur.y = prev.y + (dy / d) * seg;
    }
  }

  /* ==================== ENEMY AI (STORY & ENDLESS) ==================== */
  function spawnEnemy(kind, x) {
    const scale = mode === 'endless' ? 1 + (wave - 1) * 0.1 : 1;
    const cfg = {
      ronin: { hp: 56, pos: 60, wep: 0, sash: '#7c1a1a' },
      spearman: { hp: 52, pos: 55, wep: 2, sash: '#992222' },
      brute: { hp: 105, pos: 95, wep: 1, sash: '#c82424' },
      gunner: { hp: 44, pos: 45, wep: 3, sash: '#8a857b' },
      boss: { hp: 250, pos: 130, wep: 0, sash: '#c82424' },
    }[kind] || { hp: 56, pos: 60, wep: 0, sash: '#7c1a1a' };

    const e = createFighter({
      id: kind + '_' + Math.random().toString(36).slice(2, 6),
      kind,
      team: 2,
      weaponIdx: cfg.wep,
      x: clamp(x, LEFT_WALL + 20, RIGHT_WALL - 20),
      face: x > p1.x ? -1 : 1,
      maxHp: Math.round(cfg.hp * scale),
      maxPos: Math.round(cfg.pos * scale),
      sashColor: cfg.sash,
    });
    enemies.push(e);
    return e;
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.dead) {
        e.stT -= dt;
        updatePhysics(e, dt);
        if (e.stT <= 0) enemies.splice(i, 1);
        continue;
      }

      // Boss Phase 2 transition
      if (e.kind === 'boss' && e.phase === 1 && e.hp <= e.maxHp * 0.5) {
        e.phase = 2;
        e.st = ST.IDLE;
        e.stT = 0;
        bloodMoonT = 3.0;
        invertT = 0.12;
        addShake(12);
        SFX.ult();
        addBanner('LORD KUROGANE — PHASE II', 'BLOOD MOON AWAKENS', 2.0);
        spawnParticles(e.x, e.y - 50, 24, '#c82424', 120, 440, 400);
      }

      if (e.st !== ST.STAGGER && e.pos > 0) e.pos = Math.max(0, e.pos - 6 * dt);
      if (e.stT > 0) {
        e.stT -= dt;
        if (e.stT <= 0) {
          e.stT = 0;
          e.unblockable = false;
          e.st = ST.IDLE;
        }
      }

      const dx = p1.x - e.x;
      const dist = Math.abs(dx);
      const dir = dx >= 0 ? 1 : -1;

      if (e.st !== ST.STAGGER && e.st !== ST.HURT && !p1.dead) {
        // Active attack telegraph -> strike
        if (e.telegraphT > 0) {
          e.telegraphT -= dt;
          e.vx *= 0.85;
          if (e.telegraphT <= 0) {
            executeEnemyStrike(e);
          }
        } else if (e.st !== ST.SLASH) {
          e.face = dir;
          e.aiT -= dt;

          const prefDist =
            e.kind === 'gunner' ? 420 : e.kind === 'spearman' ? 155 : e.kind === 'brute' ? 115 : 100;
          const spd =
            e.kind === 'brute' ? 145 : e.kind === 'boss' ? (e.phase === 2 ? 305 : 240) : e.kind === 'gunner' ? 185 : 225;

          if (e.kind === 'gunner' && dist < 240) {
            e.vx = lerp(e.vx, -dir * spd, 6 * dt);
            e.st = ST.RUN;
          } else if (dist > prefDist + 24) {
            e.vx = lerp(e.vx, dir * spd, 7 * dt);
            e.st = ST.RUN;
          } else {
            e.vx *= 0.8;
            e.st = ST.IDLE;
          }

          if (e.aiT <= 0) {
            if (e.kind === 'gunner' && dist < 680) {
              e.telegraphT = 0.72;
              e.aimX = p1.x;
              e.aimY = p1.y - 52;
              e.aiT = rand(1.9, 2.7);
            } else if (e.kind === 'boss' && dist > 260 && Math.random() < 0.5) {
              // Boss wave or flash-step
              if (e.phase === 2 && Math.random() < 0.5) {
                e.x = clamp(p1.x - dir * 115, LEFT_WALL, RIGHT_WALL);
                e.face = p1.x >= e.x ? 1 : -1;
                addGhost(e);
                SFX.dash();
                e.telegraphT = 0.34;
                e.unblockable = false;
              } else {
                SFX.wave();
                spawnProjectile({
                  owner: e,
                  team: 2,
                  kind: 'wave',
                  x: e.x + dir * 48,
                  y: e.y - 52,
                  vx: dir * (e.phase === 2 ? 620 : 500),
                  vy: 0,
                  r: 38,
                  dmg: 18,
                  posDmg: 28,
                  pierce: false,
                  t: 1.5,
                  color: '#c82424',
                });
              }
              e.aiT = e.phase === 2 ? rand(0.95, 1.45) : rand(1.3, 1.9);
            } else if (dist <= prefDist + 55) {
              e.unblockable = e.kind === 'brute' || (e.kind === 'boss' && e.phase === 2 && Math.random() < 0.32);
              e.telegraphT = e.kind === 'brute' ? 0.62 : e.kind === 'boss' ? (e.phase === 2 ? 0.36 : 0.46) : 0.44;
              e.aiT = e.kind === 'boss' ? (e.phase === 2 ? rand(0.75, 1.15) : rand(1.1, 1.6)) : rand(1.15, 1.9);
            } else {
              e.aiT = 0.35;
            }
          }
        }
      }

      // Enemy slash hit check
      if (e.st === ST.SLASH) {
        const prog = 1 - e.stT / Math.max(0.01, e.stDur);
        if (prog >= 0.25 && prog <= 0.68 && !e.hitTargets.has(p1) && !p1.dead) {
          const reach = e.kind === 'spearman' ? 168 : e.kind === 'brute' ? 135 : e.kind === 'boss' ? 132 : 108;
          const relX = (p1.x - e.x) * e.face;
          if (relX >= -20 && relX <= reach && Math.abs(p1.y - e.y) < 88) {
            e.hitTargets.add(p1);
            const dmg = e.kind === 'brute' ? 24 : e.kind === 'boss' ? (e.phase === 2 ? 20 : 16) : 13;
            resolveLocalHit(e, p1, dmg, e.unblockable ? 45 : 22, e.unblockable ? 360 : 210, e.face, e.unblockable, false, false);
          }
        }
      }

      updatePhysics(e, dt);
    }

    // Check wave clear
    if ((mode === 'story' || mode === 'endless') && enemies.length === 0 && !p1.dead && !scrollPause && !matchEnded) {
      advanceWave();
    }
  }

  function executeEnemyStrike(e) {
    if (e.kind === 'gunner') {
      SFX.gun();
      addShake(4);
      spawnProjectile({
        owner: e,
        team: 2,
        kind: 'bullet',
        x: e.x + e.face * 36,
        y: e.y - 54,
        vx: e.face * 860,
        vy: 0,
        r: 14,
        dmg: 20,
        posDmg: 30,
        pierce: false,
        t: 1.5,
        color: '#f2eee5',
      });
      return;
    }
    e.st = ST.SLASH;
    e.stDur = e.kind === 'brute' ? 0.36 : 0.26;
    e.stT = e.stDur;
    e.hitTargets.clear();
    e.vx = e.face * (e.kind === 'spearman' ? 320 : e.kind === 'boss' ? 300 : 190);
    SFX.slash(e.unblockable);
    addSlashArc(
      e.x + e.face * 55,
      e.y - 52,
      e.face,
      e.kind === 'spearman' ? 120 : e.kind === 'brute' ? 112 : 85,
      e.unblockable ? '#c82424' : '#f2eee5',
      e.unblockable ? 13 : 8,
      0.25
    );
  }

  /* ==================== PROJECTILES & CLONES ==================== */
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.t -= dt;
      if (pr.t <= 0 || pr.x < -80 || pr.x > W + 80) {
        projectiles.splice(i, 1);
        continue;
      }
      if (pr.visualOnly) continue;

      const targets = pr.team === 1 ? (mode === 'local2p' || mode === 'online' ? [p2] : enemies) : [p1];
      let removed = false;
      for (const t of targets) {
        if (!t || t.dead || pr.hitSet.has(t)) continue;
        if (Math.abs(t.x - pr.x) < pr.r + 22 && Math.abs(t.y - 52 - pr.y) < pr.r + 42) {
          // Reflectable on Perfect Parry!
          if (!t.isRemote && t.parryT > 0) {
            pr.team = t.team;
            pr.owner = t;
            pr.vx = -pr.vx * 1.2;
            pr.dmg = Math.round(pr.dmg * 2.2);
            pr.hitSet.clear();
            gainKi(t, 25);
            invertT = 0.08;
            hitstop = 0.06;
            SFX.parry();
            addPopup(t.x, t.y - 108, 'DEFLECTED!', '#c82424', true);
            break;
          }
          pr.hitSet.add(t);
          deliverHit(pr.owner, t, pr.dmg, pr.posDmg, 240, pr.vx >= 0 ? 1 : -1, pr.kind === 'wave', false, false);
          if (!pr.pierce) {
            projectiles.splice(i, 1);
            removed = true;
            break;
          }
        }
      }
      if (removed) continue;
    }

    // Shadow Clone bombs
    for (let i = clones.length - 1; i >= 0; i--) {
      const c = clones[i];
      c.t -= dt;
      if (c.t <= 0) {
        clones.splice(i, 1);
        SFX.hit(true);
        addShake(7);
        spawnParticles(c.x, c.y - 45, 18, '#0b0b0c', 120, 420, 500);
        spawnParticles(c.x, c.y - 45, 10, '#c82424', 100, 340, 450);
        for (const e of enemies) {
          if (!e.dead && Math.abs(e.x - c.x) < 135) {
            resolveLocalHit(p1, e, 24, 34, 280, e.x >= c.x ? 1 : -1, true, false, false);
          }
        }
      }
    }
  }

  /* ==================== WAVE & MODE MANAGEMENT ==================== */
  function spawnStoryWave(w) {
    enemies = [];
    projectiles = [];
    if (w === 1) {
      stageIdx = 0;
      buildStageProps();
      addBanner('ACT I — BAMBOO RAIN', 'Defeat the Ronin Ambush', 2.0);
      spawnEnemy('ronin', 940);
      spawnEnemy('spearman', 1120);
    } else if (w === 2) {
      stageIdx = 1;
      buildStageProps();
      addBanner('ACT II — BURNING TEMPLE', 'Watch for Crimson Kanabo & Matchlock Sightlines', 2.2);
      spawnEnemy('brute', 920);
      spawnEnemy('gunner', 1140);
      spawnEnemy('ronin', 180);
    } else if (w === 3) {
      stageIdx = 2;
      buildStageProps();
      addBanner('ACT III — BLOOD MOON BRIDGE', 'Duel Lord Kurogane', 2.3);
      spawnEnemy('boss', 980);
    }
  }

  function spawnEndlessWave(w) {
    enemies = [];
    projectiles = [];
    stageIdx = (w - 1) % STAGES.length;
    buildStageProps();
    const isBossWave = w % 4 === 0;
    addBanner(`DOJO WAVE ${w}`, isBossWave ? 'LORD KUROGANE ENTERS' : 'Survive the Onslaught', 1.8);
    if (isBossWave) {
      spawnEnemy('boss', 980);
      if (w >= 8) spawnEnemy('gunner', 1130);
    } else {
      const count = Math.min(5, 2 + Math.floor(w * 0.65));
      const pool = ['ronin', 'spearman', 'brute', 'gunner'];
      for (let i = 0; i < count; i++) {
        const kind = pool[Math.floor(Math.random() * Math.min(pool.length, 1 + w))];
        const sideX = i % 2 === 0 ? rand(860, 1150) : rand(120, 320);
        spawnEnemy(kind, sideX);
      }
    }
  }

  function advanceWave() {
    if (mode === 'story') {
      if (wave >= 3) {
        finishSoloRun(true);
        return;
      }
      wave++;
      p1.hp = Math.min(p1.maxHp, p1.hp + 30);
      spawnStoryWave(wave);
    } else if (mode === 'endless') {
      score += 200 * wave;
      saveBest(wave, score);
      wave++;
      p1.hp = Math.min(p1.maxHp, p1.hp + 25);

      const remaining = SCROLLS.filter((s) => !activeScrolls.has(s.id));
      if (remaining.length > 0 && callbacks.onScrollPrompt) {
        scrollPause = true;
        const shuffled = remaining.slice().sort(() => Math.random() - 0.5).slice(0, 3);
        callbacks.onScrollPrompt(shuffled);
      } else {
        spawnEndlessWave(wave);
      }
    }
  }

  function finishSoloRun(win) {
    if (matchEnded) return;
    matchEnded = true;
    const best = mode === 'endless' ? saveBest(wave, score) : loadBest();
    setTimeout(() => {
      if (callbacks.onResult) {
        callbacks.onResult({
          mode,
          win,
          title: win ? 'BLADE SUPREME' : 'FALLEN IN INK',
          sub:
            mode === 'story'
              ? win
                ? 'Lord Kurogane has fallen beneath the Blood Moon.'
                : `Defeated in Act ${wave}`
              : `Reached Wave ${wave} • Best Wave ${best.wave}`,
          canRematch: true,
          stats: [
            ['Score', String(score)],
            ['Kills', String(kills)],
            ['Peak Flow', FLOW_RANKS[Math.min(5, maxCombo)]],
          ],
        });
      }
    }, 950);
  }

  function concludeDuelRound(winner) {
    if (roundOverT > 0 || matchEnded) return;
    if (winner === 1) p1Wins++;
    else p2Wins++;
    if (p1Wins >= 2 || p2Wins >= 2) {
      matchEnded = true;
      addBanner(`PLAYER ${winner} WINS`, `${p1Wins} — ${p2Wins}`, 2.0);
      setTimeout(() => {
        if (callbacks.onResult) {
          callbacks.onResult({
            mode: 'local2p',
            win: true,
            title: `PLAYER ${winner} VICTORIOUS`,
            sub: `Best of 3 • ${p1Wins} — ${p2Wins}`,
            canRematch: true,
            stats: [
              ['P1 Rounds', String(p1Wins)],
              ['P2 Rounds', String(p2Wins)],
            ],
          });
        }
      }, 1300);
    } else {
      roundOverT = 2.0;
      addBanner(`PLAYER ${winner} TAKES ROUND ${roundNum}`, `${p1Wins} — ${p2Wins}`, 1.8);
    }
  }

  function setupLocal2PRound() {
    projectiles = [];
    slashes = [];
    ghosts = [];
    clones = [];
    roundOverT = 0;
    p1 = createFighter({ id: 'p1', team: 1, weaponIdx: menuWeaponIdx, x: 320, face: 1, sashColor: '#c82424' });
    p2 = createFighter({ id: 'p2', team: 2, weaponIdx: (menuWeaponIdx + 1) % WEAPONS.length, x: W - 320, face: -1, sashColor: '#f2eee5', rimColor: '#c82424' });
    addBanner(`ROUND ${roundNum}`, 'DRAW YOUR BLADES', 1.4);
  }

  function setupOnlineRound() {
    projectiles = [];
    slashes = [];
    ghosts = [];
    clones = [];
    netState.pendingHits.clear();
    netState.remoteTarget = null;
    netState.koSent = false;
    roundOverT = 0;

    stageIdx = netState.stageIdx;
    buildStageProps();
    p1 = createFighter({
      id: 'p1',
      team: 1,
      weaponIdx: netState.p1Weapon,
      x: 320,
      face: 1,
      sashColor: '#c82424',
      isRemote: netState.role !== 'host',
    });
    p2 = createFighter({
      id: 'p2',
      team: 2,
      weaponIdx: netState.p2Weapon,
      x: W - 320,
      face: -1,
      sashColor: '#f2eee5',
      rimColor: '#c82424',
      isRemote: netState.role !== 'guest',
    });
    addBanner(`ROUND ${roundNum}`, netState.role === 'host' ? 'YOU ARE P1 (LEFT)' : 'YOU ARE P2 (RIGHT)', 1.5);
    sendMyNetState(true);
  }

  function setupMenuBackdrop() {
    mode = 'menu';
    paused = false;
    scrollPause = false;
    matchEnded = false;
    netState.active = false;
    stageIdx = 2;
    enemies = [];
    projectiles = [];
    slashes = [];
    ghosts = [];
    clones = [];
    buildStageProps();
    p1 = createFighter({ id: 'm1', team: 1, weaponIdx: menuWeaponIdx, x: 520, face: 1, sashColor: '#c82424' });
    p2 = createFighter({ id: 'm2', team: 2, weaponIdx: 1, x: 860, face: -1, sashColor: '#d9d3c7' });
    camX = W * 0.5;
    camZoom = 1;
    targetZoom = 1;
    if (callbacks.onModeChange) callbacks.onModeChange('menu');
  }

  /* ==================== RENDERING (KUROSAWA SUMI-E) ==================== */
  function drawBackground() {
    const st = STAGES[stageIdx] || STAGES[0];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, st.skyTop);
    grad.addColorStop(1, st.skyBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Pale or Blood Moon
    const isBlood = bloodMoonT > 0 || st.id === 'bridge';
    const mx = W * 0.68 - (camX - W * 0.5) * 0.08;
    const my = st.moonY;
    ctx.save();
    const moonCol = bloodMoonT > 0 ? '#c82424' : isBlood ? '#e6d8cc' : '#f2eee5';
    const halo = ctx.createRadialGradient(mx, my, st.moonR * 0.5, mx, my, st.moonR * 2.2);
    halo.addColorStop(0, bloodMoonT > 0 ? 'rgba(200,36,36,0.34)' : 'rgba(242,238,229,0.16)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, st.moonR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = moonCol;
    ctx.beginPath();
    ctx.arc(mx, my, st.moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Distant silhouette mountains
    ctx.fillStyle = '#151517';
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    for (let x = 0; x <= W; x += 160) {
      const mh = 150 + Math.sin(x * 0.008 + stageIdx) * 65 + Math.cos(x * 0.02) * 28;
      ctx.lineTo(x, GROUND_Y - mh);
    }
    ctx.lineTo(W, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Torii Gate / Pagoda silhouette
    const tx = W * 0.52 - (camX - W * 0.5) * 0.16;
    ctx.fillStyle = '#0d0d0f';
    if (st.id === 'temple') {
      // Pagoda tiers
      for (let t = 0; t < 3; t++) {
        const w = 180 - t * 34;
        const y = GROUND_Y - 120 - t * 62;
        ctx.fillRect(tx - w * 0.35, y, w * 0.7, 52);
        ctx.beginPath();
        ctx.moveTo(tx - w * 0.58, y + 6);
        ctx.lineTo(tx, y - 22);
        ctx.lineTo(tx + w * 0.58, y + 6);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // Torii Gate
      ctx.fillRect(tx - 84, GROUND_Y - 210, 14, 210);
      ctx.fillRect(tx + 70, GROUND_Y - 210, 14, 210);
      ctx.fillRect(tx - 118, GROUND_Y - 216, 236, 16);
      ctx.fillRect(tx - 98, GROUND_Y - 176, 196, 11);
    }

    // Swaying bamboo silhouettes
    ctx.save();
    for (const b of bamboo) {
      const bx = ((b.x - (camX - W * 0.5) * b.depth * 0.45) % (W + 120) + (W + 120)) % (W + 120) - 60;
      const sway = Math.sin(time * 1.4 + b.phase) * 14 * b.depth;
      ctx.strokeStyle = b.depth > 0.55 ? 'rgba(10,10,12,0.85)' : 'rgba(20,20,24,0.48)';
      ctx.lineWidth = b.w;
      ctx.beginPath();
      ctx.moveTo(bx, GROUND_Y + 10);
      ctx.quadraticCurveTo(bx + sway * 0.5, GROUND_Y - 260, bx + sway, -30);
      ctx.stroke();
    }
    ctx.restore();

    // Ground / Bridge deck
    ctx.fillStyle = '#0b0b0d';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    if (st.bridge) {
      ctx.strokeStyle = 'rgba(242,238,229,0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y - 52);
      ctx.lineTo(W, GROUND_Y - 52);
      ctx.stroke();
      for (let x = 40; x < W; x += 120) {
        ctx.fillStyle = '#111114';
        ctx.fillRect(x, GROUND_Y - 62, 10, 62);
      }
    }

    // Crisp rim ground line
    ctx.strokeStyle = 'rgba(242,238,229,0.34)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();

    // Drifting mist
    const mist = ctx.createLinearGradient(0, GROUND_Y - 75, 0, GROUND_Y + 10);
    mist.addColorStop(0, 'rgba(242,238,229,0)');
    mist.addColorStop(1, 'rgba(242,238,229,0.09)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, GROUND_Y - 75, W, 85);
  }

  function drawFighter(f, alpha) {
    if (!f) return;
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;

    const x = f.x;
    const y = f.y;
    const dir = f.face;
    const isBoss = f.kind === 'boss';
    const isBrute = f.kind === 'brute';
    const sc = isBoss ? 1.2 : isBrute ? 1.15 : 1.0;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, GROUND_Y + 3, 28 * sc, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flowing Verlet scarf
    ctx.strokeStyle = f.sashColor;
    ctx.lineWidth = 6 * sc;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(f.scarf[0].x, f.scarf[0].y);
    for (let i = 1; i < f.scarf.length; i++) ctx.lineTo(f.scarf[i].x, f.scarf[i].y);
    ctx.stroke();

    ctx.translate(x, y);
    ctx.scale(dir * sc, sc);

    if (f.dead) {
      ctx.rotate(-1.35);
      ctx.translate(-12, 16);
    }

    const run = f.st === ST.RUN ? Math.sin(f.animPhase) : 0;
    const breathe = Math.sin(f.animPhase * 0.7) * 2;
    const lean =
      f.st === ST.RUN ? 0.16 : f.st === ST.DASH || f.st === ST.IAI ? 0.38 : f.st === ST.SLASH ? 0.25 : f.st === ST.STAGGER ? -0.22 : 0.04;

    // Legs & hakama trousers
    ctx.strokeStyle = f.rimColor;
    ctx.fillStyle = '#09090b';
    ctx.lineWidth = 2;

    const legF = run * 18;
    const legB = -run * 18;

    // Back leg
    ctx.beginPath();
    ctx.moveTo(-4, -36);
    ctx.lineTo(-12 + legB, -16);
    ctx.lineTo(-14 + legB * 1.1, 0);
    ctx.lineTo(-4 + legB, 0);
    ctx.lineTo(2, -32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front leg
    ctx.beginPath();
    ctx.moveTo(2, -36);
    ctx.lineTo(13 + legF, -16);
    ctx.lineTo(15 + legF * 1.1, 0);
    ctx.lineTo(5 + legF, 0);
    ctx.lineTo(-4, -32);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Torso / Haori coat
    ctx.save();
    ctx.translate(0, -36 + breathe);
    ctx.rotate(lean);

    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.lineTo(-11, -38);
    ctx.lineTo(12, -38);
    ctx.lineTo(15, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Obi sash
    ctx.fillStyle = f.sashColor;
    ctx.fillRect(-13, -6, 26, 7);

    // Head + Kasa straw hat / Kabuto horns
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(1, -50, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (isBoss) {
      // Horned kabuto helmet
      ctx.strokeStyle = '#c82424';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(0, -58);
      ctx.lineTo(-14, -74);
      ctx.moveTo(2, -58);
      ctx.lineTo(18, -75);
      ctx.stroke();
    } else if (f.kind === 'player' || f.kind === 'ronin') {
      // Conical ronin kasa hat
      ctx.fillStyle = '#09090b';
      ctx.strokeStyle = f.rimColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-26, -54);
      ctx.lineTo(2, -68);
      ctx.lineTo(28, -53);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Glowing crimson eye slit on telegraph / boss
    if (f.telegraphT > 0 || isBoss || f.parryT > 0) {
      ctx.fillStyle = f.parryT > 0 ? '#f2eee5' : '#c82424';
      ctx.fillRect(4, -52, 5, 2.5);
    }

    // Weapon arm & blade
    let bladeAng = -0.35;
    if (f.st === ST.SLASH) {
      const p = 1 - f.stT / Math.max(0.01, f.stDur);
      bladeAng = f.combo % 2 === 1 ? lerp(-2.1, 1.15, p) : lerp(1.3, -1.9, p);
    } else if (f.st === ST.GUARD || f.parryT > 0) {
      bladeAng = -1.38;
    } else if (f.telegraphT > 0) {
      bladeAng = -2.35;
    } else if (f.st === ST.STAGGER) {
      bladeAng = 0.9;
    }

    ctx.save();
    ctx.translate(6, -30);
    ctx.rotate(bladeAng);

    // Arm
    ctx.strokeStyle = f.rimColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, 0);
    ctx.stroke();

    // Blade by weapon/class
    if (f.kind === 'gunner') {
      ctx.fillStyle = '#252528';
      ctx.fillRect(14, -3, 38, 6);
    } else if (isBrute) {
      ctx.fillStyle = '#1d1d20';
      ctx.strokeStyle = '#c82424';
      ctx.lineWidth = 1.6;
      ctx.fillRect(14, -5, 58, 10);
      ctx.strokeRect(14, -5, 58, 10);
    } else {
      const wId = f.wep.id;
      const len = wId === 'odachi' ? 78 : wId === 'naginata' ? 88 : wId === 'dual' ? 42 : 58;
      ctx.strokeStyle = f.parryT > 0 ? '#ffffff' : '#f2eee5';
      ctx.lineWidth = wId === 'odachi' ? 4.2 : 2.8;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(14 + len, -3);
      ctx.stroke();
      if (wId === 'dual') {
        ctx.beginPath();
        ctx.moveTo(6, 7);
        ctx.lineTo(-28, 12);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.restore();
    ctx.restore();

    // Telegraph glint or Gunner sightline
    if (f.telegraphT > 0 && !f.dead) {
      ctx.save();
      if (f.kind === 'gunner') {
        ctx.strokeStyle = 'rgba(242,238,229,0.75)';
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + dir * 40, y - 54);
        ctx.lineTo(x + dir * 720, y - 54);
        ctx.stroke();
      } else {
        const pulse = 10 + Math.sin(time * 40) * 4;
        ctx.strokeStyle = f.unblockable ? '#c82424' : '#f2eee5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - pulse, y - 96);
        ctx.lineTo(x + pulse, y - 96);
        ctx.moveTo(x, y - 96 - pulse);
        ctx.lineTo(x, y - 96 + pulse);
        ctx.stroke();
        if (f.unblockable) {
          ctx.fillStyle = '#c82424';
          ctx.font = 'bold 24px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillText('破', x, y - 114);
        }
      }
      ctx.restore();
    }

    // Stagger Execution Mark 殺
    if (f.st === ST.STAGGER && !f.dead) {
      ctx.save();
      ctx.fillStyle = '#c82424';
      ctx.font = 'bold 28px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText('殺', x, y - 114 + Math.sin(time * 18) * 4);
      ctx.restore();
    }

    // Overhead mini HP + Posture for non-boss enemies
    if (f.kind !== 'player' && f.kind !== 'boss' && !f.dead) {
      const bw = 54;
      const bx = x - bw * 0.5;
      const by = y - 104;
      ctx.fillStyle = 'rgba(10,10,12,0.8)';
      ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = '#c82424';
      ctx.fillRect(bx, by, bw * clamp(f.hp / f.maxHp, 0, 1), 5);
      ctx.fillStyle = '#f2eee5';
      ctx.fillRect(bx, by + 6, bw * clamp(f.pos / f.maxPos, 0, 1), 3);
    }
  }

  function drawVfx() {
    // Ghosts
    for (const g of ghosts) {
      const a = (g.t / g.maxT) * 0.35;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#0b0b0c';
      ctx.strokeStyle = '#f2eee5';
      ctx.lineWidth = 1.5;
      ctx.fillRect(g.x - 14, g.y - 84, 28, 84);
      ctx.strokeRect(g.x - 14, g.y - 84, 28, 84);
      ctx.restore();
    }

    // Shadow Clones
    for (const c of clones) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#09090b';
      ctx.strokeStyle = '#c82424';
      ctx.lineWidth = 2;
      ctx.fillRect(c.x - 13, c.y - 82, 26, 82);
      ctx.strokeRect(c.x - 13, c.y - 82, 26, 82);
      ctx.restore();
    }

    // Slash Smears
    for (const s of slashes) {
      const p = s.t / s.maxT;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.face, 1);
      ctx.rotate(s.ang);
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = p;
      ctx.lineWidth = s.thick * p;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, s.r, -1.1, 1.0);
      ctx.stroke();
      ctx.restore();
    }

    // Projectiles
    for (const pr of projectiles) {
      ctx.save();
      if (pr.kind === 'wave') {
        const dir = pr.vx >= 0 ? 1 : -1;
        ctx.translate(pr.x, pr.y);
        ctx.scale(dir, 1);
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(-10, 0, pr.r, -1.15, 1.15);
        ctx.stroke();
        ctx.strokeStyle = '#f2eee5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(-6, 0, pr.r - 4, -1.0, 1.0);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#f2eee5';
        ctx.fillRect(pr.x - 12, pr.y - 2, 24, 4);
      }
      ctx.restore();
    }

    // Particles
    for (const pt of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(pt.t / pt.maxT, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.sz * 0.5, pt.y - pt.sz * 0.5, pt.sz, pt.sz);
      ctx.restore();
    }

    // Ambient rain / embers
    const st = STAGES[stageIdx] || STAGES[0];
    ctx.save();
    if (st.rain) {
      ctx.strokeStyle = 'rgba(242,238,229,0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const a of ambient) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x - a.len * 0.25, a.y + a.len);
      }
      ctx.stroke();
    } else if (st.embers) {
      ctx.fillStyle = 'rgba(200,36,36,0.65)';
      for (const a of ambient) {
        ctx.fillRect(a.x, a.y, a.sz, a.sz);
      }
    }
    ctx.restore();

    // Popups
    for (const pop of popups) {
      const a = clamp(pop.t / pop.maxT, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = pop.big ? 'bold 22px Georgia, serif' : 'bold 14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#09090b';
      ctx.fillText(pop.text, pop.x + 2, pop.y + 2);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
      ctx.restore();
    }
  }

  function drawHud() {
    if (mode === 'menu') return;

    const topY = settings.letterbox ? 44 : 18;

    // P1 Bars (Top-Left)
    if (p1) {
      const p1Label = mode === 'online' ? (netState.role === 'host' ? 'YOU (P1)' : 'HOST (P1)') : 'KUROKAZE';
      drawFighterBar(28, topY, 290, p1, p1Label, false, mode === 'local2p' || mode === 'online' ? p1Wins : -1);
    }

    // P2 or Boss Bar (Top-Right)
    if ((mode === 'local2p' || mode === 'online') && p2) {
      const p2Label = mode === 'online' ? (netState.role === 'guest' ? 'YOU (P2)' : 'GUEST (P2)') : 'PLAYER 2';
      drawFighterBar(W - 318, topY, 290, p2, p2Label, true, p2Wins);
    } else {
      const boss = enemies.find((e) => e.kind === 'boss' && !e.dead);
      if (boss) {
        drawFighterBar(W - 368, topY, 340, boss, `LORD KUROGANE • PHASE ${boss.phase}`, true, -1);
      }
    }

    // Center Info (Wave / Round / Flow)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2eee5';
    ctx.font = 'bold 15px Georgia, serif';
    if (mode === 'story') {
      ctx.fillText(`ACT ${wave} / 3  •  ${STAGES[stageIdx].name.toUpperCase()}`, W * 0.5, topY + 14);
    } else if (mode === 'endless') {
      ctx.fillText(`WAVE ${wave}  •  SCORE ${score}`, W * 0.5, topY + 14);
    } else {
      ctx.fillText(`ROUND ${roundNum}  •  BEST OF 3`, W * 0.5, topY + 14);
    }

    // Flow Rank (Solo modes)
    if (mode === 'story' || mode === 'endless') {
      ctx.font = 'bold 26px Georgia, serif';
      ctx.fillStyle = flowRank >= 4 ? '#c82424' : '#f2eee5';
      ctx.fillText(`FLOW ${FLOW_RANKS[flowRank]}`, W * 0.5, topY + 46);
    }
    ctx.restore();

    // Cinematic Banner
    if (banner.t > 0) {
      const alpha = clamp(Math.min(banner.t * 2.5, (banner.maxT - banner.t) * 5 + 0.2), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(11,11,12,0.72)';
      ctx.fillRect(0, H * 0.34, W, 114);
      ctx.fillStyle = '#c82424';
      ctx.fillRect(0, H * 0.34, W, 2);
      ctx.fillRect(0, H * 0.34 + 112, W, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f2eee5';
      ctx.font = 'bold 38px Georgia, serif';
      ctx.fillText(banner.title, W * 0.5, H * 0.34 + 56);
      if (banner.sub) {
        ctx.fillStyle = '#c82424';
        ctx.font = '15px -apple-system, sans-serif';
        ctx.fillText(banner.sub.toUpperCase(), W * 0.5, H * 0.34 + 88);
      }
      ctx.restore();
    }
  }

  function drawFighterBar(x, y, w, f, label, alignRight, wins) {
    ctx.save();
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.fillStyle = '#f2eee5';
    ctx.textAlign = alignRight ? 'right' : 'left';
    ctx.fillText(`${label}  [${f.wep.name.toUpperCase()}]`, alignRight ? x + w : x, y);

    // Round win pips
    if (wins >= 0) {
      for (let i = 0; i < 2; i++) {
        const px = alignRight ? x + i * 16 + 6 : x + w - (i * 16 + 6);
        ctx.fillStyle = i < wins ? '#c82424' : 'rgba(242,238,229,0.22)';
        ctx.beginPath();
        ctx.arc(px, y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // HP Bar
    const hpRatio = clamp(f.hp / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(12,12,14,0.85)';
    ctx.fillRect(x, y + 6, w, 13);
    ctx.fillStyle = '#c82424';
    if (alignRight) ctx.fillRect(x + w * (1 - hpRatio), y + 6, w * hpRatio, 13);
    else ctx.fillRect(x, y + 6, w * hpRatio, 13);
    ctx.strokeStyle = 'rgba(242,238,229,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y + 6, w, 13);

    // Ki Bar
    const kiRatio = clamp(f.ki / 100, 0, 1);
    ctx.fillStyle = 'rgba(12,12,14,0.85)';
    ctx.fillRect(x, y + 23, w, 7);
    ctx.fillStyle = f.ki >= 100 ? '#c82424' : '#f2eee5';
    if (alignRight) ctx.fillRect(x + w * (1 - kiRatio), y + 23, w * kiRatio, 7);
    else ctx.fillRect(x, y + 23, w * kiRatio, 7);

    // Posture Bar
    const posRatio = clamp(f.pos / getMaxPosture(f), 0, 1);
    ctx.fillStyle = 'rgba(12,12,14,0.75)';
    ctx.fillRect(x, y + 33, w, 4);
    ctx.fillStyle = posRatio > 0.72 ? '#c82424' : '#9a968e';
    if (alignRight) ctx.fillRect(x + w * (1 - posRatio), y + 33, w * posRatio, 4);
    else ctx.fillRect(x, y + 33, w * posRatio, 4);

    ctx.restore();
  }

  function drawCinemaOverlay() {
    if (invertT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    if (settings.grain && !isLowFx() && grainCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(grainCanvas, rand(-20, 0), rand(-12, 0), W + 24, H + 16);
      ctx.restore();
    }

    if (settings.letterbox) {
      const barH = mode === 'menu' ? 26 : 30;
      ctx.fillStyle = '#060607';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }
  }

  /* ==================== MAIN LOOP ==================== */
  function step(dt) {
    time += dt;
    if (bloodMoonT > 0) bloodMoonT = Math.max(0, bloodMoonT - dt);
    if (invertT > 0) invertT = Math.max(0, invertT - dt);
    if (banner.t > 0) banner.t = Math.max(0, banner.t - dt);

    // Ambient weather
    const st = STAGES[stageIdx] || STAGES[0];
    for (const a of ambient) {
      if (st.rain) {
        a.x -= a.spd * 0.22 * dt;
        a.y += a.spd * dt;
        if (a.y > H) {
          a.y = -20;
          a.x = rand(0, W + 160);
        }
      } else {
        a.y -= a.spd * 0.14 * dt;
        a.x += Math.sin(time * 2 + a.phase) * 28 * dt;
        if (a.y < -10) {
          a.y = H + 10;
          a.x = rand(0, W);
        }
      }
    }

    if (mode === 'menu') {
      if (p1) {
        p1.animPhase += dt * 2.6;
        updateScarf(p1, dt);
      }
      if (p2) {
        p2.animPhase += dt * 2.4;
        updateScarf(p2, dt);
      }
      clearJustPressed();
      return;
    }

    if (paused || scrollPause) {
      clearJustPressed();
      return;
    }

    if (hitstop > 0) {
      hitstop = Math.max(0, hitstop - dt);
      clearJustPressed();
      return;
    }

    // Round transition timer
    if (roundOverT > 0) {
      roundOverT -= dt;
      if (roundOverT <= 0 && !matchEnded) {
        roundNum++;
        if (mode === 'local2p') {
          setupLocal2PRound();
        } else if (mode === 'online' && netState.role === 'host') {
          KuroNet.sendReliable(['rnd_next', roundNum, p1Wins, p2Wins]);
          setupOnlineRound();
        }
      }
    }

    // Update fighters
    if (mode === 'story' || mode === 'endless') {
      updateControlledFighter(p1, readP1Input(), dt);
      updateEnemies(dt);
    } else if (mode === 'local2p') {
      updateControlledFighter(p1, readP1Input(), dt);
      updateControlledFighter(p2, readP2LocalInput(), dt);
    } else if (mode === 'online') {
      const myF = getMyFighter();
      const opF = getRemoteFighter();
      if (myF) updateControlledFighter(myF, readP1Input(), dt);
      if (opF) updateRemoteFighter(opF, dt);
    }

    updateProjectiles(dt);

    // VFX timers
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].t -= dt;
      if (slashes[i].t <= 0) slashes.splice(i, 1);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].t -= dt;
      if (ghosts[i].t <= 0) ghosts.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 36 * dt;
      popups[i].t -= dt;
      if (popups[i].t <= 0) popups.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += pt.grav * dt;
      pt.t -= dt;
      if (pt.t <= 0) particles.splice(i, 1);
    }

    // Camera tracking & shake
    let focusX = W * 0.5;
    if ((mode === 'local2p' || mode === 'online') && p1 && p2) {
      focusX = (p1.x + p2.x) * 0.5;
    } else if (p1) {
      focusX = lerp(W * 0.5, p1.x, 0.35);
    }
    camX = lerp(camX, clamp(focusX, W * 0.42, W * 0.58), Math.min(1, 6 * dt));
    camZoom = lerp(camZoom, targetZoom, Math.min(1, 10 * dt));

    if (shakeMag > 0.2) {
      shakeX = rand(-shakeMag, shakeMag);
      shakeY = rand(-shakeMag, shakeMag);
      shakeMag *= Math.pow(0.0015, dt);
    } else {
      shakeMag = 0;
      shakeX = 0;
      shakeY = 0;
    }

    clearJustPressed();
  }

  function render() {
    if (!ctx) return;
    ctx.save();
    ctx.translate(W * 0.5 + shakeX, H * 0.5 + shakeY);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-W * 0.5, -H * 0.5);

    drawBackground();
    if (p1) drawFighter(p1);
    if (p2) drawFighter(p2);
    for (const e of enemies) drawFighter(e);
    drawVfx();

    ctx.restore();
    drawHud();
    drawCinemaOverlay();
  }

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    const rawDt = (ts - lastTs) / 1000;
    lastTs = ts;
    const dt = clamp(rawDt, 0.001, 0.05);

    // FPS counter
    fpsFrames++;
    fpsAccum += rawDt;
    if (fpsAccum >= 0.5) {
      currentFps = Math.round(fpsFrames / fpsAccum);
      fpsFrames = 0;
      fpsAccum = 0;
    }

    step(dt);
    render();

    // Emit HUD skill ready state (~10Hz) for mobile Q/E/R buttons
    if (mode !== 'menu' && ts - lastSkillEmit > 100) {
      lastSkillEmit = ts;
      const myF = getMyFighter();
      if (myF && callbacks.onSkillState) {
        callbacks.onSkillState({
          ki: Math.round(myF.ki),
          qReady: myF.ki >= 30,
          eReady: myF.ki >= 40,
          rReady: myF.ki >= 100,
          dashReady: myF.dashCd <= 0,
        });
      }
    }

    // Emit telemetry (~2Hz)
    if (ts - lastTeleEmit > 500) {
      lastTeleEmit = ts;
      if (callbacks.onTelemetry) {
        const net = global.KuroNet ? KuroNet.getState() : {};
        callbacks.onTelemetry({
          fps: currentFps,
          ping: net.ping || 0,
          region: net.region || '',
          path: net.path || 'idle',
          lowFx: isLowFx(),
          mode,
        });
      }
    }
  }

  function clearJustPressed() {
    for (const k in justPressed) justPressed[k] = false;
    for (const k in touchJust) touchJust[k] = false;
  }

  function clearAllInputs() {
    for (const k in keys) keys[k] = false;
    clearJustPressed();
    touchState.axis = 0;
    touchState.guard = false;
  }

  /* ==================== CANVAS RESIZING ==================== */
  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const dprCap = isLowFx() ? 1.35 : 2.0;
    const dpr = Math.min(global.devicePixelRatio || 1, dprCap);
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(320, Math.round(rect.width * dpr));
    const ch = Math.max(180, Math.round(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  /* ==================== PUBLIC API ==================== */
  const KuroGame = {
    WEAPONS,
    STAGES,
    SCROLLS,
    IS_TOUCH,

    init(canvasEl, cbs) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d', { alpha: false });
      callbacks = cbs || {};
      buildGrainCanvas();
      resizeCanvas();
      setupMenuBackdrop();

      global.addEventListener('resize', resizeCanvas);
      global.addEventListener('blur', clearAllInputs);
      global.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        SFX.unlock();
        if (e.code === 'Escape' && mode !== 'menu' && !matchEnded && !scrollPause) {
          KuroGame.togglePause();
          return;
        }
        if (!keys[e.code]) justPressed[e.code] = true;
        keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          e.preventDefault();
        }
      });
      global.addEventListener('keyup', (e) => {
        keys[e.code] = false;
      });

      if (global.KuroNet) {
        KuroNet.on('relay', handleNetRelay);
      }

      if (!rafId) rafId = requestAnimationFrame(loop);
    },

    unlockAudio: SFX.unlock,
    playMenuDraw: SFX.menuDraw,
    loadBest,

    setWeapon(idx) {
      menuWeaponIdx = clamp(idx, 0, WEAPONS.length - 1);
      if (mode === 'menu' && p1) {
        p1.weaponIdx = menuWeaponIdx;
        p1.wep = WEAPONS[menuWeaponIdx];
      }
    },

    setStage(idx) {
      selectedStageIdx = clamp(idx, 0, STAGES.length - 1);
    },

    updateSettings(patch) {
      Object.assign(settings, patch || {});
      SFX.setVolume(settings.volume);
      resizeCanvas();
      buildStageProps();
    },

    getSettings() {
      return { ...settings };
    },

    startStory() {
      SFX.unlock();
      mode = 'story';
      paused = false;
      scrollPause = false;
      matchEnded = false;
      netState.active = false;
      wave = 1;
      score = 0;
      kills = 0;
      maxCombo = 0;
      flowPts = 0;
      flowRank = 0;
      activeScrolls.clear();
      p2 = null;
      p1 = createFighter({ id: 'p1', team: 1, weaponIdx: menuWeaponIdx, x: 260, face: 1, sashColor: '#c82424' });
      spawnStoryWave(1);
      if (callbacks.onModeChange) callbacks.onModeChange('story');
    },

    startEndless() {
      SFX.unlock();
      mode = 'endless';
      paused = false;
      scrollPause = false;
      matchEnded = false;
      netState.active = false;
      wave = 1;
      score = 0;
      kills = 0;
      maxCombo = 0;
      flowPts = 0;
      flowRank = 0;
      activeScrolls.clear();
      p2 = null;
      p1 = createFighter({ id: 'p1', team: 1, weaponIdx: menuWeaponIdx, x: 280, face: 1, sashColor: '#c82424' });
      spawnEndlessWave(1);
      if (callbacks.onModeChange) callbacks.onModeChange('endless');
    },

    startLocal2P() {
      SFX.unlock();
      mode = 'local2p';
      paused = false;
      scrollPause = false;
      matchEnded = false;
      netState.active = false;
      stageIdx = selectedStageIdx;
      buildStageProps();
      enemies = [];
      roundNum = 1;
      p1Wins = 0;
      p2Wins = 0;
      setupLocal2PRound();
      if (callbacks.onModeChange) callbacks.onModeChange('local2p');
    },

    startOnline(cfg) {
      SFX.unlock();
      mode = 'online';
      paused = false;
      scrollPause = false;
      matchEnded = false;
      netState.active = true;
      netState.role = cfg.role === 'guest' ? 'guest' : 'host';
      netState.p1Weapon = clamp(cfg.p1Weapon || 0, 0, WEAPONS.length - 1);
      netState.p2Weapon = clamp(cfg.p2Weapon || 0, 0, WEAPONS.length - 1);
      netState.stageIdx = clamp(cfg.stageIdx || 0, 0, STAGES.length - 1);
      enemies = [];
      roundNum = 1;
      p1Wins = 0;
      p2Wins = 0;
      setupOnlineRound();
      if (callbacks.onModeChange) callbacks.onModeChange('online');
    },

    requestRematch() {
      if (mode === 'story') KuroGame.startStory();
      else if (mode === 'endless') KuroGame.startEndless();
      else if (mode === 'local2p') KuroGame.startLocal2P();
      else if (mode === 'online') {
        roundNum = 1;
        p1Wins = 0;
        p2Wins = 0;
        matchEnded = false;
        KuroNet.sendReliable(['rm']);
        setupOnlineRound();
      }
    },

    applyScroll(scrollId) {
      activeScrolls.add(scrollId);
      scrollPause = false;
      SFX.parry();
      spawnEndlessWave(wave);
    },

    togglePause(force) {
      if (mode === 'menu' || mode === 'online') return;
      paused = force !== undefined ? Boolean(force) : !paused;
      if (callbacks.onPauseChange) callbacks.onPauseChange(paused);
    },

    returnToMenu() {
      clearAllInputs();
      setupMenuBackdrop();
    },

    setTouchAxis(val) {
      touchState.axis = clamp(val, -1, 1);
    },

    setTouchButton(name, down) {
      SFX.unlock();
      if (down && !touchState[name]) touchJust[name] = true;
      touchState[name] = Boolean(down);
    },
  };

  global.KuroGame = KuroGame;
})(window);