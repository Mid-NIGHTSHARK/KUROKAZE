/* KUROKAZE IV — Modular Core Engine (Step 5 of 6)
 * Orchestrates KuroControls, KuroWeapons, KuroFX, KuroRender, and KuroNet.
 */
(function (global) {
  'use strict';

  const GROUND = 582;
  const LEFT_B = -640;
  const RIGHT_B = 640;
  const GRAV = 2250;
  const BEST_KEY = 'kurokaze_iv_best_v1';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sgn = (v) => (v < 0 ? -1 : 1);

  const ACT_LIST = [
    'idle', 'run', 'jump', 'attack', 'airSlash', 'dash', 'guard',
    'parry', 'clash', 'windup', 'hurt', 'stagger', 'iai', 'skillQ',
    'skillE', 'taunt', 'ult',
  ];
  const actToId = (a) => Math.max(0, ACT_LIST.indexOf(a));
  const idToAct = (i) => ACT_LIST[i] || 'idle';

  /* ==================== RUNTIME STATE ==================== */
  let cv = null;
  let callbacks = {};
  let rafId = 0;
  let lastTs = 0;

  const settings = {
    volume: 0.7,
    muted: false,
    grain: !(global.KuroControls && KuroControls.IS_TOUCH),
    letterbox: true,
    perfMode: 'auto', // auto | high | low
  };

  let mode = 'menu'; // menu | story | endless | local2p | online
  let state = 'MENU'; // MENU | BANNER | STANDOFF | PLAYING | CLASH | ULT | SCROLL | PAUSED | VICTORY | GAMEOVER
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
  let camX = 0;
  let camZoom = 1;
  let banner = { kanji: '', title: '', sub: '', t: 0, dur: 1.4 };
  let standoff = { active: false, phase: 'wait', waitT: 0, drawT: 0, resolved: false };
  let clash = { active: false, t: 0, meter: 0, x: 0, y: GROUND - 54, a: null, b: null, cd: 0, aiPushT: 0 };
  let ult = null;

  let killSlowCd = 0;
  let fighters = [];
  let projs = [];
  let clones = [];
  let menuFighters = [];

  // Online Local-Prediction & Rematch Swap State
  const netState = {
    active: false,
    role: 'host',
    p1Weapon: 0,
    p2Weapon: 0,
    stageIdx: 0,
    localHitSeq: 0,
    pendingHits: new Map(),
    remoteTarget: null,
    koSent: false,
  };

  // Telemetry
  let fpsFrames = 0;
  let fpsAccum = 0;
  let currentFps = 60;
  let lastTeleEmit = 0;
  let lastSkillEmit = 0;

  /* ==================== HELPERS ==================== */
  function computeLowFx() {
    if (settings.perfMode === 'low') return true;
    if (settings.perfMode === 'high') return false;
    return Boolean(global.KuroControls && KuroControls.IS_TOUCH);
  }

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

  function emitEvent(ev, replicate = true) {
    KuroFX.applyEvent(ev);
    if (replicate && netState.active && global.KuroNet) {
      KuroNet.sendReliable(['fx', ev]);
    }
  }

  function getMyFighter() {
    if (!netState.active) return fighters[0] || null;
    return netState.role === 'host' ? fighters[0] || null : fighters[1] || null;
  }

  function getRemoteFighter() {
    if (!netState.active) return null;
    return netState.role === 'host' ? fighters[1] || null : fighters[0] || null;
  }

  function currentStageId() {
    return (KuroWeapons.STAGES[stageIdx] || KuroWeapons.STAGES[0]).id;
  }

  /* ==================== FIGHTER FACTORY ==================== */
  let nextFid = 1;
  function makeFighter(cfg) {
    const W = KuroWeapons.get(cfg.weaponIdx || 0);
    const sc = new KuroRender.Scarf(8, 8.2);
    sc.reset(cfg.x, GROUND - 80);
    return {
      id: cfg.id || nextFid++,
      team: cfg.team,
      role: cfg.role,
      name: cfg.name || 'SAMURAI',
      weaponIdx: W.index,
      weapon: W.id,
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
      spd: cfg.spd || W.moveSpd || 415,
      ground: true,
      coyote: 0,
      jumps: 2,
      act: 'idle',
      actT: 0,
      actD: 0,
      step: 0,
      comboWin: 0,
      activeMove: null,
      moveKind: 0, // 0=combo 1=up 2=down 3=q 4=e
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
      skillStage: 0,
      sheathed: false,
      idleStillT: 0,
      stepRippleT: 0,
      bleedT: 0,
      bleedTick: 0,
      bleedAtk: null,
      runC: rand(0, 6),
      pose: { ...KuroRender.idlePoseFor(W.id) },
      scarf: sc,
      perks: new Set(cfg.perks || []),
      delays: [],
      phase: 1,
      aiCd: rand(0.4, 0.9),
      aiSpecial: rand(1.6, 2.8),
      aiKind: 'slash',
      dead: false,
      deadT: 0,
      severed: false,
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

  function grantHit(atk, pts, kiBase) {
    if (!atk) return;
    const W = KuroWeapons.get(atk.weaponIdx);
    const pMul = atk.perks.has('swift') ? 1.4 : 1;
    const fMul = atk.team === 1 && (mode === 'story' || mode === 'endless') ? flowKiMul() : 1;
    atk.ki = clamp(atk.ki + kiBase * W.kiMul * pMul * fMul, 0, atk.maxKi);
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

  /* ==================== PRE-FINAL-BLOW SLOW MOTION ==================== */
  function checkKillAnticipation(attacker, move) {
    if (mode === 'online' || killSlowCd > 0 || !move || attacker.role !== 'player') return;
    const foes = fighters.filter((o) => o.team !== attacker.team && !o.dead);
    if (foes.length !== 1) return; // Last enemy in wave, Boss, or Duel opponent
    const tgt = foes[0];
    const isDuel = mode === 'local2p';
    if (isDuel && rounds[attacker.team === 1 ? 0 : 1] < 1) return; // Match point only in local 2P

    const reach = (move.reach || 115) + 46;
    const dx = (tgt.x - attacker.x) * attacker.f;
    if (dx < -25 || dx > reach || Math.abs(tgt.y - attacker.y) > 105) return;

    const estDmg = tgt.execMark ? 999 : (move.dmg || 16) * (tgt.stagT > 0 ? 2 : 1);
    if (tgt.hp <= estDmg) {
      killSlowCd = 2.6;
      KuroFX.screen.slowT = Math.max(KuroFX.screen.slowT, 0.24);
      KuroFX.screen.slowScale = 0.22;
      KuroFX.screen.targetZoom = 1.22;
    }
  }

  /* ==================== BLADE CLASH (TSUBAZERIAI) ==================== */
  function tryStartBladeClash(a, b) {
    if (clash.active || clash.cd > 0 || state !== 'PLAYING') return false;
    if (!a || !b || a.dead || b.dead) return false;
    if (a.role === 'gunner' || b.role === 'gunner') return false;
    const dist = Math.abs(a.x - b.x);
    if (dist > 138 || Math.abs(a.y - b.y) > 72) return false;
    if (a.f !== sgn(b.x - a.x) || b.f !== sgn(a.x - b.x)) return false;

    const midX = (a.x + b.x) * 0.5;
    a.x = clamp(midX - a.f * 42, LEFT_B + 50, RIGHT_B - 50);
    b.x = clamp(midX - b.f * 42, LEFT_B + 50, RIGHT_B - 50);
    a.vx = b.vx = 0;
    a.act = b.act = 'clash';
    a.actT = b.actT = 1.25;
    a.actD = b.actD = 1.25;
    a.hitSet.add(b.id);
    b.hitSet.add(a.id);

    clash = {
      active: true,
      t: 1.25,
      meter: 0,
      x: midX,
      y: Math.min(a.y, b.y) - 56,
      a,
      b,
      cd: 5.0,
      aiPushT: 0.16,
    };
    state = 'CLASH';
    KuroFX.screen.targetZoom = 1.2;
    emitEvent({ k: 'sparks', x: midX, y: clash.y, dir: 0, n: 20, redP: 0.45, sfx: 'clash', shake: 11, vibe: 30 }, mode === 'online' && netState.role === 'host');
    if (mode === 'online' && netState.role === 'host') {
      KuroNet.sendReliable(['cl_start', Math.round(midX), Math.round(clash.y)]);
    }
    return true;
  }

  function resolveBladeClash(winnerSide) {
    if (!clash.active) return;
    const a = clash.a;
    const b = clash.b;
    const win = winnerSide === 1 ? a : b;
    const lose = winnerSide === 1 ? b : a;
    const dir = sgn(lose.x - win.x);

    clash.active = false;
    state = 'PLAYING';
    KuroFX.screen.targetZoom = 1;

    if (win && !win.dead) {
      win.act = 'idle';
      win.actT = 0;
      win.vx = -dir * 220;
      win.ki = clamp(win.ki + 18, 0, win.maxKi);
    }
    if (lose && !lose.dead) {
      lose.act = 'hurt';
      lose.actT = lose.actD = 0.36;
      lose.vx = dir * 440;
      lose.pos = Math.min(lose.maxPos, lose.pos + 36);
      if (lose.pos >= lose.maxPos) breakPosture(lose, dir);
    }
    emitEvent({ k: 'ring', x: clash.x, y: clash.y, mr: 145, c: '#f2eee5', lw: 6, sfx: 'parry', inv: 0.08, shake: 15, vibe: 35 }, mode === 'online' && netState.role === 'host');
    emitEvent({ k: 'txt', x: win ? win.x : clash.x, y: GROUND - 125, txt: 'CLASH WON!', c: '#e03131', sc: 1.25 }, mode === 'online' && netState.role === 'host');
  }

  /* ==================== STANDOFF OPENING (待 -> 抜) ==================== */
  function startStandoff(waitDur) {
    standoff = {
      active: true,
      phase: 'wait',
      waitT: waitDur || rand(1.15, 2.05),
      drawT: 1.15,
      resolved: false,
    };
    state = 'STANDOFF';
    fighters.forEach((f) => {
      f.sheathed = true;
      f.act = 'taunt';
      f.vx = 0;
    });
    KuroFX.screen.targetZoom = 1.18;
    KuroFX.SFX.play('standoff');
  }

  function finishStandoff(winnerSide, earlySide) {
    if (!standoff.active) return;
    standoff.active = false;
    standoff.resolved = true;
    state = 'PLAYING';
    KuroFX.screen.targetZoom = 1;

    fighters.forEach((f) => {
      f.sheathed = false;
      f.act = 'idle';
      f.actT = 0;
    });

    if (earlySide) {
      const bad = fighters[earlySide === 1 ? 0 : 1];
      if (bad) {
        bad.act = 'stagger';
        bad.stagT = bad.actT = bad.actD = 0.75;
        bad.pos = Math.min(bad.maxPos - 1, bad.pos + 30);
        applyLocalTxt(bad.x, bad.y - 120, 'TOO EARLY!', '#e03131', 1.2);
      }
      KuroFX.SFX.play('guard');
      return;
    }

    if (winnerSide && fighters[0] && fighters[1]) {
      const win = fighters[winnerSide === 1 ? 0 : 1];
      const lose = fighters[winnerSide === 1 ? 1 : 0];
      const dir = sgn(lose.x - win.x);
      win.ki = clamp(win.ki + 20, 0, win.maxKi);
      win.x = clamp(lose.x - dir * 82, LEFT_B + 50, RIGHT_B - 50);
      win.f = dir;
      win.scarf.reset(win.x, win.y - 78);
      emitEvent({ k: 'cut', x1: win.x - 140, y1: GROUND - 55, x2: lose.x + 140, y2: GROUND - 55, c: '#f2eee5', w: 14, l: 0.45, sfx: 'heavy', inv: 0.08, shake: 14 }, false);
      applyLocalTxt(win.x, win.y - 125, 'FIRST DRAW! +20 KI', '#e03131', 1.25);
      if (!lose.isRemote) {
        lose.pos = Math.min(lose.maxPos - 1, lose.pos + 28);
        lose.hp = Math.max(1, lose.hp - 12);
        lose.act = 'hurt';
        lose.actT = lose.actD = 0.25;
        lose.vx = dir * 240;
      }
    }
  }

  function applyLocalTxt(x, y, txt, c, sc) {
    KuroFX.applyEvent({ k: 'txt', x, y, txt, c, sc });
  }

  /* ==================== COMBAT RESOLUTION ==================== */
  function deliverStrike(atk, def, dmg, posDmg, dir, opts = {}) {
    if (!def || def.dead) return;

    // Online: attacker sends hit claim to defender for 0ms defender-validated parries/evades
    if (netState.active && atk && !atk.isRemote && def.isRemote) {
      const hitId = ++netState.localHitSeq;
      const hy = Math.round(def.y - 54 * def.scale);
      const cutType = opts.cutType || 'waist';
      netState.pendingHits.set(hitId, {
        dir,
        heavy: !!opts.heavy,
        grantKi: opts.grantKi !== false,
        cutType,
        fxX: Math.round(def.x),
        fxY: hy,
      });
      KuroFX.applyEvent({ k: 'sparks', x: def.x, y: hy, dir, n: 6, redP: 0.35 });
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
        cutType,
        opts.lift || 0,
        opts.bleed || 0,
      ]);
      return;
    }

    resolveLocalStrike(atk, def, dmg, posDmg, dir, opts);
  }

  function resolveLocalStrike(atk, def, dmg, posDmg, dir, opts = {}) {
    if (def.dead) return { outcome: 'none' };
    if (def.invuln > 0 && !opts.unblockable) {
      KuroFX.applyEvent({ k: 'txt', x: def.x, y: def.y - 104, txt: 'EVADE', c: '#f2eee5', sc: 0.9 });
      return { outcome: 'evade' };
    }

    const {
      heavy = false,
      unblockable = false,
      guardCrush = false,
      isProj = false,
      grantKi = true,
      cutType = 'waist',
      lift = 0,
      bleed = 0,
    } = opts;
    const hy = def.y - 54 * def.scale;

    // Crimson Execution on Posture-Broken target
    if ((def.execMark || opts.forceExec) && !isProj) {
      def.execMark = false;
      def.stagT = 0;
      def.pos = 0;
      const exD = def.role === 'boss' || def.role === 'player' ? 68 : Math.round(def.maxHp * 0.95);
      def.hp = Math.max(0, def.hp - exD);
      def.flashT = 0.2;
      const heal = 15 + (atk && atk.perks.has('drain') ? 12 : 0);
      if (atk && !atk.dead) {
        atk.hp = Math.min(atk.maxHp, atk.hp + heal);
        grantHit(atk, 320, 18);
      }
      KuroFX.applyEvent({ k: 'cut', x1: def.x - 135, y1: hy - 72, x2: def.x + 135, y2: hy + 72, c: '#e03131', w: 16, l: 0.55, sfx: 'exec', hitstop: 0.085, inv: 0.12, slow: 0.34, zoom: 1.24, shake: 20, vibe: 45 });
      KuroFX.applyEvent({ k: 'ink', x: def.x, y: hy, dir, n: 24, big: true });
      KuroFX.applyEvent({ k: 'txt', x: def.x, y: hy - 55, txt: `EXECUTION -${exD}`, c: '#e03131', sc: 1.35 });
      if (atk) KuroFX.applyEvent({ k: 'txt', x: atk.x, y: atk.y - 115, txt: `+${heal} HP`, c: '#f2eee5', sc: 0.95 });
      if (def.hp <= 0) killFighter(def, atk, dir, 'waist');
      else {
        def.act = 'hurt';
        def.actT = def.actD = 0.34;
        def.vx = dir * 360;
      }
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
      KuroFX.applyEvent({ k: 'sparks', x: def.x + def.f * 26, y: hy, dir: def.f, n: 24, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, slow: 0.22, zoom: 1.18, shake: 16, vibe: 35 });
      KuroFX.applyEvent({ k: 'ring', x: def.x + def.f * 26, y: hy, mr: 135, c: '#f2eee5', lw: 6 });
      KuroFX.applyEvent({ k: 'txt', x: def.x, y: def.y - 122, txt: 'PERFECT PARRY!', c: '#e03131', sc: 1.3 });

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
        KuroFX.SFX.play('thunder');
        fighters.forEach((o) => {
          if (o.team !== def.team && !o.dead && Math.abs(o.x - def.x) < 260) {
            KuroFX.applyEvent({ k: 'bolt', x1: def.x, y1: hy, x2: o.x, y2: o.y - 54 });
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
      def.pos = Math.min(def.maxPos, def.pos + (guardCrush ? posDmg * 1.5 : posDmg * 0.7));
      const chip = Math.max(2, Math.round(dmg * 0.22));
      def.hp = Math.max(0, def.hp - chip);
      def.vx = dir * 220;
      def.ki = clamp(def.ki + 5, 0, def.maxKi);
      KuroFX.applyEvent({ k: 'sparks', x: def.x + def.f * 20, y: hy, dir: -dir, n: 10, sfx: 'guard', shake: 6 });
      let broken = false;
      if (def.pos >= def.maxPos) {
        breakPosture(def, dir);
        broken = true;
      } else {
        KuroFX.applyEvent({ k: 'txt', x: def.x, y: def.y - 105, txt: `GUARD -${chip}`, c: '#9a968e', sc: 0.85 });
      }
      if (def.hp <= 0) killFighter(def, atk, dir, 'arm');
      return { outcome: 'guard', broken, dead: def.dead };
    }

    // Direct Hit
    const finD = Math.round(dmg * (def.stagT > 0 ? 2 : 1));
    def.hp = Math.max(0, def.hp - finD);
    def.pos = Math.min(def.maxPos, def.pos + posDmg);
    def.flashT = 0.14;
    if (bleed > 0) {
      def.bleedT = Math.min(4.5, def.bleedT + 2.2);
      def.bleedAtk = atk;
    }
    if (atk) grantHit(atk, heavy ? 120 : 65, grantKi ? (heavy ? 12 : 7) : 0);
    if (def.team === 1 && (mode === 'story' || mode === 'endless')) {
      combo = 0;
      flow = Math.max(0, flow - 45);
    }

    KuroFX.applyEvent({
      k: 'sparks',
      x: def.x,
      y: hy,
      dir,
      n: heavy ? 16 : 9,
      redP: heavy ? 0.55 : 0.25,
      sfx: heavy ? 'heavyHit' : 'hit',
      hitstop: heavy ? 0.07 : 0.042,
      shake: heavy ? 12 : 6,
      dx: dir * (heavy ? 10 : 5),
      vibe: heavy ? 25 : 12,
    });
    KuroFX.applyEvent({ k: 'ink', x: def.x, y: hy, dir, n: heavy ? 16 : 10, big: def.hp <= 0 });
    KuroFX.applyEvent({
      k: 'txt',
      x: def.x + rand(-14, 14),
      y: hy - 34,
      txt: `-${finD}${def.stagT > 0 ? '!' : ''}`,
      c: heavy || unblockable || def.stagT > 0 ? '#e03131' : '#f2eee5',
      sc: heavy || def.stagT > 0 ? 1.2 : 0.95,
    });

    if (def.hp <= 0) {
      killFighter(def, atk, dir, cutType);
      return { outcome: 'hit', dmg: finD, dead: true };
    }

    // Boss Phase 2
    if (def.role === 'boss' && def.phase === 1 && def.hp <= def.maxHp * 0.5) {
      def.phase = 2;
      def.spd = 340;
      def.act = 'idle';
      def.actT = 0;
      def.vx = -dir * 260;
      KuroFX.applyEvent({ k: 'ring', x: def.x, y: hy, mr: 230, c: '#e03131', lw: 8, sfx: 'taiko', inv: 0.14, flash: '#c82424', flashA: 0.6, shake: 20 });
      KuroFX.applyEvent({ k: 'txt', x: def.x, y: def.y - 148, txt: 'DEMON AWAKENED', c: '#e03131', sc: 1.4 });
      return { outcome: 'hit', dmg: finD };
    }

    let broken = false;
    if (def.pos >= def.maxPos) {
      breakPosture(def, dir);
      broken = true;
      return { outcome: 'hit', dmg: finD, broken: true };
    }

    const armor =
      (def.role === 'brute' || def.role === 'boss' || (def.activeMove && def.activeMove.armor)) &&
      !heavy &&
      def.stagT <= 0;
    if (!armor) {
      def.act = 'hurt';
      def.actT = def.actD = heavy ? 0.3 : 0.21;
      def.vx = dir * (heavy ? 320 : 175);
      if (lift < 0) {
        def.vy = lift;
        def.ground = false;
      }
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
    KuroFX.applyEvent({ k: 'ring', x: f.x, y: f.y - 54, mr: 130, c: '#e03131', lw: 6, sfx: 'heavyHit', hitstop: 0.08, shake: 14, vibe: 30 });
    KuroFX.applyEvent({ k: 'txt', x: f.x, y: f.y - 128, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.25 });
  }

  function killFighter(f, atk, dir, cutType = 'waist') {
    if (f.dead) return;
    f.dead = true;
    f.deadT = 0.95;
    f.severed = true;
    f.hp = 0;
    f.vx = dir * 340;
    f.vy = -190;
    f.execMark = false;
    if (f.team === 2 && (mode === 'story' || mode === 'endless')) kills++;
    if (atk && atk.perks.has('drain') && !atk.dead) atk.hp = Math.min(atk.maxHp, atk.hp + 12);

    const severEv = {
      k: 'sever',
      x: Math.round(f.x),
      y: Math.round(f.y),
      f: f.f,
      dir,
      scale: f.scale,
      cutType,
      hat: f.hat,
      weapon: f.weapon,
      role: f.role,
      scarfCol: f.scarfCol,
    };
    emitEvent(severEv, mode === 'online');
    emitEvent({ k: 'ring', x: f.x, y: f.y - 54, mr: 145, c: '#e03131', lw: 6, sfx: 'taiko', inv: 0.12, slow: 0.45, slowScale: 0.24, zoom: 1.18, shake: 19 }, mode === 'online');

    if (mode === 'online' && !netState.koSent) {
      netState.koSent = true;
      const deadSide = f === fighters[0] ? 1 : 2;
      KuroNet.sendReliable(['ko', deadSide]);
      if (netState.role === 'host') hostFinalizeOnlineRound(deadSide === 2 ? 1 : 2);
    }
  }

  /* ==================== UNIQUE WEAPON SKILLS (Q / E / R) ==================== */
  function startSkillQ(f, inp) {
    const W = KuroWeapons.get(f.weaponIdx);
    const sk = W.skillQ;
    if (f.ki < sk.cost) return;
    if (inp.l) f.f = -1;
    else if (inp.r) f.f = 1;
    f.ki -= sk.cost;
    f.sheathed = false;
    f.hitSet.clear();
    f.skillStage = 0;
    f.moveKind = 3;

    if (sk.id === 'iai_draw') {
      f.act = 'iai';
      f.iaiStage = 0;
      f.actD = f.actT = sk.dur;
      f.invuln = sk.dur + 0.04;
      f.vx = f.vy = 0;
      emitEvent({ k: 'ring', x: f.x + f.f * 12, y: f.y - 36, mr: 64, c: '#e03131', lw: 3.5, sfx: 'sheathe' });
      emitEvent({ k: 'txt', x: f.x, y: f.y - 114, txt: 'FLASH DRAW', c: '#f2eee5', sc: 1.05 });
    } else if (sk.id === 'earthsplitter') {
      f.act = 'skillQ';
      f.actD = f.actT = sk.dur;
      f.vx = f.f * 140;
      f.activeMove = { pose: 'slam', armor: true, cutType: sk.cutType };
      emitEvent({ k: 'txt', x: f.x, y: f.y - 116, txt: 'EARTHSPLITTER', c: '#e03131', sc: 1.05, sfx: 'heavy' });
    } else if (sk.id === 'dragon_lunge') {
      f.act = 'skillQ';
      f.actD = f.actT = sk.dur;
      f.vx = f.f * 520;
      f.activeMove = { pose: 'thrust', cutType: sk.cutType };
      emitEvent({ k: 'txt', x: f.x, y: f.y - 116, txt: 'DRAGON LUNGE', c: '#f2eee5', sc: 1.05, sfx: 'pole' });
    } else if (sk.id === 'shadow_blink') {
      const foes = fighters.filter((o) => o.team !== f.team && !o.dead);
      const tgt = foes.length
        ? foes.reduce((b, o) => (Math.abs(o.x - f.x) < Math.abs(b.x - f.x) ? o : b), foes[0])
        : null;
      const sx = f.x;
      let ex = clamp(f.x + f.f * 260, LEFT_B + 55, RIGHT_B - 55);
      if (tgt && Math.abs(tgt.x - f.x) <= sk.range) {
        const behindDir = tgt.f;
        ex = clamp(tgt.x - behindDir * 72, LEFT_B + 55, RIGHT_B - 55);
        f.f = sgn(tgt.x - ex);
      }
      KuroFX.addGhost(KuroRender.buildSkel(sx, f.y, f.f, KuroRender.POSES.dash, f.scale), f.hat, true);
      f.x = ex;
      f.scarf.reset(ex, f.y - 78);
      f.act = 'skillQ';
      f.actD = f.actT = sk.dur;
      f.invuln = 0.28;
      f.vx = f.f * 220;
      f.activeMove = { pose: 'slash3', cutType: sk.cutType };
      emitEvent({ k: 'slash', x: f.x + f.f * 32, y: f.y - 54, f: f.f, r: 98, a0: -1.5, a1: 1.4, red: true, w: 18, sfx: 'dash', shake: 8 });
      emitEvent({ k: 'txt', x: f.x, y: f.y - 116, txt: 'SHADOW BLINK', c: '#e03131', sc: 1.05 });
      KuroFX.sliceBambooAt(f.x, f.y - 70, 100, f.f, currentStageId());
      if (tgt && Math.abs(tgt.x - f.x) < 125) {
        deliverStrike(f, tgt, sk.dmg, sk.pos, f.f, { heavy: true, cutType: sk.cutType, bleed: sk.bleed });
      }
    }
  }

  function startSkillE(f, inp) {
    const W = KuroWeapons.get(f.weaponIdx);
    const sk = W.skillE;
    if (f.ki < sk.cost) return;
    if (inp.l) f.f = -1;
    else if (inp.r) f.f = 1;
    f.ki -= sk.cost;
    f.sheathed = false;
    f.hitSet.clear();
    f.skillStage = 0;
    f.moveKind = 4;

    if (sk.id === 'moon_wave') {
      f.act = 'skillE';
      f.actD = f.actT = sk.dur;
      f.vx = -f.f * 110;
      f.activeMove = { pose: 'thrust', cutType: sk.cutType };
      emitEvent({ k: 'slash', x: f.x + f.f * 36, y: f.y - 55, f: f.f, r: 108, a0: -1.4, a1: 1.4, red: true, w: 22, sfx: 'wave', shake: 8 });
      projs.push({ k: 'wave', team: f.team, owner: f, x: f.x + f.f * 55, y: f.y - 66, vx: f.f * sk.speed, vy: 0, f: f.f, r: 74, dmg: sk.dmg, pos: sk.pos, cutType: sk.cutType, hits: new Set(), l: 1.3 });
      if (netState.active && !f.isRemote) KuroNet.sendReliable(['pw', 'wave', Math.round(f.x + f.f * 55), Math.round(f.y - 66), f.f, 0]);
    } else if (sk.id === 'whirlwind') {
      f.act = 'skillE';
      f.actD = f.actT = sk.dur;
      f.vx = f.f * 260;
      f.activeMove = { pose: 'whirl', armor: true, cutType: sk.cutType };
      emitEvent({ k: 'slash', x: f.x, y: f.y - 54, f: 1, r: sk.radius, a0: -3.1, a1: 3.1, red: true, w: 24, sfx: 'heavy', shake: 12 });
      emitEvent({ k: 'ring', x: f.x, y: f.y - 54, mr: sk.radius + 15, c: '#e03131', lw: 5 });
      emitEvent({ k: 'txt', x: f.x, y: f.y - 118, txt: 'WHIRLWIND CLEAVE', c: '#e03131', sc: 1.05 });
      KuroFX.sliceBambooAt(f.x - sk.radius, f.y - 75, sk.radius * 2, 1, currentStageId());
      fighters.forEach((o) => {
        if (o.team !== f.team && !o.dead && Math.abs(o.x - f.x) <= sk.radius && Math.abs(o.y - f.y) <= 100) {
          deliverStrike(f, o, sk.dmg, sk.pos, sgn(o.x - f.x), { heavy: true, guardCrush: true, cutType: sk.cutType });
        }
      });
    } else if (sk.id === 'pole_vault') {
      f.act = 'skillE';
      f.actD = f.actT = sk.dur;
      f.vy = -660;
      f.vx = f.f * 540;
      f.ground = false;
      f.invuln = 0.28;
      f.activeMove = { pose: 'vault', cutType: sk.cutType };
      emitEvent({ k: 'slash', x: f.x + f.f * 45, y: f.y - 62, f: f.f, r: 145, a0: -0.6, a1: 2.1, red: true, w: 20, sfx: 'pole', shake: 7 });
      emitEvent({ k: 'txt', x: f.x, y: f.y - 118, txt: 'POLE VAULT', c: '#f2eee5', sc: 1.05 });
      KuroFX.sliceBambooAt(f.x, f.y - 80, 150, f.f, currentStageId());
    } else if (sk.id === 'kunai_fan') {
      f.act = 'skillE';
      f.actD = f.actT = sk.dur;
      f.vx = -f.f * 380;
      f.vy = -310;
      f.ground = false;
      f.activeMove = { pose: 'airSlash', cutType: sk.cutType };
      emitEvent({ sfx: 'kunai', shake: 4 });
      emitEvent({ k: 'txt', x: f.x, y: f.y - 115, txt: 'KUNAI STORM', c: '#f2eee5', sc: 1.0 });
      const offsets = [-150, 0, 150];
      offsets.forEach((vy) => {
        projs.push({
          k: 'kunai',
          team: f.team,
          owner: f,
          x: f.x + f.f * 36,
          y: f.y - 58,
          vx: f.f * sk.speed,
          vy,
          f: f.f,
          r: 16,
          dmg: sk.dmg,
          pos: sk.pos,
          cutType: sk.cutType,
          hits: new Set(),
          l: 1.2,
        });
        if (netState.active && !f.isRemote) {
          KuroNet.sendReliable(['pw', 'kunai', Math.round(f.x + f.f * 36), Math.round(f.y - 58), f.f, vy]);
        }
      });
    }
  }

  function tickActiveSkills(f) {
    const W = KuroWeapons.get(f.weaponIdx);
    const prg = 1 - f.actT / Math.max(0.01, f.actD);

    if (f.act === 'iai' && f.iaiStage === 0 && f.actT <= f.actD - 0.16) {
      f.iaiStage = 1;
      execFlashDraw(f, W.skillQ);
    }

    if (f.act === 'skillQ') {
      const sk = W.skillQ;
      if (sk.id === 'earthsplitter' && f.skillStage === 0 && prg >= 0.45) {
        f.skillStage = 1;
        emitEvent({ k: 'ring', x: f.x + f.f * 72, y: GROUND, mr: 155, c: '#e03131', lw: 7, sfx: 'heavyHit', shake: 15, vibe: 30 });
        KuroFX.spawnBladeScrape(f.x + f.f * 72, f.f);
        KuroFX.sliceBambooAt(f.x, GROUND - 80, 155, f.f, currentStageId());
        fighters.forEach((o) => {
          if (o.team !== f.team && !o.dead && Math.abs(o.x - (f.x + f.f * 78)) < 110 && Math.abs(o.y - f.y) < 95) {
            deliverStrike(f, o, sk.dmg, sk.pos, f.f, { heavy: true, unblockable: true, cutType: sk.cutType });
          }
        });
        projs.push({ k: 'shock', team: f.team, owner: f, x: f.x + f.f * 92, y: GROUND - 12, vx: f.f * 720, vy: 0, f: f.f, r: 34, dmg: sk.shockDmg, pos: 28, cutType: 'legs', hits: new Set(), l: 0.9 });
        if (netState.active && !f.isRemote) KuroNet.sendReliable(['pw', 'shock', Math.round(f.x + f.f * 92), Math.round(GROUND - 12), f.f, 0]);
      } else if (sk.id === 'dragon_lunge') {
        const wanted = prg >= 0.72 ? 3 : prg >= 0.42 ? 2 : prg >= 0.14 ? 1 : 0;
        if (wanted > f.skillStage) {
          f.skillStage = wanted;
          emitEvent({ k: 'slash', x: f.x + f.f * 76, y: f.y - 54 + (wanted - 2) * 14, f: f.f, r: 120, a0: -0.35, a1: 0.35, red: wanted === 3, w: 15, sfx: 'pole', shake: 5 });
          KuroFX.sliceBambooAt(f.x, f.y - 70, sk.reach, f.f, currentStageId());
          fighters.forEach((o) => {
            if (o.team !== f.team && !o.dead) {
              const rel = (o.x - f.x) * f.f;
              if (rel >= -15 && rel <= sk.reach && Math.abs(o.y - f.y) < 90) {
                deliverStrike(f, o, sk.dmg, sk.pos, f.f, { heavy: wanted === 3, cutType: wanted === 3 ? 'waist' : sk.cutType });
              }
            }
          });
        }
      }
    }

    if (f.act === 'skillE' && W.skillE.id === 'pole_vault' && prg >= 0.25 && prg <= 0.75) {
      fighters.forEach((o) => {
        if (o.team !== f.team && !o.dead && !f.hitSet.has(o.id) && Math.abs(o.x - f.x) < 130 && Math.abs(o.y - f.y) < 130) {
          f.hitSet.add(o.id);
          deliverStrike(f, o, W.skillE.dmg, W.skillE.pos, f.f, { heavy: true, cutType: W.skillE.cutType });
        }
      });
    }
  }

  function execFlashDraw(f, sk) {
    const sx = f.x;
    const ex = clamp(sx + f.f * (sk.range || 460), LEFT_B + 55, RIGHT_B - 55);
    const ym = f.y - 52;
    for (let i = 0; i < 6; i++) {
      KuroFX.addGhost(KuroRender.buildSkel(lerp(sx, ex, i / 6), f.y, f.f, KuroRender.POSES.dash, f.scale), f.hat, i === 5);
    }
    f.x = ex;
    f.scarf.reset(ex, f.y - 78);
    KuroFX.sliceBambooAt(Math.min(sx, ex), ym, Math.abs(ex - sx), 1, currentStageId());
    emitEvent({ k: 'cut', x1: sx - f.f * 35, y1: ym, x2: ex + f.f * 35, y2: ym, c: '#f2eee5', w: 16, l: 0.5, sfx: 'heavy', inv: 0.08, shake: 15, vibe: 30 });
    emitEvent({ k: 'cut', x1: sx - f.f * 25, y1: ym + 4, x2: ex + f.f * 25, y2: ym + 4, c: '#c82424', w: 6, l: 0.42 });
    const mn = Math.min(sx, ex) - 52;
    const mx = Math.max(sx, ex) + 52;
    fighters.forEach((o) => {
      if (o.team !== f.team && !o.dead && o.x >= mn && o.x <= mx && Math.abs(o.y - f.y) < 120) {
        if (netState.active && o.isRemote) {
          deliverStrike(f, o, sk.dmg, sk.pos, f.f, { heavy: true, grantKi: false, cutType: sk.cutType });
        } else {
          o.vx = 0;
          o.act = 'hurt';
          o.actT = o.actD = 0.42;
          o.flashT = 0.2;
          o.delays.push({ t: 0.26, dmg: sk.dmg, dir: f.f, atk: f, cutType: sk.cutType });
          emitEvent({ k: 'sparks', x: o.x, y: o.y - 54, dir: f.f, n: 10, redP: 0.5 });
        }
      }
    });
    if (netState.active && !f.isRemote) sendMyNetState(true);
  }

  function startUltimate(caster, fromNet = false) {
    const W = KuroWeapons.get(caster.weaponIdx);
    const r = W.skillR;
    caster.ki = 0;
    caster.act = 'ult';
    caster.sheathed = false;
    caster.invuln = 3.0;
    caster.vx = caster.vy = 0;
    state = 'ULT';
    KuroFX.applyEvent({ sfx: 'taiko', flash: '#c82424', flashA: 0.8, shake: 14, vibe: 40 });
    ult = {
      caster,
      spec: r,
      t: 0,
      dur: 2.6,
      next: 0.36,
      done: 0,
      tot: r.cuts || 14,
      sheathed: false,
      boom: false,
      ox: caster.x,
      cuts: [],
      fromNet,
    };
    if (!fromNet && netState.active && !caster.isRemote) {
      KuroNet.sendReliable(['ult', Math.round(caster.x)]);
    }
  }

  function tickUltimate(dt) {
    const u = ult;
    const c = u.caster;
    const r = u.spec;
    u.t += dt;
    KuroFX.screen.targetZoom = u.t < 2.0 ? 1.18 : 1.06;
    const foes = fighters.filter((o) => o.team !== c.team && !o.dead);

    if (u.t >= u.next && u.done < u.tot) {
      u.done++;
      u.next += r.id === 'horizon' ? 0.16 : 0.072;
      const tgt = foes.length ? foes[u.done % foes.length] : { x: c.x + c.f * 120, y: GROUND };
      const a = r.id === 'horizon' ? rand(-0.45, 0.45) : r.id === 'spear_storm' ? rand(-0.22, 0.22) : rand(-1.35, 1.35);
      const ln = r.id === 'horizon' ? 620 : rand(280, 500);
      const cx = tgt.x + rand(-40, 40);
      const cy = tgt.y - 56 + rand(-34, 34);
      const red = r.id === 'horizon' || u.done % 3 === 0;
      u.cuts.push({ x1: cx - Math.cos(a) * ln, y1: cy - Math.sin(a) * ln, x2: cx + Math.cos(a) * ln, y2: cy + Math.sin(a) * ln, red, l: 1.3, ml: 1.3 });
      c.x = clamp(cx + Math.cos(a) * 140, LEFT_B + 60, RIGHT_B - 60);
      c.f = Math.cos(a) >= 0 ? 1 : -1;
      KuroFX.addGhost(KuroRender.buildSkel(c.x, c.y, c.f, KuroRender.POSES.dash, c.scale), c.hat, red);
      KuroFX.applyEvent({ k: 'sparks', x: cx, y: cy, dir: c.f, n: 6, redP: 0.6, sfx: 'ultCut', shake: 6 });
    }
    if (!u.sheathed && u.t >= 1.8) {
      u.sheathed = true;
      c.x = clamp(u.ox, LEFT_B + 110, RIGHT_B - 110);
      c.pose = { ...KuroRender.POSES.iai };
      c.scarf.reset(c.x, c.y - 72);
      KuroFX.applyEvent({ k: 'ring', x: c.x + c.f * 12, y: c.y - 40, mr: 95, c: '#e03131', lw: 4.5, sfx: 'sheathe' });
    }
    if (!u.boom && u.t >= 2.12) {
      u.boom = true;
      KuroFX.applyEvent({ sfx: 'ultBoom', inv: 0.18, flash: '#f2eee5', flashA: 0.9, shake: 26, vibe: 60 });
      if (!u.fromNet) {
        foes.forEach((o) => {
          const dmg = o.role === 'boss' ? r.dmgBoss : o.role === 'player' ? r.dmgPlayer : r.dmgMob;
          deliverStrike(c, o, dmg, 68, c.f, { heavy: true, unblockable: true, ignoreParry: true, grantKi: false, cutType: r.cutType });
          KuroFX.applyEvent({ k: 'ring', x: o.x, y: o.y - 54, mr: 155, c: '#e03131', lw: 7 });
        });
      }
    }
    u.cuts.forEach((s) => { s.l -= dt; });
    if (u.t >= u.dur) {
      c.act = 'idle';
      ult = null;
      state = 'PLAYING';
      KuroFX.screen.targetZoom = 1;
      if (netState.active && !c.isRemote) sendMyNetState(true);
    }
  }

  /* ==================== FIGHTER STEP & AI ==================== */
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
    const W = KuroWeapons.get(f.weaponIdx);
    const swift = f.perks.has('swift') ? 1.4 : 1;

    // Passive Ki + Idle Sheathing calm focus
    if (f.role === 'player') {
      const calmBonus = f.sheathed ? 4.2 : 0;
      f.ki = clamp(f.ki + (2.6 * swift + calmBonus) * dt, 0, f.maxKi);
    }

    // Dual Blade Bleed DOT
    if (f.bleedT > 0) {
      f.bleedT -= dt;
      f.bleedTick += dt;
      if (f.bleedTick >= 0.45) {
        f.bleedTick = 0;
        f.hp = Math.max(0, f.hp - 2);
        KuroFX.applyEvent({ k: 'ink', x: f.x, y: f.y - 54, dir: 0, n: 3, big: false });
        if (f.hp <= 0) {
          killFighter(f, f.bleedAtk, -f.f, 'arm');
          return;
        }
      }
    }

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

    // Delayed Iaijutsu cuts
    for (let i = f.delays.length - 1; i >= 0; i--) {
      if ((f.delays[i].t -= dt) <= 0) {
        const d = f.delays.splice(i, 1)[0];
        emitEvent({ k: 'cut', x1: f.x - 55, y1: f.y - 88, x2: f.x + 55, y2: f.y - 20, c: '#e03131', w: 7, l: 0.35 });
        deliverStrike(d.atk, f, d.dmg, 26, d.dir, { heavy: true, grantKi: false, cutType: d.cutType || 'waist' });
      }
    }

    const busy =
      f.act === 'hurt' ||
      f.act === 'stagger' ||
      f.act === 'iai' ||
      f.act === 'ult' ||
      f.act === 'windup' ||
      f.act === 'skillQ' ||
      f.act === 'skillE';

    // Manual Taunt / Sheathe Focus
    if (!busy && f.role === 'player' && inp.taunt && f.ground && f.act === 'idle') {
      f.sheathed = !f.sheathed;
      if (f.sheathed) KuroFX.SFX.play('sheathe');
    }

    // Q / E / R Unique Weapon Skills
    if (!busy && f.role === 'player') {
      if (inp.rSkill && f.ki >= W.skillR.cost && state === 'PLAYING') {
        startUltimate(f);
        return;
      }
      if (inp.q && f.ki >= W.skillQ.cost && f.act !== 'dash') {
        startSkillQ(f, inp);
      } else if (inp.e && f.ki >= W.skillE.cost && f.act !== 'dash') {
        startSkillE(f, inp);
      }
    }

    // Flash-Step Dash
    if (!busy && inp.dash && f.dashCd <= 0) {
      const dir = inp.l ? -1 : inp.r ? 1 : f.f;
      f.f = dir;
      f.sheathed = false;
      f.act = 'dash';
      f.actD = f.actT = 0.2;
      f.dashCd = W.dashCd;
      f.invuln = 0.26;
      f.vx = dir * 1120;
      f.vy = Math.min(f.vy, 0) * 0.2;
      f.guarding = false;
      emitEvent({ k: 'ring', x: f.x, y: f.y - 44, mr: 56, c: '#f2eee5', lw: 3.5, sfx: 'dash' });
      for (let i = 0; i < 5; i++) {
        KuroFX.addGhost(KuroRender.buildSkel(f.x - dir * i * 16, f.y, dir, KuroRender.POSES.dash, f.scale), f.hat, i === 0);
      }
      if (f.perks.has('clone')) {
        clones.push({ x: f.x, y: f.y, f: dir, team: f.team, owner: f, t: 0.45, sk: KuroRender.buildSkel(f.x, f.y, dir, KuroRender.POSES.idle, f.scale), hat: f.hat });
      }
    }

    // Weapon Combos + Directional Up/Down Attacks + Unique Air Attacks
    const canAtk = !busy && !(f.act === 'attack' && f.actT > f.actD * 0.4) && !(f.act === 'airSlash' && f.actT > 0.08);
    if (inp.atk && canAtk) {
      if (inp.l) f.f = -1;
      else if (inp.r) f.f = 1;
      f.sheathed = false;
      f.guarding = false;
      f.hitSet.clear();
      f.unblockable = false;

      if (!f.ground) {
        const mv = W.airAttack;
        f.act = 'airSlash';
        f.activeMove = mv;
        f.moveKind = 0;
        f.actD = f.actT = mv.dur;
        if (mv.diveVy) {
          f.vy = mv.diveVy;
          f.vx = f.f * (mv.vxBoost || 260);
        } else {
          f.vy = Math.min(f.vy, mv.vyLift || -180);
          f.vx = f.f * (mv.vxBoost || 230);
        }
        checkKillAnticipation(f, mv);
        emitEvent({ k: 'slash', x: f.x + f.f * 28, y: f.y - 52, f: f.f, r: mv.reach * 0.85, a0: mv.a0, a1: mv.a1, red: mv.red, w: mv.w, sfx: mv.sfx });
      } else {
        let mv;
        if (inp.down && W.downAttack) {
          mv = W.downAttack;
          f.moveKind = 2;
          f.step = 1;
        } else if (inp.up && !inp.jump && W.upAttack) {
          mv = W.upAttack;
          f.moveKind = 1;
          f.step = 2;
        } else {
          f.step = f.comboWin > 0 && f.step > 0 && f.step < W.combo.length ? f.step + 1 : 1;
          mv = W.combo[f.step - 1] || W.combo[0];
          f.moveKind = 0;
        }
        f.act = 'attack';
        f.activeMove = mv;
        f.comboWin = 0.66;
        f.actD = f.actT = mv.dur;
        f.vx = f.f * (mv.lunge || 250);
        checkKillAnticipation(f, mv);
        emitEvent({
          k: 'slash',
          x: f.x + f.f * 36,
          y: f.y - (mv.lowSweep ? 24 : 52),
          f: f.f,
          r: mv.reach * 0.94,
          a0: mv.a0,
          a1: mv.a1,
          red: mv.red,
          w: mv.w,
          sfx: mv.sfx,
        });
        KuroFX.sliceBambooAt(f.x, f.y - (mv.lowSweep ? 32 : 76), mv.reach, f.f, currentStageId());
        if (mv.heavy && W.id === 'odachi') KuroFX.spawnBladeScrape(f.x + f.f * 50, f.f);
      }
    }

    // Jump & Double Jump
    if (!busy && inp.jump) {
      f.sheathed = false;
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

    // Fast-fall in air when holding down
    if (!f.ground && inp.down && f.vy > -120 && f.act !== 'dash') {
      f.vy += 900 * dt;
    }

    // Guard & Perfect Parry
    const canG = f.ground && (f.act === 'idle' || f.act === 'run' || f.act === 'guard');
    if (inp.parryTap && canG) {
      f.sheathed = false;
      f.parryW = W.parry;
      f.guarding = true;
      f.act = 'guard';
    }
    if (inp.guard && canG) {
      f.sheathed = false;
      f.guarding = true;
      f.act = 'guard';
    } else if (!inp.guard && f.act === 'guard') {
      f.guarding = false;
      f.act = 'idle';
    }

    // Active Action & Hitbox Resolution
    if (f.actT > 0) {
      f.actT -= dt;
      tickActiveSkills(f);

      if (f.act === 'attack' || f.act === 'airSlash') {
        const prg = 1 - f.actT / Math.max(0.01, f.actD);
        if (prg >= 0.14 && prg <= 0.72) {
          const mv = f.activeMove || W.combo[0];
          const reach = mv.reach || W.reach;
          const hx = f.x + f.f * reach * 0.56;

          fighters.forEach((o) => {
            if (o.team === f.team || o.dead || f.hitSet.has(o.id)) return;
            if (Math.abs(o.x - hx) <= reach * 0.62 && Math.abs(o.y - f.y) <= 95) {
              // Simultaneous melee swing triggers Blade Clash!
              if (
                (o.act === 'attack' || o.act === 'airSlash') &&
                !o.hitSet.has(f.id) &&
                tryStartBladeClash(f, o)
              ) {
                return;
              }
              f.hitSet.add(o.id);
              deliverStrike(f, o, mv.dmg || 14, mv.pos || 18, f.f, {
                heavy: Boolean(mv.heavy || f.unblockable),
                unblockable: Boolean(f.unblockable),
                guardCrush: Boolean(mv.guardCrush),
                cutType: mv.cutType || 'waist',
                lift: mv.lift || 0,
                bleed: mv.bleed || 0,
              });
            }
          });

          projs.forEach((pr) => {
            if (pr.team !== f.team && !pr.visualOnly && pr.k !== 'bullet' && pr.k !== 'shock' && Math.abs(pr.x - hx) <= reach * 0.62 && Math.abs(pr.y - (f.y - 54)) <= 65) {
              pr.team = f.team;
              pr.owner = f;
              pr.vx = f.f * 960;
              pr.vy = 0;
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
          f.activeMove = null;
        }
      }
    }

    // Horizontal Motion & Footstep Ripples
    const mvX = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    if (f.act === 'idle' || f.act === 'run' || f.act === 'jump') {
      if (mvX) {
        f.f = mvX;
        f.sheathed = false;
        f.idleStillT = 0;
        f.vx = lerp(f.vx, mvX * f.spd, clamp(dt * 16, 0, 1));
        if (f.ground) {
          f.act = 'run';
          f.runC += dt * (f.spd * 0.032);
          f.stepRippleT -= dt;
          if (f.stepRippleT <= 0) {
            f.stepRippleT = 0.22;
            KuroFX.spawnStepRipple(f.x, currentStageId());
          }
        }
      } else {
        f.vx = lerp(f.vx, 0, clamp(dt * (f.ground ? 16 : 6), 0, 1));
        if (f.ground && f.act === 'run') f.act = 'idle';
        if (f.role === 'player' && f.ground && f.act === 'idle' && !f.sheathed) {
          f.idleStillT += dt;
          if (f.idleStillT >= 1.65) {
            f.sheathed = true;
            KuroFX.SFX.play('sheathe');
          }
        }
      }
    } else if (f.act === 'guard' || f.act === 'windup') {
      f.vx = lerp(f.vx, 0, clamp(dt * 14, 0, 1));
    } else if (f.act !== 'dash' && f.act !== 'iai' && f.act !== 'skillE') {
      f.vx = lerp(f.vx, 0, clamp(dt * 9, 0, 1));
    }

    if (f.act !== 'dash' && f.act !== 'iai') f.vy += GRAV * dt;
    f.x = clamp(f.x + f.vx * dt, LEFT_B + 42, RIGHT_B - 42);
    f.y += f.vy * dt;

    if (f.y >= GROUND) {
      if (!f.ground && f.vy > 480) {
        emitEvent({ k: 'ink', x: f.x, y: GROUND, dir: 0, n: 5 });
        const am = f.activeMove;
        if (f.act === 'airSlash' && am && am.slamRadius) {
          emitEvent({ k: 'ring', x: f.x, y: GROUND, mr: am.slamRadius, c: '#e03131', lw: 6, sfx: 'heavyHit', shake: 12 });
          fighters.forEach((o) => {
            if (o.team !== f.team && !o.dead && Math.abs(o.x - f.x) < am.slamRadius) {
              deliverStrike(f, o, Math.round(am.dmg * 0.8), 30, sgn(o.x - f.x), { heavy: true, cutType: 'cleave' });
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
      f.moveKind = rt.moveKind || 0;
      if (f.act === 'run') f.runC += dt * (f.spd * 0.032);
    }
    if (f.flashT > 0) f.flashT -= dt;
    updatePoseAndScarf(f, dt);
  }

  function updatePoseAndScarf(f, dt) {
    const P = KuroRender.POSES;
    const baseIdle = f.sheathed ? P.sheathed : KuroRender.idlePoseFor(f.weapon);
    let tp;

    if (f.act === 'run') {
      tp = KuroRender.blendPose(P.runA, P.runB, (Math.sin(f.runC) + 1) * 0.5);
    } else if (f.act === 'jump') {
      tp = f.vy < 0 ? P.jump : P.fall;
    } else if (f.act === 'attack') {
      if (f.activeMove && f.activeMove.pose && P[f.activeMove.pose]) tp = P[f.activeMove.pose];
      else if (f.moveKind === 2) tp = P.iai;
      else if (f.moveKind === 1) tp = P.slash2;
      else if (f.weapon === 'naginata' && f.step === 1) tp = P.thrust;
      else if (f.unblockable) tp = P.slam;
      else tp = f.step % 3 === 1 ? P.slash1 : f.step % 3 === 2 ? P.slash2 : P.slash3;
    } else if (f.act === 'skillQ') {
      tp = f.weapon === 'odachi' ? P.slam : f.weapon === 'naginata' ? P.thrust : P.slash3;
    } else if (f.act === 'skillE') {
      tp = f.weapon === 'odachi' ? P.whirl : f.weapon === 'naginata' ? P.vault : P.thrust;
    } else if (f.act === 'windup') {
      tp = f.role === 'gunner' ? P.aim : P.windup;
    } else if (f.act === 'taunt') {
      tp = P.sheathed;
    } else {
      tp = P[f.act] || { ...baseIdle, py: baseIdle.py + Math.sin(tTime * 3.2 + f.id) * 1.5 };
    }

    f.pose = KuroRender.blendPose(f.pose, tp, clamp(dt * 22, 0, 1));
    const sk = KuroRender.buildSkel(f.x, f.y, f.f, f.pose, f.scale);
    const wind = currentStageId() === 'bamboo' ? -220 : -115;
    f.scarf.update(sk.nk.x, sk.nk.y, f.f, wind, dt);
    f.hpLag = lerp(f.hpLag, f.hp, clamp(dt * 7, 0, 1));
  }

  /* ==================== ENEMY AI ==================== */
  function triggerEnemyStrike(e) {
    e.hitSet.clear();
    if (e.aiKind === 'kunai') {
      e.act = 'idle';
      e.actT = 0;
      e.aiSpecial = rand(2.6, 3.8);
      KuroFX.SFX.play('kunai');
      projs.push({ k: 'kunai', team: e.team, owner: e, x: e.x + e.f * 36, y: e.y - 56, vx: e.f * 720, vy: 0, f: e.f, r: 16, dmg: 11, pos: 16, cutType: 'arm', l: 1.8 });
      return;
    }
    if (e.role === 'gunner') {
      e.act = 'idle';
      e.actT = 0;
      e.aiCd = rand(1.9, 2.7);
      KuroFX.applyEvent({ k: 'sparks', x: e.x + e.f * 45, y: e.y - 58, dir: e.f, n: 10, redP: 0.6, sfx: 'gun', shake: 7 });
      projs.push({ k: 'bullet', team: e.team, owner: e, x: e.x + e.f * 48, y: e.y - 58, vx: e.f * 1160, vy: 0, f: e.f, r: 14, dmg: 22, pos: 30, cutType: 'high', l: 1.5 });
      return;
    }
    if (e.aiKind === 'bossWave') {
      e.act = 'skillE';
      e.actD = e.actT = 0.34;
      e.aiCd = 0.8;
      KuroFX.applyEvent({ k: 'slash', x: e.x + e.f * 46, y: e.y - 60, f: e.f, r: 118, a0: -1.5, a1: 1.5, red: true, w: 24, sfx: 'wave' });
      projs.push({ k: 'bWave', team: e.team, owner: e, x: e.x + e.f * 60, y: e.y - 66, vx: e.f * 740, vy: 0, f: e.f, r: 66, dmg: 18, pos: 26, cutType: 'waist', l: 1.6 });
      return;
    }
    const W = KuroWeapons.get(e.weaponIdx);
    e.act = 'attack';
    e.step = e.unblockable ? 3 : 1;
    e.activeMove = {
      dmg: e.role === 'brute' ? 26 : e.role === 'boss' ? (e.phase === 2 ? 22 : 18) : 14,
      pos: e.unblockable ? 44 : 20,
      reach: W.reach * 0.96,
      heavy: e.unblockable,
      cutType: e.unblockable ? 'cleave' : 'waist',
    };
    e.actD = e.actT = e.unblockable ? 0.36 : 0.25;
    e.vx = e.f * (e.role === 'spearman' ? 540 : 340);
    KuroFX.applyEvent({ k: 'slash', x: e.x + e.f * 42, y: e.y - 52, f: e.f, r: W.reach * 0.96, a0: -1.4, a1: 1.0, red: e.unblockable || e.role === 'boss', w: e.unblockable ? 26 : 18, sfx: e.unblockable ? 'heavy' : 'swing' });
    if (e.unblockable) {
      KuroFX.applyEvent({ k: 'ring', x: e.x + e.f * 75, y: GROUND, mr: 125, c: '#e03131', lw: 5, shake: 11 });
      KuroFX.spawnBladeScrape(e.x + e.f * 75, e.f);
    }
    e.aiCd = e.role === 'boss' ? (e.phase === 2 ? 0.45 : 0.72) : rand(0.75, 1.35);
  }

  function computeAI(e, dt) {
    const inp = { l: false, r: false, up: false, down: false, jump: false, atk: false, guard: false, parryTap: false, dash: false, q: false, e: false, rSkill: false, taunt: false };
    const tgt = fighters.find((f) => f.team === 1 && !f.dead);
    if (!tgt || e.dead || e.act === 'hurt' || e.act === 'stagger' || e.act === 'attack' || e.act === 'dash' || e.act === 'skillE') return inp;
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
      else if (e.aiCd <= 0 && activeW < 2) { e.act = 'windup'; e.actD = e.actT = 0.78; e.unblockable = false; e.aiKind = 'gun'; KuroFX.SFX.play('glint'); }
      return inp;
    }
    if (e.role === 'ronin' && e.aiSpecial <= 0 && dist > 230 && dist < 440 && activeW < 2) {
      e.act = 'windup'; e.actD = e.actT = 0.36; e.unblockable = false; e.aiKind = 'kunai'; KuroFX.SFX.play('glint'); return inp;
    }
    if (e.role === 'boss') {
      if (e.phase === 2 && e.aiSpecial <= 0 && dist > 160 && dist < 440) {
        e.aiSpecial = 3.8; inp.dash = true; if (dir > 0) inp.r = true; else inp.l = true; return inp;
      }
      if (e.aiCd <= 0 && dist > 235 && activeW < 2) {
        e.act = 'windup'; e.actD = e.actT = 0.48; e.unblockable = false; e.aiKind = 'bossWave'; KuroFX.SFX.play('glint'); return inp;
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
      KuroFX.SFX.play('glint');
    }
    return inp;
  }

  /* ==================== PROJECTILES & CLONES ==================== */
  function updateProjectilesAndClones(dt) {
    for (let i = clones.length - 1; i >= 0; i--) {
      const cl = clones[i];
      if ((cl.t -= dt) <= 0) {
        KuroFX.applyEvent({ k: 'ring', x: cl.x, y: cl.y - 52, mr: 120, c: '#e03131', lw: 5, sfx: 'heavyHit', shake: 8 });
        KuroFX.applyEvent({ k: 'ink', x: cl.x, y: cl.y - 52, dir: cl.f, n: 14, big: true });
        fighters.forEach((o) => {
          if (o.team !== cl.team && !o.dead && Math.abs(o.x - cl.x) < 125) {
            resolveLocalStrike(cl.owner, o, 24, 28, sgn(o.x - cl.x), { heavy: true, grantKi: false, cutType: 'cleave' });
          }
        });
        clones.splice(i, 1);
      }
    }

    for (let i = projs.length - 1; i >= 0; i--) {
      const pr = projs[i];
      pr.x += pr.vx * dt;
      pr.y += (pr.vy || 0) * dt;
      pr.l -= dt;
      if (pr.k === 'kunai' && pr.y >= GROUND) {
        pr.l = 0;
        KuroFX.applyEvent({ k: 'sparks', x: pr.x, y: GROUND - 2, dir: -pr.f, n: 4 });
      }
      if (!pr.visualOnly) {
        // Moon Crescent cuts through enemy projectiles
        if (pr.k === 'wave') {
          for (const other of projs) {
            if (other !== pr && other.team !== pr.team && other.k !== 'wave' && Math.hypot(other.x - pr.x, other.y - pr.y) < pr.r + 18) {
              other.l = 0;
              KuroFX.applyEvent({ k: 'sparks', x: other.x, y: other.y, dir: pr.f, n: 8, sfx: 'guard' });
            }
          }
        }
        for (const o of fighters) {
          if (o.team === pr.team || o.dead || (pr.hits && pr.hits.has(o.id))) continue;
          if (Math.abs(o.x - pr.x) <= pr.r + 22 && Math.abs(o.y - 54 - pr.y) <= pr.r + 36) {
            if (!o.isRemote && o.parryW > 0 && pr.k !== 'shock') {
              pr.team = o.team;
              pr.owner = o;
              pr.vx = -pr.vx * 1.38;
              pr.vy = 0;
              pr.f = -pr.f;
              pr.dmg = pr.k === 'bullet' || pr.k === 'kunai' ? 85 : Math.round(pr.dmg * 1.8);
              pr.hits = new Set();
              o.ki = clamp(o.ki + 25, 0, o.maxKi);
              if (o.team === 1) { parries++; flow = Math.min(200, flow + 24); flowT = 3.8; }
              KuroFX.applyEvent({ k: 'sparks', x: pr.x, y: pr.y, dir: pr.f, n: 18, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, shake: 12, vibe: 30 });
              KuroFX.applyEvent({ k: 'txt', x: o.x, y: o.y - 120, txt: pr.k === 'bullet' ? 'BULLET PARRY!' : 'PARRY DEFLECT!', c: '#e03131', sc: 1.2 });
            } else {
              if (pr.hits) pr.hits.add(o.id);
              deliverStrike(pr.owner, o, pr.dmg, pr.pos || 24, pr.f, {
                heavy: pr.k !== 'kunai',
                isProj: true,
                grantKi: false,
                cutType: pr.cutType || 'waist',
              });
              if (pr.k === 'bullet' || pr.k === 'kunai') pr.l = 0;
            }
          }
        }
      }
      if (pr.l <= 0 || pr.x < LEFT_B - 140 || pr.x > RIGHT_B + 140) projs.splice(i, 1);
    }
  }

  /* ==================== ONLINE NETCODE RELAY ==================== */
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
      (f.invuln > 0 ? 32 : 0) |
      (f.sheathed ? 64 : 0);
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
        f.moveKind || 0,
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
            p1Weapon: netState.p1Weapon,
            p2Weapon: netState.p2Weapon,
            role: netState.role,
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
          moveKind: payload[13] || 0,
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
        opF.sheathed = Boolean(flags & 64);
        break;
      }
      case 'fx':
        KuroFX.applyEvent(payload[1]);
        break;
      case 'pw': {
        const [, kind, px, py, pf, pvy] = payload;
        const spd = kind === 'shock' ? 720 : kind === 'kunai' ? 880 : 940;
        projs.push({ k: kind, team: opF ? opF.team : 2, owner: opF, x: px, y: py, vx: pf * spd, vy: pvy || 0, f: pf, r: kind === 'wave' ? 74 : kind === 'shock' ? 34 : 16, dmg: 0, pos: 0, hits: new Set(), l: 1.25, visualOnly: true });
        break;
      }
      case 'ult':
        if (opF) {
          opF.x = payload[1];
          startUltimate(opF, true);
        }
        break;
      case 'so_go':
        if (standoff.active) {
          standoff.phase = 'draw';
          KuroFX.SFX.play('glint');
        }
        break;
      case 'so_try':
        if (netState.role === 'host' && standoff.active) {
          if (standoff.phase === 'wait') {
            KuroNet.sendReliable(['so_res', 0, 2]);
            finishStandoff(0, 2);
          } else {
            KuroNet.sendReliable(['so_res', 2, 0]);
            finishStandoff(2, 0);
          }
        }
        break;
      case 'so_res':
        finishStandoff(payload[1], payload[2]);
        break;
      case 'cl_start':
        if (netState.role === 'guest' && fighters[0] && fighters[1]) {
          clash = { active: true, t: 1.25, meter: 0, x: payload[1], y: payload[2], a: fighters[0], b: fighters[1], cd: 5.0, aiPushT: 0 };
          state = 'CLASH';
          KuroFX.screen.targetZoom = 1.2;
        }
        break;
      case 'cl_m':
        if (clash.active) clash.meter = clamp(clash.meter + (netState.role === 'host' ? -0.18 : 0.18), -1, 1);
        break;
      case 'cl_end':
        resolveBladeClash(payload[1]);
        break;
      case 'hit': {
        if (!myF || myF.dead) return;
        const [, hitId, dmg, posDmg, dir, heavy, unblockable, guardCrush, isProj, forceExec, cutType, lift, bleed] = payload;
        const res = resolveLocalStrike(null, myF, dmg, posDmg, dir, {
          heavy: Boolean(heavy),
          unblockable: Boolean(unblockable),
          guardCrush: Boolean(guardCrush),
          isProj: Boolean(isProj),
          forceExec: Boolean(forceExec),
          cutType: cutType || 'waist',
          lift: lift || 0,
          bleed: bleed || 0,
        });
        KuroNet.sendReliable(['res', hitId, res.outcome, Math.round(myF.hp), Math.round(myF.pos), Math.round(myF.ki), res.broken ? 1 : 0, res.dead ? 1 : 0, res.dmg || 0]);
        sendMyNetState(true);
        break;
      }
      case 'res': {
        const [, hitId, outcome, hp, pos, ki, broken, dead, dealt] = payload;
        const pend = netState.pendingHits.get(hitId);
        netState.pendingHits.delete(hitId);
        if (opF) {
          opF.hp = hp;
          opF.pos = pos;
          opF.ki = ki;
          if (broken) opF.execMark = true;
          if (dead) opF.severed = true;
        }
        if (!pend || !myF) return;
        if (outcome === 'evade') {
          KuroFX.applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 40, txt: 'EVADE', c: '#f2eee5', sc: 0.9 });
        } else if (outcome === 'parry') {
          KuroFX.applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: -pend.dir, n: 22, redP: 0.5, sfx: 'parry', hitstop: 0.08, inv: 0.08, slow: 0.2, zoom: 1.16, shake: 16 });
          KuroFX.applyEvent({ k: 'ring', x: pend.fxX, y: pend.fxY, mr: 130, c: '#f2eee5', lw: 6 });
          myF.pos = Math.min(myF.maxPos, myF.pos + 46);
          myF.vx = -pend.dir * 320;
          if (myF.pos >= myF.maxPos) breakPosture(myF, -pend.dir);
          else { myF.act = 'stagger'; myF.stagT = myF.actT = myF.actD = 1.1; }
          KuroFX.applyEvent({ k: 'txt', x: myF.x, y: myF.y - 122, txt: 'PARRIED!', c: '#e03131', sc: 1.25 });
          sendMyNetState(true);
        } else if (outcome === 'guard') {
          KuroFX.applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: -pend.dir, n: 10, sfx: 'guard', shake: 6 });
          if (broken) KuroFX.applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 60, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.2 });
        } else if (outcome === 'hit' || outcome === 'exec') {
          const isEx = outcome === 'exec';
          if (pend.grantKi) grantHit(myF, 80, isEx ? 18 : pend.heavy ? 12 : 7);
          if (isEx) {
            myF.hp = Math.min(myF.maxHp, myF.hp + 15);
            KuroFX.applyEvent({ k: 'cut', x1: pend.fxX - 135, y1: pend.fxY - 72, x2: pend.fxX + 135, y2: pend.fxY + 72, c: '#e03131', w: 16, l: 0.55, sfx: 'exec', hitstop: 0.085, inv: 0.12, slow: 0.3, zoom: 1.22, shake: 20 });
            KuroFX.applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 50, txt: `EXECUTION -${dealt}`, c: '#e03131', sc: 1.3 });
          } else {
            KuroFX.applyEvent({ k: 'sparks', x: pend.fxX, y: pend.fxY, dir: pend.dir, n: pend.heavy ? 14 : 9, redP: 0.45, sfx: pend.heavy ? 'heavyHit' : 'hit', hitstop: pend.heavy ? 0.06 : 0.04, shake: pend.heavy ? 10 : 6 });
            KuroFX.applyEvent({ k: 'ink', x: pend.fxX, y: pend.fxY, dir: pend.dir, n: 12, big: pend.heavy });
            KuroFX.applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 34, txt: `-${dealt}`, c: pend.heavy ? '#e03131' : '#f2eee5', sc: pend.heavy ? 1.15 : 0.95 });
          }
          if (broken) KuroFX.applyEvent({ k: 'txt', x: pend.fxX, y: pend.fxY - 70, txt: 'POSTURE BROKEN!', c: '#e03131', sc: 1.2 });
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
      case 'rm_wep':
        if (payload[1] === 'host') netState.p1Weapon = clamp(payload[2] || 0, 0, KuroWeapons.WEAPONS.length - 1);
        else netState.p2Weapon = clamp(payload[2] || 0, 0, KuroWeapons.WEAPONS.length - 1);
        if (callbacks.onRematchWeaponSync) callbacks.onRematchWeaponSync(netState.p1Weapon, netState.p2Weapon);
        break;
      case 'rm':
        if (payload[1] !== undefined) netState.p1Weapon = clamp(payload[1], 0, KuroWeapons.WEAPONS.length - 1);
        if (payload[2] !== undefined) netState.p2Weapon = clamp(payload[2], 0, KuroWeapons.WEAPONS.length - 1);
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

  /* ==================== MODES & ROUND SETUP ==================== */
  function resetArena() {
    projs = [];
    clones = [];
    ult = null;
    standoff.active = false;
    clash.active = false;
    KuroFX.resetArena();
  }

  function showBanner(kanji, title, sub, dur = 1.35, enterBannerState = true) {
    banner = { kanji, title, sub, t: dur, dur };
    if (enterBannerState) state = 'BANNER';
    KuroFX.SFX.play('taiko');
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
    p1.sheathed = false;
    p1.bleedT = 0;
    p1.hp = Math.min(p1.maxHp, p1.hp + 25);
    p1.hpLag = p1.hp;
    p1.scarf.reset(-240, GROUND - 80);
    resetArena();

    if (mode === 'story') {
      const w = KuroWeapons.STORY_WAVES[idx];
      stageIdx = w.stageIdx;
      showBanner(w.kanji, w.title, w.sub, 1.45);
    } else {
      stageIdx = idx % KuroWeapons.STAGES.length;
      showBanner(`第${idx + 1}波`, `DOJO WAVE ${idx + 1}`, 'Survive and raise your Flow Rank.', 1.2);
    }
  }

  function spawnWaveEnemies() {
    let list;
    let mult = 1;
    if (mode === 'story') {
      list = KuroWeapons.STORY_WAVES[wave].list;
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
    if (list.length === 1 && list[0] === 'boss') startStandoff(1.45);
  }

  function openScrollPicker() {
    state = 'SCROLL';
    if (mode === 'endless') saveBest(wave + 1, score);
    const p1 = fighters[0];
    const avail = KuroWeapons.SCROLLS.filter((p) => !p1.perks.has(p.id));
    const picks = (avail.length >= 3 ? avail : KuroWeapons.SCROLLS).slice().sort(() => Math.random() - 0.5).slice(0, 3);
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
    }, 900);
  }

  function setupLocal2PRound() {
    resetArena();
    roundEndT = 0;
    fighters = [
      makeFighter({ id: 1, team: 1, role: 'player', name: 'P1', weaponIdx: menuWeaponIdx, x: -240, f: 1, hp: 120, scarfCol: '#f2eee5', hat: 'kasa' }),
      makeFighter({ id: 2, team: 2, role: 'player', name: 'P2', weaponIdx: (menuWeaponIdx + 1) % KuroWeapons.WEAPONS.length, x: 240, f: -1, hp: 120, scarfCol: '#c82424', hat: 'kabuto' }),
    ];
    showBanner(`第${roundNum}戦`, `ROUND ${roundNum}`, `${KuroWeapons.get(fighters[0].weaponIdx).name.toUpperCase()}  VS  ${KuroWeapons.get(fighters[1].weaponIdx).name.toUpperCase()}`, 1.15);
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
    showBanner(`第${roundNum}戦`, `ROUND ${roundNum}`, netState.role === 'host' ? 'YOU ARE P1 (LEFT)' : 'YOU ARE P2 (RIGHT)', 1.15);
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
    menuFighters = [
      makeFighter({ id: 901, team: 1, role: 'player', weaponIdx: menuWeaponIdx, x: -135, f: 1, hat: 'kasa', scarfCol: '#f2eee5' }),
      makeFighter({ id: 902, team: 2, role: 'player', weaponIdx: 1, x: 145, f: -1, hat: 'boss', scarfCol: '#c82424' }),
    ];
    camX = 0;
    camZoom = 1.04;
    KuroFX.screen.targetZoom = 1.04;
    if (callbacks.onModeChange) callbacks.onModeChange('menu');
  }

  /* ==================== MAIN 60 FPS LOOP ==================== */
  function buildWorldView() {
    return {
      mode,
      state,
      stageId: currentStageId(),
      wave,
      score,
      combo,
      flowRank: flowRankOf(flow),
      rounds,
      roundNum,
      netRole: netState.role,
      tTime,
      camX,
      camZoom,
      settings,
      banner,
      standoff,
      clash,
      ult,
      fighters,
      menuFighters,
      clones,
      projs,
      myFighter: getMyFighter(),
    };
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
    if (killSlowCd > 0) killSlowCd = Math.max(0, killSlowCd - rdt);
    if (clash.cd > 0) clash.cd = Math.max(0, clash.cd - rdt);

    if (state === 'MENU' || state === 'SCROLL') {
      tTime += rdt;
      camX = Math.sin(tTime * 0.28) * 32;
      camZoom = 1.04;
      if (menuFighters[0]) {
        menuFighters[0].weaponIdx = menuWeaponIdx;
        menuFighters[0].weapon = KuroWeapons.get(menuWeaponIdx).id;
      }
      menuFighters.forEach((f) => updatePoseAndScarf(f, rdt));
      KuroFX.update(rdt, rdt, 'bridge', true);
      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    if (state === 'PAUSED' || state === 'VICTORY' || state === 'GAMEOVER') {
      KuroFX.update(rdt, rdt * 0.25, currentStageId(), false);
      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    // Banner -> Standoff or Play
    if (state === 'BANNER') {
      tTime += rdt;
      KuroFX.update(rdt, rdt, currentStageId(), false);
      fighters.forEach((f) => updatePoseAndScarf(f, rdt));
      if (banner.t <= 0) {
        if (mode === 'story' || mode === 'endless') {
          state = 'PLAYING';
          spawnWaveEnemies();
        } else if (roundNum === 1) {
          startStandoff(mode === 'online' ? 1.55 : rand(1.1, 1.9));
        } else {
          state = 'PLAYING';
        }
      }
      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    // Standoff Opening (待 -> 抜)
    if (state === 'STANDOFF') {
      tTime += rdt;
      KuroFX.update(rdt, rdt, currentStageId(), false);
      fighters.forEach((f) => updatePoseAndScarf(f, rdt));
      camZoom = lerp(camZoom, KuroFX.screen.targetZoom, clamp(rdt * 6, 0, 1));

      const i1 = KuroControls.readP1(mode);
      const i2 = mode === 'local2p' ? KuroControls.readP2Local() : null;

      if (standoff.phase === 'wait') {
        if (mode !== 'online' || netState.role === 'host') {
          standoff.waitT -= rdt;
          if (standoff.waitT <= 0) {
            standoff.phase = 'draw';
            KuroFX.SFX.play('glint');
            if (mode === 'online') KuroNet.sendReliable(['so_go']);
          }
        }
        if (i1.atk) {
          if (mode === 'online') {
            if (netState.role === 'host') { KuroNet.sendReliable(['so_res', 0, 1]); finishStandoff(0, 1); }
            else KuroNet.sendReliable(['so_try']);
          } else finishStandoff(0, 1);
        } else if (i2 && i2.atk) {
          finishStandoff(0, 2);
        }
      } else {
        standoff.drawT -= rdt;
        if (i1.atk) {
          if (mode === 'online') {
            if (netState.role === 'host') { KuroNet.sendReliable(['so_res', 1, 0]); finishStandoff(1, 0); }
            else KuroNet.sendReliable(['so_try']);
          } else finishStandoff(1, 0);
        } else if (i2 && i2.atk) {
          finishStandoff(2, 0);
        } else if (standoff.drawT <= 0) {
          if (mode === 'online' && netState.role === 'host') KuroNet.sendReliable(['so_res', 0, 0]);
          finishStandoff(0, 0);
        }
      }

      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    // Blade Clash (Tsubazeriai)
    if (state === 'CLASH') {
      tTime += rdt;
      clash.t -= rdt;
      KuroFX.update(rdt, rdt, currentStageId(), false);
      fighters.forEach((f) => updatePoseAndScarf(f, rdt));
      camZoom = lerp(camZoom, KuroFX.screen.targetZoom, clamp(rdt * 8, 0, 1));

      const i1 = KuroControls.readP1(mode);
      const i2 = mode === 'local2p' ? KuroControls.readP2Local() : null;

      if (i1.atk) {
        const delta = mode === 'online' && netState.role === 'guest' ? -0.18 : 0.18;
        clash.meter = clamp(clash.meter + delta, -1, 1);
        KuroFX.applyEvent({ k: 'sparks', x: clash.x, y: clash.y, dir: 0, n: 6, sfx: 'guard', shake: 4 });
        if (mode === 'online') KuroNet.sendReliable(['cl_m']);
      }
      if (i2 && i2.atk) {
        clash.meter = clamp(clash.meter - 0.18, -1, 1);
        KuroFX.applyEvent({ k: 'sparks', x: clash.x, y: clash.y, dir: 0, n: 6, sfx: 'guard', shake: 4 });
      }
      if (mode === 'story' || mode === 'endless') {
        clash.aiPushT -= rdt;
        if (clash.aiPushT <= 0) {
          clash.aiPushT = 0.22;
          clash.meter = clamp(clash.meter - 0.11, -1, 1);
        }
      }

      if (clash.t <= 0 || Math.abs(clash.meter) >= 0.95) {
        const winner = clash.meter >= 0 ? 1 : 2;
        if (mode !== 'online' || netState.role === 'host') {
          if (mode === 'online') KuroNet.sendReliable(['cl_end', winner]);
          resolveBladeClash(winner);
        }
      }

      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    // Ultimate Freeze Sequence
    if (state === 'ULT') {
      tTime += rdt;
      tickUltimate(rdt);
      KuroFX.update(rdt, rdt, currentStageId(), false);
      camZoom = lerp(camZoom, KuroFX.screen.targetZoom, clamp(rdt * 6, 0, 1));
      KuroRender.drawFrame(buildWorldView());
      emitHudCallbacks(now);
      return;
    }

    // Hitstop
    if (KuroFX.screen.hitstop > 0) {
      KuroFX.screen.hitstop = Math.max(0, KuroFX.screen.hitstop - rdt);
      KuroRender.drawFrame(buildWorldView());
      return;
    }

    // Slow Motion (Kill Anticipation, Execution, Parry, Sever)
    let scale = 1;
    if (KuroFX.screen.slowT > 0) {
      KuroFX.screen.slowT = Math.max(0, KuroFX.screen.slowT - rdt);
      scale = KuroFX.screen.slowScale || 0.28;
      if (KuroFX.screen.slowT <= 0) KuroFX.screen.targetZoom = 1;
    }
    const dt = rdt * scale;
    tTime += dt;

    if (flowT > 0 && (flowT -= rdt) <= 0) {
      combo = 0;
      flow = Math.max(0, flow - 20 * rdt);
    }

    // Step Fighters by Mode
    if (mode === 'online') {
      const myF = getMyFighter();
      const opF = getRemoteFighter();
      if (myF) stepFighter(myF, KuroControls.readP1(mode), dt);
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
      if (fighters[0]) stepFighter(fighters[0], KuroControls.readP1(mode), dt);
      if (fighters[1]) stepFighter(fighters[1], KuroControls.readP2Local(), dt);
      const p1 = fighters[0];
      const p2 = fighters[1];
      if ((p1.dead || p2.dead) && (roundEndT += rdt) >= 1.45) {
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
      if (fighters[0]) stepFighter(fighters[0], KuroControls.readP1(mode), dt);
      for (let i = fighters.length - 1; i >= 1; i--) {
        const e = fighters[i];
        stepFighter(e, computeAI(e, dt), dt);
        if (e.dead && e.deadT <= 0) fighters.splice(i, 1);
      }
      if (fighters[0] && fighters[0].dead) {
        finishSoloRun(false);
      } else if (fighters.length === 1 && (clearDelay += rdt) >= 1.2) {
        clearDelay = 0;
        if (mode === 'story' && wave + 1 >= KuroWeapons.STORY_WAVES.length) finishSoloRun(true);
        else openScrollPicker();
      }
    }

    updateProjectilesAndClones(dt);
    KuroFX.update(rdt, dt, currentStageId(), false);

    // Camera Tracking
    if (fighters.length >= 2) {
      const f0 = fighters[0];
      const near = fighters.slice(1).reduce((b, o) => (Math.abs(o.x - f0.x) < Math.abs(b.x - f0.x) ? o : b), fighters[1]);
      camX = lerp(camX, clamp(lerp(f0.x, near.x, mode === 'story' || mode === 'endless' ? 0.3 : 0.5), LEFT_B + 460, RIGHT_B - 460), clamp(rdt * 6.5, 0, 1));
    } else if (fighters[0]) {
      camX = lerp(camX, clamp(fighters[0].x, LEFT_B + 460, RIGHT_B - 460), clamp(rdt * 6, 0, 1));
    }
    camZoom = lerp(camZoom, KuroFX.screen.targetZoom, clamp(rdt * 5.5, 0, 1));

    KuroRender.drawFrame(buildWorldView());
    emitHudCallbacks(now);
  }

  function emitHudCallbacks(now) {
    if (mode !== 'menu' && now - lastSkillEmit > 100) {
      lastSkillEmit = now;
      const myF = getMyFighter();
      if (myF && callbacks.onSkillState) {
        const sk = KuroWeapons.getSkillLabels(myF.weaponIdx);
        callbacks.onSkillState({
          ki: Math.round(myF.ki),
          qReady: myF.ki >= sk.q.cost,
          eReady: myF.ki >= sk.e.cost,
          rReady: myF.ki >= sk.r.cost,
          qShort: sk.q.short,
          eShort: sk.e.short,
          rShort: sk.r.short,
          qCost: sk.q.cost,
          eCost: sk.e.cost,
          rCost: sk.r.cost,
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
          lowFx: KuroFX.isLowFx(),
          mode,
        });
      }
    }
  }

  /* ==================== PUBLIC API ==================== */
  const KuroGame = {
    get WEAPONS() { return KuroWeapons.WEAPONS; },
    get STAGES() { return KuroWeapons.STAGES; },
    get SCROLLS() { return KuroWeapons.SCROLLS; },
    get IS_TOUCH() { return KuroControls.IS_TOUCH; },

    init(canvasEl, cbs) {
      cv = canvasEl;
      callbacks = cbs || {};
      KuroFX.setLowFx(computeLowFx());
      KuroRender.init(cv);
      setupMenuBackdrop();

      global.addEventListener('resize', () => KuroRender.resize());

      KuroControls.bindCanvas(cv, {
        canAttack: () => state === 'PLAYING' || state === 'STANDOFF' || state === 'CLASH',
        getMode: () => mode,
        onAudioUnlock: () => KuroFX.SFX.init(),
        onPause: () => {
          if (mode !== 'menu' && mode !== 'online' && !matchEnded && state !== 'SCROLL') {
            KuroGame.togglePause();
          }
        },
      });

      if (global.KuroNet) KuroNet.on('relay', handleNetRelay);
      if (!rafId) rafId = requestAnimationFrame(loop);
    },

    unlockAudio: () => KuroFX.SFX.init(),
    playMenuDraw: () => { KuroFX.SFX.init(); KuroFX.SFX.play('hover'); },
    loadBest,

    setWeapon(idx) {
      menuWeaponIdx = KuroWeapons.indexOf(idx);
      if (menuFighters[0]) {
        menuFighters[0].weaponIdx = menuWeaponIdx;
        menuFighters[0].weapon = KuroWeapons.get(menuWeaponIdx).id;
      }
    },

    setStage(idx) {
      selectedStageIdx = clamp(idx | 0, 0, KuroWeapons.STAGES.length - 1);
    },

    updateSettings(patch) {
      Object.assign(settings, patch || {});
      KuroFX.SFX.setVolume(settings.volume);
      KuroFX.SFX.setMuted(Boolean(settings.muted));
      KuroFX.setLowFx(computeLowFx());
      KuroRender.resize();
    },

    getSettings() {
      return { ...settings };
    },

    startStory() {
      KuroFX.SFX.init();
      mode = 'story';
      matchEnded = false;
      netState.active = false;
      wave = 0; score = 0; kills = 0; combo = 0; flow = 0; maxFlow = 'D'; parries = 0; clearDelay = 0;
      fighters = [makeFighter({ id: 1, team: 1, role: 'player', name: 'KUROKAZE', weaponIdx: menuWeaponIdx, x: -240, f: 1, scarfCol: '#c82424' })];
      if (callbacks.onModeChange) callbacks.onModeChange('story');
      beginSoloWave(0);
    },

    startEndless() {
      KuroFX.SFX.init();
      mode = 'endless';
      matchEnded = false;
      netState.active = false;
      wave = 0; score = 0; kills = 0; combo = 0; flow = 0; maxFlow = 'D'; parries = 0; clearDelay = 0;
      fighters = [makeFighter({ id: 1, team: 1, role: 'player', name: 'KUROKAZE', weaponIdx: menuWeaponIdx, x: -240, f: 1, scarfCol: '#c82424' })];
      if (callbacks.onModeChange) callbacks.onModeChange('endless');
      beginSoloWave(0);
    },

    startLocal2P() {
      KuroFX.SFX.init();
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
      KuroFX.SFX.init();
      mode = 'online';
      matchEnded = false;
      netState.active = true;
      netState.role = cfg.role === 'guest' ? 'guest' : 'host';
      netState.p1Weapon = KuroWeapons.indexOf(cfg.p1Weapon || 0);
      netState.p2Weapon = KuroWeapons.indexOf(cfg.p2Weapon || 0);
      netState.stageIdx = clamp(cfg.stageIdx || 0, 0, KuroWeapons.STAGES.length - 1);
      rounds = [0, 0];
      roundNum = 1;
      if (callbacks.onModeChange) callbacks.onModeChange('online');
      setupOnlineRound();
    },

    setOnlineRematchWeapon(wepIdx) {
      if (mode !== 'online' || !netState.active) return;
      const idx = KuroWeapons.indexOf(wepIdx);
      if (netState.role === 'host') netState.p1Weapon = idx;
      else netState.p2Weapon = idx;
      KuroNet.sendReliable(['rm_wep', netState.role, idx]);
    },

    requestRematch() {
      if (mode === 'story') KuroGame.startStory();
      else if (mode === 'endless') KuroGame.startEndless();
      else if (mode === 'local2p') KuroGame.startLocal2P();
      else if (mode === 'online') {
        roundNum = 1;
        rounds = [0, 0];
        matchEnded = false;
        KuroNet.sendReliable(['rm', netState.p1Weapon, netState.p2Weapon]);
        setupOnlineRound();
      }
    },

    applyScroll(scrollId) {
      const p1 = fighters[0];
      if (p1) {
        p1.perks.add(scrollId);
        if (scrollId === 'iron') p1.maxPos = 145;
      }
      KuroFX.SFX.play('parry');
      beginSoloWave(wave + 1);
    },

    togglePause(force) {
      if (mode === 'menu' || mode === 'online') return;
      const next = force !== undefined ? Boolean(force) : state !== 'PAUSED';
      state = next ? 'PAUSED' : 'PLAYING';
      if (callbacks.onPauseChange) callbacks.onPauseChange(next);
    },

    returnToMenu() {
      KuroControls.clearAll();
      setupMenuBackdrop();
    },

    setTouchAxis(x, y) {
      KuroControls.setTouchAxis(x, y);
    },

    setTouchButton(name, down) {
      KuroControls.setTouchButton(name, down);
    },
  };

  global.KuroGame = KuroGame;
})(window);
