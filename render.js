/* KUROKAZE IV — Kurosawa Sumi-e Renderer, Articulated Skeletons & Dynamic HUD
 * Loaded after controls.js, weapons.js, and fx.js, and before game.js.
 */
(function (global) {
  'use strict';

  const VW = 1280;
  const VH = 720;
  const GROUND = 582;
  const LEFT_B = -640;
  const RIGHT_B = 640;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ==================== ARTICULATED SKELETON POSES ==================== */
  const POSES = {
    idle:       { py:-52, tr:.14, hd:-.05, uL:.55, fL:1.5,  uR:.35, fR:1.45, lL:-.28, sL:-.15, lR:.32, sR:-.20, sw:.42 },
    idleOdachi: { py:-50, tr:.08, hd:-.04, uL:.35, fL:1.2,  uR:-.55,fR:-.95, lL:-.36, sL:-.16, lR:.38, sR:-.22, sw:-1.25 },
    idleNagi:   { py:-51, tr:.18, hd:-.06, uL:1.05,fL:1.5,  uR:.15, fR:1.3,  lL:-.38, sL:-.18, lR:.42, sR:-.24, sw:.12 },
    idleDual:   { py:-47, tr:.34, hd:-.14, uL:-.45,fL:.55,  uR:.95, fR:1.6,  lL:-.44, sL:-.24, lR:.46, sR:-.34, sw:-.35 },
    sheathed:   { py:-52, tr:.06, hd:-.02, uL:.22, fL:1.15, uR:.18, fR:1.05, lL:-.22, sL:-.10, lR:.26, sR:-.12, sw:-1.45 },
    runA:       { py:-47, tr:.56, hd:-.26, uL:-.7, fL:-.2,  uR:-.5, fR:-.1,  lL:-.84, sL:-.44, lR:.80, sR:-.60, sw:-1.15 },
    runB:       { py:-45, tr:.56, hd:-.26, uL:.55, fL:1.15, uR:-.6, fR:-.2,  lL:.74,  sL:-.56, lR:-.80,sR:-.42, sw:-1.10 },
    jump:       { py:-54, tr:.25, hd:-.10, uL:.80, fL:1.55, uR:-.45,fR:.35,  lL:-.55, sL:-1.05,lR:.75, sR:-.65, sw:-.65 },
    fall:       { py:-54, tr:.10, hd:.08,  uL:1.25,fL:1.85, uR:-.65,fR:-.1,  lL:-.35, sL:-.75, lR:.45, sR:-.35, sw:-.45 },
    dash:       { py:-39, tr:.88, hd:-.45, uL:-.95,fL:-.6,  uR:-.8, fR:-.5,  lL:-.95, sL:-.35, lR:.85, sR:-.75, sw:-1.35 },
    guard:      { py:-48, tr:-.08,hd:.04,  uL:1.05,fL:2.25, uR:1.15,fR:2.1,  lL:-.42, sL:-.25, lR:.48, sR:-.35, sw:1.42 },
    parry:      { py:-50, tr:-.24,hd:.05,  uL:.55, fL:1.45, uR:2.25,fR:2.55, lL:-.50, sL:-.25, lR:.55, sR:-.38, sw:.85 },
    clash:      { py:-45, tr:.28, hd:-.08, uL:1.18,fL:2.15, uR:1.26,fR:2.05, lL:-.58, sL:-.30, lR:.62, sR:-.42, sw:1.18 },
    windup:     { py:-45, tr:-.34,hd:.10,  uL:.45, fL:1.35, uR:2.58,fR:2.95, lL:-.48, sL:-.30, lR:.52, sR:-.38, sw:.95 },
    slash1:     { py:-46, tr:.52, hd:-.22, uL:-.45,fL:.25,  uR:1.42,fR:1.55, lL:-.60, sL:-.28, lR:.65, sR:-.45, sw:-.10 },
    slash2:     { py:-54, tr:-.24,hd:-.10, uL:-.35,fL:.55,  uR:2.55,fR:2.75, lL:-.45, sL:-.20, lR:.50, sR:-.28, sw:.45 },
    slash3:     { py:-42, tr:.72, hd:-.30, uL:-.75,fL:-.3,  uR:.75, fR:.82,  lL:-.75, sL:-.35, lR:.78, sR:-.55, sw:-.32 },
    thrust:     { py:-46, tr:.65, hd:-.28, uL:1.35,fL:1.55, uR:1.50,fR:1.58, lL:-.78, sL:-.30, lR:.78, sR:-.50, sw:.02 },
    aim:        { py:-48, tr:.18, hd:-.05, uL:1.45,fL:1.60, uR:1.35,fR:1.55, lL:-.45, sL:-.22, lR:.48, sR:-.32, sw:.0 },
    airSlash:   { py:-52, tr:.48, hd:-.15, uL:-.55,fL:.15,  uR:1.15,fR:1.25, lL:-.45, sL:-.95, lR:.85, sR:-.45, sw:-.22 },
    vault:      { py:-56, tr:.62, hd:-.18, uL:1.25,fL:1.75, uR:1.85,fR:2.15, lL:-.85, sL:-1.25,lR:.72, sR:-.95, sw:-.75 },
    whirl:      { py:-45, tr:.38, hd:-.12, uL:-1.1,fL:-1.2, uR:1.35,fR:1.45, lL:-.62, sL:-.28, lR:.64, sR:-.36, sw:-.06 },
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
      return {
        e: W(ex, ey),
        h: W(ex + Math.sin(fa) * 21 * s, ey + Math.cos(fa) * 21 * s),
      };
    };
    const leg = (u, sh) => {
      const kx = Math.sin(u) * 26 * s;
      const ky = Math.cos(u) * 26 * s;
      return {
        k: W(kx, ky),
        ft: W(kx + Math.sin(sh) * 26 * s, ky + Math.cos(sh) * 26 * s),
      };
    };
    const aL = arm(p.uL, p.fL);
    const aR = arm(p.uR, p.fR);
    const lL = leg(p.lL, p.sL);
    const lR = leg(p.lR, p.sR);
    return {
      pel,
      sh: W(sx, sy),
      nk: W(nx, ny),
      hd: W(hx, hy),
      hr: 11 * s,
      eL: aL.e,
      hL: aL.h,
      eR: aR.e,
      hR: aR.h,
      kL: lL.k,
      fL: lL.ft,
      kR: lR.k,
      fR: lR.ft,
      f,
      s,
      swAng: Math.atan2(aR.h.y - aR.e.y, aR.h.x - aR.e.x) + p.sw * f,
    };
  }

  /* ==================== 8-NODE VERLET SCARF ==================== */
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

  /* ==================== CANVAS & FILM GRAIN ==================== */
  let cv = null;
  let ctx = null;
  let vScale = 1;
  let vOx = 0;
  let vOy = 0;
  let grainPattern = null;

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

  function init(canvasEl) {
    cv = canvasEl;
    ctx = cv.getContext('2d', { alpha: false });
    grainPattern = null;
    resize();
  }

  function resize() {
    if (!cv || !ctx) return;
    const rect = cv.getBoundingClientRect();
    const low = global.KuroFX ? KuroFX.isLowFx() : false;
    const dpr = Math.min(global.devicePixelRatio || 1, low ? 1.4 : 2.0);
    cv.width = Math.max(2, Math.floor(rect.width * dpr));
    cv.height = Math.max(2, Math.floor(rect.height * dpr));
    const sx = cv.width / VW;
    const sy = cv.height / VH;
    vScale = Math.max(Math.min(sx, sy), Math.max(sx, sy) * 0.8);
    vOx = (cv.width - VW * vScale) * 0.5;
    vOy = (cv.height - VH * vScale) * 0.5;
  }

  function seg(a, b, w, c) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /* ==================== STAGE BACKDROP ==================== */
  function drawBackdrop(inv, stId, world) {
    const fx = global.KuroFX;
    const inUlt = world.state === 'ULT';
    const isMenu = world.mode === 'menu';
    const camX = world.camX;
    const tTime = world.tTime;

    const sky = ctx.createLinearGradient(0, 0, 0, VH);
    if (inv) {
      sky.addColorStop(0, '#f2eee5');
      sky.addColorStop(1, '#d6d2c8');
    } else if (inUlt) {
      sky.addColorStop(0, '#050507');
      sky.addColorStop(1, '#180709');
    } else if (stId === 'temple') {
      sky.addColorStop(0, '#0b080a');
      sky.addColorStop(0.55, '#251518');
      sky.addColorStop(1, '#582022');
    } else if (stId === 'bridge') {
      sky.addColorStop(0, '#07060a');
      sky.addColorStop(0.55, '#19181d');
      sky.addColorStop(1, '#323136');
    } else {
      sky.addColorStop(0, '#0c0d11');
      sky.addColorStop(0.55, '#242423');
      sky.addColorStop(1, '#4c4b46');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(-320, -240, VW + 640, VH + 480);

    // Blood Moon distant lightning flash
    if (!inv && fx && fx.screen.lightningA > 0.02) {
      ctx.fillStyle = `rgba(242,238,229,${fx.screen.lightningA * 0.32})`;
      ctx.fillRect(-320, -240, VW + 640, VH + 480);
    }

    // Moon / Crimson Eclipse
    const mx = VW * 0.52 - camX * 0.06;
    const my = VH * 0.28;
    const mr = inUlt || stId === 'bridge' ? 148 : 118;
    const redMoon = inUlt || (stId === 'bridge' && !isMenu);
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

    // Distant silhouette mountains
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

    // Background bamboo layer (intact parallax stalks; foreground sliceable ones draw in world space)
    if (fx && (stId === 'bamboo' || isMenu)) {
      fx.state.bamboo.forEach((b) => {
        if (b.d >= 0.6 && !isMenu) return;
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

    // Burning Temple Torii Gate
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

    // Drifting bridge fog
    if (fx && (stId === 'bridge' || isMenu)) {
      fx.state.fog.forEach((p) => {
        const fxPos = ((p.x + tTime * p.spd + 1000) % 2000) - 1000;
        ctx.fillStyle = 'rgba(242,238,229,0.09)';
        ctx.beginPath();
        ctx.ellipse(VW * 0.5 + fxPos - camX * 0.35, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    const mist = ctx.createLinearGradient(0, GROUND - 110, 0, GROUND + 20);
    mist.addColorStop(0, 'rgba(242,238,229,0)');
    mist.addColorStop(1, stId === 'temple' ? 'rgba(200,36,36,0.18)' : 'rgba(242,238,229,0.16)');
    ctx.fillStyle = mist;
    ctx.fillRect(-320, GROUND - 110, VW + 640, 130);
  }

  /* ==================== SLICEABLE FOREGROUND BAMBOO ==================== */
  function drawSliceableBamboo(tTime, inv) {
    const fx = global.KuroFX;
    if (!fx || inv) return;
    for (const b of fx.state.bamboo) {
      if (b.d < 0.6) continue;
      const sw = Math.sin(tTime * 3.1 + b.ph) * 14;
      ctx.save();
      ctx.strokeStyle = 'rgba(10,10,13,0.88)';
      ctx.lineWidth = b.w;
      ctx.lineCap = 'butt';

      if (!b.sliced) {
        ctx.beginPath();
        ctx.moveTo(b.x, GROUND + 8);
        ctx.quadraticCurveTo(b.x + sw * 0.4 + b.lean * 120, GROUND * 0.52, b.x + sw + b.lean * 220, -40);
        ctx.stroke();
      } else {
        // Remaining cut stump with crisp diagonal edge
        ctx.beginPath();
        ctx.moveTo(b.x, GROUND + 8);
        ctx.lineTo(b.x + b.lean * 24, b.cutY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(242,238,229,0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + b.lean * 24 - b.w * 0.5, b.cutY + 3);
        ctx.lineTo(b.x + b.lean * 24 + b.w * 0.5, b.cutY - 3);
        ctx.stroke();

        // Falling upper bamboo half
        if (b.topLife > 0) {
          ctx.save();
          ctx.globalAlpha = clamp(b.topLife / 1.2, 0, 1);
          ctx.translate(b.topX, b.topY);
          ctx.rotate(b.topAng);
          ctx.strokeStyle = 'rgba(10,10,13,0.9)';
          ctx.lineWidth = b.w;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(b.lean * 110, -260);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  /* ==================== HAT, WEAPON, SEVERED & FIGHTER DRAWING ==================== */
  function drawHatShape(hx, hy, r, hat, f, team) {
    if (hat === 'kasa') {
      ctx.beginPath();
      ctx.moveTo(hx - r * 2.7, hy - r * 0.15);
      ctx.quadraticCurveTo(hx, hy - r * 2.2, hx + r * 2.7, hy - r * 0.15);
      ctx.closePath();
      ctx.fillStyle = '#111115';
      ctx.fill();
      ctx.strokeStyle = '#f2eee5';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (hat === 'band') {
      seg({ x: hx - r, y: hy - r * 0.3 }, { x: hx + r, y: hy - r * 0.3 }, 3.5, '#c82424');
    } else {
      const isB = hat === 'boss';
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
      ctx.strokeStyle = isB || team === 2 ? '#c82424' : '#f2eee5';
      ctx.lineWidth = isB ? 4 : 2.8;
      ctx.beginPath();
      ctx.moveTo(hx + f * r * 0.3, hy - r * 0.85);
      ctx.quadraticCurveTo(hx + f * r * 1.7, hy - r * 2.6, hx + f * r * 2.2, hy - r * 3.1);
      ctx.stroke();
    }
  }

  function drawFighter(f, inv, world, ghostA = 1, gRed = false, skOverride = null) {
    const sk = skOverride || buildSkel(f.x, f.y, f.f, f.pose, f.scale);
    const W = global.KuroWeapons ? KuroWeapons.get(f.weaponIdx || 0) : { len: 78, dual: false, guardCrush: false };
    const ink =
      ghostA < 1
        ? gRed ? 'rgba(200,36,36,0.65)' : 'rgba(14,14,18,0.72)'
        : f.flashT > 0 ? '#f2eee5' : '#08080a';
    const rim = ghostA < 1 ? 'rgba(242,238,229,0.38)' : f.stagT > 0 ? '#e03131' : '#f2eee5';
    const lw = (f.role === 'boss' || f.role === 'brute' ? 8 : 6.4) * sk.s;

    ctx.save();
    ctx.globalAlpha = ghostA;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

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

    const isSheathed =
      Boolean(f.sheathed) ||
      f.act === 'taunt' ||
      (f.act === 'iai' && f.iaiStage === 0) ||
      (world && world.ult && world.ult.caster === f && world.ult.sheathed);

    if (isSheathed && ghostA >= 0.45) {
      // Draw saya scabbard tucked at hip
      const scAng = f.f > 0 ? 2.85 : 0.29;
      const sx1 = sk.pel.x + f.f * 8;
      const sy1 = sk.pel.y + 2;
      const sx2 = sx1 + Math.cos(scAng) * 52 * sk.s;
      const sy2 = sy1 + Math.sin(scAng) * 52 * sk.s;
      seg({ x: sx1, y: sy1 }, { x: sx2, y: sy2 }, 5.2, '#141418');
      seg({ x: sx1, y: sy1 }, { x: sx1 - Math.cos(scAng) * 14, y: sy1 - Math.sin(scAng) * 14 }, 4.5, '#c82424');
    } else if (ghostA >= 0.45) {
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
        blade(mx, my, an, 44, 6, f.act === 'airSlash' || f.act === 'skillQ' || f.act === 'skillE');
      } else if (W.dual) {
        blade(hx, hy, an, ln, 4.4, false);
        blade(sk.hL.x, sk.hL.y, an - 0.35 * f.f, ln * 0.9, 4.2, true);
      } else {
        blade(hx, hy, an, ln, W.guardCrush ? 7.2 : 4.8, (f.role === 'boss' && f.phase === 2) || f.act === 'skillQ' || f.act === 'skillE');
      }

      // Telegraph cross glint
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

    drawHatShape(sk.hd.x, sk.hd.y, sk.hr, f.hat, f.f, f.team);

    // Bleed aura indicator (Dual Blade stacks)
    if (f.bleedT > 0 && ghostA >= 1) {
      ctx.fillStyle = 'rgba(224,49,49,0.75)';
      ctx.beginPath();
      ctx.arc(sk.sh.x + Math.sin(world.tTime * 14) * 8, sk.sh.y - 8, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Execution kanji 殺
    if (f.execMark && ghostA >= 1) {
      const p = 1 + 0.14 * Math.sin(world.tTime * 16);
      ctx.save();
      ctx.translate(sk.hd.x, sk.hd.y - 48);
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

  function drawSeveredPieces(inv) {
    const fx = global.KuroFX;
    if (!fx) return;

    const strokeDual = (x1, y1, x2, y2, w) => {
      seg({ x: x1, y: y1 }, { x: x2, y: y2 }, w + 3, inv ? '#08080a' : '#f2eee5');
      seg({ x: x1, y: y1 }, { x: x2, y: y2 }, w, inv ? '#f2eee5' : '#08080a');
    };

    for (const sv of fx.state.severed) {
      const a = clamp(sv.l / 1.4, 0, 1);
      const s = sv.s || 1;
      const lw = 6.6 * s;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(sv.x, sv.y);
      ctx.rotate(sv.ang);
      ctx.scale(sv.f || 1, 1);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (sv.part === 'lowerLegs') {
        strokeDual(-8 * s, -28 * s, -12 * s, 0, lw);
        strokeDual(8 * s, -28 * s, 12 * s, 0, lw);
        ctx.fillStyle = '#c82424';
        ctx.fillRect(-13 * s, -30 * s, 26 * s, 4 * s);
      } else if (sv.part === 'lowerBody') {
        strokeDual(0, -48 * s, -12 * s, -24 * s, lw);
        strokeDual(-12 * s, -24 * s, -15 * s, 0, lw * 0.9);
        strokeDual(0, -48 * s, 13 * s, -24 * s, lw);
        strokeDual(13 * s, -24 * s, 16 * s, 0, lw * 0.9);
        ctx.fillStyle = '#c82424';
        ctx.fillRect(-10 * s, -52 * s, 20 * s, 5 * s);
      } else if (sv.part === 'upperTorso' || sv.part === 'upperFull') {
        strokeDual(0, 0, 4 * s, -34 * s, lw * 1.2);
        strokeDual(4 * s, -34 * s, 22 * s, -18 * s, lw * 0.8);
        strokeDual(4 * s, -34 * s, -16 * s, -20 * s, lw * 0.8);
        ctx.fillStyle = inv ? '#08080a' : '#f2eee5';
        ctx.beginPath(); ctx.arc(5 * s, -48 * s, 12 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = inv ? '#f2eee5' : '#08080a';
        ctx.beginPath(); ctx.arc(5 * s, -48 * s, 10 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c82424';
        ctx.fillRect(-9 * s, -3 * s, 18 * s, 5 * s);
      } else if (sv.part === 'headCrest') {
        ctx.fillStyle = inv ? '#08080a' : '#f2eee5';
        ctx.beginPath(); ctx.arc(0, 0, 12 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = inv ? '#f2eee5' : '#08080a';
        ctx.beginPath(); ctx.arc(0, 0, 10 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c82424';
        ctx.fillRect(-6 * s, 8 * s, 12 * s, 4 * s);
      } else if (sv.part === 'headlessBody' || sv.part === 'armlessBody') {
        strokeDual(0, -48 * s, -13 * s, 0, lw);
        strokeDual(0, -48 * s, 14 * s, 0, lw);
        strokeDual(0, -48 * s, 4 * s, -82 * s, lw * 1.2);
        if (sv.part === 'armlessBody') {
          strokeDual(4 * s, -82 * s, -16 * s, -62 * s, lw * 0.8);
          ctx.fillStyle = inv ? '#08080a' : '#f2eee5';
          ctx.beginPath(); ctx.arc(5 * s, -96 * s, 12 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = inv ? '#f2eee5' : '#08080a';
          ctx.beginPath(); ctx.arc(5 * s, -96 * s, 10 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#c82424';
          ctx.beginPath(); ctx.arc(10 * s, -78 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
        } else {
          strokeDual(4 * s, -82 * s, 20 * s, -60 * s, lw * 0.8);
          strokeDual(4 * s, -82 * s, -16 * s, -62 * s, lw * 0.8);
          ctx.fillStyle = '#c82424';
          ctx.fillRect(-6 * s, -86 * s, 16 * s, 5 * s);
        }
      } else if (sv.part === 'arm') {
        strokeDual(-16 * s, 0, 2 * s, -4 * s, lw * 0.85);
        strokeDual(2 * s, -4 * s, 20 * s, 2 * s, lw * 0.78);
        ctx.fillStyle = '#c82424';
        ctx.beginPath(); ctx.arc(-16 * s, 0, 4.5 * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // Spinning Hats
    for (const h of fx.state.hats) {
      ctx.save();
      ctx.globalAlpha = clamp(h.l / 1.4, 0, 1);
      ctx.translate(h.x, h.y);
      ctx.rotate(h.ang);
      drawHatShape(0, 0, 11 * (h.scale || 1), h.hat, 1, 2);
      ctx.restore();
    }

    // Planted Weapons
    for (const pw of fx.state.planted) {
      const a = clamp(pw.l / 1.6, 0, 1);
      const len = pw.weapon === 'odachi' ? 96 : pw.weapon === 'naginata' ? 108 : pw.weapon === 'wakizashi' ? 54 : 74;
      const wob = pw.stuck ? Math.sin(performance.now() * 0.045) * pw.wobble : 0;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(pw.x, pw.y);
      ctx.rotate(pw.ang + wob);
      ctx.lineCap = 'round';
      // Blade stuck downward into ground
      seg({ x: 0, y: 0 }, { x: 0, y: -len * 0.72 }, pw.weapon === 'odachi' ? 6.2 : 4.2, '#111115');
      seg({ x: 0, y: 0 }, { x: 0, y: -len * 0.72 }, 2.1, '#f2eee5');
      // Guard & hilt at top
      seg({ x: -8, y: -len * 0.72 }, { x: 8, y: -len * 0.72 }, 3.2, '#c82424');
      seg({ x: 0, y: -len * 0.72 }, { x: 0, y: -len * 0.94 }, 4.2, '#18181d');
      ctx.restore();
    }
  }

  /* ==================== HUD, STANDOFF & BLADE CLASH OVERLAYS ==================== */
  function drawFighterBar(x, y, w, f, label, right, wins) {
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
    const lagR = clamp((f.hpLag !== undefined ? f.hpLag : f.hp) / f.maxHp, 0, 1);
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

  function drawHud(world) {
    if (world.mode === 'menu') return;
    const p1 = world.fighters[0];
    if (!p1) return;

    const topY = world.settings.letterbox ? 50 : 28;
    const isDuel = world.mode === 'local2p' || world.mode === 'online';
    const W1 = KuroWeapons.get(p1.weaponIdx);
    const p1Lbl = isDuel
      ? world.mode === 'online'
        ? world.netRole === 'host' ? 'YOU (P1)' : 'HOST (P1)'
        : 'P1'
      : 'KUROKAZE';
    drawFighterBar(28, topY, 276, p1, `${p1Lbl} • ${W1.name.toUpperCase()}`, false, isDuel ? world.rounds[0] : -1);

    if (isDuel && world.fighters[1]) {
      const p2 = world.fighters[1];
      const W2 = KuroWeapons.get(p2.weaponIdx);
      const p2Lbl = world.mode === 'online'
        ? world.netRole === 'guest' ? 'YOU (P2)' : 'GUEST (P2)'
        : 'P2';
      drawFighterBar(VW - 304, topY, 276, p2, `${p2Lbl} • ${W2.name.toUpperCase()}`, true, world.rounds[1]);
    } else {
      ctx.save();
      ctx.textAlign = 'right';
      ctx.font = '800 18px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#f2eee5';
      ctx.fillText(String(world.score).padStart(6, '0'), VW - 28, topY + 14);
      ctx.font = 'italic 900 28px Georgia, serif';
      ctx.fillStyle = '#e03131';
      ctx.fillText(`FLOW ${world.flowRank}`, VW - 28, topY + 46);
      if (world.combo >= 2) {
        ctx.font = '800 12px -apple-system, sans-serif';
        ctx.fillStyle = '#f2eee5';
        ctx.fillText(`${world.combo} HITS`, VW - 28, topY + 64);
      }
      ctx.restore();

      const boss = world.fighters.find((f) => f.role === 'boss' && !f.dead);
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
    const stObj = KuroWeapons.STAGES.find((s) => s.id === world.stageId) || KuroWeapons.STAGES[0];
    if (world.mode === 'story') ctx.fillText(`ACT ${world.wave + 1}/3 • ${stObj.name.toUpperCase()}`, VW * 0.5, topY + 10);
    else if (world.mode === 'endless') ctx.fillText(`DOJO WAVE ${world.wave + 1}`, VW * 0.5, topY + 10);
    else ctx.fillText(`ROUND ${world.roundNum} • BEST OF 3`, VW * 0.5, topY + 10);
    ctx.restore();

    // Desktop Dynamic Weapon-Skill Bar (updates live with custom keybinds & chosen blade)
    const isTouch = global.KuroControls ? KuroControls.IS_TOUCH : false;
    if (!isTouch && world.myFighter && world.mode !== 'local2p') {
      const f = world.myFighter;
      const sk = KuroWeapons.getSkillLabels(f.weaponIdx);
      const kQ = global.KuroControls ? KuroControls.getShortKey('skillQ') : 'Q';
      const kE = global.KuroControls ? KuroControls.getShortKey('skillE') : 'E';
      const kR = global.KuroControls ? KuroControls.getShortKey('skillR') : 'R';
      const items = [
        { k: `[${kQ}] ${sk.q.short}`, cost: sk.q.cost },
        { k: `[${kE}] ${sk.e.short}`, cost: sk.e.cost },
        { k: `[${kR}] ${sk.r.short}`, cost: sk.r.cost },
      ];
      const yB = VH - (world.settings.letterbox ? 58 : 34);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 11px -apple-system, sans-serif';
      items.forEach((it, idx) => {
        const x = VW * 0.5 + (idx - 1) * 156;
        const ok = f.ki >= it.cost;
        ctx.fillStyle = ok ? 'rgba(200,36,36,0.32)' : 'rgba(10,10,13,0.75)';
        ctx.fillRect(x - 70, yB - 14, 140, 22);
        ctx.strokeStyle = ok ? '#e03131' : 'rgba(242,238,229,0.22)';
        ctx.strokeRect(x - 70, yB - 14, 140, 22);
        ctx.fillStyle = ok ? '#f2eee5' : '#7b7770';
        ctx.fillText(`${it.k} (${it.cost})`, x, yB + 1);
      });
      ctx.restore();
    }

    // Standoff Opening Overlay (待 -> 抜 DRAW!)
    if (world.standoff && world.standoff.active) {
      const so = world.standoff;
      const atkKey = global.KuroControls ? KuroControls.getLabel('atk', 0) : 'SLASH';
      ctx.save();
      ctx.textAlign = 'center';
      if (so.phase === 'wait') {
        const pulse = 0.65 + 0.35 * Math.sin(world.tTime * 9);
        ctx.fillStyle = `rgba(242,238,229,${pulse})`;
        ctx.font = '900 48px Georgia, serif';
        ctx.fillText('待', VW * 0.5, VH * 0.36);
        ctx.font = '700 13px -apple-system, sans-serif';
        ctx.fillStyle = '#a8a29a';
        ctx.fillText('STANDOFF — HOLD YOUR BLADE UNTIL THE CRIMSON SIGNAL', VW * 0.5, VH * 0.36 + 34);
      } else if (so.phase === 'draw') {
        ctx.fillStyle = 'rgba(200,36,36,0.24)';
        ctx.fillRect(0, VH * 0.27, VW, 130);
        ctx.fillStyle = '#e03131';
        ctx.font = '900 72px Georgia, serif';
        ctx.fillText('抜', VW * 0.5, VH * 0.36 + 10);
        ctx.fillStyle = '#f2eee5';
        ctx.font = '900 18px -apple-system, sans-serif';
        ctx.fillText(`DRAW NOW!  [${atkKey}]`, VW * 0.5, VH * 0.36 + 44);
      }
      ctx.restore();
    }

    // Blade Clash (Tsubazeriai) Gauge
    if (world.clash && world.clash.active) {
      const cl = world.clash;
      const atkKey = global.KuroControls ? KuroControls.getLabel('atk', 0) : 'SLASH';
      const bw = 280;
      const bx = (VW - bw) * 0.5;
      const by = VH * 0.24;
      const ratio = clamp((cl.meter + 1) * 0.5, 0.05, 0.95);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '900 22px Georgia, serif';
      ctx.fillStyle = '#f2eee5';
      ctx.fillText('鍔迫り合い • BLADE CLASH!', VW * 0.5, by - 14);
      ctx.fillStyle = 'rgba(8,8,10,0.9)';
      ctx.fillRect(bx, by, bw, 14);
      ctx.fillStyle = '#f2eee5';
      ctx.fillRect(bx, by, bw * ratio, 14);
      ctx.fillStyle = '#c82424';
      ctx.fillRect(bx + bw * ratio, by, bw * (1 - ratio), 14);
      ctx.strokeStyle = '#f2eee5';
      ctx.strokeRect(bx, by, bw, 14);
      ctx.font = '700 12px -apple-system, sans-serif';
      ctx.fillStyle = '#e03131';
      ctx.fillText(`MASH [${atkKey}] TO OVERPOWER!`, VW * 0.5, by + 34);
      ctx.restore();
    }

    // Cinematic Kanji Banner
    if (world.banner && world.banner.t > 0) {
      const b = world.banner;
      const alpha = clamp(Math.min(b.t * 3, (b.dur - b.t) * 6 + 0.2), 0, 1);
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
      ctx.fillText(b.kanji || '', VW * 0.5, VH * 0.34 + 38);
      ctx.fillStyle = '#f2eee5';
      ctx.font = '900 44px Georgia, serif';
      ctx.fillText(b.title || '', VW * 0.5, VH * 0.34 + 90);
      if (b.sub) {
        ctx.fillStyle = '#a8a29a';
        ctx.font = '600 13px -apple-system, sans-serif';
        ctx.fillText(b.sub.toUpperCase(), VW * 0.5, VH * 0.34 + 124);
      }
      ctx.restore();
    }
  }

  /* ==================== MAIN FRAME RENDER ==================== */
  function drawFrame(world) {
    if (!ctx || !cv) return;
    const fx = global.KuroFX;
    const scr = fx ? fx.screen : { invT: 0, flashA: 0, flashCol: '#f2eee5', shakeX: 0, shakeY: 0, slowT: 0 };
    const inv = scr.invT > 0;
    const isMenu = world.mode === 'menu';
    const stId = isMenu ? 'bridge' : world.stageId || 'bamboo';

    ctx.save();
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(vOx, vOy);
    ctx.scale(vScale, vScale);

    drawBackdrop(inv, stId, world);

    // World Camera Space
    ctx.save();
    ctx.translate(VW * 0.5 + scr.shakeX, VH * 0.58 + scr.shakeY);
    ctx.scale(world.camZoom, world.camZoom);
    ctx.translate(-world.camX, -(GROUND - 125));

    // Ground plane
    ctx.fillStyle = inv ? '#d6d2c8' : '#0a0a0d';
    ctx.fillRect(LEFT_B - 420, GROUND, RIGHT_B - LEFT_B + 840, 420);
    ctx.strokeStyle = inv ? '#08080a' : 'rgba(242,238,229,0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(LEFT_B - 300, GROUND + 1);
    ctx.lineTo(RIGHT_B + 300, GROUND + 1);
    ctx.stroke();

    // Bridge Railings
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

    // Sliceable foreground bamboo on Bamboo Rain
    if (!isMenu && stId === 'bamboo') {
      drawSliceableBamboo(world.tTime, inv);
    }

    // Rain ripples & footstep splashes
    if (fx && !inv && (stId === 'bamboo' || isMenu || stId === 'bridge')) {
      ctx.strokeStyle = 'rgba(242,238,229,0.26)';
      ctx.lineWidth = 1.2;
      if (stId === 'bamboo' || isMenu) {
        fx.state.splashes.forEach((s) => {
          const p = (world.tTime * 2.4 + s.ph) % 1;
          ctx.globalAlpha = (1 - p) * 0.5;
          ctx.beginPath();
          ctx.ellipse(s.x, GROUND + 4, 4 + p * 18, 1.5 + p * 4, 0, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      fx.state.ripples.forEach((rp) => {
        const p = clamp(rp.l / rp.ml, 0, 1);
        ctx.globalAlpha = p * 0.55;
        ctx.beginPath();
        ctx.ellipse(rp.x, GROUND + 3, rp.r, rp.r * 0.22, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (isMenu) {
      (world.menuFighters || []).forEach((u) => {
        u.scarf.draw(ctx, false, u.scarfCol);
        drawFighter(u, false, world, 1);
      });
    } else {
      // Ground stains
      if (fx) {
        fx.state.stains.forEach((m) => {
          ctx.fillStyle = m.red
            ? `rgba(200,36,36,${clamp(m.l / 2, 0, 1) * 0.8})`
            : `rgba(4,4,6,${clamp(m.l / 2, 0, 1) * 0.8})`;
          ctx.beginPath();
          ctx.ellipse(m.x, GROUND + 4, m.w * 0.5, m.h * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
        });
        fx.state.ghosts.forEach((g) => {
          drawFighter(
            { weaponIdx: 0, weapon: 'katana', hat: g.hat, role: 'player', team: 1, f: g.sk.f, scale: g.sk.s, flashT: 0, stagT: 0 },
            inv,
            world,
            (g.l / g.ml) * 0.52,
            g.red,
            g.sk
          );
        });
      }

      // Shadow clones
      (world.clones || []).forEach((c) => {
        drawFighter(
          { weaponIdx: 0, weapon: 'katana', hat: c.hat, role: 'player', team: c.team, f: c.f, scale: 1, flashT: 0, stagT: 0 },
          inv,
          world,
          0.45,
          true,
          c.sk
        );
      });

      // Severed pieces, spinning hats, planted swords
      drawSeveredPieces(inv);

      // Living fighters (dead fighters with severed=true are already replaced by pieces)
      (world.fighters || []).forEach((f) => {
        if (f.dead && f.severed) return;
        if (!f.dead) f.scarf.draw(ctx, inv, f.scarfCol);
        drawFighter(f, inv, world, f.dead ? clamp(f.deadT / 0.85, 0, 1) : 1);
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

      // Blade Clash central sparks
      if (world.clash && world.clash.active) {
        const cx = world.clash.x;
        const cy = world.clash.y;
        const pulse = 18 + Math.sin(world.tTime * 48) * 10;
        ctx.save();
        ctx.strokeStyle = '#f2eee5';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - pulse, cy - pulse * 0.7); ctx.lineTo(cx + pulse, cy + pulse * 0.7);
        ctx.moveTo(cx - pulse, cy + pulse * 0.7); ctx.lineTo(cx + pulse, cy - pulse * 0.7);
        ctx.stroke();
        ctx.fillStyle = '#e03131';
        ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // Triple-layer Sumi-e Slash Arcs
      if (fx) {
        fx.state.slashes.forEach((s) => {
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
      }

      // Projectiles (bullet, kunai, wave, bWave, Odachi ground shockwave)
      (world.projs || []).forEach((pr) => {
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
        } else if (pr.k === 'shock') {
          // Earthsplitter ground wave
          ctx.fillStyle = '#c82424';
          ctx.beginPath();
          ctx.moveTo(-26, 12);
          ctx.lineTo(18, -36);
          ctx.lineTo(34, 12);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#f2eee5';
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          const b = pr.k === 'bWave';
          ctx.fillStyle = b ? '#c82424' : '#f2eee5';
          ctx.beginPath();
          ctx.arc(-18, 0, pr.r, -1.25, 1.25);
          ctx.arc(-44, 0, pr.r * 0.92, 1.15, -1.15, true);
          ctx.fill();
          ctx.fillStyle = '#08080a';
          ctx.beginPath();
          ctx.arc(-22, 0, pr.r * 0.88, -1.15, 1.15);
          ctx.arc(-42, 0, pr.r * 0.85, 1.05, -1.05, true);
          ctx.fill();
        }
        ctx.restore();
      });

      // Particles, Cuts, Rings, Bolts, Ult Cuts, Floating Combat Texts
      if (fx) {
        fx.state.parts.forEach((pt) => {
          const p = clamp(pt.l / pt.ml, 0, 1);
          ctx.save();
          ctx.globalAlpha = p;
          if (pt.k === 'sp') {
            ctx.strokeStyle = pt.c;
            ctx.lineWidth = 2.4 * p + 0.8;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt.x - pt.vx * 0.032, pt.y - pt.vy * 0.032);
            ctx.stroke();
          } else if (pt.k === 'ink') {
            ctx.fillStyle = pt.c;
            ctx.beginPath();
            ctx.ellipse(pt.x, pt.y, pt.sz * (0.6 + p * 0.5), pt.sz * 0.72, Math.atan2(pt.vy, pt.vx), 0, Math.PI * 2);
            ctx.fill();
          } else if (pt.k === 'ring') {
            ctx.strokeStyle = pt.c;
            ctx.lineWidth = pt.lw * p;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
            ctx.stroke();
          } else if (pt.k === 'cut') {
            ctx.strokeStyle = pt.c;
            ctx.lineWidth = pt.w * p;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pt.x1, pt.y1);
            ctx.lineTo(pt.x2, pt.y2);
            ctx.stroke();
          } else if (pt.k === 'bolt') {
            ctx.strokeStyle = '#f2eee5';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(pt.x1, pt.y1);
            for (let k = 1; k < 5; k++) {
              ctx.lineTo(lerp(pt.x1, pt.x2, k / 5) + rand(-18, 18), lerp(pt.y1, pt.y2, k / 5) + rand(-24, 24));
            }
            ctx.lineTo(pt.x2, pt.y2);
            ctx.stroke();
          }
          ctx.restore();
        });
      }

      if (world.ult) {
        world.ult.cuts.forEach((c) => {
          const p = clamp(c.l / c.ml, 0, 1);
          ctx.save();
          ctx.globalAlpha = p;
          ctx.lineCap = 'round';
          ctx.strokeStyle = c.red ? '#e03131' : '#f2eee5';
          ctx.lineWidth = (c.red ? 7 : 5) * p + 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x1, c.y1);
          ctx.lineTo(c.x2, c.y2);
          ctx.stroke();
          ctx.restore();
        });
      }

      if (fx) {
        fx.state.texts.forEach((t) => {
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
    }
    ctx.restore();

    // Foreground Rain & Motes
    const low = fx ? fx.isLowFx() : false;
    if (!inv) {
      if (stId === 'bamboo' || isMenu) {
        const rainCount = low ? 38 : 74;
        ctx.strokeStyle = 'rgba(242,238,229,0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < rainCount; i++) {
          const rx = (((i * 103 - world.tTime * 420) % (VW + 160)) + (VW + 160)) % (VW + 160) - 80;
          const ry = ((i * 157 + world.tTime * 920) % (VH + 120)) - 60;
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 14, ry + 34);
        }
        ctx.stroke();
      }
      if (fx) {
        const mCount = low ? 18 : fx.state.motes.length;
        for (let i = 0; i < mCount; i++) {
          const m = fx.state.motes[i];
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
    }

    // Impact Flash
    if (scr.flashA > 0.01) {
      ctx.fillStyle = scr.flashCol;
      ctx.globalAlpha = scr.flashA;
      ctx.fillRect(-320, -240, VW + 640, VH + 480);
      ctx.globalAlpha = 1;
    }

    // 16mm Film Grain
    if (world.settings.grain && !low) {
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

    // Radial Cinema Vignette (deepens crimson slightly during kill-anticipation slow-mo)
    const vg = ctx.createRadialGradient(VW * 0.5, VH * 0.5, VW * 0.3, VW * 0.5, VH * 0.5, VW * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, scr.slowT > 0.04 ? 'rgba(90,8,10,0.62)' : 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(-320, -240, VW + 640, VH + 480);

    drawHud(world);
    ctx.restore();

    // Widescreen Letterbox Bars (tighter during Standoff & Ult)
    const dramatic = world.state === 'ULT' || (world.standoff && world.standoff.active);
    if (world.settings.letterbox || dramatic) {
      const bar = Math.round((dramatic ? 54 : 18) * (cv.height / VH));
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, cv.width, bar);
      ctx.fillRect(0, cv.height - bar, cv.width, bar);
    }
  }

  global.KuroRender = {
    VW,
    VH,
    GROUND,
    LEFT_B,
    RIGHT_B,
    POSES,
    Scarf,
    blendPose,
    idlePoseFor,
    buildSkel,
    init,
    resize,
    drawFrame,
  };
})(window);
