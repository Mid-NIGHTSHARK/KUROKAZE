/* KUROKAZE IV — Ink & Steel (Full Kurosawa Art + PC Mouse + 0ms Prediction Netcode)
 * Drop-in replacement for game.js — pairs with net.js (KuroNet) and kurokaze_online.html.
 */
(function (global) {
  'use strict';

  const VW = 1280;
  const VH = 720;
  const GROUND = 582;
  const LEFT_B = -640;
  const RIGHT_B = 640;
  const GRAV = 2250;
  const BEST_KEY = 'kurokaze_iv_best_v1';

  const IS_TOUCH =
    (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ||
    'ontouchstart' in global;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sgn = (v) => (v < 0 ? -1 : 1);

  const WEAPONS = [
    {
      id: 'katana',
      name: 'Katana',
      jp: '刀',
      desc: 'Balanced 3-hit cadence with generous 220ms parry and crisp iaijutsu reach.',
      stats: { speed: 74, reach: 66, posture: 62, parry: 92 },
      hits: 3,
      reach: 108,
      dmg: [14, 17, 26],
      pos: [16, 20, 34],
      dur: [0.23, 0.26, 0.36],
      parry: 0.22,
      dashCd: 0.42,
      kiMul: 1.0,
      len: 78,
    },
    {
      id: 'odachi',
      name: 'Odachi',
      jp: '大太刀',
      desc: 'Heavy greatsword with wide crimson smear arcs, guard crush, and huge posture break.',
      stats: { speed: 44, reach: 88, posture: 96, parry: 72 },
      hits: 3,
      reach: 138,
      dmg: [20, 24, 34],
      pos: [28, 34, 56],
      dur: [0.32, 0.34, 0.44],
      parry: 0.2,
      dashCd: 0.48,
      kiMul: 1.0,
      len: 108,
      guardCrush: true,
    },
    {
      id: 'naginata',
      name: 'Naginata',
      jp: '薙刀',
      desc: 'Long horizontal polearm poke plus an aerial dive-slam shockwave.',
      stats: { speed: 66, reach: 96, posture: 72, parry: 80 },
      hits: 3,
      reach: 148,
      dmg: [14, 16, 23],
      pos: [18, 22, 30],
      dur: [0.25, 0.27, 0.35],
      parry: 0.21,
      dashCd: 0.42,
      kiMul: 1.0,
      len: 118,
      diveBonus: true,
    },
    {
      id: 'wakizashi',
      name: 'Dual Blade',
      jp: '二刀',
      desc: 'Rapid 5-hit flurry, short Flash-Step cooldown, faster Ki gain, tighter 160ms parry.',
      stats: { speed: 96, reach: 48, posture: 54, parry: 56 },
      hits: 5,
      reach: 88,
      dmg: [9, 10, 11, 12, 20],
      pos: [11, 12, 13, 15, 26],
      dur: [0.16, 0.16, 0.17, 0.18, 0.28],
      parry: 0.16,
      dashCd: 0.26,
      kiMul: 1.38,
      len: 56,
      dual: true,
    },
  ];

  const STAGES = [
    { id: 'bamboo', name: 'Bamboo Rain', jp: '竹林雨' },
    { id: 'temple', name: 'Burning Temple', jp: '炎上寺' },
    { id: 'bridge', name: 'Blood Moon Bridge', jp: '血月橋' },
  ];

  const SCROLLS = [
    { id: 'thunder', name: 'Thunder Parry', jp: '雷弾', desc: 'Perfect Parries shock nearby foes with lightning.' },
    { id: 'clone', name: 'Shadow Clone', jp: '影分身', desc: 'Flash-Step leaves an ink decoy that detonates.' },
    { id: 'drain', name: 'Crimson Drain', jp: '紅吸', desc: 'Kills & Executions restore +12 extra HP.' },
    { id: 'iron', name: 'Iron Posture', jp: '鉄構', desc: '+45 Max Posture & faster posture recovery.' },
    { id: 'swift', name: 'Swift Ki', jp: '疾気', desc: '+40% Ki gain & faster passive spirit flow.' },
  ];

  const STORY_WAVES = [
    { stageIdx: 0, kanji: '第一幕', title: 'BAMBOO RAIN', sub: 'Ronin & Yari Spearman ambush in the storm.', list: ['ronin', 'spearman', 'ronin'] },
    { stageIdx: 1, kanji: '第二幕', title: 'BURNING TEMPLE', sub: 'Parry Teppo bullets back at the backline.', list: ['ronin', 'gunner', 'brute'] },
    { stageIdx: 2, kanji: '最終幕', title: 'LORD KUROGANE', sub: 'Demon of Ash — survive both phases.', list: ['boss'] },
  ];

  const ACT_LIST = ['idle', 'run', 'jump', 'attack', 'airSlash', 'dash', 'guard', 'parry', 'windup', 'hurt', 'stagger', 'iai', 'wave', 'ult'];
  const actToId = (a) => Math.max(0, ACT_LIST.indexOf(a));
  const idToAct = (i) => ACT_LIST[i] || 'idle';

  /* ==================== PROCEDURAL WEB AUDIO (FULL SUITE) ==================== */
  const SFX = {
    ctx: null,
    master: null,
    noise: null,
    vol: 0.7,
    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      try {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.vol;
        this.master.connect(this.ctx.destination);
        const b = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      } catch {}
    },
    setVolume(v) {
      this.vol = clamp(Number(v) || 0, 0, 1);
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.03);
      }
    },
    tone(f0, f1, d, v, type = 'sine', del = 0) {
      const t = this.ctx.currentTime + del;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + d + 0.02);
    },
    burst(f0, f1, d, v, ft = 'bandpass', q = 1.6) {
      const t = this.ctx.currentTime;
      const s = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      s.buffer = this.noise;
      f.type = ft;
      f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      s.connect(f);
      f.connect(g);
      g.connect(this.master);
      s.start(t);
      s.stop(t + d + 0.02);
    },
    play(k) {
      if (!this.ctx || this.vol <= 0.001) return;
      try {
        if (k === 'hover') { this.tone(2900, 1850, 0.06, 0.06); this.burst(4200, 1800, 0.04, 0.04, 'highpass'); }
        else if (k === 'swing') this.burst(2600, 520, 0.12, 0.22);
        else if (k === 'heavy') this.burst(1500, 220, 0.21, 0.34);
        else if (k === 'pole') this.burst(2100, 420, 0.16, 0.26, 'bandpass', 2.4);
        else if (k === 'hit') { this.tone(145, 36, 0.12, 0.42, 'triangle'); this.burst(2200, 900, 0.08, 0.2, 'highpass'); }
        else if (k === 'heavyHit') { this.tone(175, 28, 0.22, 0.6, 'triangle'); this.burst(1800, 420, 0.14, 0.32, 'highpass'); }
        else if (k === 'guard') { this.tone(740, 620, 0.11, 0.16, 'square'); this.tone(1240, 1020, 0.1, 0.1, 'triangle'); }
        else if (k === 'parry') {
          [1568, 2349, 3520, 4698].forEach((f, i) => this.tone(f, f * 0.985, 0.6, 0.22 / (i * 0.7 + 1)));
          this.tone(115, 38, 0.4, 0.58);
        }
        else if (k === 'glint') this.tone(2150, 3450, 0.12, 0.14);
        else if (k === 'dash') this.burst(980, 220, 0.14, 0.24);
        else if (k === 'taiko') { this.tone(118, 38, 0.48, 0.68); this.burst(340, 90, 0.22, 0.18, 'lowpass'); }
        else if (k === 'kunai') this.tone(1950, 760, 0.08, 0.14, 'triangle');
        else if (k === 'gun') { this.burst(3600, 280, 0.18, 0.48, 'lowpass', 0.8); this.tone(240, 48, 0.14, 0.45, 'sawtooth'); }
        else if (k === 'wave') { this.burst(1900, 300, 0.22, 0.3); this.tone(360, 90, 0.3, 0.18, 'sawtooth'); }
        else if (k === 'sheathe') { this.tone(3900, 2600, 0.24, 0.24); this.tone(940, 220, 0.07, 0.2, 'square', 0.04); }
        else if (k === 'ultCut') this.tone(1500 + Math.random() * 1400, 320, 0.08, 0.12, 'sawtooth');
        else if (k === 'ultBoom') { this.tone(95, 22, 0.9, 0.78); this.burst(1900, 140, 0.82, 0.46, 'lowpass'); }
        else if (k === 'exec') { this.tone(120, 24, 0.5, 0.75); this.tone(2800, 920, 0.35, 0.25); this.burst(2800, 320, 0.22, 0.36); }
        else if (k === 'thunder') { this.burst(4200, 340, 0.26, 0.34, 'bandpass', 1.2); this.tone(180, 44, 0.28, 0.38, 'sawtooth'); }
      } catch {}
    },
  };

  function vibe(ms) {
    try {
      if (IS_TOUCH && navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  }

  /* ==================== ARTICULATED SKELETON & 8-NODE VERLET SCARF ==================== */
  const POSES = {
    idle:       { py:-52, tr:.14, hd:-.05, uL:.55, fL:1.5,  uR:.35, fR:1.45, lL:-.28, sL:-.15, lR:.32, sR:-.20, sw:.42 },
    idleOdachi: { py:-50, tr:.08, hd:-.04, uL:.35, fL:1.2,  uR:-.55,fR:-.95, lL:-.36, sL:-.16, lR:.38, sR:-.22, sw:-1.25 },
    idleNagi:   { py:-51, tr:.18, hd:-.06, uL:1.05,fL:1.5,  uR:.15, fR:1.3,  lL:-.38, sL:-.18, lR:.42, sR:-.24, sw:.12 },
    idleDual:   { py:-47, tr:.34, hd:-.14, uL:-.45,fL:.55,  uR:.95, fR:1.6,  lL:-.44, sL:-.24, lR:.46, sR:-.34, sw:-.35 },
    runA:       { py:-47, tr:.56, hd:-.26, uL:-.7, fL:-.2,  uR:-.5, fR:-.1,  lL:-.84, sL:-.44, lR:.80, sR:-.60, sw:-1.15 },
    runB:       { py:-45, tr:.56, hd:-.26, uL:.55, fL:1.15, uR:-.6, fR:-.2,  lL:.74,  sL:-.56, lR:-.80,sR:-.42, sw:-1.10 },
    jump:       { py:-54, tr:.25, hd:-.10, uL:.80, fL:1.55, uR:-.45,fR:.35,  lL:-.55, sL:-1.05,lR:.75, sR:-.65, sw:-.65 },
    fall:       { py:-54, tr:.10, hd:.08,  uL:1.25,fL:1.85, uR:-.65,fR:-.1,  lL:-.35, sL:-.75, lR:.45, sR:-.35, sw:-.45 },
    dash:       { py:-39, tr:.88, hd:-.45, uL:-.95,fL:-.6,  uR:-.8, fR:-.5,  lL:-.95, sL:-.35, lR:.85, sR:-.75, sw:-1.35 },
    guard:      { py:-48, tr:-.08,hd:.04,  uL:1.05,fL:2.25, uR:1.15,fR:2.1,  lL:-.42, sL:-.25, lR:.48, sR:-.35, sw:1.42 },
    parry:      { py:-50, tr:-.24,hd:.05,  uL:.55, fL:1.45, uR:2.25,fR:2.55, lL:-.50, sL:-.25, lR:.55, sR:-.38, sw:.85 },
    windup:     { py:-45, tr:-.34,hd:.10,  uL:.45, fL:1.35, uR:2.58,fR:2.95, lL:-.48, sL:-.30, lR:.52, sR:-.38, sw:.95 },
    slash1:     { py:-46, tr:.52, hd:-.22, uL:-.45,fL:.25,  uR:1.42,fR:1.55, lL:-.60, sL:-.28, lR:.65, sR:-.45, sw:-.10 },
    slash2:     { py:-54, tr:-.24,hd:-.10, uL:-.35,fL:.55,  uR:2.55,fR:2.75, lL:-.45, sL:-.20, lR:.50, sR:-.28, sw:.45 },
    slash3:     { py:-42, tr:.72, hd:-.30, uL:-.75,fL:-.3,  uR:.75, fR:.82,  lL:-.75, sL:-.35, lR:.78, sR:-.55, sw:-.32 },
    thrust:     { py:-46, tr:.65, hd:-.28, uL:1.35,fL:1.55, uR:1.50,fR:1.58, lL:-.78, sL:-.30, lR:.78, sR:-.50, sw:.02 },
    aim:        { py:-48, tr:.18, hd:-.05, uL:1.45,fL:1.60, uR:1.35,fR:1.55, lL:-.45, sL:-.22, lR:.48, sR:-.32, sw:.0 },
    airSlash:   { py:-52, tr:.48, hd:-.15, uL:-.55,fL:.15,  uR:1.15,fR:1.25, lL:-.45, sL:-.95, lR:.85, sR:-.45, sw:-.22 },
    iai:        { py:-34, tr:.65, hd:-.35, uL:.65, fL:1.45, uR:-.45,fR:.55,  lL:-.72, sL:-.78, lR:.78, sR:-.82, sw:-1.48 },
    hurt:       { py:-46, tr:-.55,hd:-.35, uL:.55, fL:.25,  uR:-.65,fR:-.2,  lL:-.25, sL:-.18, lR:.48, sR:-.22, sw:.60 },
    stagger:    { py:-38, tr:-.40,hd:.28,  uL:-.35,fL:-.2,  uR:-.55,fR:.15,  lL:-.45, sL:-.35, lR:.50, sR:-.42, sw:-.75 },
    slam:       { py:-34, tr:.78, hd:-.10, uL:.65, fL:.45,  uR:.62, fR:.42,  lL:-.78, sL:-.85, lR:.80, sR:-.88, sw:-.45 },
  };

  function blendPose(a, b, t) {
    const o = {};
    for (const k in a) o[k] = lerp(a[k], b[k], t);
    return o;
  }

  function idlePoseFor(wId) {
    if (wId === 'odachi') return POSES.idleOdachi;
    if (wId === 'naginata') return POSES.idleNagi;
    if (wId === 'wakizashi') return POSES.idleDual;
    return POSES.idle;
  }

  function buildSkel(x, y, f, p, s = 1) {
    const pel = { x, y: y + p.py * s };
    const W = (lx, ly) => ({ x: pel.x + lx * f, y: pel.y + ly });
    const sx = Math.sin(p.tr) * 34 * s;
    const sy = -Math.cos(p.tr) * 34 * s;
    const nx = sx + Math.sin(p.tr + p.hd * 0.5) * 8 * s;
    const ny = sy - Math.cos(p.tr + p.hd * 0.5) * 8 * s;
    const hx = nx + Math.sin(p.tr + p.hd) * 10.5 * s;
    const hy = ny - Math.cos(p.tr + p.hd) * 10.5 * s;
    const arm = (u, fa) => {
      const ex = sx + Math.sin(u) * 22 * s;
      const ey = sy + Math.cos(u) * 22 * s;
      return { e: W(ex, ey), h: W(ex + Math.sin(fa) * 21 * s, ey + Math.cos(fa) * 21 * s) };
    };
    const leg = (u, sh) => {
      const kx = Math.sin(u) * 26 * s;
      const ky = Math.cos(u) * 26 * s;
      return { k: W(kx, ky), ft: W(kx + Math.sin(sh) * 26 * s, ky + Math.cos(sh) * 26 * s) };
    };
    const aL = arm(p.uL, p.fL);
    const aR = arm(p.uR, p.fR);
    const lL = leg(p.lL, p.sL);
    const lR = leg(p.lR, p.sR);
    return {
      pel, sh: W(sx, sy), nk: W(nx, ny), hd: W(hx, hy), hr: 11 * s,
      eL: aL.e, hL: aL.h, eR: aR.e, hR: aR.h,
      kL: lL.k, fL: lL.ft, kR: lR.k, fR: lR.ft,
      f, s, swAng: Math.atan2(aR.h.y - aR.e.y, aR.h.x - aR.e.x) + p.sw * f,
    };
  }

  class Scarf {
    constructor(n = 8, len = 8.2) {
      this.len = len;
      this.pts = Array.from({ length: n }, () => ({ x: 0, y: 0, ox: 0, oy: 0 }));
      this.ok = false;
    }
    reset(x, y) {
      this.pts.forEach((p, i) => {
        p.x = p.ox = x - i * this.len;
        p.y = p.oy = y + i * 1.4;
      });
      this.ok = true;
    }
    update(ax, ay, f, wind, dt) {
      if (!this.ok) this.reset(ax, ay);
      const t = performance.now() * 0.012;
      this.pts[0].x = ax;
      this.pts[0].y = ay;
      for (let i = 1; i < this.pts.length; i++) {
        const p = this.pts[i];
        const vx = (p.x - p.ox) * 0.86;
        const vy = (p.y - p.oy) * 0.86;
        p.ox = p.x;
        p.oy = p.y;
        p.x += vx + (wind - f * 130) * dt * dt * 15;
        p.y += vy + (210 + Math.sin(t - i * 0.85) * (155 + i * 44)) * dt * dt;
      }
      for (let k = 0; k < 3; k++) {
        this.pts[0].x = ax;
        this.pts[0].y = ay;
        for (let i = 1; i < this.pts.length; i++) {
          const a = this.pts[i - 1];
          const b = this.pts[i];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.001;
          const df = (d - this.len) / d;
          if (i === 1) {
            b.x -= dx * df;
            b.y -= dy * df;
          } else {
            a.x += dx * df * 0.25;
            a.y += dy * df * 0.25;
            b.x -= dx * df * 0.75;
            b.y -= dy * df * 0.75;
          }
        }
      }
    }
    draw(c, inv, col) {
      c.save();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.beginPath();
      this.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.strokeStyle = inv ? '#08080a' : '#f2eee5';
      c.lineWidth = 7;
      c.stroke();
      c.strokeStyle = inv ? '#f2eee5' : col;
      c.lineWidth = 4.2;
      c.stroke();
      c.restore();
    }
  }

  /* ==================== PRE-GENERATED SCENERY ==================== */
  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainCanvas.height = 128;
  (() => {
    const gc = grainCanvas.getContext('2d');
    const im = gc.createImageData(128, 128);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
      im.data[i + 3] = Math.floor(Math.random() * 19);
    }
    gc.putImageData(im, 0, 0);
  })();
  let grainPattern = null;

  const BAMBOO = Array.from({ length: 24 }, (_, i) => ({
    x: -860 + i * 74 + rand(-18, 18),
    w: rand(5, 10),
    d: i % 3 === 0 ? 0.52 : 0.76,
    ph: rand(0, 6.28),
    lean: rand(-0.07, 0.07),
  }));
  const MOTES = Array.from({ length: 34 }, () => ({
    x: rand(0, VW),
    y: rand(0, VH),
    vx: rand(-62, -16),
    vy: rand(22, 60),
    r: rand(0, 6.28),
    vr: rand(-3, 3),
    sz: rand(2.8, 6),
    red: Math.random() < 0.35,
  }));
  const FOG = Array.from({ length: 8 }, (_, i) => ({
    x: -900 + i * 255,
    y: GROUND - 38 + rand(-30, 14),
    rx: rand(160, 260),
    ry: rand(24, 44),
    spd: rand(14, 26),
  }));
  const SPLASHES = Array.from({ length: 16 }, () => ({
    x: rand(LEFT_B, RIGHT_B),
    ph: rand(0, 1),
  }));

  /* ==================== ENGINE STATE ==================== */
  let cv = null;
  let ctx = null;
  let vScale = 1;
  let vOx = 0;
  let vOy = 0;
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
  let state = 'MENU'; // MENU | BANNER | PLAYING | ULT | SCROLL | PAUSED | VICTORY | GAMEOVER
  let stageIdx = 2;
  let menuWeaponIdx = 0;
  let selectedStageIdx = 0;
  let wave = 0;
  let score = 0;
  let kills = 0;
  let combo = 0;
  let flow = 0;
  let maxFlow = 'D';
  let flowT = 0;
  let parries = 0;
  let clearDelay = 0;
  let rounds = [0, 0];
  let roundNum = 1;
  let roundEndT = 0;
  let matchEnded = false;

  let tTime = 0;
  let banner = { kanji: '', title: '', sub: '', t: 0, dur: 1.5 };
  let hitstop = 0;
  let slowT = 0;
  let invT = 0;
  let flashA = 0;
  let flashCol = '#f2eee5';
  let shakeAmp = 0;
  let shakeX = 0;
  let shakeY = 0;
  let camX = 0;
  let camZoom = 1;
  let targetZoom = 1;

  let ult = null;
  let fighters = [];
  let projs = [];
  let clones = [];
  let slashes = [];
  let parts = [];
  let stains = [];
  let ghosts = [];
  let texts = [];

  // Online Local-Prediction State
  const netState = {
    active: false,
    role: 'host', // host = P1 (index 0), guest = P2 (index 1)
    p1Weapon: 0,
    p2Weapon: 0,
    stageIdx: 0,
    localHitSeq: 0,
    pendingHits: new Map(),
    remoteTarget: null,
    koSent: false,
  };

  // Input State (Keyboard + PC Mouse + Touch)
  const K = Object.create(null);
  const P1B = { jump: 0, atk: 0, dash: 0, parry: 0, q: 0, e: 0, rSkill: 0 };
  const P2B = { jump: 0, atk: 0, dash: 0, parry: 0, q: 0, e: 0, rSkill: 0 };
  const touchState = { axis: 0, guard: false };
  let mouseGuard = false;
  let lastTouchAt = 0;

  // Telemetry
  let fpsFrames = 0;
  let fpsAccum = 0;
  let currentFps = 60;
  let lastTeleEmit = 0;
  let lastSkillEmit = 0;

  /* ==================== FIGHTER FACTORY ==================== */
  let nextFid = 1;
  function makeFighter(cfg) {
    const wIdx = clamp(cfg.weaponIdx || 0, 0, WEAPONS.length - 1);
    const w = WEAPONS[wIdx];
    const sc = new Scarf(8, 8.2);
    sc.reset(cfg.x, GROUND - 80);
    return {
      id: cfg.id || nextFid++,
      team: cfg.team,
      role: cfg.role,
      name: cfg.name || 'SAMURAI',
      weaponIdx: wIdx,
      weapon: w.id,
      hat: cfg.hat || 'kasa',
      scarfCol: cfg.scarfCol || '#c82424',
      scale: cfg.scale || 1,
      x: cfg.x,
      y: GROUND,
      vx: 0,
      vy: 0,
      f: cfg.f || 1,
      hp: cfg.hp || 100,
      maxHp: cfg.hp || 100,
      hpLag: cfg.hp || 100,
      pos: 0,
      maxPos: cfg.maxPos || 100,
      ki: cfg.ki !== undefined ? cfg.ki : 40,
      maxKi: 100,
      spd: cfg.spd || 415,
      ground: true,
      coyote: 0,
      jumps: 2,
      act: 'idle',
      actT: 0,
      actD: 0,
      step: 0,
      comboWin: 0,
      hitSet: new Set(),
      parryW: 0,
      guarding: false,
      dashCd: 0,
      invuln: 0,
      stagT: 0,
      execMark: false,
      flashT: 0,
      unblockable: false,
      iaiStage: 0,
      runC: rand(0, 6),
      pose: { ...idlePoseFor(w.id) },
      scarf: sc,
      perks: new Set(cfg.perks || []),
      delays: [],
      phase: 1,
      aiCd: rand(0.4, 0.9),
      aiSpecial: rand(1.6, 2.8),
      aiKind: 'slash',
      dead: false,
      deadT: 0,
      isRemote: Boolean(cfg.isRemote),
    };
  }

  function makeEnemy(role, x, mult = 1) {
    const S = {
      ronin:    { name: 'Ronin',    weaponIdx: 0, hp: 60,  maxPos: 70,  spd: 258, scale: 1.0,  hat: 'kasa',   scarfCol: '#52525b' },
      spearman: { name: 'Yari',     weaponIdx: 2, hp: 58,  maxPos: 65,  spd: 242, scale: 1.02, hat: 'kasa',   scarfCol: '#d4d4d8' },
      brute:    { name: 'Kanabo',   weaponIdx: 1, hp: 135, maxPos: 95,  spd: 155, scale: 1.26, hat: 'kabuto', scarfCol: '#c82424' },
      gunner:   { name: 'Teppo',    weaponIdx: 0, hp: 46,  maxPos: 50,  spd: 222, scale: 0.96, hat: 'band',   scarfCol: '#f2eee5' },
      boss:     { name: 'KUROGANE', weaponIdx: 1, hp: 420, maxPos: 130, spd: 280, scale: 1.3,  hat: 'boss',   scarfCol: '#c82424' },
    }[role];
    return makeFighter({ ...S, team: 2, role, x, f: x > 0 ? -1 : 1, hp: Math.round(S.hp * mult), ki: 0 });
  }

  const MENU_P1 = makeFighter({ id: 901, team: 1, role: 'player', weaponIdx: 0, x: -135, f: 1, hat: 'kasa', scarfCol: '#f2eee5' });
  const MENU_P2 = makeFighter({ id: 902, team: 2, role: 'player', weaponIdx: 1, x: 145, f: -1, hat: 'boss', scarfCol: '#c82424' });

  /* ==================== BEST RECORD & FLOW ==================== */
  function loadBest() {
    try {
      return JSON.parse(localStorage.getItem(BEST_KEY) || '{"wave":0,"score":0}');
    } catch {
      return { wave: 0, score: 0 };
    }
  }
  function saveBest(w, sc) {
    const c = loadBest();
    const n = { wave: Math.max(c.wave || 0, w), score: Math.max(c.score || 0, sc) };
    try { localStorage.setItem(BEST_KEY, JSON.stringify(n)); } catch {}
    return n;
  }

  const flowRankOf = (v) => (v >= 160 ? '鬼' : v >= 115 ? 'S' : v >= 78 ? 'A' : v >= 45 ? 'B' : v >= 18 ? 'C' : 'D');
  const flowKiMul = () => ({ '鬼': 1.8, S: 1.55, A: 1.35, B: 1.2, C: 1.1, D: 1.0 })[flowRankOf(flow)];

  function grantHit(atk, pts, kiBase) {
    const w = WEAPONS[atk.weaponIdx];
    const pMul = atk.perks.has('swift') ? 1.4 : 1;
    const fMul = atk.team === 1 && (mode === 'story' || mode === 'endless') ? flowKiMul() : 1;
    atk.ki = clamp(atk.ki + kiBase * w.kiMul * pMul * fMul, 0, atk.maxKi);
    if (atk.team === 1 && (mode === 'story' || mode === 'endless')) {
      combo++;
      flow = Math.min(200, flow + 11);
      flowT = 3.6;
      const rk = flowRankOf(flow);
      const ord = ['D', 'C', 'B', 'A', 'S', '鬼'];
      if (ord.indexOf(rk) > ord.indexOf(maxFlow)) maxFlow = rk;
      score += Math.round(pts * (1 + Math.min(combo, 30) * 0.08));
    }
  }

  /* ==================== VFX & EVENT DISPATCH ==================== */
  function emitEvent(ev, replicate = true) {
    applyEvent(ev);
    if (replicate && netState.active && global.KuroNet) {
      KuroNet.sendReliable(['fx', ev]);
    }
  }

  function applyEvent(ev) {
    if (!ev) return;
    if (ev.sfx) SFX.play(ev.sfx);
    if (ev.vibe) vibe(ev.vibe);
    if (ev.shake) {
      shakeAmp = Math.max(shakeAmp, ev.shake);
      shakeX += ev.dx || 0;
    }
    if (ev.hitstop) hitstop = Math.max(hitstop, ev.hitstop);
    if (ev.inv) invT = Math.max(invT, ev.inv);
    if (ev.slow) {
      slowT = Math.max(slowT, ev.slow);
      targetZoom = ev.zoom || 1.16;
    }
    if (ev.flash) {
      flashA = ev.flashA || 0.5;
      flashCol = ev.flash;
    }
    if (ev.k === 'slash') {
      slashes.push({ x: ev.x, y: ev.y, f: ev.f, r: ev.r, a0: ev.a0, a1: ev.a1, red: ev.red, w: ev.w, l: 0.19, ml: 0.19 });
    }
    const pCap = isLowFx() ? 90 : 220;
    if (ev.k === 'sparks') {
      const n = isLowFx() ? Math.max(4, Math.round((ev.n || 12) * 0.6)) : ev.n || 12;
      for (let i = 0; i < n; i++) {
        if (parts.length >= pCap) parts.shift();
        const a = (ev.dir >= 0 ? 0 : Math.PI) + rand(-1.3, 1.3);
        const sp = rand(220, 740);
        parts.push({ k: 'sp', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 140), l: rand(0.15, 0.35), ml: 0.35, c: Math.random() < (ev.redP || 0.3) ? '#e03131' : '#f2eee5' });
      }
    }
    if (ev.k === 'ink') {
      const n = isLowFx() ? Math.max(4, Math.round((ev.n || 14) * 0.6)) : ev.n || 14;
      for (let i = 0; i < n; i++) {
        if (parts.length >= pCap) parts.shift();
        const a = (ev.dir >= 0 ? -0.35 : Math.PI + 0.35) + rand(-1.2, 1.2);
        const sp = rand(140, ev.big ? 680 : 440);
        parts.push({ k: 'ink', x: ev.x, y: ev.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(60, 220), l: rand(0.28, 0.6), ml: 0.6, sz: rand(3, ev.big ? 11 : 8), c: Math.random() < (ev.big ? 0.36 : 0.16) ? '#c82424' : Math.random() < 0.78 ? '#08080a' : '#f2eee5' });
      }
      if (stains.length > 26) stains.shift();
      stains.push({ x: ev.x + rand(-20, 20), w: rand(22, ev.big ? 74 : 42), h: rand(4, 8), red: !!ev.big, l: 8 });
    }
    if (ev.k === 'ring') parts.push({ k: 'ring', x: ev.x, y: ev.y, r: 8, mr: ev.mr || 110, l: 0.26, ml: 0.26, c: ev.c || '#f2eee5', lw: ev.lw || 5 });
    if (ev.k === 'cut') parts.push({ k: 'cut', x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, c: ev.c || '#f2eee5', w: ev.w || 10, l: ev.l || 0.45, ml: ev.l || 0.45 });
    if (ev.k === 'bolt') parts.push({ k: 'bolt', x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, l: 0.24, ml: 0.24 });
    if (ev.k === 'txt') texts.push({ x: ev.x, y: ev.y, txt: ev.txt, c: ev.c || '#f2eee5', sc: ev.sc || 1, vy: -76, l: 0.8, ml: 0.8 });
  }

  /* ==================== COMBAT & DEFENDER-VALIDATED ONLINE HITS ==================== */
  function deliverStrike(atk, def, dmg, posDmg, dir, opts = {}) {
    if (!def || def.dead) return;
    if (netState.active && atk && !atk.isRemote && def.isRemote) {
      const hitId = ++netState.localHitSeq;
      const hy = Math.round(def.y - 54 * def.scale);
      netState.pendingHits.set(hitId, { dir, heavy: !!opts.heavy, grantKi: opts.grantKi !== false, fxX: Math.round(def.x), fxY: hy });
      applyEvent({ k: 'sparks', x: def.x, y: hy, dir, n: 6, redP: 0.35 });
      KuroNet.sendReliable([
        'hit',
        hitId,
        Math.round(dmg),
        Math.round(posDmg),
        dir,
        opts.heavy ? 1 : 0,
        opts.unblockable ? 1 : 0,
        opts.guardCrush ? 1 : 0,
        opts.isProj ? 1 : 0,
        def.execMark ? 1 : 0,
      ]);
      return;
    }
    resolveLocalStrike(atk, def, dmg, posDmg, dir, opts);
  }

  function resolveLocalStrike(atk, def, dmg, posDmg, dir, opts = {}) {
    if (def.dead) return { outcome: 'none' };
    if (def.invuln > 0 && !opts.unblockable) {
      applyEvent({ k: 'txt', x: def.x, y: def.y - 104, txt: 'EVADE', c: '#f2eee5', sc: 0.9 });
      return { outcome: 'evade' };
    }

    const { heavy = false, unblockable = false, guardCrush = false, isProj = false, grantKi = true } = opts;
    const hy = def.y - 54 * def.scale;

    // Crimson Execution on posture-broken target
    if ((def.execMark || opts.forceExec) && !isProj) {
      def.execMark = false;
      def.stagT = 0;
      def.pos = 0;
      const exD = def.role === 'boss' || def.role === 'player' ? 68 : Math.round(def.maxHp * 0.9);
      def.hp = Math.max(0, def.hp - exD);
      def.flashT = 0.2;
      const heal = 15 + (atk && atk.perks.has('drain') ? 12 : 0);
      if (atk && !atk.dead) {
        atk.hp = Math.min(atk.maxHp, atk.hp + heal);
        grantHit(atk, 320, 18);
      }
      applyEvent({ k: 'cut', x1: def.x - 135, y1: hy - 72, x2: def.x + 135, y2: hy + 72, c: '#e03131', w: 16, l: 0.55, sfx: 'exec', hitstop: 0.085, inv: 0.12, slow: 0.34, zoom: 1.24, shake: 20, vibe: 45 });
      applyEvent({ k: 'ink', x: def.x, y: hy, dir, n: 24, big: true });
      applyEvent({ k: 'txt', x: def.x, y: hy - 55, txt: `EXECUTION -${exD}`, c: '#e03131', sc: 1.35 });
      if (atk) applyEvent({ k: 'txt', x: atk.x, y: atk.y - 115, txt: `+${heal} HP`, c: '#f2eee5', sc: 0.95 });
      if (def.hp <= 0) killFighter(def, atk, dir);
      else { def.act = 'hurt'; def.actT = def.actD = 0.34; def.vx = dir * 360; }
      return { outcome: 'exec', dmg: exD, dead: def.dead };
    }

    // Perfect Parry
    if (def.parryW > 0 && !opts.ignoreParry) {
      def.parryW = 0;
      def.invuln = 0.42;
      def.act = 'parry';
      def.actT = def.actD = 0.24;
      def.f = atk ? sgn(atk.x - def.x) : -dir;
      def.ki = clamp(def.ki + 25 * (def.perks.has('swift') ? 1.4 : 1), 0, def.maxKi);
      if (def.team === 1) {
        parries++;
        flow = Math.min(200, flow + 24);
        flowT = 3.8;
      }
      applyEvent({ k: 'sparks', x: def.x + def.f * 26, y: hy, dir: def.f, n: 24, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, slow: 0.22, zoom: 1.18, shake: 16, vibe: 35 });
      applyEvent({ k: 'ring', x: def.x + def.f * 26, y: hy, mr: 135, c: '#f2eee5', lw: 6 });
      applyEvent({ k: 'txt', x: def.x, y: def.y - 122, txt: 'PERFECT PARRY!', c: '#e03131', sc: 1.3 });

      if (atk && !atk.dead && !isProj) {
        atk.pos = Math.min(atk.maxPos, atk.pos + (unblockable ? 65 : 46));
        atk.vx = -dir * 320;
        if (atk.pos >= atk.maxPos) breakPosture(atk, -dir);
        else {
          atk.act = 'stagger';
          atk.stagT = atk.actT = atk.actD = atk.role === 'boss' ? 1.0 : 1.5;
        }
      }
      if (def.perks.has('thunder')) {
        SFX.play('thunder');
        fighters.forEach((o) => {
          if (o.team !== def.team && !o.dead && Math.abs(o.x - def.x) < 260) {
            applyEvent({ k: 'bolt', x1: def.x, y1: hy, x2: o.x, y2: o.y - 54 });
            o.hp = Math.max(1, o.hp - 18);
            o.pos = Math.min(o.maxPos, o.pos + 24);
            if (o.pos >= o.maxPos) breakPosture(o, sgn(o.x - def.x));
          }
        });
      }
      return { outcome: 'parry' };
    }

    // Standard Guard
    if (def.guarding && !unblockable) {
      def.pos = Math.min(def.maxPos, def.pos + (guardCrush ? posDmg * 1.45 : posDmg * 0.7));
      const chip = Math.max(2, Math.round(dmg * 0.22));
      def.hp = Math.max(0, def.hp - chip);
      def.vx = dir * 220;
      def.ki = clamp(def.ki + 5, 0, def.maxKi);
      applyEvent({ k: 'sparks', x: def.x + def.f * 20, y: hy, dir: -dir, n: 10, sfx: 'guard', shake: 6 });
      let broken = false;
      if (def.pos >= def.maxPos) {
        breakPosture(def, dir);
        broken = true;
      } else {
        applyEvent({ k: 'txt', x: def.x, y: def.y - 105, txt: `GUARD -${chip}`, c: '#9a968e', sc: 0.85 });
      }
      if (def.hp <= 0) killFighter(def, atk, dir);
      return { outcome: 'guard', broken, dead: def.dead };
    }

    // Direct Hit
    const finD = Math.round(dmg * (def.stagT > 0 ? 2 : 1));
    def.hp = Math.max(0, def.hp - finD);
    def.pos = Math.min(def.maxPos, def.pos + posDmg);
    def.flashT = 0.14;
    if (atk) grantHit(atk, heavy ? 120 : 65, grantKi ? (heavy ? 12 : 7) : 0);
    if (def.team === 1 && (mode === 'story' || mode === 'endless')) {
      combo = 0;
      flow = Math.max(0, flow - 45);
    }
    applyEvent({ k: 'sparks', x: def.x, y: hy, dir, n: heavy ? 16 : 9, redP: heavy ? 0.55 : 0.25, sfx: heavy ? 'heavyHit' : 'hit', hitstop: heavy ? 0.07 : 0.042, shake: heavy ? 12 : 6, dx: dir * (heavy ? 10 : 5), vibe: heavy ? 25 : 12 });
    applyEvent({ k: 'ink', x: def.x, y: hy, dir, n: heavy ? 16 : 10, big: def.hp <= 0 });
    applyEvent({ k: 'txt', x: def.x + rand(-14, 14), y: hy - 34, txt: `-${finD}${def.stagT > 0 ? '!' : ''}`, c: heavy || unblockable || def.stagT > 0 ? '#e03131' : '#f2eee5', sc: heavy || def.stagT > 0 ? 1.2 : 0.95 });

    if (def.hp <= 0) {
      killFighter(def, atk, dir);
      return { outcome: 'hit', dmg: finD, dead: true };
    }

    // Boss Phase 2
    if (def.role === 'boss' && def.phase === 1 && def.hp <= def.maxHp * 0.5) {
      def.phase = 2;
      def.spd = 340;
      def.act = 'idle';
      def.actT = 0;
      def.vx = -dir * 260;
      applyEvent({ k: 'ring', x: def.x, y: hy, mr: 230, c: '#e03131', lw: 8, sfx: 'taiko', inv: 0.14, flash: '#c82424', flashA: 0.6, shake: 20 });
      applyEvent({ k: 'txt', x: def.x, y: def.y - 148, txt: 'DEMON AWAKENED', c: '#e03131', sc: 1.4 });
      return { outcome: 'hit', dmg: finD };
    }

    let broken = false;
    if (def.pos >= def.maxPos) {
      breakPosture(def, dir);
      broken = true;
      return { outcome: 'hit', dmg: finD, broken: true };
    }
    const armor = (def.role === 'brute' || def.role === 'boss') && !heavy && def.stagT <= 0;
    if (!armor) {
      def.act = 'hurt';
      def.actT = def.actD = heavy ? 0.3 : 0.21;
      def.vx = dir * (heavy ? 320 : 175);
      if (def.role === 'player') def.invuln = 0.24;
    } else {
      def.vx += dir * 60;
    }
    return { outcome: 'hit', dmg: finD, broken };
  }

  function breakPosture(f, dir) {
    f.pos = f.maxPos;
    f.act = 'stagger';
    f.stagT = f.actT = f.actD = 2.4;
    f.execMark = true;
    f.guarding = false;
    f.vx = dir * 260;
    applyEvent({ k: 'ring', x: f.x, y: f.y - 54, mr: 130, c: '#e03131', lw: 6, sfx: 'heavyHit', hitstop: 0.08, shake: 14, vibe: 30 });
    applyEvent({ k: 'txt', x: f.x, y: f.y - 128, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.25 });
  }

  function killFighter(f, atk, dir) {
    if (f.dead) return;
    f.dead = true;
    f.deadT = 0.85;
    f.hp = 0;
    f.vx = dir * 360;
    f.vy = -210;
    f.execMark = false;
    if (f.team === 2 && (mode === 'story' || mode === 'endless')) kills++;
    if (atk && atk.perks.has('drain') && !atk.dead) atk.hp = Math.min(atk.maxHp, atk.hp + 12);
    applyEvent({ k: 'ring', x: f.x, y: f.y - 54, mr: 140, c: '#e03131', lw: 6, sfx: 'taiko', inv: 0.12, slow: 0.36, zoom: 1.15, shake: 18 });

    if (mode === 'online' && !netState.koSent) {
      netState.koSent = true;
      const deadSide = f === fighters[0] ? 1 : 2;
      KuroNet.sendReliable(['ko', deadSide]);
      if (netState.role === 'host') hostFinalizeOnlineRound(deadSide === 2 ? 1 : 2);
    }
  }

  /* ==================== FIGHTER SIMULATION & AI ==================== */
  function stepFighter(f, inp, dt) {
    if (f.dead) {
      f.deadT -= dt;
      f.vy += GRAV * dt;
      f.x += f.vx * dt;
      f.y = Math.min(GROUND, f.y + f.vy * dt);
      f.vx *= 0.92;
      return;
    }

    const prevAct = f.act;
    const prevFace = f.f;
    const W = WEAPONS[f.weaponIdx];
    const swift = f.perks.has('swift') ? 1.4 : 1;

    if (f.role === 'player') f.ki = clamp(f.ki + 2.6 * swift * dt, 0, f.maxKi);
    if (f.stagT <= 0 && !f.guarding && f.pos > 0) f.pos = Math.max(0, f.pos - (f.perks.has('iron') ? 16 : 10) * dt);
    if (f.dashCd > 0) f.dashCd -= dt;
    if (f.invuln > 0) f.invuln -= dt;
    if (f.parryW > 0) f.parryW -= dt;
    if (f.flashT > 0) f.flashT -= dt;
    if (f.stagT > 0 && (f.stagT -= dt) <= 0) {
      f.execMark = false;
      f.pos = 0;
    }
    if (f.comboWin > 0 && (f.comboWin -= dt) <= 0) f.step = 0;
    f.coyote = f.ground ? 0.1 : Math.max(0, f.coyote - dt);

    for (let i = f.delays.length - 1; i >= 0; i--) {
      if ((f.delays[i].t -= dt) <= 0) {
        const d = f.delays.splice(i, 1)[0];
        emitEvent({ k: 'cut', x1: f.x - 55, y1: f.y - 88, x2: f.x + 55, y2: f.y - 20, c: '#e03131', w: 7, l: 0.35 });
        deliverStrike(d.atk, f, d.dmg, 26, d.dir, { heavy: true, grantKi: false });
      }
    }

    const busy = f.act === 'hurt' || f.act === 'stagger' || f.act === 'iai' || f.act === 'ult' || f.act === 'windup';

    if (!busy && f.role === 'player') {
      if (inp.rSkill && f.ki >= 100 && state === 'PLAYING') {
        startUltimate(f);
        return;
      }
      if (inp.q && f.ki >= 30 && f.act !== 'dash') {
        if (inp.l) f.f = -1;
        else if (inp.r) f.f = 1;
        f.ki -= 30;
        f.act = 'iai';
        f.iaiStage = 0;
        f.actD = f.actT = 0.5;
        f.invuln = 0.54;
        f.vx = f.vy = 0;
        emitEvent({ k: 'ring', x: f.x + f.f * 12, y: f.y - 36, mr: 64, c: '#e03131', lw: 3.5, sfx: 'sheathe' });
        emitEvent({ k: 'txt', x: f.x, y: f.y - 114, txt: 'FLASH DRAW', c: '#f2eee5', sc: 1.05 });
      } else if (inp.e && f.ki >= 40 && f.act !== 'dash') {
        if (inp.l) f.f = -1;
        else if (inp.r) f.f = 1;
        f.ki -= 40;
        f.act = 'wave';
        f.actD = f.actT = 0.28;
        f.vx = -f.f * 110;
        emitEvent({ k: 'slash', x: f.x + f.f * 36, y: f.y - 55, f: f.f, r: 108, a0: -1.4, a1: 1.4, red: true, w: 22, sfx: 'wave', shake: 8 });
        projs.push({ k: 'wave', team: f.team, owner: f, x: f.x + f.f * 55, y: f.y - 66, vx: f.f * 920, f: f.f, r: 74, dmg: 32, pos: 28, hits: new Set(), l: 1.3 });
        if (netState.active && !f.isRemote) {
          KuroNet.sendReliable(['pw', Math.round(f.x + f.f * 55), Math.round(f.y - 66), f.f]);
        }
      }
    }

    if (!busy && inp.dash && f.dashCd <= 0 && f.act !== 'wave') {
      const dir = inp.l ? -1 : inp.r ? 1 : f.f;
      f.f = dir;
      f.act = 'dash';
      f.actD = f.actT = 0.2;
      f.dashCd = W.dashCd;
      f.invuln = 0.26;
      f.vx = dir * 1120;
      f.vy = Math.min(f.vy, 0) * 0.2;
      f.guarding = false;
      emitEvent({ k: 'ring', x: f.x, y: f.y - 44, mr: 56, c: '#f2eee5', lw: 3.5, sfx: 'dash' });
      for (let i = 0; i < 5; i++) {
        ghosts.push({ sk: buildSkel(f.x - dir * i * 16, f.y, dir, POSES.dash, f.scale), hat: f.hat, red: i === 0, l: 0.26, ml: 0.26 });
      }
      if (f.perks.has('clone')) {
        clones.push({ x: f.x, y: f.y, f: dir, team: f.team, owner: f, t: 0.45, sk: buildSkel(f.x, f.y, dir, POSES.idle, f.scale), hat: f.hat });
      }
    }

    const canAtk = !busy && f.act !== 'wave' && !(f.act === 'attack' && f.actT > f.actD * 0.4) && !(f.act === 'airSlash' && f.actT > 0.08);
    if (inp.atk && canAtk) {
      if (inp.l) f.f = -1;
      else if (inp.r) f.f = 1;
      f.guarding = false;
      f.hitSet.clear();
      f.unblockable = false;
      if (!f.ground) {
        f.act = 'airSlash';
        f.actD = f.actT = 0.26;
        if (W.diveBonus) {
          f.vy = 620;
          f.vx = f.f * 280;
        } else {
          f.vy = Math.min(f.vy, -180);
          f.vx = f.f * 230;
        }
        emitEvent({ k: 'slash', x: f.x + f.f * 28, y: f.y - 52, f: f.f, r: W.reach * 0.85, a0: -1.5, a1: 1.4, red: !!W.diveBonus, w: 18, sfx: W.diveBonus ? 'pole' : 'swing' });
      } else {
        f.step = f.comboWin > 0 && f.step > 0 && f.step < W.hits ? f.step + 1 : 1;
        f.act = 'attack';
        f.comboWin = 0.66;
        const idx = f.step - 1;
        const isFin = f.step === W.hits;
        f.actD = f.actT = W.dur[idx];
        f.vx = f.f * (isFin ? 490 : 250);
        emitEvent({
          k: 'slash',
          x: f.x + f.f * 36,
          y: f.y - 52,
          f: f.f,
          r: W.reach * (isFin ? 1.05 : 0.88),
          a0: idx % 2 ? 1.2 : -1.25,
          a1: idx % 2 ? -1.4 : 1.05,
          red: isFin || !!W.guardCrush,
          w: W.guardCrush ? 24 : isFin ? 22 : 16,
          sfx: W.guardCrush ? 'heavy' : W.diveBonus ? 'pole' : isFin ? 'heavy' : 'swing',
        });
      }
    }

    if (!busy && inp.jump) {
      if (f.ground || f.coyote > 0) {
        f.vy = -805;
        f.ground = false;
        f.coyote = 0;
        f.jumps = 1;
        if (f.act === 'guard') f.act = 'jump';
        emitEvent({ k: 'ink', x: f.x, y: GROUND, dir: -f.f, n: 5, sfx: 'dash' });
      } else if (f.jumps > 0) {
        f.vy = -740;
        f.jumps = 0;
        f.act = 'jump';
        emitEvent({ k: 'ring', x: f.x, y: f.y - 10, mr: 46, c: '#f2eee5', lw: 3, sfx: 'dash' });
      }
    }

    const canG = f.ground && (f.act === 'idle' || f.act === 'run' || f.act === 'guard');
    if (inp.parryTap && canG) {
      f.parryW = W.parry;
      f.guarding = true;
      f.act = 'guard';
    }
    if (inp.guard && canG) {
      f.guarding = true;
      f.act = 'guard';
    } else if (!inp.guard && f.act === 'guard') {
      f.guarding = false;
      f.act = 'idle';
    }

    if (f.actT > 0) {
      f.actT -= dt;
      if (f.act === 'iai' && f.iaiStage === 0 && f.actT <= f.actD - 0.16) {
        f.iaiStage = 1;
        execFlashDraw(f);
      }
      if (f.act === 'attack' || f.act === 'airSlash') {
        const prg = 1 - f.actT / Math.max(0.01, f.actD);
        if (prg >= 0.14 && prg <= 0.7) {
          const idx = clamp(f.step - 1, 0, W.hits - 1);
          const isFin = f.step === W.hits;
          const reach = W.reach * (isFin ? 1.08 : 1);
          const dmg = f.act === 'airSlash' ? (W.diveBonus ? 24 : 15) : W.dmg[idx];
          const posD = f.act === 'airSlash' ? (W.diveBonus ? 30 : 15) : W.pos[idx];
          const hx = f.x + f.f * reach * 0.56;
          fighters.forEach((o) => {
            if (o.team !== f.team && !o.dead && !f.hitSet.has(o.id) && Math.abs(o.x - hx) <= reach * 0.62 && Math.abs(o.y - f.y) <= 92) {
              f.hitSet.add(o.id);
              deliverStrike(f, o, dmg, posD, f.f, {
                heavy: isFin || !!W.guardCrush || f.unblockable,
                unblockable: f.unblockable,
                guardCrush: !!W.guardCrush && isFin,
              });
            }
          });
          projs.forEach((pr) => {
            if (pr.team !== f.team && !pr.visualOnly && pr.k !== 'bullet' && Math.abs(pr.x - hx) <= reach * 0.62 && Math.abs(pr.y - (f.y - 54)) <= 65) {
              pr.team = f.team;
              pr.owner = f;
              pr.vx = f.f * 960;
              pr.f = f.f;
              pr.hits = new Set();
              emitEvent({ k: 'sparks', x: pr.x, y: pr.y, dir: f.f, n: 12, sfx: 'parry' });
            }
          });
        }
      }
      if (f.actT <= 0) {
        if (f.act === 'windup') triggerEnemyStrike(f);
        else {
          f.act = f.ground ? 'idle' : 'jump';
          f.unblockable = false;
        }
      }
    }

    const mv = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (f.act === 'idle' || f.act === 'run' || f.act === 'jump') {
      if (mv) {
        f.f = mv;
        f.vx = lerp(f.vx, mv * f.spd, clamp(dt * 16, 0, 1));
        if (f.ground) {
          f.act = 'run';
          f.runC += dt * (f.spd * 0.032);
        }
      } else {
        f.vx = lerp(f.vx, 0, clamp(dt * (f.ground ? 16 : 6), 0, 1));
        if (f.ground && f.act === 'run') f.act = 'idle';
      }
    } else if (f.act === 'guard' || f.act === 'windup') {
      f.vx = lerp(f.vx, 0, clamp(dt * 14, 0, 1));
    } else if (f.act !== 'dash' && f.act !== 'iai') {
      f.vx = lerp(f.vx, 0, clamp(dt * 9, 0, 1));
    }

    if (f.act !== 'dash' && f.act !== 'iai') f.vy += GRAV * dt;
    f.x = clamp(f.x + f.vx * dt, LEFT_B + 42, RIGHT_B - 42);
    f.y += f.vy * dt;
    if (f.y >= GROUND) {
      if (!f.ground && f.vy > 480) {
        emitEvent({ k: 'ink', x: f.x, y: GROUND, dir: 0, n: 5 });
        if (f.act === 'airSlash' && W.diveBonus) {
          emitEvent({ k: 'ring', x: f.x, y: GROUND, mr: 118, c: '#e03131', lw: 5, sfx: 'heavyHit', shake: 10 });
          fighters.forEach((o) => {
            if (o.team !== f.team && !o.dead && Math.abs(o.x - f.x) < 125) {
              deliverStrike(f, o, 18, 28, sgn(o.x - f.x), { heavy: true });
            }
          });
        }
      }
      f.y = GROUND;
      f.vy = 0;
      f.ground = true;
      f.jumps = 2;
      if (f.act === 'jump' || f.act === 'airSlash') f.act = Math.abs(f.vx) > 40 ? 'run' : 'idle';
    } else {
      f.ground = false;
    }

    updatePoseAndScarf(f, dt);

    if (netState.active && !f.isRemote) {
      const important = f.act !== prevAct || f.f !== prevFace;
      sendMyNetState(important);
    }
  }

  function updateRemoteFighter(f, dt) {
    if (!f) return;
    const rt = netState.remoteTarget;
    if (rt) {
      const halfRttSec = clamp((KuroNet.getState().halfRtt || 20) / 1000, 0.01, 0.085);
      const age = clamp((performance.now() - rt.rxAt) / 1000, 0, 0.14);
      const extrap = Math.min(0.11, halfRttSec + age * 0.55);
      const tx = clamp(rt.x + rt.vx * extrap, LEFT_B + 42, RIGHT_B - 42);
      const ty = Math.min(GROUND, rt.y + rt.vy * extrap * 0.65);

      if (Math.hypot(tx - f.x, ty - f.y) > 170) {
        f.x = tx;
        f.y = ty;
        f.scarf.reset(f.x, f.y - 78);
      } else {
        const k = 1 - Math.exp(-24 * dt);
        f.x = lerp(f.x, tx, k);
        f.y = lerp(f.y, ty, k);
      }
      f.vx = rt.vx;
      f.vy = rt.vy;
      f.f = rt.f;
      f.act = rt.act;
      f.step = rt.step;
      if (f.act === 'run') f.runC += dt * (f.spd * 0.032);
    }
    if (f.flashT > 0) f.flashT -= dt;
    updatePoseAndScarf(f, dt);
  }

  function updatePoseAndScarf(f, dt) {
    const baseIdle = idlePoseFor(f.weapon);
    const tp =
      f.act === 'run'
        ? blendPose(POSES.runA, POSES.runB, (Math.sin(f.runC) + 1) * 0.5)
        : f.act === 'jump'
          ? f.vy < 0 ? POSES.jump : POSES.fall
          : f.act === 'attack'
            ? f.weapon === 'naginata' && f.step === 1
              ? POSES.thrust
              : f.unblockable
                ? POSES.slam
                : f.step % 3 === 1
                  ? POSES.slash1
                  : f.step % 3 === 2
                    ? POSES.slash2
                    : POSES.slash3
            : f.act === 'windup'
              ? f.role === 'gunner' ? POSES.aim : POSES.windup
              : f.act === 'wave'
                ? POSES.thrust
                : POSES[f.act] || { ...baseIdle, py: baseIdle.py + Math.sin(tTime * 3.2 + f.id) * 1.5 };
    f.pose = blendPose(f.pose, tp, clamp(dt * 22, 0, 1));
    const sk = buildSkel(f.x, f.y, f.f, f.pose, f.scale);
    const wind = STAGES[stageIdx].id === 'bamboo' ? -220 : -115;
    f.scarf.update(sk.nk.x, sk.nk.y, f.f, wind, dt);
    f.hpLag = lerp(f.hpLag, f.hp, clamp(dt * 7, 0, 1));
  }

  function execFlashDraw(f) {
    const sx = f.x;
    const ex = clamp(sx + f.f * 460, LEFT_B + 55, RIGHT_B - 55);
    const ym = f.y - 52;
    for (let i = 0; i < 6; i++) {
      ghosts.push({ sk: buildSkel(lerp(sx, ex, i / 6), f.y, f.f, POSES.dash, f.scale), hat: f.hat, red: i === 5, l: 0.28, ml: 0.28 });
    }
    f.x = ex;
    f.scarf.reset(ex, f.y - 78);
    emitEvent({ k: 'cut', x1: sx - f.f * 35, y1: ym, x2: ex + f.f * 35, y2: ym, c: '#f2eee5', w: 16, l: 0.5, sfx: 'heavy', inv: 0.08, shake: 15, vibe: 30 });
    emitEvent({ k: 'cut', x1: sx - f.f * 25, y1: ym + 4, x2: ex + f.f * 25, y2: ym + 4, c: '#c82424', w: 6, l: 0.42 });
    const mn = Math.min(sx, ex) - 52;
    const mx = Math.max(sx, ex) + 52;
    fighters.forEach((o) => {
      if (o.team !== f.team && !o.dead && o.x >= mn && o.x <= mx && Math.abs(o.y - f.y) < 120) {
        if (netState.active && o.isRemote) {
          deliverStrike(f, o, 36, 28, f.f, { heavy: true, grantKi: false });
        } else {
          o.vx = 0;
          o.act = 'hurt';
          o.actT = o.actD = 0.42;
          o.flashT = 0.2;
          o.delays.push({ t: 0.26, dmg: 36, dir: f.f, atk: f });
          emitEvent({ k: 'sparks', x: o.x, y: o.y - 54, dir: f.f, n: 10, redP: 0.5 });
        }
      }
    });
    if (netState.active && !f.isRemote) sendMyNetState(true);
  }

  function startUltimate(caster, fromNet = false) {
    caster.ki = 0;
    caster.act = 'ult';
    caster.invuln = 3.0;
    caster.vx = caster.vy = 0;
    state = 'ULT';
    applyEvent({ sfx: 'taiko', flash: '#c82424', flashA: 0.8, shake: 14, vibe: 40 });
    ult = { caster, t: 0, dur: 2.65, next: 0.38, done: 0, tot: 15, sheathed: false, boom: false, ox: caster.x, cuts: [], fromNet };
    if (!fromNet && netState.active && !caster.isRemote) {
      KuroNet.sendReliable(['ult', Math.round(caster.x)]);
    }
  }

  function tickUltimate(dt) {
    const u = ult;
    const c = u.caster;
    u.t += dt;
    targetZoom = u.t < 2.05 ? 1.18 : 1.06;
    const foes = fighters.filter((o) => o.team !== c.team && !o.dead);

    if (u.t >= u.next && u.done < u.tot) {
      u.done++;
      u.next += 0.075;
      const tgt = foes.length ? foes[u.done % foes.length] : { x: c.x + c.f * 120, y: GROUND };
      const a = rand(-1.35, 1.35);
      const ln = rand(280, 500);
      const cx = tgt.x + rand(-40, 40);
      const cy = tgt.y - 56 + rand(-34, 34);
      const red = u.done % 3 === 0;
      u.cuts.push({ x1: cx - Math.cos(a) * ln, y1: cy - Math.sin(a) * ln, x2: cx + Math.cos(a) * ln, y2: cy + Math.sin(a) * ln, red, l: 1.3, ml: 1.3 });
      c.x = clamp(cx + Math.cos(a) * 140, LEFT_B + 60, RIGHT_B - 60);
      c.f = Math.cos(a) >= 0 ? 1 : -1;
      ghosts.push({ sk: buildSkel(c.x, c.y, c.f, POSES.dash, c.scale), hat: c.hat, red, l: 0.28, ml: 0.28 });
      applyEvent({ k: 'sparks', x: cx, y: cy, dir: c.f, n: 6, redP: 0.6, sfx: 'ultCut', shake: 6 });
    }
    if (!u.sheathed && u.t >= 1.82) {
      u.sheathed = true;
      c.x = clamp(u.ox, LEFT_B + 110, RIGHT_B - 110);
      c.pose = { ...POSES.iai };
      c.scarf.reset(c.x, c.y - 72);
      applyEvent({ k: 'ring', x: c.x + c.f * 12, y: c.y - 40, mr: 95, c: '#e03131', lw: 4.5, sfx: 'sheathe' });
    }
    if (!u.boom && u.t >= 2.15) {
      u.boom = true;
      applyEvent({ sfx: 'ultBoom', inv: 0.18, flash: '#f2eee5', flashA: 0.9, shake: 26, vibe: 60 });
      if (!u.fromNet) {
        foes.forEach((o) => {
          deliverStrike(c, o, o.role === 'boss' ? 115 : o.role === 'player' ? 48 : 165, 65, c.f, { heavy: true, unblockable: true, ignoreParry: true, grantKi: false });
          applyEvent({ k: 'ring', x: o.x, y: o.y - 54, mr: 155, c: '#e03131', lw: 7 });
        });
      }
    }
    u.cuts.forEach((s) => { s.l -= dt; });
    if (u.t >= u.dur) {
      c.act = 'idle';
      ult = null;
      state = 'PLAYING';
      targetZoom = 1;
      if (netState.active && !c.isRemote) sendMyNetState(true);
    }
  }

  function triggerEnemyStrike(e) {
    e.hitSet.clear();
    if (e.aiKind === 'kunai') {
      e.act = 'idle';
      e.actT = 0;
      e.aiSpecial = rand(2.6, 3.8);
      applyEvent({ sfx: 'kunai' });
      projs.push({ k: 'kunai', team: e.team, owner: e, x: e.x + e.f * 36, y: e.y - 56, vx: e.f * 720, f: e.f, r: 16, dmg: 11, pos: 16, l: 1.8 });
      return;
    }
    if (e.role === 'gunner') {
      e.act = 'idle';
      e.actT = 0;
      e.aiCd = rand(1.9, 2.7);
      applyEvent({ k: 'sparks', x: e.x + e.f * 45, y: e.y - 58, dir: e.f, n: 10, redP: 0.6, sfx: 'gun', shake: 7 });
      projs.push({ k: 'bullet', team: e.team, owner: e, x: e.x + e.f * 48, y: e.y - 58, vx: e.f * 1160, f: e.f, r: 14, dmg: 22, pos: 30, l: 1.5 });
      return;
    }
    if (e.aiKind === 'bossWave') {
      e.act = 'wave';
      e.actD = e.actT = 0.34;
      e.aiCd = 0.8;
      applyEvent({ k: 'slash', x: e.x + e.f * 46, y: e.y - 60, f: e.f, r: 118, a0: -1.5, a1: 1.5, red: true, w: 24, sfx: 'wave' });
      projs.push({ k: 'bWave', team: e.team, owner: e, x: e.x + e.f * 60, y: e.y - 66, vx: e.f * 740, f: e.f, r: 66, dmg: 18, pos: 26, l: 1.6 });
      return;
    }
    e.act = 'attack';
    e.step = e.unblockable ? 3 : 1;
    e.actD = e.actT = e.unblockable ? 0.36 : 0.25;
    e.vx = e.f * (e.role === 'spearman' ? 540 : 340);
    applyEvent({ k: 'slash', x: e.x + e.f * 42, y: e.y - 52, f: e.f, r: WEAPONS[e.weaponIdx].reach * 0.96, a0: -1.4, a1: 1.0, red: e.unblockable || e.role === 'boss', w: e.unblockable ? 26 : 18, sfx: e.unblockable ? 'heavy' : 'swing' });
    if (e.unblockable) applyEvent({ k: 'ring', x: e.x + e.f * 75, y: GROUND, mr: 125, c: '#e03131', lw: 5, shake: 11 });
    e.aiCd = e.role === 'boss' ? (e.phase === 2 ? 0.45 : 0.72) : rand(0.75, 1.35);
  }

  function computeAI(e, dt) {
    const inp = { l: false, r: false, jump: false, atk: false, guard: false, parryTap: false, dash: false, q: false, e: false, rSkill: false };
    const tgt = fighters.find((f) => f.team === 1 && !f.dead);
    if (!tgt || e.dead || e.act === 'hurt' || e.act === 'stagger' || e.act === 'attack' || e.act === 'dash' || e.act === 'wave') return inp;
    if (e.aiCd > 0) e.aiCd -= dt;
    if (e.aiSpecial > 0) e.aiSpecial -= dt;
    const dx = tgt.x - e.x;
    const dist = Math.abs(dx);
    const dir = dx >= 0 ? 1 : -1;
    if (e.act === 'windup') {
      e.f = dir;
      return inp;
    }
    fighters.forEach((o) => {
      if (o !== e && o.team === e.team && !o.dead && Math.abs(e.x - o.x) < 62) e.x += sgn(e.x - o.x) * 95 * dt;
    });
    e.f = dir;
    const activeW = fighters.filter((o) => o.team === 2 && !o.dead && o.act === 'windup').length;
    if (e.role === 'gunner') {
      if (dist < 240) { if (dir > 0) inp.l = true; else inp.r = true; }
      else if (dist > 470) { if (dir > 0) inp.r = true; else inp.l = true; }
      else if (e.aiCd <= 0 && activeW < 2) { e.act = 'windup'; e.actD = e.actT = 0.78; e.unblockable = false; e.aiKind = 'gun'; SFX.play('glint'); }
      return inp;
    }
    if (e.role === 'ronin' && e.aiSpecial <= 0 && dist > 230 && dist < 440 && activeW < 2) {
      e.act = 'windup'; e.actD = e.actT = 0.36; e.unblockable = false; e.aiKind = 'kunai'; SFX.play('glint'); return inp;
    }
    if (e.role === 'boss') {
      if (e.phase === 2 && e.aiSpecial <= 0 && dist > 160 && dist < 440) {
        e.aiSpecial = 3.8; inp.dash = true; if (dir > 0) inp.r = true; else inp.l = true; return inp;
      }
      if (e.aiCd <= 0 && dist > 235 && activeW < 2) {
        e.act = 'windup'; e.actD = e.actT = 0.48; e.unblockable = false; e.aiKind = 'bossWave'; SFX.play('glint'); return inp;
      }
    }
    const pref = e.role === 'spearman' ? 165 : e.role === 'brute' || e.role === 'boss' ? 124 : 92;
    if (dist > pref) {
      if (dir > 0) inp.r = true; else inp.l = true;
    } else if (e.aiCd <= 0 && activeW < 2) {
      e.act = 'windup';
      const isUnb = e.role === 'brute' || (e.role === 'boss' && Math.random() < 0.42);
      e.unblockable = isUnb;
      e.aiKind = isUnb ? 'slam' : 'slash';
      e.actD = e.actT = isUnb ? 0.62 : e.role === 'spearman' ? 0.48 : e.role === 'boss' && e.phase === 2 ? 0.34 : 0.42;
      SFX.play('glint');
    }
    return inp;
  }

  function updateWorldObjects(dt) {
    for (let i = clones.length - 1; i >= 0; i--) {
      const cl = clones[i];
      if ((cl.t -= dt) <= 0) {
        applyEvent({ k: 'ring', x: cl.x, y: cl.y - 52, mr: 120, c: '#e03131', lw: 5, sfx: 'heavyHit', shake: 8 });
        applyEvent({ k: 'ink', x: cl.x, y: cl.y - 52, dir: cl.f, n: 14, big: true });
        fighters.forEach((o) => {
          if (o.team !== cl.team && !o.dead && Math.abs(o.x - cl.x) < 125) {
            resolveLocalStrike(cl.owner, o, 24, 28, sgn(o.x - cl.x), { heavy: true, grantKi: false });
          }
        });
        clones.splice(i, 1);
      }
    }
    for (let i = projs.length - 1; i >= 0; i--) {
      const pr = projs[i];
      pr.x += pr.vx * dt;
      pr.l -= dt;
      if (!pr.visualOnly) {
        for (const o of fighters) {
          if (o.team === pr.team || o.dead || (pr.hits && pr.hits.has(o.id))) continue;
          if (Math.abs(o.x - pr.x) <= pr.r + 22 && Math.abs(o.y - 54 - pr.y) <= pr.r + 36) {
            if (!o.isRemote && o.parryW > 0) {
              pr.team = o.team;
              pr.owner = o;
              pr.vx = -pr.vx * 1.38;
              pr.f = -pr.f;
              pr.dmg = pr.k === 'bullet' || pr.k === 'kunai' ? 95 : Math.round(pr.dmg * 1.8);
              pr.hits = new Set();
              o.ki = clamp(o.ki + 25, 0, o.maxKi);
              if (o.team === 1) { parries++; flow = Math.min(200, flow + 24); flowT = 3.8; }
              applyEvent({ k: 'sparks', x: pr.x, y: pr.y, dir: pr.f, n: 18, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, shake: 12, vibe: 30 });
              applyEvent({ k: 'txt', x: o.x, y: o.y - 120, txt: pr.k === 'bullet' ? 'BULLET PARRY!' : 'PARRY DEFLECT!', c: '#e03131', sc: 1.2 });
            } else {
              if (pr.hits) pr.hits.add(o.id);
              deliverStrike(pr.owner, o, pr.dmg, pr.pos || 24, pr.f, { heavy: pr.k !== 'kunai', isProj: true, grantKi: false });
              if (pr.k === 'bullet' || pr.k === 'kunai') pr.l = 0;
            }
          }
        }
      }
      if (pr.l <= 0 || pr.x < LEFT_B - 140 || pr.x > RIGHT_B + 140) projs.splice(i, 1);
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const pt = parts[i];
      pt.l -= dt;
      if (pt.k === 'sp' || pt.k === 'ink') {
        pt.vy += (pt.k === 'ink' ? 780 : 420) * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        if (pt.y > GROUND) {
          pt.y = GROUND;
          pt.vx *= 0.4;
          pt.vy *= -0.2;
        }
      } else if (pt.k === 'ring') {
        pt.r = lerp(8, pt.mr, 1 - Math.pow(clamp(pt.l / pt.ml, 0, 1), 3));
      }
      if (pt.l <= 0) parts.splice(i, 1);
    }
    slashes = slashes.filter((s) => (s.l -= dt) > 0);
    ghosts = ghosts.filter((g) => (g.l -= dt) > 0);
    stains = stains.filter((s) => (s.l -= dt) > 0);
    texts = texts.filter((t) => {
      t.y += t.vy * dt;
      t.vy *= 0.92;
      return (t.l -= dt) > 0;
    });
    const stId = STAGES[stageIdx].id;
    MOTES.forEach((m) => {
      const up = stId === 'temple';
      m.x += m.vx * dt;
      m.y += (up ? -Math.abs(m.vy) * 1.15 : Math.abs(m.vy)) * dt;
      m.r += m.vr * dt;
      if (m.x < -14) m.x = VW + 14;
      if (m.y > VH + 14) m.y = -14;
      if (m.y < -14) m.y = VH + 14;
    });
  }

  /* ==================== ONLINE NETCODE SYNC ==================== */
  function getMyFighter() {
    if (!netState.active) return fighters[0] || null;
    return netState.role === 'host' ? fighters[0] || null : fighters[1] || null;
  }
  function getRemoteFighter() {
    if (!netState.active) return null;
    return netState.role === 'host' ? fighters[1] || null : fighters[0] || null;
  }

  function sendMyNetState(force) {
    if (!netState.active || !global.KuroNet) return;
    const f = getMyFighter();
    if (!f) return;
    const flags =
      (f.execMark ? 1 : 0) |
      (f.dead ? 2 : 0) |
      (f.flashT > 0 ? 4 : 0) |
      (f.guarding ? 8 : 0) |
      (f.parryW > 0 ? 16 : 0) |
      (f.invuln > 0 ? 32 : 0);
    KuroNet.sendState(
      [
        Math.round(f.x),
        Math.round(f.y),
        Math.round(f.vx),
        Math.round(f.vy),
        f.f,
        Math.round(f.hp),
        Math.round(f.pos),
        Math.round(f.ki),
        actToId(f.act),
        f.step,
        flags,
      ],
      Boolean(force)
    );
  }

  function hostFinalizeOnlineRound(winnerSide) {
    if (roundEndT > 0 || matchEnded) return;
    if (winnerSide === 1) rounds[0]++;
    else rounds[1]++;
    KuroNet.sendReliable(['rnd_end', rounds[0], rounds[1], winnerSide]);
    applyOnlineRoundEnd(rounds[0], rounds[1], winnerSide);
  }

  function applyOnlineRoundEnd(w1, w2, winnerSide) {
    rounds[0] = w1;
    rounds[1] = w2;
    const iWonRound = (netState.role === 'host' && winnerSide === 1) || (netState.role === 'guest' && winnerSide === 2);
    if (rounds[0] >= 2 || rounds[1] >= 2) {
      matchEnded = true;
      state = 'VICTORY';
      const iWonMatch = (netState.role === 'host' && rounds[0] >= 2) || (netState.role === 'guest' && rounds[1] >= 2);
      showBanner(iWonMatch ? '剣聖' : '落花', iWonMatch ? 'VICTORY' : 'DEFEATED', `P1 ${rounds[0]} — ${rounds[1]} P2`, 2.0, false);
      setTimeout(() => {
        if (mode === 'online' && callbacks.onResult) {
          callbacks.onResult({
            mode: 'online',
            win: iWonMatch,
            title: iWonMatch ? 'DUEL VICTORY' : 'FALLEN IN DUEL',
            sub: `Best of 3 • P1 ${rounds[0]} — ${rounds[1]} P2`,
            canRematch: true,
            stats: [
              ['Your Role', netState.role.toUpperCase()],
              ['Rounds', `${rounds[0]} — ${rounds[1]}`],
              ['Ping', `${KuroNet.getState().ping || 0} ms`],
            ],
          });
        }
      }, 1350);
    } else {
      roundEndT = 1.9;
      showBanner('決着', iWonRound ? 'ROUND WON' : 'ROUND LOST', `P1 ${rounds[0]} — ${rounds[1]} P2`, 1.7, false);
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
        if (!opF) return;
        const flags = payload[12] || 0;
        netState.remoteTarget = {
          x: payload[2],
          y: payload[3],
          vx: payload[4],
          vy: payload[5],
          f: payload[6] || 1,
          act: idToAct(payload[10]),
          step: payload[11] || 0,
          rxAt: performance.now(),
        };
        opF.hp = payload[7];
        opF.pos = payload[8];
        opF.ki = payload[9];
        opF.execMark = Boolean(flags & 1);
        opF.dead = Boolean(flags & 2);
        if (flags & 4) opF.flashT = 0.1;
        opF.guarding = Boolean(flags & 8);
        opF.parryW = flags & 16 ? 0.15 : 0;
        opF.invuln = flags & 32 ? 0.15 : 0;
        break;
      }
      case 'fx':
        applyEvent(payload[1]);
        break;
      case 'pw':
        projs.push({ k: 'wave', team: opF ? opF.team : 2, owner: opF, x: payload[1], y: payload[2], vx: payload[3] * 920, f: payload[3], r: 74, dmg: 0, pos: 0, hits: new Set(), l: 1.3, visualOnly: true });
        break;
      case 'ult':
        if (opF) {
          opF.x = payload[1];
          startUltimate(opF, true);
        }
        break;
      case 'hit': {
        if (!myF || myF.dead) return;
        const [, hitId, dmg, posDmg, dir, heavy, unblockable, guardCrush, isProj, forceExec] = payload;
        const res = resolveLocalStrike(null, myF, dmg, posDmg, dir, {
          heavy: Boolean(heavy),
          unblockable: Boolean(unblockable),
          guardCrush: Boolean(guardCrush),
          isProj: Boolean(isProj),
          forceExec: Boolean(forceExec),
        });
        KuroNet.sendReliable(['res', hitId, res.outcome, Math.round(myF.hp), Math.round(myF.pos), Math.round(myF.ki), res.broken ? 1 : 0, res.dead ? 1 : 0, res.dmg || 0]);
        sendMyNetState(true);
        break;
      }
      case 'res': {
        const [, hitId, outcome, hp, pos, ki, broken, , dealt] = payload;
        const pend = netState.pendingHits.get(hitId);
        netState.pendingHits.delete(hitId);
        if (opF) {
          opF.hp = hp;
          opF.pos = pos;
          opF.ki = ki;
          if (broken) opF.execMark = true;
        }
        if (!pend || !myF) return;
        if (outcome === 'evade') {
          applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 40, txt: 'EVADE', c: '#f2eee5', sc: 0.9 });
        } else if (outcome === 'parry') {
          applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: -pend.dir, n: 22, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, slow: 0.2, zoom: 1.16, shake: 16 });
          applyEvent({ k: 'ring', x: pend.fxX, y: pend.fxY, mr: 130, c: '#f2eee5', lw: 6 });
          myF.pos = Math.min(myF.maxPos, myF.pos + 46);
          myF.vx = -pend.dir * 320;
          if (myF.pos >= myF.maxPos) breakPosture(myF, -pend.dir);
          else { myF.act = 'stagger'; myF.stagT = myF.actT = myF.actD = 1.1; }
          applyEvent({ k: 'txt', x: myF.x, y: myF.y - 122, txt: 'PARRIED!', c: '#e03131', sc: 1.25 });
          sendMyNetState(true);
        } else if (outcome === 'guard') {
          applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: -pend.dir, n: 10, sfx: 'guard', shake: 6 });
          if (broken) applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 60, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.2 });
        } else if (outcome === 'hit' || outcome === 'exec') {
          const isEx = outcome === 'exec';
          if (pend.grantKi) grantHit(myF, 80, isEx ? 18 : pend.heavy ? 12 : 7);
          if (isEx) {
            myF.hp = Math.min(myF.maxHp, myF.hp + 15);
            applyEvent({ k: 'cut', x1: pend.fxX - 135, y1: pend.fxY - 72, x2: pend.fxX + 135, y2: pend.fxY + 72, c: '#e03131', w: 16, l: 0.55, sfx: 'exec', hitstop: 0.085, inv: 0.12, slow: 0.3, zoom: 1.22, shake: 20 });
            applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 50, txt: `EXECUTION -${dealt}`, c: '#e03131', sc: 1.3 });
          } else {
            applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: pend.dir, n: pend.heavy ? 14 : 9, redP: 0.45, sfx: pend.heavy ? 'heavyHit' : 'hit', hitstop: pend.heavy ? 0.06 : 0.04, shake: pend.heavy ? 10 : 6 });
            applyEvent({ k: 'ink', x: pend.fxX, y: pend.fxY, dir: pend.dir, n: 12, big: pend.heavy });
            applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 34, txt: `-${dealt}`, c: pend.heavy ? '#e03131' : '#f2eee5', sc: pend.heavy ? 1.15 : 0.95 });
          }
          if (broken) applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 70, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.2 });
        }
        break;
      }
      case 'ko':
        if (netState.role === 'host') hostFinalizeOnlineRound(payload[1] === 2 ? 1 : 2);
        break;
      case 'rnd_end':
        if (netState.role === 'guest') applyOnlineRoundEnd(payload[1], payload[2], payload[3]);
        break;
      case 'rnd_next':
        roundNum = payload[1];
        rounds[0] = payload[2];
        rounds[1] = payload[3];
        setupOnlineRound();
        break;
      case 'rm':
        roundNum = 1;
        rounds = [0, 0];
        matchEnded = false;
        setupOnlineRound();
        if (callbacks.onRematchStarted) callbacks.onRematchStarted();
        break;
      default:
        break;
    }
  }

  /* ==================== MODES & WAVE FLOW ==================== */
  function resetArena() {
    projs = [];
    clones = [];
    slashes = [];
    parts = [];
    ghosts = [];
    texts = [];
    stains = [];
    hitstop = slowT = invT = 0;
    ult = null;
    targetZoom = 1;
  }

  function showBanner(kanji, title, sub, dur = 1.45, enterBannerState = true) {
    banner = { kanji, title, sub, t: dur, dur };
    if (enterBannerState) state = 'BANNER';
    SFX.play('taiko');
  }

  function beginSoloWave(idx) {
    wave = idx;
    const p1 = fighters[0];
    fighters = [p1];
    p1.x = -240;
    p1.y = GROUND;
    p1.vx = p1.vy = 0;
    p1.f = 1;
    p1.pos = 0;
    p1.execMark = false;
    p1.hp = Math.min(p1.maxHp, p1.hp + 25);
    p1.hpLag = p1.hp;
    p1.scarf.reset(-240, GROUND - 80);
    resetArena();
    if (mode === 'story') {
      const w = STORY_WAVES[idx];
      stageIdx = w.stageIdx;
      showBanner(w.kanji, w.title, w.sub, 1.55);
    } else {
      stageIdx = idx % STAGES.length;
      showBanner(`第${idx + 1}波`, `DOJO WAVE ${idx + 1}`, 'Survive and raise your Flow Rank.', 1.25);
    }
  }

  function spawnWaveEnemies() {
    let list;
    let mult = 1;
    if (mode === 'story') {
      list = STORY_WAVES[wave].list;
    } else {
      const n = wave + 1;
      mult = 1 + wave * 0.12;
      list = [];
      if (n % 4 === 0) list.push('boss');
      else {
        const pool = ['ronin', 'spearman', 'gunner', 'brute'];
        for (let i = 0; i < Math.min(5, 2 + Math.floor(n * 0.6)); i++) {
          list.push(pool[Math.floor(Math.random() * Math.min(pool.length, n + 1))]);
        }
      }
    }
    list.forEach((r, i) => fighters.push(makeEnemy(r, r === 'boss' ? 320 : clamp(170 + i * 130, -480, 540), mult)));
  }

  function openScrollPicker() {
    state = 'SCROLL';
    if (mode === 'endless') saveBest(wave + 1, score);
    const p1 = fighters[0];
    const avail = SCROLLS.filter((p) => !p1.perks.has(p.id));
    const picks = (avail.length >= 3 ? avail : SCROLLS).slice().sort(() => Math.random() - 0.5).slice(0, 3);
    if (callbacks.onScrollPrompt) callbacks.onScrollPrompt(picks);
    else beginSoloWave(wave + 1);
  }

  function finishSoloRun(win) {
    if (matchEnded) return;
    matchEnded = true;
    state = win ? 'VICTORY' : 'GAMEOVER';
    const best = mode === 'endless' ? saveBest(wave + 1, score) : loadBest();
    setTimeout(() => {
      if (callbacks.onResult) {
        callbacks.onResult({
          mode,
          win,
          title: win ? 'VICTORY' : 'DEFEATED',
          sub: win ? 'Lord Kurogane falls beneath the Blood Moon.' : `Fallen on Wave ${wave + 1} • Best Wave ${best.wave}`,
          canRematch: true,
          stats: [
            ['Score', score.toLocaleString()],
            ['Peak Flow', maxFlow],
            ['Parries', String(parries)],
          ],
        });
      }
    }, 850);
  }

  function setupLocal2PRound() {
    resetArena();
    roundEndT = 0;
    fighters = [
      makeFighter({ id: 1, team: 1, role: 'player', name: 'P1', weaponIdx: menuWeaponIdx, x: -240, f: 1, hp: 120, scarfCol: '#f2eee5', hat: 'kasa' }),
      makeFighter({ id: 2, team: 2, role: 'player', name: 'P2', weaponIdx: (menuWeaponIdx + 1) % WEAPONS.length, x: 240, f: -1, hp: 120, scarfCol: '#c82424', hat: 'kabuto' }),
    ];
    showBanner(`第${roundNum}戦`, `ROUND ${roundNum}`, `${WEAPONS[fighters[0].weaponIdx].name.toUpperCase()}  VS  ${WEAPONS[fighters[1].weaponIdx].name.toUpperCase()}`, 1.3);
  }

  function setupOnlineRound() {
    resetArena();
    netState.pendingHits.clear();
    netState.remoteTarget = null;
    netState.koSent = false;
    roundEndT = 0;
    stageIdx = netState.stageIdx;
    fighters = [
      makeFighter({ id: 1, team: 1, role: 'player', name: 'P1', weaponIdx: netState.p1Weapon, x: -240, f: 1, hp: 120, scarfCol: '#f2eee5', hat: 'kasa', isRemote: netState.role !== 'host' }),
      makeFighter({ id: 2, team: 2, role: 'player', name: 'P2', weaponIdx: netState.p2Weapon, x: 240, f: -1, hp: 120, scarfCol: '#c82424', hat: 'kabuto', isRemote: netState.role !== 'guest' }),
    ];
    showBanner(`第${roundNum}戦`, `ROUND ${roundNum}`, netState.role === 'host' ? 'YOU ARE P1 (LEFT)' : 'YOU ARE P2 (RIGHT)', 1.25);
    sendMyNetState(true);
  }

  function setupMenuBackdrop() {
    mode = 'menu';
    state = 'MENU';
    matchEnded = false;
    netState.active = false;
    stageIdx = 2;
    fighters = [];
    resetArena();
    MENU_P1.weaponIdx = menuWeaponIdx;
    MENU_P1.weapon = WEAPONS[menuWeaponIdx].id;
    MENU_P1.scarf.reset(MENU_P1.x, GROUND - 80);
    MENU_P2.scarf.reset(MENU_P2.x, GROUND - 80);
    camX = 0;
    camZoom = 1.04;
    targetZoom = 1.04;
    if (callbacks.onModeChange) callbacks.onModeChange('menu');
  }

  /* ==================== KUROSAWA SUMI-E RENDERER ==================== */
  function drawBackdrop(inv, stId) {
    const inUlt = state === 'ULT';
    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    if (inv) { sky.addColorStop(0, '#f2eee5'); sky.addColorStop(1, '#d6d2c8'); }
    else if (inUlt) { sky.addColorStop(0, '#050507'); sky.addColorStop(1, '#180709'); }
    else if (stId === 'temple') { sky.addColorStop(0, '#0b080a'); sky.addColorStop(0.55, '#251518'); sky.addColorStop(1, '#582022'); }
    else if (stId === 'bridge') { sky.addColorStop(0, '#07060a'); sky.addColorStop(0.55, '#19181d'); sky.addColorStop(1, '#323136'); }
    else { sky.addColorStop(0, '#0c0d11'); sky.addColorStop(0.55, '#242423'); sky.addColorStop(1, '#4c4b46'); }
    ctx.fillStyle = sky;
    ctx.fillRect(-320, -240, VW + 640, VH + 480);

    const mx = VW * 0.52 - camX * 0.06;
    const my = VH * 0.28;
    const mr = inUlt || stId === 'bridge' ? 148 : 118;
    const redMoon = inUlt || (stId === 'bridge' && mode !== 'menu');
    if (!inv) {
      const h = ctx.createRadialGradient(mx, my, mr * 0.7, mx, my, mr * 2.3);
      h.addColorStop(0, redMoon ? 'rgba(200,36,36,0.58)' : 'rgba(242,238,229,0.34)');
      h.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.arc(mx, my, mr * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = inv ? '#08080a' : redMoon ? '#c82424' : '#f2eee5';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    if (redMoon && !inv) {
      ctx.fillStyle = '#08080a';
      ctx.beginPath();
      ctx.arc(mx + (inUlt ? 0 : 12), my - (inUlt ? 0 : 6), mr * 0.84, 0, Math.PI * 2);
      ctx.fill();
    }
    if (inv || inUlt) return;

    // Mountain silhouettes
    ctx.save();
    ctx.translate(VW * 0.5 - camX * 0.2, 0);
    ctx.fillStyle = 'rgba(16,16,20,0.84)';
    ctx.beginPath();
    ctx.moveTo(-1200, VH + 200);
    ctx.lineTo(-860, 380);
    ctx.lineTo(-480, 310);
    ctx.lineTo(-120, 400);
    ctx.lineTo(280, 295);
    ctx.lineTo(720, 385);
    ctx.lineTo(1200, 320);
    ctx.lineTo(1200, VH + 200);
    ctx.fill();
    ctx.restore();

    if (stId === 'bamboo' || mode === 'menu') {
      BAMBOO.forEach((b) => {
        const bx = VW * 0.5 + b.x - camX * b.d;
        if (bx < -100 || bx > VW + 100) return;
        const sw = Math.sin(tTime * 3.1 + b.ph) * 18;
        ctx.strokeStyle = b.d > 0.65 ? 'rgba(10,10,13,0.85)' : 'rgba(28,28,32,0.48)';
        ctx.lineWidth = b.w;
        ctx.beginPath();
        ctx.moveTo(bx, GROUND + 10);
        ctx.quadraticCurveTo(bx + sw * 0.5 + b.lean * 200, GROUND * 0.5, bx + sw + b.lean * 380, -40);
        ctx.stroke();
      });
    }
    if (stId === 'temple') {
      ctx.save();
      ctx.translate(VW * 0.5 - camX * 0.45, GROUND);
      ctx.fillStyle = '#0c0a0d';
      ctx.fillRect(-118, -245, 18, 245);
      ctx.fillRect(100, -245, 18, 245);
      ctx.fillRect(-148, -198, 296, 14);
      ctx.beginPath();
      ctx.moveTo(-174, -258);
      ctx.quadraticCurveTo(0, -234, 174, -258);
      ctx.lineTo(162, -230);
      ctx.quadraticCurveTo(0, -214, -162, -230);
      ctx.fill();
      ctx.restore();
    }
    if (stId === 'bridge' || mode === 'menu') {
      FOG.forEach((p) => {
        const fx = ((p.x + tTime * p.spd + 1000) % 2000) - 1000;
        ctx.fillStyle = 'rgba(242,238,229,0.09)';
        ctx.beginPath();
        ctx.ellipse(VW * 0.5 + fx - camX * 0.35, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    const mist = ctx.createLinearGradient(0, GROUND - 110, 0, GROUND + 20);
    mist.addColorStop(0, 'rgba(242,238,229,0)');
    mist.addColorStop(1, stId === 'temple' ? 'rgba(200,36,36,0.18)' : 'rgba(242,238,229,0.16)');
    ctx.fillStyle = mist;
    ctx.fillRect(-320, GROUND - 110, VW + 640, 130);
  }

  function drawFighter(f, inv, ghostA = 1, gRed = false, skOverride = null) {
    const sk = skOverride || buildSkel(f.x, f.y, f.f, f.pose, f.scale);
    const W = WEAPONS[f.weaponIdx || 0];
    const ink = ghostA < 1 ? (gRed ? 'rgba(200,36,36,0.65)' : 'rgba(14,14,18,0.72)') : f.flashT > 0 ? '#f2eee5' : '#08080a';
    const rim = ghostA < 1 ? 'rgba(242,238,229,0.38)' : f.stagT > 0 ? '#e03131' : '#f2eee5';
    const lw = (f.role === 'boss' || f.role === 'brute' ? 8 : 6.4) * sk.s;

    ctx.save();
    ctx.globalAlpha = ghostA;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const seg = (a, b, w, c) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };
    const body = (ex, c) => {
      seg(sk.pel, sk.kL, lw + ex, c);
      seg(sk.kL, sk.fL, lw * 0.88 + ex, c);
      seg(sk.pel, sk.kR, lw + ex, c);
      seg(sk.kR, sk.fR, lw * 0.88 + ex, c);
      seg(sk.pel, sk.sh, lw * 1.24 + ex, c);
      seg(sk.sh, sk.eL, lw * 0.84 + ex, c);
      seg(sk.eL, sk.hL, lw * 0.8 + ex, c);
      seg(sk.sh, sk.eR, lw * 0.84 + ex, c);
      seg(sk.eR, sk.hR, lw * 0.8 + ex, c);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(sk.hd.x, sk.hd.y, sk.hr + ex * 0.5, 0, Math.PI * 2);
      ctx.fill();
    };
    body(3, rim);
    body(0, ink);

    const sheathed = (f.act === 'iai' && f.iaiStage === 0) || (ult && ult.caster === f && ult.sheathed);
    if (!sheathed && ghostA >= 0.45) {
      const hx = sk.hR.x;
      const hy = sk.hR.y;
      const an = sk.swAng;
      const ln = W.len * sk.s;
      const blade = (ox, oy, ang, len, th, red) => {
        const tx = ox + Math.cos(ang) * len;
        const ty = oy + Math.sin(ang) * len;
        seg({ x: ox - Math.cos(ang) * 14, y: oy - Math.sin(ang) * 14 }, { x: ox, y: oy }, 4, '#18181d');
        seg({ x: ox, y: oy }, { x: tx, y: ty }, th, '#111115');
        seg({ x: ox, y: oy }, { x: tx, y: ty }, th * 0.46, red ? '#e03131' : '#f2eee5');
      };
      if (f.role === 'gunner') {
        const tx = hx + f.f * 64;
        const ty = hy - 4;
        seg({ x: hx - f.f * 16, y: hy + 2 }, { x: tx, y: ty }, 5.5, '#18181d');
        seg({ x: hx, y: hy - 2 }, { x: tx, y: ty - 2 }, 2, '#f2eee5');
        if (f.act === 'windup' && !inv) {
          ctx.strokeStyle = 'rgba(242,238,229,0.68)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + f.f * 620, ty);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (f.role === 'brute') {
        const tx = hx + Math.cos(an) * 98;
        const ty = hy + Math.sin(an) * 98;
        seg({ x: hx, y: hy }, { x: tx, y: ty }, 12, '#0e0e12');
        seg({ x: hx, y: hy }, { x: tx, y: ty }, 4, f.unblockable ? '#e03131' : '#9a968e');
      } else if (f.weapon === 'naginata') {
        const bx = hx - Math.cos(an) * 34;
        const by = hy - Math.sin(an) * 34;
        const mx = hx + Math.cos(an) * 76;
        const my = hy + Math.sin(an) * 76;
        seg({ x: bx, y: by }, { x: mx, y: my }, 4.2, '#222228');
        blade(mx, my, an, 44, 6, f.act === 'airSlash');
      } else if (W.dual) {
        blade(hx, hy, an, ln, 4.4, false);
        blade(sk.hL.x, sk.hL.y, an - 0.35 * f.f, ln * 0.9, 4.2, true);
      } else {
        blade(hx, hy, an, ln, W.guardCrush ? 7.2 : 4.8, f.role === 'boss' && f.phase === 2);
      }

      if (f.act === 'windup' && ghostA >= 1) {
        const g = Math.sin(clamp(1 - f.actT / Math.max(0.05, f.actD), 0, 1) * Math.PI);
        const r1 = 34 * g + 8;
        ctx.save();
        ctx.translate(hx + Math.cos(an) * 36, hy + Math.sin(an) * 36);
        ctx.strokeStyle = '#c82424';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-r1, 0); ctx.lineTo(r1, 0);
        ctx.moveTo(0, -r1); ctx.lineTo(0, r1);
        ctx.stroke();
        ctx.strokeStyle = '#f2eee5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r1 * 0.7, 0); ctx.lineTo(r1 * 0.7, 0);
        ctx.moveTo(0, -r1 * 0.7); ctx.lineTo(0, r1 * 0.7);
        ctx.stroke();
        ctx.restore();
        if (f.unblockable) {
          ctx.font = '900 28px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#e03131';
          ctx.fillText('破', sk.hd.x, sk.hd.y - 44);
        }
      }
    }

    const hx = sk.hd.x;
    const hy = sk.hd.y;
    const r = sk.hr;
    if (f.hat === 'kasa') {
      ctx.beginPath();
      ctx.moveTo(hx - r * 2.7, hy - r * 0.15);
      ctx.quadraticCurveTo(hx, hy - r * 2.2, hx + r * 2.7, hy - r * 0.15);
      ctx.closePath();
      ctx.fillStyle = '#111115';
      ctx.fill();
      ctx.strokeStyle = '#f2eee5';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (f.hat === 'band') {
      seg({ x: hx - r, y: hy - r * 0.3 }, { x: hx + r, y: hy - r * 0.3 }, 3.5, '#c82424');
    } else {
      const isB = f.hat === 'boss';
      ctx.fillStyle = '#111115';
      ctx.strokeStyle = '#f2eee5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, hy - 2, r * 1.25, Math.PI, Math.PI * 2);
      ctx.lineTo(hx + r * 1.55, hy + r * 0.6);
      ctx.lineTo(hx - r * 1.55, hy + r * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = isB || f.team === 2 ? '#c82424' : '#f2eee5';
      ctx.lineWidth = isB ? 4 : 2.8;
      ctx.beginPath();
      ctx.moveTo(hx + f.f * r * 0.3, hy - r * 0.85);
      ctx.quadraticCurveTo(hx + f.f * r * 1.7, hy - r * 2.6, hx + f.f * r * 2.2, hy - r * 3.1);
      ctx.stroke();
    }

    if (f.execMark && ghostA >= 1) {
      const p = 1 + 0.14 * Math.sin(tTime * 16);
      ctx.save();
      ctx.translate(hx, hy - 48);
      ctx.scale(p, p);
      ctx.fillStyle = 'rgba(200,36,36,0.26)';
      ctx.beginPath();
      ctx.arc(0, -6, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '900 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e03131';
      ctx.fillText('殺', 0, 5);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawHud() {
    if (mode === 'menu') return;
    const p1 = fighters[0];
    if (!p1) return;
    const topY = settings.letterbox ? 50 : 28;
    const isDuel = mode === 'local2p' || mode === 'online';

    const p1Lbl = isDuel ? (mode === 'online' ? (netState.role === 'host' ? 'YOU (P1)' : 'HOST (P1)') : 'P1') : 'KUROKAZE';
    drawBar(28, topY, 276, p1, `${p1Lbl} • ${WEAPONS[p1.weaponIdx].name.toUpperCase()}`, false, isDuel ? rounds[0] : -1);

    if (isDuel && fighters[1]) {
      const p2 = fighters[1];
      const p2Lbl = mode === 'online' ? (netState.role === 'guest' ? 'YOU (P2)' : 'GUEST (P2)') : 'P2';
      drawBar(VW - 304, topY, 276, p2, `${p2Lbl} • ${WEAPONS[p2.weaponIdx].name.toUpperCase()}`, true, rounds[1]);
    } else {
      // Solo Score & Flow Rank
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = '800 18px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#f2eee5';
      ctx.fillText(String(score).padStart(6, '0'), VW - 28, topY + 14);
      ctx.font = 'italic 900 28px Georgia, serif';
      ctx.fillStyle = '#e03131';
      ctx.fillText(`FLOW ${flowRankOf(flow)}`, VW - 28, topY + 46);
      if (combo >= 2) {
        ctx.font = '800 12px -apple-system, sans-serif';
        ctx.fillStyle = '#f2eee5';
        ctx.fillText(`${combo} HITS`, VW - 28, topY + 64);
      }
      ctx.restore();

      const boss = fighters.find((f) => f.role === 'boss' && !f.dead);
      if (boss) {
        const bw = 380;
        const bx = (VW - bw) * 0.5;
        ctx.save();
        ctx.font = '800 12px Georgia, serif';
        ctx.fillStyle = '#f2eee5';
        ctx.textAlign = 'left';
        ctx.fillText('LORD KUROGANE', bx, topY + 26);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#e03131';
        ctx.fillText(boss.phase === 2 ? 'PHASE II • AWAKENED' : 'PHASE I', bx + bw, topY + 26);
        ctx.fillStyle = 'rgba(8,8,10,0.9)';
        ctx.fillRect(bx, topY + 32, bw, 12);
        ctx.fillStyle = '#c82424';
        ctx.fillRect(bx, topY + 32, bw * clamp(boss.hp / boss.maxHp, 0, 1), 12);
        ctx.strokeStyle = 'rgba(200,36,36,0.85)';
        ctx.strokeRect(bx, topY + 32, bw, 12);
        ctx.fillStyle = '#f2eee5';
        ctx.fillRect(bx, topY + 47, bw * clamp(boss.pos / boss.maxPos, 0, 1), 3);
        ctx.restore();
      }
    }

    // Center Wave / Round title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '800 12px Georgia, serif';
    ctx.fillStyle = 'rgba(242,238,229,0.88)';
    if (mode === 'story') ctx.fillText(`ACT ${wave + 1}/3 • ${STAGES[stageIdx].name.toUpperCase()}`, VW * 0.5, topY + 10);
    else if (mode === 'endless') ctx.fillText(`DOJO WAVE ${wave + 1}`, VW * 0.5, topY + 10);
    else ctx.fillText(`ROUND ${roundNum} • BEST OF 3`, VW * 0.5, topY + 10);
    ctx.restore();

    // Desktop Ki Hint Strip (hidden on touch devices)
    if (!IS_TOUCH) {
      const localF = getMyFighter();
      if (localF) {
        const labels = [
          { k: '[Q] FLASH DRAW', cost: 30 },
          { k: '[E] INK WAVE', cost: 40 },
          { k: '[R] ECLIPSE ULT', cost: 100 },
        ];
        const yB = VH - (settings.letterbox ? 58 : 34);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '700 11px -apple-system, sans-serif';
        labels.forEach((it, idx) => {
          const x = VW * 0.5 + (idx - 1) * 148;
          const ok = localF.ki >= it.cost;
          ctx.fillStyle = ok ? 'rgba(200,36,36,0.28)' : 'rgba(10,10,13,0.75)';
          ctx.fillRect(x - 66, yB - 14, 132, 22);
          ctx.strokeStyle = ok ? '#e03131' : 'rgba(242,238,229,0.22)';
          ctx.strokeRect(x - 66, yB - 14, 132, 22);
          ctx.fillStyle = ok ? '#f2eee5' : '#7b7770';
          ctx.fillText(`${it.k} (${it.cost})`, x, yB + 1);
        });
        ctx.restore();
      }
    }

    // Cinematic Kanji Banner
    if (banner.t > 0) {
      const alpha = clamp(Math.min(banner.t * 3, (banner.dur - banner.t) * 6 + 0.2), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(8,8,10,0.68)';
      ctx.fillRect(0, VH * 0.34, VW, 146);
      ctx.fillStyle = '#c82424';
      ctx.fillRect(0, VH * 0.34, VW, 2);
      ctx.fillRect(0, VH * 0.34 + 144, VW, 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e03131';
      ctx.font = '900 24px Georgia, serif';
      ctx.fillText(banner.kanji, VW * 0.5, VH * 0.34 + 38);
      ctx.fillStyle = '#f2eee5';
      ctx.font = '900 44px Georgia, serif';
      ctx.fillText(banner.title, VW * 0.5, VH * 0.34 + 90);
      if (banner.sub) {
        ctx.fillStyle = '#a8a29a';
        ctx.font = '600 13px -apple-system, sans-serif';
        ctx.fillText(banner.sub.toUpperCase(), VW * 0.5, VH * 0.34 + 124);
      }
      ctx.restore();
    }
  }

  function drawBar(x, y, w, f, label, right, wins) {
    ctx.save();
    ctx.font = '800 11px -apple-system, sans-serif';
    ctx.fillStyle = right ? '#e03131' : '#f2eee5';
    ctx.textAlign = right ? 'right' : 'left';
    ctx.fillText(label, right ? x + w : x, y);

    if (wins >= 0) {
      for (let i = 0; i < 2; i++) {
        const px = right ? x + i * 15 + 6 : x + w - (i * 15 + 6);
        ctx.fillStyle = i < wins ? '#e03131' : 'rgba(242,238,229,0.24)';
        ctx.beginPath();
        ctx.arc(px, y - 4, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const hpR = clamp(f.hp / f.maxHp, 0, 1);
    const lagR = clamp(f.hpLag / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(8,8,10,0.9)';
    ctx.fillRect(x, y + 6, w, 14);
    ctx.fillStyle = right ? 'rgba(242,238,229,0.55)' : '#c82424';
    if (right) ctx.fillRect(x + w * (1 - lagR), y + 6, w * lagR, 14);
    else ctx.fillRect(x, y + 6, w * lagR, 14);
    ctx.fillStyle = right ? '#e03131' : '#f2eee5';
    if (right) ctx.fillRect(x + w * (1 - hpR), y + 6, w * hpR, 14);
    else ctx.fillRect(x, y + 6, w * hpR, 14);
    ctx.strokeStyle = 'rgba(242,238,229,0.42)';
    ctx.strokeRect(x, y + 6, w, 14);

    // Posture bar
    const posR = clamp(f.pos / f.maxPos, 0, 1);
    ctx.fillStyle = 'rgba(8,8,10,0.9)';
    ctx.fillRect(x, y + 23, w, 4);
    ctx.fillStyle = posR > 0.72 ? '#e03131' : '#f2eee5';
    if (right) ctx.fillRect(x + w * (1 - posR), y + 23, w * posR, 4);
    else ctx.fillRect(x, y + 23, w * posR, 4);

    // Ki bar
    const kiR = clamp(f.ki / f.maxKi, 0, 1);
    ctx.fillStyle = 'rgba(8,8,10,0.9)';
    ctx.fillRect(x, y + 30, w, 6);
    ctx.fillStyle = f.ki >= 100 ? '#e03131' : '#b8b3a8';
    if (right) ctx.fillRect(x + w * (1 - kiR), y + 30, w * kiR, 6);
    else ctx.fillRect(x, y + 30, w * kiR, 6);
    ctx.restore();
  }

  function render() {
    if (!ctx) return;
    const inv = invT > 0;
    const isMenu = mode === 'menu';
    const stId = isMenu ? 'bridge' : STAGES[stageIdx].id;

    ctx.save();
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(vOx, vOy);
    ctx.scale(vScale, vScale);
    drawBackdrop(inv, stId);

    ctx.save();
    ctx.translate(VW * 0.5 + shakeX, VH * 0.58 + shakeY);
    ctx.scale(camZoom, camZoom);
    ctx.translate(-camX, -(GROUND - 125));

    // Ground & Bridge Railings
    ctx.fillStyle = inv ? '#d6d2c8' : '#0a0a0d';
    ctx.fillRect(LEFT_B - 420, GROUND, RIGHT_B - LEFT_B + 840, 420);
    ctx.strokeStyle = inv ? '#08080a' : 'rgba(242,238,229,0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(LEFT_B - 300, GROUND + 1);
    ctx.lineTo(RIGHT_B + 300, GROUND + 1);
    ctx.stroke();

    if (!inv && stId === 'bridge') {
      ctx.strokeStyle = 'rgba(200,36,36,0.46)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(LEFT_B - 140, GROUND - 54);
      ctx.lineTo(RIGHT_B + 140, GROUND - 54);
      ctx.stroke();
      for (let bx = LEFT_B; bx <= RIGHT_B; bx += 128) {
        ctx.fillStyle = '#121217';
        ctx.fillRect(bx - 6, GROUND - 66, 12, 66);
        ctx.fillStyle = '#c82424';
        ctx.fillRect(bx - 7, GROUND - 70, 14, 5);
      }
    }
    if (!inv && (stId === 'bamboo' || isMenu)) {
      ctx.strokeStyle = 'rgba(242,238,229,0.26)';
      ctx.lineWidth = 1.2;
      SPLASHES.forEach((s) => {
        const p = (tTime * 2.4 + s.ph) % 1;
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.beginPath();
        ctx.ellipse(s.x, GROUND + 4, 4 + p * 18, 1.5 + p * 4, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (isMenu) {
      [MENU_P1, MENU_P2].forEach((u) => {
        u.scarf.draw(ctx, false, u.scarfCol);
        drawFighter(u, false, 1);
      });
    } else {
      stains.forEach((m) => {
        ctx.fillStyle = m.red ? `rgba(200,36,36,${clamp(m.l / 2, 0, 1) * 0.8})` : `rgba(4,4,6,${clamp(m.l / 2, 0, 1) * 0.8})`;
        ctx.beginPath();
        ctx.ellipse(m.x, GROUND + 4, m.w * 0.5, m.h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ghosts.forEach((g) => drawFighter({ weaponIdx: 0, weapon: 'katana', hat: g.hat, role: 'player', team: 1, f: g.sk.f, scale: g.sk.s, flashT: 0, stagT: 0 }, inv, (g.l / g.ml) * 0.52, g.red, g.sk));
      clones.forEach((c) => drawFighter({ weaponIdx: 0, weapon: 'katana', hat: c.hat, role: 'player', team: c.team, f: c.f, scale: 1, flashT: 0, stagT: 0 }, inv, 0.45, true, c.sk));
      fighters.forEach((f) => {
        if (!f.dead) f.scarf.draw(ctx, inv, f.scarfCol);
        drawFighter(f, inv, f.dead ? clamp(f.deadT / 0.85, 0, 1) : 1);
        if (f.role !== 'player' && f.role !== 'boss' && !f.dead) {
          const bx = f.x - 24;
          const by = f.y - 118 * f.scale;
          ctx.fillStyle = 'rgba(8,8,10,0.85)';
          ctx.fillRect(bx - 1, by - 1, 50, 10);
          ctx.fillStyle = '#c82424';
          ctx.fillRect(bx, by, 48 * clamp(f.hp / f.maxHp, 0, 1), 5);
          ctx.fillStyle = '#f2eee5';
          ctx.fillRect(bx, by + 6, 48 * clamp(f.pos / f.maxPos, 0, 1), 2);
        }
      });

      // Triple-layer Sumi-e Slash Arcs
      slashes.forEach((s) => {
        const p = clamp(s.l / s.ml, 0, 1);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.scale(s.f, 1);
        ctx.globalAlpha = p;
        ctx.lineCap = 'round';
        ctx.strokeStyle = inv ? '#08080a' : '#f2eee5';
        ctx.lineWidth = (s.w + 5) * p;
        ctx.beginPath();
        ctx.arc(0, 0, s.r, Math.min(s.a0, s.a1), Math.max(s.a0, s.a1));
        ctx.stroke();
        ctx.strokeStyle = inv ? '#f2eee5' : '#08080a';
        ctx.lineWidth = s.w * 0.72 * p;
        ctx.beginPath();
        ctx.arc(0, 0, s.r - 2, Math.min(s.a0, s.a1), Math.max(s.a0, s.a1));
        ctx.stroke();
        if (s.red) {
          ctx.strokeStyle = '#e03131';
          ctx.lineWidth = 4.2 * p;
          ctx.beginPath();
          ctx.arc(0, 0, s.r + 4, Math.min(s.a0, s.a1), Math.max(s.a0, s.a1));
          ctx.stroke();
        }
        ctx.restore();
      });

      // Projectiles
      projs.forEach((pr) => {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.scale(pr.f, 1);
        if (pr.k === 'bullet') {
          ctx.strokeStyle = '#e03131';
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(12, 0); ctx.stroke();
          ctx.fillStyle = '#f2eee5';
          ctx.beginPath(); ctx.arc(10, 0, 4.5, 0, Math.PI * 2); ctx.fill();
        } else if (pr.k === 'kunai') {
          ctx.fillStyle = '#f2eee5';
          ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-4, -4.5); ctx.lineTo(-14, 0); ctx.lineTo(-4, 4.5); ctx.fill();
          ctx.strokeStyle = '#e03131';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-26, 0); ctx.stroke();
        } else {
          const b = pr.k === 'bWave';
          ctx.fillStyle = b ? '#c82424' : '#f2eee5';
          ctx.beginPath(); ctx.arc(-18, 0, pr.r, -1.25, 1.25); ctx.arc(-44, 0, pr.r * 0.92, 1.15, -1.15, true); ctx.fill();
          ctx.fillStyle = '#08080a';
          ctx.beginPath(); ctx.arc(-22, 0, pr.r * 0.88, -1.15, 1.15); ctx.arc(-42, 0, pr.r * 0.85, 1.05, -1.05, true); ctx.fill();
        }
        ctx.restore();
      });

      // Particles, Rings, Cuts, Bolts
      parts.forEach((pt) => {
        const p = clamp(pt.l / pt.ml, 0, 1);
        ctx.save();
        ctx.globalAlpha = p;
        if (pt.k === 'sp') {
          ctx.strokeStyle = pt.c;
          ctx.lineWidth = 2.4 * p + 0.8;
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.vx * 0.032, pt.y - pt.vy * 0.032); ctx.stroke();
        } else if (pt.k === 'ink') {
          ctx.fillStyle = pt.c;
          ctx.beginPath(); ctx.ellipse(pt.x, pt.y, pt.sz * (0.6 + p * 0.5), pt.sz * 0.72, Math.atan2(pt.vy, pt.vx), 0, Math.PI * 2); ctx.fill();
        } else if (pt.k === 'ring') {
          ctx.strokeStyle = pt.c;
          ctx.lineWidth = pt.lw * p;
          ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.stroke();
        } else if (pt.k === 'cut') {
          ctx.strokeStyle = pt.c;
          ctx.lineWidth = pt.w * p;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(pt.x1, pt.y1); ctx.lineTo(pt.x2, pt.y2); ctx.stroke();
        } else if (pt.k === 'bolt') {
          ctx.strokeStyle = '#f2eee5';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(pt.x1, pt.y1);
          for (let k = 1; k < 5; k++) ctx.lineTo(lerp(pt.x1, pt.x2, k / 5) + rand(-18, 18), lerp(pt.y1, pt.y2, k / 5) + rand(-24, 24));
          ctx.lineTo(pt.x2, pt.y2);
          ctx.stroke();
        }
        ctx.restore();
      });

      if (ult) {
        ult.cuts.forEach((c) => {
          const p = clamp(c.l / c.ml, 0, 1);
          ctx.save();
          ctx.globalAlpha = p;
          ctx.lineCap = 'round';
          ctx.strokeStyle = c.red ? '#e03131' : '#f2eee5';
          ctx.lineWidth = (c.red ? 7 : 5) * p + 1.5;
          ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke();
          ctx.restore();
        });
      }

      texts.forEach((t) => {
        ctx.save();
        ctx.globalAlpha = clamp(t.l / t.ml, 0, 1);
        ctx.font = `900 ${Math.round(17 * t.sc)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#08080a';
        ctx.strokeText(t.txt, t.x, t.y);
        ctx.fillStyle = t.c;
        ctx.fillText(t.txt, t.x, t.y);
        ctx.restore();
      });
    }
    ctx.restore();

    // Foreground Rain & Floating Motes
    if (!inv) {
      if (stId === 'bamboo' || isMenu) {
        const rainCount = isLowFx() ? 38 : 74;
        ctx.strokeStyle = 'rgba(242,238,229,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < rainCount; i++) {
          const rx = (((i * 103 - tTime * 420) % (VW + 160)) + (VW + 160)) % (VW + 160) - 80;
          const ry = ((i * 157 + tTime * 920) % (VH + 120)) - 60;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 14, ry + 34);
        }
        ctx.stroke();
      }
      const mCount = isLowFx() ? 18 : MOTES.length;
      for (let i = 0; i < mCount; i++) {
        const m = MOTES[i];
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.r);
        ctx.fillStyle = m.red ? 'rgba(200,36,36,0.75)' : 'rgba(242,238,229,0.5)';
        ctx.beginPath();
        ctx.ellipse(0, 0, m.sz, m.sz * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (flashA > 0.01) {
      ctx.fillStyle = flashCol;
      ctx.globalAlpha = flashA;
      ctx.fillRect(-320, -240, VW + 640, VH + 480);
      ctx.globalAlpha = 1;
    }

    if (settings.grain && !isLowFx()) {
      if (!grainPattern) grainPattern = ctx.createPattern(grainCanvas, 'repeat');
      ctx.save();
      ctx.globalAlpha = 0.19;
      const gx = -Math.floor(Math.random() * 128);
      const gy = -Math.floor(Math.random() * 128);
      ctx.translate(gx, gy);
      ctx.fillStyle = grainPattern;
      ctx.fillRect(-gx - 320, -gy - 240, VW + 640, VH + 480);
      ctx.restore();
    }

    const vg = ctx.createRadialGradient(VW * 0.5, VH * 0.5, VW * 0.3, VW * 0.5, VH * 0.5, VW * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(-320, -240, VW + 640, VH + 480);

    drawHud();
    ctx.restore();

    if (settings.letterbox || state === 'ULT') {
      const bar = Math.round((state === 'ULT' ? 54 : 18) * (cv.height / VH));
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, cv.width, bar);
      ctx.fillRect(0, cv.height - bar, cv.width, bar);
    }
  }

  /* ==================== INPUT READERS & MAIN LOOP ==================== */
  function readP1() {
    const solo = mode !== 'local2p';
    const o = {
      l: Boolean(K.KeyA || (solo && K.ArrowLeft) || touchState.axis < -0.15),
      r: Boolean(K.KeyD || (solo && K.ArrowRight) || touchState.axis > 0.15),
      guard: Boolean((solo ? K.KeyK || K.KeyX || mouseGuard : K.KeyG) || touchState.guard),
      jump: P1B.jump > 0,
      atk: P1B.atk > 0,
      dash: P1B.dash > 0,
      parryTap: P1B.parry > 0,
      q: P1B.q > 0,
      e: P1B.e > 0,
      rSkill: P1B.rSkill > 0,
    };
    for (const k in P1B) P1B[k] = 0;
    return o;
  }

  function readP2Local() {
    const o = {
      l: Boolean(K.ArrowLeft),
      r: Boolean(K.ArrowRight),
      guard: Boolean(K.KeyK || K.Digit2 || K.Numpad2),
      jump: P2B.jump > 0,
      atk: P2B.atk > 0,
      dash: P2B.dash > 0,
      parryTap: P2B.parry > 0,
      q: P2B.q > 0,
      e: P2B.e > 0,
      rSkill: P2B.rSkill > 0,
    };
    for (const k in P2B) P2B[k] = 0;
    return o;
  }

  function clearInputs() {
    for (const k in K) K[k] = false;
    for (const k in P1B) P1B[k] = 0;
    for (const k in P2B) P2B[k] = 0;
    touchState.axis = 0;
    touchState.guard = false;
    mouseGuard = false;
  }

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (!lastTs) lastTs = now;
    const rawDt = (now - lastTs) / 1000;
    lastTs = now;
    const rdt = clamp(rawDt, 0.001, 0.033);

    fpsFrames++;
    fpsAccum += rawDt;
    if (fpsAccum >= 0.5) {
      currentFps = Math.round(fpsFrames / fpsAccum);
      fpsFrames = 0;
      fpsAccum = 0;
    }

    if (banner.t > 0) banner.t = Math.max(0, banner.t - rdt);

    if (state === 'MENU' || state === 'SCROLL') {
      tTime += rdt;
      camX = Math.sin(tTime * 0.28) * 32;
      camZoom = 1.04;
      MENU_P1.weaponIdx = menuWeaponIdx;
      MENU_P1.weapon = WEAPONS[menuWeaponIdx].id;
      updatePoseAndScarf(MENU_P1, rdt);
      updatePoseAndScarf(MENU_P2, rdt);
      updateWorldObjects(rdt);
      render();
      emitHudCallbacks(now);
      return;
    }

    if (state === 'PAUSED' || state === 'VICTORY' || state === 'GAMEOVER') {
      render();
      emitHudCallbacks(now);
      return;
    }

    if (invT > 0) invT -= rdt;
    if (flashA > 0) flashA = Math.max(0, flashA - rdt * 2.5);
    if (shakeAmp > 0.2) {
      shakeAmp *= Math.pow(0.0014, rdt);
      shakeX = (Math.random() * 2 - 1) * shakeAmp;
      shakeY = (Math.random() * 2 - 1) * shakeAmp;
    } else {
      shakeAmp = shakeX = shakeY = 0;
    }

    if (state === 'BANNER') {
      tTime += rdt;
      updateWorldObjects(rdt);
      fighters.forEach((f) => updatePoseAndScarf(f, rdt));
      if (banner.t <= 0) {
        state = 'PLAYING';
        if (mode === 'story' || mode === 'endless') spawnWaveEnemies();
      }
      render();
      emitHudCallbacks(now);
      return;
    }

    if (state === 'ULT') {
      tTime += rdt;
      tickUltimate(rdt);
      updateWorldObjects(rdt);
      camZoom = lerp(camZoom, targetZoom, clamp(rdt * 6, 0, 1));
      render();
      emitHudCallbacks(now);
      return;
    }

    if (hitstop > 0) {
      hitstop -= rdt;
      render();
      return;
    }

    let scale = 1;
    if (slowT > 0) {
      slowT -= rdt;
      scale = 0.28;
      if (slowT <= 0) targetZoom = 1;
    }
    const dt = rdt * scale;
    tTime += dt;
    if (flowT > 0 && (flowT -= rdt) <= 0) {
      combo = 0;
      flow = Math.max(0, flow - 20 * rdt);
    }

    if (mode === 'online') {
      const myF = getMyFighter();
      const opF = getRemoteFighter();
      if (myF) stepFighter(myF, readP1(), dt);
      if (opF) updateRemoteFighter(opF, dt);
      if (roundEndT > 0) {
        roundEndT -= rdt;
        if (roundEndT <= 0 && !matchEnded && netState.role === 'host') {
          roundNum++;
          KuroNet.sendReliable(['rnd_next', roundNum, rounds[0], rounds[1]]);
          setupOnlineRound();
        }
      }
    } else if (mode === 'local2p') {
      if (fighters[0]) stepFighter(fighters[0], readP1(), dt);
      if (fighters[1]) stepFighter(fighters[1], readP2Local(), dt);
      const p1 = fighters[0];
      const p2 = fighters[1];
      if ((p1.dead || p2.dead) && (roundEndT += rdt) >= 1.35) {
        if (p2.dead) rounds[0]++;
        else rounds[1]++;
        if (rounds[0] >= 2 || rounds[1] >= 2) {
          matchEnded = true;
          state = 'VICTORY';
          const p1W = rounds[0] >= 2;
          if (callbacks.onResult) {
            callbacks.onResult({
              mode: 'local2p',
              win: true,
              title: p1W ? 'P1 WINS' : 'P2 WINS',
              sub: `Best of 3 • P1 ${rounds[0]} — ${rounds[1]} P2`,
              canRematch: true,
              stats: [
                ['P1 Rounds', String(rounds[0])],
                ['P2 Rounds', String(rounds[1])],
              ],
            });
          }
        } else {
          roundNum++;
          setupLocal2PRound();
        }
      }
    } else {
      if (fighters[0]) stepFighter(fighters[0], readP1(), dt);
      for (let i = fighters.length - 1; i >= 1; i--) {
        const e = fighters[i];
        stepFighter(e, computeAI(e, dt), dt);
        if (e.dead && e.deadT <= 0) fighters.splice(i, 1);
      }
      if (fighters[0] && fighters[0].dead) {
        finishSoloRun(false);
      } else if (fighters.length === 1 && (clearDelay += rdt) >= 1.15) {
        clearDelay = 0;
        if (mode === 'story' && wave + 1 >= STORY_WAVES.length) finishSoloRun(true);
        else openScrollPicker();
      }
    }

    updateWorldObjects(dt);

    if (fighters.length >= 2) {
      const f0 = fighters[0];
      const near = fighters.slice(1).reduce((b, o) => (Math.abs(o.x - f0.x) < Math.abs(b.x - f0.x) ? o : b), fighters[1]);
      camX = lerp(camX, clamp(lerp(f0.x, near.x, mode === 'story' || mode === 'endless' ? 0.3 : 0.5), LEFT_B + 460, RIGHT_B - 460), clamp(rdt * 6.5, 0, 1));
    } else if (fighters[0]) {
      camX = lerp(camX, clamp(fighters[0].x, LEFT_B + 460, RIGHT_B - 460), clamp(rdt * 6, 0, 1));
    }
    camZoom = lerp(camZoom, targetZoom, clamp(rdt * 5.5, 0, 1));

    render();
    emitHudCallbacks(now);
  }

  function emitHudCallbacks(now) {
    if (mode !== 'menu' && now - lastSkillEmit > 100) {
      lastSkillEmit = now;
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
    if (now - lastTeleEmit > 500) {
      lastTeleEmit = now;
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

  function resizeCanvas() {
    if (!cv || !ctx) return;
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(global.devicePixelRatio || 1, isLowFx() ? 1.4 : 2.0);
    cv.width = Math.max(2, Math.floor(rect.width * dpr));
    cv.height = Math.max(2, Math.floor(rect.height * dpr));
    const sx = cv.width / VW;
    const sy = cv.height / VH;
    vScale = Math.max(Math.min(sx, sy), Math.max(sx, sy) * 0.78);
    vOx = (cv.width - VW * vScale) * 0.5;
    vOy = (cv.height - VH * vScale) * 0.5;
  }

  /* ==================== PUBLIC API ==================== */
  const KuroGame = {
    WEAPONS,
    STAGES,
    SCROLLS,
    IS_TOUCH,

    init(canvasEl, cbs) {
      cv = canvasEl;
      ctx = cv.getContext('2d', { alpha: false });
      callbacks = cbs || {};
      resizeCanvas();
      setupMenuBackdrop();

      global.addEventListener('resize', resizeCanvas);
      global.addEventListener('blur', clearInputs);
      global.addEventListener('touchstart', () => { lastTouchAt = performance.now(); }, { passive: true });

      // PC Mouse Combat: Left-Click Slash, Right-Click Guard & Perfect Parry
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('mousedown', (e) => {
        if (performance.now() - lastTouchAt < 450) return;
        if (state !== 'PLAYING' || mode === 'menu' || mode === 'local2p') return;
        SFX.init();
        if (e.button === 0) {
          P1B.atk = 1;
        } else if (e.button === 2) {
          mouseGuard = true;
          P1B.parry = 1;
        }
      });
      global.addEventListener('mouseup', (e) => {
        if (e.button === 2) mouseGuard = false;
      });

      // Keyboard Controls
      global.addEventListener('keydown', (e) => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        const c = e.code;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
        if (e.repeat) return;
        SFX.init();
        K[c] = true;

        if (c === 'Escape' || c === 'KeyP') {
          if (mode !== 'menu' && mode !== 'online' && !matchEnded && state !== 'SCROLL') {
            KuroGame.togglePause();
          }
          return;
        }
        if (mode === 'local2p') {
          if (c === 'KeyW') P1B.jump = 1;
          if (c === 'KeyF') P1B.atk = 1;
          if (c === 'KeyG') P1B.parry = 1;
          if (c === 'KeyH') P1B.dash = 1;
          if (c === 'KeyR') P1B.q = 1;
          if (c === 'KeyT') P1B.e = 1;
          if (c === 'KeyY') P1B.rSkill = 1;
          if (c === 'ArrowUp') P2B.jump = 1;
          if (c === 'KeyJ' || c === 'Digit1' || c === 'Numpad1') P2B.atk = 1;
          if (c === 'KeyK' || c === 'Digit2' || c === 'Numpad2') P2B.parry = 1;
          if (c === 'KeyL' || c === 'Digit3' || c === 'Numpad3') P2B.dash = 1;
          if (c === 'KeyU' || c === 'Digit4' || c === 'Numpad4') P2B.q = 1;
          if (c === 'KeyI' || c === 'Digit5' || c === 'Numpad5') P2B.e = 1;
          if (c === 'KeyO' || c === 'Digit6' || c === 'Numpad6') P2B.rSkill = 1;
        } else {
          if (c === 'KeyW' || c === 'ArrowUp' || c === 'Space') P1B.jump = 1;
          if (c === 'KeyJ' || c === 'KeyZ' || c === 'KeyF') P1B.atk = 1;
          if (c === 'KeyK' || c === 'KeyX' || c === 'KeyG') P1B.parry = 1;
          if (c === 'KeyL' || c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyC') P1B.dash = 1;
          if (c === 'KeyQ' || c === 'Digit1') P1B.q = 1;
          if (c === 'KeyE' || c === 'Digit2') P1B.e = 1;
          if (c === 'KeyR' || c === 'Digit3') P1B.rSkill = 1;
        }
      });
      global.addEventListener('keyup', (e) => { K[e.code] = false; });

      if (global.KuroNet) KuroNet.on('relay', handleNetRelay);
      if (!rafId) rafId = requestAnimationFrame(loop);
    },

    unlockAudio: () => SFX.init(),
    playMenuDraw: () => { SFX.init(); SFX.play('hover'); },
    loadBest,

    setWeapon(idx) {
      menuWeaponIdx = clamp(idx, 0, WEAPONS.length - 1);
      MENU_P1.weaponIdx = menuWeaponIdx;
      MENU_P1.weapon = WEAPONS[menuWeaponIdx].id;
    },

    setStage(idx) {
      selectedStageIdx = clamp(idx, 0, STAGES.length - 1);
    },

    updateSettings(patch) {
      Object.assign(settings, patch || {});
      SFX.setVolume(settings.volume);
      resizeCanvas();
    },

    getSettings() {
      return { ...settings };
    },

    startStory() {
      SFX.init();
      mode = 'story';
      matchEnded = false;
      netState.active = false;
      wave = 0; score = 0; kills = 0; combo = 0; flow = 0; maxFlow = 'D'; parries = 0; clearDelay = 0;
      fighters = [makeFighter({ id: 1, team: 1, role: 'player', name: 'KUROKAZE', weaponIdx: menuWeaponIdx, x: -240, f: 1, scarfCol: '#c82424' })];
      if (callbacks.onModeChange) callbacks.onModeChange('story');
      beginSoloWave(0);
    },

    startEndless() {
      SFX.init();
      mode = 'endless';
      matchEnded = false;
      netState.active = false;
      wave = 0; score = 0; kills = 0; combo = 0; flow = 0; maxFlow = 'D'; parries = 0; clearDelay = 0;
      fighters = [makeFighter({ id: 1, team: 1, role: 'player', name: 'KUROKAZE', weaponIdx: menuWeaponIdx, x: -240, f: 1, scarfCol: '#c82424' })];
      if (callbacks.onModeChange) callbacks.onModeChange('endless');
      beginSoloWave(0);
    },

    startLocal2P() {
      SFX.init();
      mode = 'local2p';
      matchEnded = false;
      netState.active = false;
      stageIdx = selectedStageIdx;
      rounds = [0, 0];
      roundNum = 1;
      if (callbacks.onModeChange) callbacks.onModeChange('local2p');
      setupLocal2PRound();
    },

    startOnline(cfg) {
      SFX.init();
      mode = 'online';
      matchEnded = false;
      netState.active = true;
      netState.role = cfg.role === 'guest' ? 'guest' : 'host';
      netState.p1Weapon = clamp(cfg.p1Weapon || 0, 0, WEAPONS.length - 1);
      netState.p2Weapon = clamp(cfg.p2Weapon || 0, 0, WEAPONS.length - 1);
      netState.stageIdx = clamp(cfg.stageIdx || 0, 0, STAGES.length - 1);
      rounds = [0, 0];
      roundNum = 1;
      if (callbacks.onModeChange) callbacks.onModeChange('online');
      setupOnlineRound();
    },

    requestRematch() {
      if (mode === 'story') KuroGame.startStory();
      else if (mode === 'endless') KuroGame.startEndless();
      else if (mode === 'local2p') KuroGame.startLocal2P();
      else if (mode === 'online') {
        roundNum = 1;
        rounds = [0, 0];
        matchEnded = false;
        KuroNet.sendReliable(['rm']);
        setupOnlineRound();
      }
    },

    applyScroll(scrollId) {
      const p1 = fighters[0];
      if (p1) {
        p1.perks.add(scrollId);
        if (scrollId === 'iron') p1.maxPos = 145;
      }
      SFX.play('parry');
      beginSoloWave(wave + 1);
    },

    togglePause(force) {
      if (mode === 'menu' || mode === 'online') return;
      const next = force !== undefined ? Boolean(force) : state !== 'PAUSED';
      state = next ? 'PAUSED' : 'PLAYING';
      if (callbacks.onPauseChange) callbacks.onPauseChange(next);
    },

    returnToMenu() {
      clearInputs();
      setupMenuBackdrop();
    },

    setTouchAxis(val) {
      touchState.axis = clamp(val, -1, 1);
    },

    setTouchButton(name, down) {
      SFX.init();
      if (name === 'guard') {
        if (down && !touchState.guard) P1B.parry = 1;
        touchState.guard = Boolean(down);
        return;
      }
      if (!down) return;
      if (name === 'jump') P1B.jump = 1;
      else if (name === 'slash') P1B.atk = 1;
      else if (name === 'dash') P1B.dash = 1;
      else if (name === 'q') P1B.q = 1;
      else if (name === 'e') P1B.e = 1;
      else if (name === 'r') P1B.rSkill = 1;
    },
  };

  global.KuroGame = KuroGame;
})(window);