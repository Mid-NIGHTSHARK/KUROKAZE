/* KUROKAZE IV — Procedural Audio (Pitch-Varied), Severing Physics, Dust & Counter-Hit FX (v2)
 * Loaded after controls.js & weapons.js, and before render.js & game.js.
 */
(function (global) {
  'use strict';

  const VW = 1280;
  const VH = 720;
  const GROUND = 582;
  const LEFT_B = -640;
  const RIGHT_B = 640;
  const GRAV = 1950;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const jit = (base, spread = 0.1) => base * (1 + (Math.random() * 2 - 1) * spread);

  /* ==================== PROCEDURAL WEB AUDIO (PITCH-VARIED) ==================== */
  const SFX = {
    ctx: null,
    master: null,
    noise: null,
    vol: 0.7,
    muted: false,

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
        this.master.gain.value = this.muted ? 0 : this.vol;
        this.master.connect(this.ctx.destination);
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch {}
    },

    syncGain() {
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol, this.ctx.currentTime, 0.03);
      }
    },

    setVolume(v) {
      this.vol = clamp(Number(v) || 0, 0, 1);
      this.syncGain();
    },

    setMuted(m) {
      this.muted = Boolean(m);
      this.syncGain();
    },

    tone(f0, f1, d, v, type = 'sine', del = 0) {
      const t = this.ctx.currentTime + del;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + d + 0.02);
    },

    burst(f0, f1, d, v, ft = 'bandpass', q = 1.6, del = 0) {
      const t = this.ctx.currentTime + del;
      const s = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      s.buffer = this.noise;
      f.type = ft;
      f.Q.value = q;
      f.frequency.setValueAtTime(Math.max(60, f0), t);
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
      if (!this.ctx || this.muted || this.vol <= 0.001) return;
      try {
        if (k === 'hover') {
          this.tone(jit(2900, 0.05), jit(1850, 0.05), 0.06, 0.06);
          this.burst(jit(4200, 0.06), 1800, 0.04, 0.04, 'highpass');
        } else if (k === 'swing') {
          this.burst(jit(2600, 0.12), jit(520, 0.12), jit(0.115, 0.08), 0.22, 'bandpass', jit(1.6, 0.1));
          this.tone(jit(420, 0.1), jit(140, 0.1), 0.08, 0.06, 'triangle');
        } else if (k === 'heavy') {
          this.burst(jit(1480, 0.1), jit(215, 0.1), jit(0.21, 0.07), 0.34, 'bandpass', jit(1.4, 0.1));
          this.tone(jit(185, 0.08), jit(58, 0.08), 0.18, 0.16, 'triangle');
        } else if (k === 'pole') {
          this.burst(jit(2150, 0.11), jit(420, 0.11), jit(0.155, 0.08), 0.26, 'bandpass', jit(2.4, 0.1));
        } else if (k === 'hit') {
          this.tone(jit(148, 0.11), jit(36, 0.09), 0.12, 0.42, 'triangle');
          this.burst(jit(2250, 0.12), jit(880, 0.12), 0.08, 0.2, 'highpass');
        } else if (k === 'heavyHit') {
          this.tone(jit(175, 0.09), jit(28, 0.08), 0.22, 0.6, 'triangle');
          this.burst(jit(1800, 0.1), jit(420, 0.1), 0.14, 0.32, 'highpass');
        } else if (k === 'counter') {
          // Crisp counter-hit steel snap + low chest punch
          this.tone(jit(2180, 0.06), jit(3240, 0.06), 0.24, 0.24, 'sine');
          this.tone(jit(1320, 0.06), jit(680, 0.06), 0.22, 0.18, 'triangle');
          this.tone(jit(160, 0.08), 32, 0.26, 0.64, 'triangle');
          this.burst(jit(3400, 0.1), 920, 0.11, 0.28, 'highpass');
        } else if (k === 'guard') {
          this.tone(jit(760, 0.1), jit(620, 0.1), 0.11, 0.16, 'square');
          this.tone(jit(1280, 0.1), jit(1020, 0.1), 0.1, 0.1, 'triangle');
        } else if (k === 'parry') {
          const p = jit(1, 0.035);
          [1568, 2349, 3520, 4698].forEach((f, i) =>
            this.tone(f * p, f * p * 0.985, 0.6, 0.22 / (i * 0.7 + 1))
          );
          this.tone(115, 38, 0.4, 0.58);
        } else if (k === 'clash') {
          const p = jit(1, 0.05);
          this.tone(1980 * p, 1420 * p, 0.45, 0.26, 'triangle');
          this.tone(3120 * p, 2280 * p, 0.36, 0.18, 'sine');
          this.burst(jit(3800, 0.08), 1400, 0.14, 0.24, 'bandpass', 3.0);
        } else if (k === 'glint') {
          this.tone(jit(2150, 0.05), jit(3450, 0.05), 0.12, 0.14);
        } else if (k === 'dash') {
          this.burst(jit(980, 0.12), jit(220, 0.12), 0.14, 0.24);
        } else if (k === 'land') {
          this.tone(jit(96, 0.12), 34, 0.09, 0.2, 'sine');
          this.burst(jit(520, 0.12), 160, 0.08, 0.14, 'lowpass', 0.9);
        } else if (k === 'step') {
          this.burst(jit(820, 0.14), 260, 0.035, 0.045, 'bandpass', 1.2);
        } else if (k === 'taiko') {
          this.tone(118, 38, 0.48, 0.68);
          this.burst(340, 90, 0.22, 0.18, 'lowpass');
        } else if (k === 'standoff') {
          this.tone(86, 42, 0.24, 0.48);
          this.tone(86, 38, 0.28, 0.32, 'sine', 0.26);
        } else if (k === 'kunai') {
          this.tone(jit(1950, 0.1), jit(760, 0.1), 0.08, 0.14, 'triangle');
        } else if (k === 'gun') {
          this.burst(jit(3600, 0.08), 280, 0.18, 0.48, 'lowpass', 0.8);
          this.tone(jit(240, 0.08), 48, 0.14, 0.45, 'sawtooth');
        } else if (k === 'wave') {
          this.burst(jit(1900, 0.09), 300, 0.22, 0.3);
          this.tone(jit(360, 0.08), 90, 0.3, 0.18, 'sawtooth');
        } else if (k === 'sheathe') {
          this.tone(jit(3900, 0.04), 2600, 0.24, 0.24);
          this.tone(jit(940, 0.05), 220, 0.07, 0.2, 'square', 0.04);
        } else if (k === 'ultCut') {
          this.tone(1500 + Math.random() * 1400, 320, 0.08, 0.12, 'sawtooth');
        } else if (k === 'ultBoom') {
          this.tone(95, 22, 0.9, 0.78);
          this.burst(1900, 140, 0.82, 0.46, 'lowpass');
        } else if (k === 'exec') {
          this.tone(120, 24, 0.5, 0.75);
          this.tone(2800, 920, 0.35, 0.25);
          this.burst(2800, 320, 0.22, 0.36);
        } else if (k === 'sever') {
          this.burst(jit(3200, 0.09), 480, 0.18, 0.36, 'bandpass', 1.4);
          this.tone(jit(210, 0.08), 34, 0.28, 0.5, 'triangle');
          this.burst(900, 180, 0.24, 0.24, 'lowpass', 1.0, 0.05);
        } else if (k === 'bamboo') {
          this.tone(jit(680, 0.12), jit(240, 0.12), 0.09, 0.16, 'triangle');
          this.burst(jit(2400, 0.1), 900, 0.06, 0.14, 'bandpass', 2.6);
        } else if (k === 'thunder') {
          this.burst(jit(4200, 0.08), 340, 0.26, 0.34, 'bandpass', 1.2);
          this.tone(180, 44, 0.28, 0.38, 'sawtooth');
        } else if (k === 'lightning') {
          this.burst(520, 70, 0.85, 0.24, 'lowpass', 0.7);
          this.tone(72, 26, 0.75, 0.28, 'sine');
        }
      } catch {}
    },
  };

  function vibe(ms) {
    try {
      const touch = global.KuroControls ? global.KuroControls.IS_TOUCH : 'ontouchstart' in global;
      if (touch && navigator.vibrate) navigator.vibrate(ms);
    } catch {}
  }

  /* ==================== STAGE PROPS & LIVE VFX STATE ==================== */
  let lowFx = Boolean(global.KuroControls && global.KuroControls.IS_TOUCH);

  function buildBamboo() {
    return Array.from({ length: 24 }, (_, i) => ({
      x: -860 + i * 74 + rand(-18, 18),
      w: rand(5, 10),
      d: i % 3 === 0 ? 0.52 : 0.76,
      ph: rand(0, 6.28),
      lean: rand(-0.07, 0.07),
      sliced: false,
      cutY: GROUND - 110,
      topX: 0,
      topY: 0,
      topVx: 0,
      topVy: 0,
      topAng: 0,
      topVang: 0,
      topLife: 0,
    }));
  }

  const state = {
    slashes: [],
    parts: [],
    stains: [],
    ghosts: [],
    texts: [],
    ripples: [],
    severed: [],
    hats: [],
    planted: [],
    bamboo: buildBamboo(),
    motes: Array.from({ length: 34 }, () => ({
      x: rand(0, VW),
      y: rand(0, VH),
      vx: rand(-62, -16),
      vy: rand(22, 60),
      r: rand(0, 6.28),
      vr: rand(-3, 3),
      sz: rand(2.8, 6),
      red: Math.random() < 0.35,
    })),
    fog: Array.from({ length: 8 }, (_, i) => ({
      x: -900 + i * 255,
      y: GROUND - 38 + rand(-30, 14),
      rx: rand(160, 260),
      ry: rand(24, 44),
      spd: rand(14, 26),
    })),
    splashes: Array.from({ length: 16 }, () => ({
      x: rand(LEFT_B, RIGHT_B),
      ph: rand(0, 1),
    })),
  };

  const screen = {
    hitstop: 0,
    slowT: 0,
    slowScale: 0.28,
    invT: 0,
    flashA: 0,
    flashCol: '#f2eee5',
    shakeAmp: 0,
    shakeX: 0,
    shakeY: 0,
    targetZoom: 1,
    lightningA: 0,
    nextLightning: rand(5.5, 11.5),
  };

  /* ==================== LANDING DUST & COUNTER-HIT BURSTS ==================== */
  function spawnLandDust(x, intensity = 1, dir = 0) {
    const cap = lowFx ? 95 : 230;
    const count = lowFx ? Math.max(3, Math.round(4 * intensity)) : Math.round(7 * intensity);
    for (let i = 0; i < count; i++) {
      if (state.parts.length >= cap) state.parts.shift();
      const side = dir !== 0 ? -dir : (i % 2 === 0 ? -1 : 1);
      const spd = rand(55, 165) * intensity;
      state.parts.push({
        k: 'dust',
        x: x + rand(-14, 14),
        y: GROUND - rand(2, 7),
        vx: side * spd + (dir ? rand(-25, 25) : 0),
        vy: -rand(16, 52) * intensity,
        r: rand(5, 9) * intensity,
        mr: rand(18, 30) * intensity,
        l: rand(0.26, 0.44),
        ml: 0.44,
        c: 'rgba(242,238,229,0.28)',
      });
    }
  }

  function spawnCounterBurst(x, y, dir) {
    SFX.play('counter');
    vibe(28);
    screen.hitstop = Math.max(screen.hitstop, 0.085);
    screen.shakeAmp = Math.max(screen.shakeAmp, 15);
    screen.shakeX += (dir || 1) * 12;
    screen.flashA = Math.max(screen.flashA, 0.26);
    screen.flashCol = '#c82424';

    state.parts.push({
      k: 'flashStar',
      x,
      y,
      r: 72,
      ang: rand(-0.35, 0.35),
      c: '#e03131',
      l: 0.22,
      ml: 0.22,
    });
    state.parts.push({
      k: 'ring',
      x,
      y,
      r: 10,
      mr: 128,
      l: 0.26,
      ml: 0.26,
      c: '#e03131',
      lw: 6,
    });
    applyEvent({ k: 'sparks', x, y, dir: dir || 1, n: 20, redP: 0.65 });
    state.texts.push({
      x,
      y: y - 56,
      txt: 'COUNTER!',
      c: '#e03131',
      sc: 1.28,
      vy: -88,
      l: 0.9,
      ml: 0.9,
    });
  }

  /* ==================== SEVERING, HATS, PLANTED SWORDS & BAMBOO ==================== */
  function spawnHat(x, y, hat, dir, scale, highLaunch) {
    if (!hat || hat === 'band') return;
    if (state.hats.length > 10) state.hats.shift();
    state.hats.push({
      x,
      y,
      vx: dir * rand(120, 260),
      vy: highLaunch ? -rand(560, 740) : -rand(320, 480),
      ang: rand(-0.2, 0.2),
      vang: dir * rand(6, 12),
      hat,
      scale: scale || 1,
      bounced: 0,
      l: 7.5,
      ml: 7.5,
    });
  }

  function spawnPlantedWeapon(x, y, weapon, role, dir, scale) {
    if (state.planted.length > 10) state.planted.shift();
    state.planted.push({
      x,
      y,
      vx: dir * rand(140, 290),
      vy: -rand(420, 620),
      ang: rand(-0.4, 0.4),
      vang: dir * rand(10, 16),
      weapon: weapon || 'katana',
      role: role || 'ronin',
      scale: scale || 1,
      stuck: false,
      stuckAng: dir * rand(0.12, 0.32),
      wobble: 0,
      l: 9.0,
      ml: 9.0,
    });
  }

  function spawnInkBurst(x, y, dir, n, big) {
    const cap = lowFx ? 95 : 230;
    const count = lowFx ? Math.max(4, Math.round(n * 0.58)) : n;
    for (let i = 0; i < count; i++) {
      if (state.parts.length >= cap) state.parts.shift();
      const a = (dir >= 0 ? -0.35 : Math.PI + 0.35) + rand(-1.25, 1.25);
      const sp = rand(140, big ? 700 : 450);
      state.parts.push({
        k: 'ink',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - rand(60, 230),
        l: rand(0.28, 0.65),
        ml: 0.65,
        sz: rand(3, big ? 11.5 : 8),
        c: Math.random() < (big ? 0.42 : 0.2) ? '#c82424' : Math.random() < 0.78 ? '#08080a' : '#f2eee5',
      });
    }
    if (state.stains.length > 28) state.stains.shift();
    state.stains.push({
      x: x + rand(-22, 22),
      w: rand(26, big ? 84 : 46),
      h: rand(4, 9),
      red: Boolean(big),
      l: 10,
    });
  }

  function pushSeverPiece(piece) {
    if (state.severed.length > 24) state.severed.shift();
    state.severed.push({
      bounced: 0,
      delay: 0,
      burstDone: true,
      l: 7.5,
      ml: 7.5,
      ...piece,
    });
  }

  /**
   * Breaks a defeated fighter into attack-driven articulated ink pieces.
   * cutType: 'legs' | 'high' | 'waist' | 'arm' | 'cleave'
   */
  function spawnSever(info) {
    const x = Number(info.x) || 0;
    const y = Number(info.y) || GROUND;
    const f = info.f || 1;
    const dir = info.dir || f;
    const s = info.scale || 1;
    const cut = info.cutType || 'waist';
    const hat = info.hat || 'kasa';
    const weapon = info.weapon || 'katana';
    const role = info.role || 'ronin';
    const scarfCol = info.scarfCol || '#c82424';

    SFX.play('sever');

    if (cut === 'legs') {
      pushSeverPiece({
        part: 'lowerLegs',
        x,
        y,
        vx: 0,
        vy: 0,
        ang: 0,
        vang: 0,
        f,
        s,
        scarfCol,
        delay: 0.34,
        slideVx: -dir * 45,
        slideVy: -60,
        slideVang: -dir * 3.8,
        burstDone: false,
      });
      pushSeverPiece({
        part: 'upperFull',
        x,
        y: y - 34 * s,
        vx: dir * 240,
        vy: -310,
        ang: 0,
        vang: dir * 6.5,
        f,
        s,
        scarfCol,
      });
      spawnHat(x, y - 96 * s, hat, dir, s, false);
      spawnPlantedWeapon(x + f * 24, y - 54 * s, weapon, role, dir, s);
      spawnInkBurst(x, y - 28 * s, dir, 22, true);
      state.parts.push({ k: 'cut', x1: x - 90, y1: y - 24 * s, x2: x + 90, y2: y - 30 * s, c: '#e03131', w: 10, l: 0.48, ml: 0.48 });
      return;
    }

    if (cut === 'high') {
      spawnHat(x, y - 102 * s, hat, dir, s, true);
      pushSeverPiece({
        part: 'headCrest',
        x,
        y: y - 92 * s,
        vx: dir * 260,
        vy: -460,
        ang: 0,
        vang: dir * 11,
        f,
        s,
        scarfCol,
      });
      pushSeverPiece({
        part: 'headlessBody',
        x,
        y,
        vx: dir * 55,
        vy: 0,
        ang: 0,
        vang: 0,
        f,
        s,
        scarfCol,
        delay: 0.2,
        slideVx: dir * 95,
        slideVy: -90,
        slideVang: dir * 3.2,
        burstDone: false,
      });
      spawnPlantedWeapon(x + f * 18, y - 58 * s, weapon, role, -dir, s);
      spawnInkBurst(x, y - 88 * s, dir, 20, true);
      state.parts.push({ k: 'cut', x1: x - 85, y1: y - 82 * s, x2: x + 85, y2: y - 102 * s, c: '#e03131', w: 11, l: 0.48, ml: 0.48 });
      return;
    }

    if (cut === 'arm') {
      pushSeverPiece({
        part: 'arm',
        x: x + f * 18 * s,
        y: y - 64 * s,
        vx: dir * 320,
        vy: -360,
        ang: 0,
        vang: dir * 13,
        f,
        s,
        scarfCol,
      });
      pushSeverPiece({
        part: 'armlessBody',
        x,
        y,
        vx: dir * 210,
        vy: -170,
        ang: 0,
        vang: dir * 4.4,
        f,
        s,
        scarfCol,
      });
      spawnPlantedWeapon(x + f * 28 * s, y - 62 * s, weapon, role, dir, s);
      spawnHat(x, y - 96 * s, hat, -dir, s, false);
      spawnInkBurst(x + f * 14 * s, y - 64 * s, dir, 18, true);
      state.parts.push({ k: 'cut', x1: x - 68, y1: y - 86 * s, x2: x + 68, y2: y - 42 * s, c: '#e03131', w: 9, l: 0.42, ml: 0.42 });
      return;
    }

    if (cut === 'cleave') {
      pushSeverPiece({
        part: 'lowerBody',
        x,
        y,
        vx: -dir * 90,
        vy: -120,
        ang: 0,
        vang: -dir * 4.5,
        f,
        s,
        scarfCol,
      });
      pushSeverPiece({
        part: 'upperTorso',
        x,
        y: y - 54 * s,
        vx: dir * 340,
        vy: -360,
        ang: 0,
        vang: dir * 7.8,
        f,
        s,
        scarfCol,
      });
      pushSeverPiece({
        part: 'arm',
        x: x + f * 16 * s,
        y: y - 64 * s,
        vx: dir * 420,
        vy: -420,
        ang: 0,
        vang: dir * 15,
        f,
        s,
        scarfCol,
      });
      spawnHat(x, y - 98 * s, hat, dir, s, true);
      spawnPlantedWeapon(x + f * 22 * s, y - 56 * s, weapon, role, dir, s);
      spawnInkBurst(x, y - 56 * s, dir, 30, true);
      state.parts.push({ k: 'cut', x1: x - 120, y1: y - 108 * s, x2: x + 120, y2: y - 12 * s, c: '#e03131', w: 15, l: 0.56, ml: 0.56 });
      return;
    }

    // Default 'waist': Sanjuro 0.22s delayed freeze before upper torso slides off
    pushSeverPiece({
      part: 'lowerBody',
      x,
      y,
      vx: 0,
      vy: 0,
      ang: 0,
      vang: 0,
      f,
      s,
      scarfCol,
      delay: 0.42,
      slideVx: -dir * 40,
      slideVy: -45,
      slideVang: -dir * 2.8,
      burstDone: true,
    });
    pushSeverPiece({
      part: 'upperTorso',
      x,
      y: y - 52 * s,
      vx: 0,
      vy: 0,
      ang: 0,
      vang: 0,
      f,
      s,
      scarfCol,
      delay: 0.22,
      slideVx: dir * 235,
      slideVy: -225,
      slideVang: dir * 5.2,
      burstDone: false,
      burstDir: dir,
    });
    spawnHat(x, y - 98 * s, hat, dir, s, false);
    spawnPlantedWeapon(x + f * 22 * s, y - 54 * s, weapon, role, dir, s);
    state.parts.push({ k: 'cut', x1: x - 115, y1: y - 58 * s, x2: x + 115, y2: y - 48 * s, c: '#f2eee5', w: 12, l: 0.45, ml: 0.45 });
    state.parts.push({ k: 'cut', x1: x - 105, y1: y - 55 * s, x2: x + 105, y2: y - 47 * s, c: '#e03131', w: 5, l: 0.55, ml: 0.55 });
  }

  function sliceBambooAt(worldX, cutY, reach, dir, stageId) {
    if (stageId !== 'bamboo') return;
    const minX = Math.min(worldX, worldX + dir * reach) - 24;
    const maxX = Math.max(worldX, worldX + dir * reach) + 24;
    let slicedAny = false;

    for (const b of state.bamboo) {
      if (b.sliced || b.d < 0.6) continue;
      if (b.x >= minX && b.x <= maxX) {
        b.sliced = true;
        b.cutY = clamp(cutY || GROUND - 86, GROUND - 165, GROUND - 42);
        b.topX = b.x;
        b.topY = b.cutY;
        b.topVx = dir * rand(120, 210);
        b.topVy = -rand(70, 140);
        b.topAng = 0;
        b.topVang = dir * rand(1.4, 2.8);
        b.topLife = 2.6;
        slicedAny = true;
      }
    }

    if (slicedAny) {
      SFX.play('bamboo');
      spawnInkBurst(worldX + dir * (reach * 0.5), cutY || GROUND - 80, dir, 5, false);
    }
  }

  function spawnStepRipple(x, stageId) {
    SFX.play('step');
    if (stageId !== 'bamboo' && stageId !== 'bridge') return;
    if (state.ripples.length > (lowFx ? 10 : 20)) state.ripples.shift();
    state.ripples.push({ x, r: 4, mr: rand(22, 34), l: 0.34, ml: 0.34 });
  }

  function spawnBladeScrape(x, dir) {
    applyEvent({ k: 'sparks', x, y: GROUND - 2, dir: -dir, n: 6, redP: 0.45 });
  }

  /* ==================== UNIFIED EVENT APPLIER ==================== */
  function applyEvent(ev) {
    if (!ev) return;
    if (ev.sfx) SFX.play(ev.sfx);
    if (ev.vibe) vibe(ev.vibe);
    if (ev.shake) {
      screen.shakeAmp = Math.max(screen.shakeAmp, ev.shake);
      screen.shakeX += ev.dx || 0;
    }
    if (ev.hitstop) screen.hitstop = Math.max(screen.hitstop, ev.hitstop);
    if (ev.inv) screen.invT = Math.max(screen.invT, ev.inv);
    if (ev.slow) {
      screen.slowT = Math.max(screen.slowT, ev.slow);
      screen.slowScale = ev.slowScale || 0.28;
      screen.targetZoom = ev.zoom || 1.16;
    }
    if (ev.flash) {
      screen.flashA = ev.flashA || 0.5;
      screen.flashCol = ev.flash;
    }

    if (ev.k === 'slash') {
      state.slashes.push({
        x: ev.x,
        y: ev.y,
        f: ev.f,
        r: ev.r,
        a0: ev.a0,
        a1: ev.a1,
        red: ev.red,
        w: ev.w,
        l: 0.19,
        ml: 0.19,
      });
    } else if (ev.k === 'sparks') {
      const cap = lowFx ? 95 : 230;
      const n = lowFx ? Math.max(4, Math.round((ev.n || 12) * 0.6)) : ev.n || 12;
      for (let i = 0; i < n; i++) {
        if (state.parts.length >= cap) state.parts.shift();
        const a = (ev.dir >= 0 ? 0 : Math.PI) + rand(-1.3, 1.3);
        const sp = rand(220, 740);
        state.parts.push({
          k: 'sp',
          x: ev.x,
          y: ev.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - rand(40, 140),
          l: rand(0.15, 0.35),
          ml: 0.35,
          c: Math.random() < (ev.redP || 0.3) ? '#e03131' : '#f2eee5',
        });
      }
    } else if (ev.k === 'ink') {
      spawnInkBurst(ev.x, ev.y, ev.dir || 0, ev.n || 14, Boolean(ev.big));
    } else if (ev.k === 'dust') {
      spawnLandDust(ev.x, ev.intensity || 1, ev.dir || 0);
    } else if (ev.k === 'counter') {
      spawnCounterBurst(ev.x, ev.y, ev.dir || 1);
    } else if (ev.k === 'ring') {
      state.parts.push({
        k: 'ring',
        x: ev.x,
        y: ev.y,
        r: 8,
        mr: ev.mr || 110,
        l: 0.26,
        ml: 0.26,
        c: ev.c || '#f2eee5',
        lw: ev.lw || 5,
      });
    } else if (ev.k === 'cut') {
      state.parts.push({
        k: 'cut',
        x1: ev.x1,
        y1: ev.y1,
        x2: ev.x2,
        y2: ev.y2,
        c: ev.c || '#f2eee5',
        w: ev.w || 10,
        l: ev.l || 0.45,
        ml: ev.l || 0.45,
      });
    } else if (ev.k === 'bolt') {
      state.parts.push({
        k: 'bolt',
        x1: ev.x1,
        y1: ev.y1,
        x2: ev.x2,
        y2: ev.y2,
        l: 0.24,
        ml: 0.24,
      });
    } else if (ev.k === 'txt') {
      state.texts.push({
        x: ev.x,
        y: ev.y,
        txt: ev.txt,
        c: ev.c || '#f2eee5',
        sc: ev.sc || 1,
        vy: -76,
        l: 0.85,
        ml: 0.85,
      });
    } else if (ev.k === 'sever') {
      spawnSever(ev);
    } else if (ev.k === 'bamboo') {
      sliceBambooAt(ev.x, ev.y, ev.reach, ev.dir, 'bamboo');
    }
  }

  function addGhost(sk, hat, red) {
    if (state.ghosts.length > (lowFx ? 12 : 26)) state.ghosts.shift();
    state.ghosts.push({ sk, hat, red: Boolean(red), l: 0.28, ml: 0.28 });
  }

  /* ==================== UPDATE LOOP ==================== */
  function update(rdt, dt, stageId, isMenu) {
    if (screen.invT > 0) screen.invT = Math.max(0, screen.invT - rdt);
    if (screen.flashA > 0) screen.flashA = Math.max(0, screen.flashA - rdt * 2.5);
    if (screen.lightningA > 0) screen.lightningA = Math.max(0, screen.lightningA - rdt * 3.2);

    if (screen.shakeAmp > 0.2) {
      screen.shakeAmp *= Math.pow(0.0014, rdt);
      screen.shakeX = (Math.random() * 2 - 1) * screen.shakeAmp;
      screen.shakeY = (Math.random() * 2 - 1) * screen.shakeAmp;
    } else {
      screen.shakeAmp = screen.shakeX = screen.shakeY = 0;
    }

    if (stageId === 'bridge' && !isMenu) {
      screen.nextLightning -= rdt;
      if (screen.nextLightning <= 0) {
        screen.nextLightning = rand(7.0, 14.0);
        screen.lightningA = 0.85;
        SFX.play('lightning');
      }
    }

    // Particles (sparks, ink, dust puffs, rings, cuts, bolts, counter flashStars)
    for (let i = state.parts.length - 1; i >= 0; i--) {
      const pt = state.parts[i];
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
      } else if (pt.k === 'dust') {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= Math.pow(0.05, dt);
        pt.vy *= Math.pow(0.12, dt);
        pt.r = lerp(pt.r, pt.mr, clamp(dt * 8, 0, 1));
      } else if (pt.k === 'ring') {
        pt.r = lerp(8, pt.mr, 1 - Math.pow(clamp(pt.l / pt.ml, 0, 1), 3));
      }
      if (pt.l <= 0) state.parts.splice(i, 1);
    }

    // Severed body/limb physics
    for (let i = state.severed.length - 1; i >= 0; i--) {
      const sv = state.severed[i];
      sv.l -= dt;
      if (sv.delay > 0) {
        sv.delay -= dt;
        if (sv.delay <= 0) {
          sv.vx = sv.slideVx || 0;
          sv.vy = sv.slideVy || 0;
          sv.vang = sv.slideVang || 0;
          if (!sv.burstDone) {
            sv.burstDone = true;
            spawnInkBurst(sv.x, sv.y, sv.burstDir || sv.f, 22, true);
            SFX.play('sever');
          }
        }
      } else {
        sv.vy += GRAV * dt;
        sv.x = clamp(sv.x + sv.vx * dt, LEFT_B + 20, RIGHT_B - 20);
        sv.y += sv.vy * dt;
        sv.ang += sv.vang * dt;
        if (sv.y >= GROUND - 6) {
          sv.y = GROUND - 6;
          if (sv.bounced < 2 && Math.abs(sv.vy) > 120) {
            sv.vy = -sv.vy * 0.28;
            sv.vx *= 0.55;
            sv.vang *= 0.45;
            sv.bounced++;
          } else {
            sv.vy = 0;
            sv.vx *= Math.pow(0.01, dt);
            sv.vang *= Math.pow(0.01, dt);
          }
        }
      }
      if (sv.l <= 0) state.severed.splice(i, 1);
    }

    // Flying hats
    for (let i = state.hats.length - 1; i >= 0; i--) {
      const h = state.hats[i];
      h.l -= dt;
      h.vy += GRAV * 0.72 * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.ang += h.vang * dt;
      if (h.y >= GROUND - 4) {
        h.y = GROUND - 4;
        if (h.bounced < 2 && Math.abs(h.vy) > 90) {
          h.vy = -h.vy * 0.36;
          h.vx *= 0.62;
          h.vang *= 0.55;
          h.bounced++;
        } else {
          h.vy = 0;
          h.vx *= Math.pow(0.02, dt);
          h.vang *= Math.pow(0.02, dt);
        }
      }
      if (h.l <= 0) state.hats.splice(i, 1);
    }

    // Planted weapons
    for (let i = state.planted.length - 1; i >= 0; i--) {
      const pw = state.planted[i];
      pw.l -= dt;
      if (!pw.stuck) {
        pw.vy += GRAV * dt;
        pw.x = clamp(pw.x + pw.vx * dt, LEFT_B + 32, RIGHT_B - 32);
        pw.y += pw.vy * dt;
        pw.ang += pw.vang * dt;
        if (pw.y >= GROUND) {
          pw.y = GROUND;
          pw.stuck = true;
          pw.ang = pw.stuckAng;
          pw.wobble = 0.26;
          SFX.play('guard');
          applyEvent({ k: 'sparks', x: pw.x, y: GROUND - 2, dir: 0, n: 5, redP: 0.2 });
        }
      } else if (pw.wobble > 0.004) {
        pw.wobble *= Math.pow(0.015, dt);
      }
      if (pw.l <= 0) state.planted.splice(i, 1);
    }

    // Sliced bamboo top halves falling
    for (const b of state.bamboo) {
      if (b.sliced && b.topLife > 0) {
        b.topLife -= dt;
        b.topVy += 680 * dt;
        b.topX += b.topVx * dt;
        b.topY += b.topVy * dt;
        b.topAng += b.topVang * dt;
      }
    }

    // Footstep ripples
    for (let i = state.ripples.length - 1; i >= 0; i--) {
      const rp = state.ripples[i];
      rp.l -= dt;
      rp.r = lerp(4, rp.mr, 1 - clamp(rp.l / rp.ml, 0, 1));
      if (rp.l <= 0) state.ripples.splice(i, 1);
    }

    state.slashes = state.slashes.filter((s) => (s.l -= dt) > 0);
    state.ghosts = state.ghosts.filter((g) => (g.l -= dt) > 0);
    state.stains = state.stains.filter((s) => (s.l -= dt) > 0);
    state.texts = state.texts.filter((t) => {
      t.y += t.vy * dt;
      t.vy *= 0.92;
      return (t.l -= dt) > 0;
    });

    const up = stageId === 'temple';
    for (const m of state.motes) {
      m.x += m.vx * dt;
      m.y += (up ? -Math.abs(m.vy) * 1.15 : Math.abs(m.vy)) * dt;
      m.r += m.vr * dt;
      if (m.x < -14) m.x = VW + 14;
      if (m.y > VH + 14) m.y = -14;
      if (m.y < -14) m.y = VH + 14;
    }
  }

  function resetArena() {
    state.slashes.length = 0;
    state.parts.length = 0;
    state.stains.length = 0;
    state.ghosts.length = 0;
    state.texts.length = 0;
    state.ripples.length = 0;
    state.severed.length = 0;
    state.hats.length = 0;
    state.planted.length = 0;
    for (const b of state.bamboo) {
      b.sliced = false;
      b.topLife = 0;
    }
    screen.hitstop = 0;
    screen.slowT = 0;
    screen.invT = 0;
    screen.flashA = 0;
    screen.shakeAmp = 0;
    screen.shakeX = 0;
    screen.shakeY = 0;
    screen.targetZoom = 1;
    screen.lightningA = 0;
  }

  global.KuroFX = {
    SFX,
    vibe,
    state,
    screen,
    setLowFx(flag) {
      lowFx = Boolean(flag);
    },
    isLowFx() {
      return lowFx;
    },
    resetArena,
    applyEvent,
    addGhost,
    spawnSever,
    spawnLandDust,
    spawnCounterBurst,
    sliceBambooAt,
    spawnStepRipple,
    spawnBladeScrape,
    update,
  };
})(window);
