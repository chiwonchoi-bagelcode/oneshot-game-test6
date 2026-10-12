/*
 * 다리야, 가지 마! — core simulation (DOM-free, shared by the game and the node tools)
 *
 * Toy rules (kept deliberately simple so every tap is explainable):
 *  - The pelvis pump P holds a fixed amount of red fluid split between the two legs.
 *    Tapping a leg moves one unit from the other leg into it.
 *  - Leg rest length = L0 + fluid * DL.  A planted shoe is glued to the surface, so
 *    feeding that leg pushes the pelvis away from the shoe along the leg.
 *  - The starving leg shrinks.  If both feet are planted, it lets go when it is empty
 *    or when it is stretched too far ("pop").  A sole support never lets go.
 *  - A free leg with fluid searches for a landing spot: it swings mirrored to the
 *    support leg (compass gait) and sticks to the first top surface it touches.
 *  - The torso leans toward weight hanging outside the support; the cake slides on
 *    a shallow dish, decorations slide a beat later on top of the cake.
 */
(function (root) {
  'use strict';

  const CFG = {
    T: 10, L0: 40, DL: 12,
    g: 1000,
    kAx: 1400, zAx: 0.7,
    kAnk: 700000, zLat: 0.8, leanStop: 1.1,
    flowRate: 5.5, flowDelay: 0.05,
    popStretch: 0.6, minStanceH: 34,
    switchMargin: -2,
    maxBeyond: 0.72,
    liftEps: 0.04,
    maxMirror: 1.2,
    aimRate: 9, swingCost: 4,
    extendRate: 13,
    // torso
    leanScale: 170, thetaMax: 0.62,
    kTheta: 60, cTheta: 8.5, jTheta: 0.0011,
    // body geometry (relative to pelvis P, before tilt)
    pelvisR: 12, torsoOff: 32, torsoR: 24, trayOff: 64, cakeR: 26,
    // cake on tray
    trayHalf: 46, cakeHalf: 26, cakeH: 30,
    muS: 0.09, muK: 0.06, kDish: 9, bCake: 11,
    // decorations on cake
    decoGrip: 335, decoGripTime: 0.85, decoMuS: 0.12, decoMuK: 0.08, decoB: 14, decoLag: 0.2,
    inertia: 0.3,
    dt: 1 / 240,
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

  function restLen(fa) { return CFG.L0 + fa * CFG.DL; }

  // ---------------------------------------------------------------- geometry
  // Ray vs axis-aligned rect. Returns {t, nx, ny} of entry face or null.
  function rayRect(ox, oy, dx, dy, r, maxT) {
    let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0;
    const x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h;
    if (Math.abs(dx) < 1e-9) {
      if (ox < x0 || ox > x1) return null;
    } else {
      let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx, n = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = n; ny = 0; }
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < y0 || oy > y1) return null;
    } else {
      let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy, n = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; n = 1; }
      if (t1 > tmin) { tmin = t1; nx = 0; ny = n; }
      if (t2 < tmax) tmax = t2;
    }
    if (tmax < tmin || tmax < 0 || tmin > maxT) return null;
    if (tmin < 0) return { t: 0, nx: 0, ny: 0, inside: true };
    return { t: tmin, nx, ny };
  }

  // Nearest hit among level solids.  top=true when it is a plantable top surface.
  function raycast(level, ox, oy, dx, dy, maxT) {
    let best = null;
    const solids = level.solids;
    for (let i = 0; i < solids.length; i++) {
      const r = solids[i];
      const h = rayRect(ox, oy, dx, dy, r, maxT);
      if (h && (!best || h.t < best.t)) { best = h; best.rect = r; }
    }
    if (!best) return null;
    best.x = ox + dx * best.t; best.y = oy + dy * best.t;
    best.top = !best.inside && best.ny === -1 && !best.rect.hazard;
    return best;
  }

  function circleRect(cx, cy, rad, r) {
    const px = clamp(cx, r.x, r.x + r.w), py = clamp(cy, r.y, r.y + r.h);
    let dx = cx - px, dy = cy - py;
    let d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return null;
    if (d2 < 1e-9) {
      // centre inside: push out the shortest way
      const l = cx - r.x, rr = r.x + r.w - cx, t = cy - r.y, b = r.y + r.h - cy;
      const m = Math.min(l, rr, t, b);
      if (m === t) return { nx: 0, ny: -1, pen: t + rad };
      if (m === b) return { nx: 0, ny: 1, pen: b + rad };
      if (m === l) return { nx: -1, ny: 0, pen: l + rad };
      return { nx: 1, ny: 0, pen: rr + rad };
    }
    const d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, pen: rad - d };
  }

  // Equilibrium lean of a single support leg: k(φ-φr) = g ℓ sin φ (per unit mass)
  function droopEq(phiRest, len) {
    const G = CFG.g * len / CFG.kAnk;
    let phi = phiRest;
    for (let i = 0; i < 12; i++) phi = phiRest + G * Math.sin(phi);
    return clamp(phi, -1.45, 1.45);
  }

  // ---------------------------------------------------------------- level prep
  function prepareLevel(def) {
    const level = Object.assign({}, def);
    level.platforms = def.platforms.map((p) => Object.assign({ h: 600 }, p));
    level.hazards = (def.hazards || []).map((p) => Object.assign({ hazard: true }, p));
    level.solids = level.platforms.concat(level.hazards);
    level.checkpoints = def.checkpoints || [];
    return level;
  }

  // ---------------------------------------------------------------- game state
  function makeLeg(side) {
    return {
      side, f: 5, fa: 5, hold: 0,
      planted: true, foot: { x: 0, y: 0 }, phiRest: 0,
      d: 100, tension: 0, stretch: 0,
      dirA: 0, len: CFG.L0, aimA: 0, aimOff: 0,
      plantT: 0, liftT: 0, squeeze: 0, wiggle: 0, pushT: 0,
      target: null,
    };
  }

  function createGame(levelDef, opts) {
    const level = prepareLevel(levelDef);
    const g = {
      level,
      time: 0,
      state: 'play',
      events: [],
      taps: 0,
      char: null,
      checkpoint: null,
      winT: 0,
      failCause: null,
      history: [],
    };
    resetChar(g, opts && opts.fromCheckpoint ? opts.fromCheckpoint : null);
    return g;
  }

  function resetChar(g, cp) {
    const lv = g.level;
    const st = cp || lv.start;
    const c = {
      P: { x: 0, y: 0 }, V: { x: 0, y: 0 }, A: { x: 0, y: 0 },
      theta: 0, omega: 0,
      legs: [makeLeg(0), makeLeg(1)],
      cake: { s: 0, v: 0, stuck: true, wob: 0, wobV: 0, squash: 0, fallen: false, slideMax: 0 },
      decos: [],
      thetaLag: 0,
      pulses: [],
      pool: 0, poolA: 0,
      danger: 0, dangerT: 0, calmT: 0, wasDanger: false,
      bumpCD: 0,
      support: 2,
      singleT: 0,
      maxTilt: 0,
    };
    const feet = st.feet;
    for (let i = 0; i < 2; i++) {
      const L = c.legs[i];
      L.foot = { x: feet[i][0], y: feet[i][1] };
      L.f = st.fluid[i]; L.fa = L.f;
      L.planted = true;
    }
    c.pool = st.pool || 0; c.poolA = c.pool;
    // solve the starting triangle apex
    const a = c.legs[0], b = c.legs[1];
    const la = restLen(a.fa), lb = restLen(b.fa);
    const dx = b.foot.x - a.foot.x, dy = b.foot.y - a.foot.y;
    const D = Math.hypot(dx, dy) || 1;
    const x = (la * la - lb * lb + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(1, la * la - x * x));
    const ux = dx / D, uy = dy / D;
    c.P.x = a.foot.x + ux * x + uy * h * 1;
    c.P.y = a.foot.y + uy * x - ux * h;
    if (c.P.y > Math.min(a.foot.y, b.foot.y)) c.P.y = Math.min(a.foot.y, b.foot.y) - h;
    const decoDefs = (cp && cp.decos) || g.level.decos || defaultDecos();
    c.decos = decoDefs.map((d) => ({
      kind: d.kind, a0: d.a0, d: d.d != null ? d.d : d.a0, v: 0, seated: d.seated != null ? d.seated : true,
      gripT: 0, lost: d.lost || false, hop: 0, hopV: 0, wob: 0, fallT: 0, fallX: 0, fallY: 0, fallVX: 0, fallVY: 0, fallR: 0,
    }));
    g.char = c;
    g.state = 'play';
    g.winT = 0;
    g.failCause = null;
    // settle
    for (let i = 0; i < 240; i++) physicsStep(g, CFG.dt, true);
    c.V.x = c.V.y = 0;
    c.cake.s = 0; c.cake.v = 0; c.cake.stuck = true;
    for (const d of c.decos) { if (!d.lost) { d.d = d.seated ? d.a0 : d.d; d.v = 0; } }
    g.events.length = 0;
  }

  function defaultDecos() {
    return [
      { kind: 'berry', a0: -13 },
      { kind: 'candle', a0: 1 },
      { kind: 'cherry', a0: 14 },
    ];
  }

  // ---------------------------------------------------------------- input
  // Upper apex of the triangle formed by two planted shoes and two leg lengths.
  function triApex(a, la, b, lb) {
    const dx = b.x - a.x, dy = b.y - a.y, D = Math.hypot(dx, dy) || 1e-6;
    if (la + lb < D || Math.abs(la - lb) > D) return null;
    const x = (la * la - lb * lb + D * D) / (2 * D);
    const h = Math.sqrt(Math.max(0, la * la - x * x));
    const ux = dx / D, uy = dy / D;
    const p1 = { x: a.x + ux * x + uy * h, y: a.y + uy * x - ux * h, h };
    const p2 = { x: a.x + ux * x - uy * h, y: a.y + uy * x + ux * h, h };
    return p1.y < p2.y ? p1 : p2;
  }
  // Where the pelvis settles on two shoes with fluid fa/fb (null = can't stand).
  function twoFootEq(c, fa, fb) {
    const A = c.legs[0], B = c.legs[1];
    return triApex(A.foot, restLen(fa), B.foot, restLen(fb));
  }
  // signed distance of point Q past shoe X, measured away from shoe Y
  function pastFoot(Q, X, Y) {
    const ux = X.foot.x - Y.foot.x, uy = X.foot.y - Y.foot.y;
    const d = Math.hypot(ux, uy) || 1;
    return ((Q.x - X.foot.x) * ux + (Q.y - X.foot.y) * uy) / d;
  }
  // how far shoe Y's leg leans outward (away from X) when the pelvis is at Q
  function outwardLean(Q, Y, X) {
    const along = pastFoot(Q, Y, X);
    const d = Math.hypot(Q.x - Y.foot.x, Q.y - Y.foot.y) || 1;
    return Math.asin(clamp(along / d, -1, 1));
  }

  // What tapping leg i would do right now (shared by the sim and the UI).
  function tapPreview(g, i) {
    const c = g.char;
    const L = c.legs[i], O = c.legs[1 - i];
    const canDraw = c.pool > 0 || O.f > 0;
    if (L.planted && O.planted) {
      const f = [c.legs[0].f, c.legs[1].f];
      const eq = twoFootEq(c, f[0], f[1]) || c.P;
      if (pastFoot(eq, L, O) > CFG.switchMargin) return { kind: 'switch' };
      if (!canDraw) return { kind: 'full' };
      f[i] += 1;
      if (c.pool <= 0) f[1 - i] -= 1;
      if (f[1 - i] <= 0) return { kind: 'release', why: 'empty' };
      const nx = twoFootEq(c, f[0], f[1]);
      if (!nx || nx.h < CFG.minStanceH || outwardLean(nx, O, L) > CFG.maxBeyond) return { kind: 'release', why: 'carried' };
      return { kind: 'push', eq: nx };
    }
    if (!canDraw) return { kind: 'full' };
    if (L.planted) return { kind: 'push' };
    const t = L.target;
    if (t && !t.none) return { kind: 'reach', k: Math.max(1, t.k - 0) };
    return { kind: 'search' };
  }

  function tap(g, i) {
    if (g.state !== 'play') return null;
    const c = g.char;
    const L = c.legs[i], O = c.legs[1 - i];
    g.taps++;
    const pv = tapPreview(g, i);
    if (pv.kind === 'full') {
      // nothing left to draw: the tapped leg is already full
      L.squeeze = 1;
      if (!L.planted) L.wiggle = 1;
      else {
        const dx = c.P.x - L.foot.x, dy = c.P.y - L.foot.y, d = Math.hypot(dx, dy) || 1;
        c.V.x += dx / d * 40; c.V.y += dy / d * 40;
      }
      emit(g, { type: 'full', leg: i, planted: L.planted });
      return 'full';
    }
    // 갈아타기: the body already hangs past this shoe -> the other leg folds,
    // its fluid drains back into the pelvis.
    if (pv.kind === 'switch') liftLeg(g, O, 'switch');
    // pushing would carry the body past (or drain) the other shoe -> it lets go now
    else if (pv.kind === 'release') liftLeg(g, O, pv.why === 'empty' ? 'fold' : 'pop');
    let src;
    if (c.pool > 0) { c.pool -= 1; src = 'pool'; }
    else { O.f -= 1; src = 'leg'; }
    L.f += 1;
    L.hold = CFG.flowDelay;
    L.pushT = 0.35;
    c.pulses.push({ from: src === 'pool' ? -1 : 1 - i, to: i, t: 0 });
    if (!L.planted) L.wiggle = Math.max(L.wiggle, 0.5);
    emit(g, { type: 'pump', leg: i, planted: L.planted, f: L.f, other: O.f, otherPlanted: O.planted, src, kind: pv.kind });
    return pv.kind === 'switch' ? 'switch' : 'pump';
  }

  function emit(g, e) { e.t = g.time; g.events.push(e); }

  // ---------------------------------------------------------------- helpers
  function plantedLegs(c) {
    const out = [];
    if (c.legs[0].planted) out.push(c.legs[0]);
    if (c.legs[1].planted) out.push(c.legs[1]);
    return out;
  }

  function legAngleFromUp(c, L) { return Math.atan2(c.P.x - L.foot.x, -(c.P.y - L.foot.y)); }

  function freeFoot(c, L) {
    return { x: c.P.x + Math.sin(L.dirA) * L.len, y: c.P.y + Math.cos(L.dirA) * L.len };
  }

  function mirrorAim(c, F) {
    const S = c.legs[1 - F.side];
    if (S.planted) return clamp(legAngleFromUp(c, S), -CFG.maxMirror, CFG.maxMirror);
    return clamp(c.theta, -0.8, 0.8);
  }

  // Predict where the free leg F will land if it keeps getting fluid.
  function predict(g, F) {
    const c = g.char, S = c.legs[1 - F.side];
    if (F.planted || !S.planted) return null;
    const fS = S.f, fF = F.f, pool = c.pool;
    const ks = [];
    for (let k = 0; k <= fS + pool; k++) {
      const lS = restLen(fS - Math.max(0, k - pool)), lF = restLen(fF + k);
      const phi = droopEq(S.phiRest, lS);
      ks.push({
        k, lS, lF, phi,
        P: { x: S.foot.x + lS * Math.sin(phi), y: S.foot.y - lS * Math.cos(phi) },
        aim: clamp(phi, -CFG.maxMirror, CFG.maxMirror),
      });
    }
    const tryOff = (off) => {
      for (let i = 0; i < ks.length; i++) {
        const q = ks[i];
        const a = q.aim + off, dx = Math.sin(a), dy = Math.cos(a);
        if (dy < 0.05) continue;
        const h = raycast(g.level, q.P.x, q.P.y, dx, dy, q.lF + 0.5);
        if (h && h.top) return { k: q.k, x: h.x, y: h.y, off, rect: h.rect, ks };
      }
      return null;
    };
    // The leg swings mirrored to the support; if that line finds nothing soon it
    // sweeps nearby angles. Cost = taps needed + how far it has to swing.
    let res = null, bestCost = Infinity;
    for (let s = 0; s <= 10; s++) {
      for (const sg of s === 0 ? [1] : [1, -1]) {
        const off = sg * s * 0.09;
        const r = tryOff(off);
        if (!r) continue;
        let cost = r.k + Math.abs(off) * CFG.swingCost;
        if (Math.abs(off - F.aimOff) < 1e-6) cost -= 0.4; // stay with the current choice
        if (cost < bestCost) { bestCost = cost; res = r; }
      }
    }
    if (!res) return { none: true, ks, off: 0 };
    // foot path for preview: the leg aims straight at the landing spot
    res.path = [];
    for (let i = 0; i <= res.k; i++) {
      const q = ks[i];
      const dx = res.x - q.P.x, dy = res.y - q.P.y, d = Math.hypot(dx, dy) || 1;
      const len = Math.min(q.lF, d);
      res.path.push({ x: q.P.x + dx / d * len, y: q.P.y + dy / d * len });
    }
    return res;
  }

  // ---------------------------------------------------------------- per-frame logic
  function frameUpdate(g) {
    const c = g.char;
    for (const F of c.legs) {
      if (F.planted) { F.target = null; continue; }
      const base = mirrorAim(c, F);
      if (F.f > 0) {
        const p = predict(g, F);
        F.target = p;
        if (p && !p.none) { F.aimOff = p.off; F.aimA = Math.atan2(p.x - c.P.x, p.y - c.P.y); }
        else { F.aimOff = 0; F.aimA = base; }
      } else {
        // tucked: still show where it would land, but keep it folded
        F.target = c.pool > 0 || c.legs[1 - F.side].f > 0 ? predict(g, F) : null;
        F.aimOff = 0;
        F.aimA = base * 0.55;
      }
    }
  }

  // ---------------------------------------------------------------- physics
  function physicsStep(g, dt, settling) {
    const c = g.char, lv = g.level;
    g.time += dt;

    // --- fluid animation
    for (const L of c.legs) {
      if (L.hold > 0) L.hold -= dt;
      const tgt = L.f;
      if (L.fa > tgt) L.fa = Math.max(tgt, L.fa - (L.planted ? CFG.flowRate : CFG.flowRate * 2.5) * dt);
      else if (L.fa < tgt && L.hold <= 0) L.fa = Math.min(tgt, L.fa + CFG.flowRate * dt);
      L.squeeze = Math.max(0, L.squeeze - dt * 3);
      L.wiggle = Math.max(0, L.wiggle - dt * 1.6);
      L.pushT = Math.max(0, L.pushT - dt);
      L.plantT += dt; L.liftT += dt;
    }
    c.poolA += (c.pool - c.poolA) * (1 - Math.exp(-dt * 10));
    for (let i = c.pulses.length - 1; i >= 0; i--) {
      c.pulses[i].t += dt / 0.3;
      if (c.pulses[i].t >= 1) c.pulses.splice(i, 1);
    }

    const planted = plantedLegs(c);
    c.support = planted.length;

    // --- forces on pelvis
    let fx = 0, fy = CFG.g;
    const cAx = 2 * CFG.zAx * Math.sqrt(CFG.kAx);
    for (const L of planted) {
      const dx = c.P.x - L.foot.x, dy = c.P.y - L.foot.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d, uy = dy / d;
      const rest = restLen(L.fa);
      const vAx = c.V.x * ux + c.V.y * uy;
      const fAx = CFG.kAx * (rest - d) - cAx * vAx;
      fx += fAx * ux; fy += fAx * uy;
      L.d = d; L.tension = -fAx; L.stretch = (d - rest) / rest;
    }
    if (planted.length === 1) {
      const S = planted[0];
      const d = S.d;
      const phi = legAngleFromUp(c, S);
      const ex = Math.cos(phi), ey = Math.sin(phi);
      let tau = -CFG.kAnk * (phi - S.phiRest);
      if (Math.abs(phi) > CFG.leanStop) tau -= CFG.kAnk * 6 * (phi - Math.sign(phi) * CFG.leanStop);
      const vLat = c.V.x * ex + c.V.y * ey;
      const kLat = CFG.kAnk / (d * d);
      const cLat = 2 * CFG.zLat * Math.sqrt(kLat);
      const fl = tau / d - cLat * vLat;
      fx += fl * ex; fy += fl * ey;
      S.phi = phi;
    } else if (planted.length === 2) {
      for (const L of planted) L.phiRest = legAngleFromUp(c, L);
    }
    // light air drag
    fx -= c.V.x * 0.6; fy -= c.V.y * 0.6;

    const vx0 = c.V.x, vy0 = c.V.y;
    c.V.x += fx * dt; c.V.y += fy * dt;
    c.P.x += c.V.x * dt; c.P.y += c.V.y * dt;

    // --- body collisions (pelvis, torso, cake)
    bodyCollide(g, dt);

    // filtered acceleration
    const ax = (c.V.x - vx0) / dt, ay = (c.V.y - vy0) / dt;
    const k = 1 - Math.exp(-dt * 30);
    c.A.x += (ax - c.A.x) * k; c.A.y += (ay - c.A.y) * k;

    // --- free legs
    for (const F of c.legs) {
      if (F.planted) continue;
      const tg = F.f > 0 && F.target && !F.target.none ? F.target : null;
      if (tg) F.aimA = Math.atan2(tg.x - c.P.x, tg.y - c.P.y);
      const kA = 1 - Math.exp(-dt * CFG.aimRate);
      F.dirA += (F.aimA - F.dirA) * kA;
      const rest = restLen(F.fa);
      const kL = 1 - Math.exp(-dt * CFG.extendRate);
      let want = F.len + (rest - F.len) * kL;
      // a leg that is still folding up (draining) can't grab anything
      const canPlant = F.f > 0 && F.liftT > 0.18 && !settling && F.fa <= F.f + 0.05 && F.len <= rest + 2;
      if (tg && canPlant && Math.abs(F.dirA - F.aimA) < 0.12) {
        const dT = Math.hypot(tg.x - c.P.x, tg.y - c.P.y);
        if (want >= dT - 0.5) { plantLeg(g, F, { x: tg.x, y: tg.y, rect: tg.rect }); continue; }
      }
      const dx = Math.sin(F.dirA), dy = Math.cos(F.dirA);
      const hit = raycast(lv, c.P.x, c.P.y, dx, dy, want);
      if (hit) {
        if (hit.top && canPlant && dy > 0.05) { plantLeg(g, F, hit); continue; }
        want = Math.max(10, hit.t - 2);
      }
      F.len = want;
    }

    // --- safety: a shoe yanked far beyond its leg length lets go
    if (c.legs[0].planted && c.legs[1].planted && !settling) {
      for (let i = 0; i < 2; i++) {
        const L = c.legs[i], O = c.legs[1 - i];
        if (L.stretch > CFG.popStretch && L.stretch > O.stretch) { liftLeg(g, L, 'pop'); break; }
      }
    }

    // --- torso tilt
    updateTorso(g, dt);
    // --- cake + decorations
    updateCake(g, dt, settling);

    // --- win check
    if (!settling && g.state === 'play') checkGoal(g, dt);
  }

  function plantLeg(g, F, hit) {
    const c = g.char;
    F.planted = true;
    F.foot = { x: hit.x, y: hit.y };
    F.plantT = 0;
    F.target = null;
    F.aimOff = 0;
    const dx = c.P.x - F.foot.x, dy = c.P.y - F.foot.y;
    F.d = Math.hypot(dx, dy);
    F.phiRest = legAngleFromUp(c, F);
    const S = c.legs[1 - F.side];
    const speed = Math.hypot(c.V.x, c.V.y);
    emit(g, { type: 'plant', leg: F.side, x: hit.x, y: hit.y, speed, both: S.planted, rect: hit.rect });
  }

  function liftLeg(g, L, kind) {
    const c = g.char;
    L.planted = false;
    const drained = L.f;
    if (drained > 0) { c.pool += drained; L.f = 0; c.pulses.push({ from: L.side, to: -1, t: 0, n: drained }); }
    L.liftT = 0;
    const dx = L.foot.x - c.P.x, dy = L.foot.y - c.P.y;
    L.dirA = Math.atan2(dx, dy);
    L.len = Math.hypot(dx, dy);
    L.aimOff = 0;
    const S = c.legs[1 - L.side];
    // the remaining shoe keeps the lean of the *settled* stance, so the outcome
    // never depends on how fast the player tapped
    const eq = S.planted ? twoFootEq(c, c.legs[0].f + (L.side === 0 ? drained : 0), c.legs[1].f + (L.side === 1 ? drained : 0)) : null;
    S.phiRest = eq ? Math.atan2(eq.x - S.foot.x, -(eq.y - S.foot.y)) : legAngleFromUp(c, S);
    c.singleT = 0;
    emit(g, { type: kind, leg: L.side, x: L.foot.x, y: L.foot.y, drained });
  }

  function bodyCollide(g, dt) {
    const c = g.char, lv = g.level;
    const st = Math.sin(c.theta), ct = Math.cos(c.theta);
    const parts = [
      { ox: 0, oy: 0, r: CFG.pelvisR, cake: false },
      { ox: 0, oy: -CFG.torsoOff, r: CFG.torsoR, cake: false },
      { ox: c.cake.s * 0.8, oy: -(CFG.trayOff + CFG.cakeH * 0.5), r: CFG.cakeR, cake: true },
    ];
    for (const p of parts) {
      // rotate offset by theta (y-down, clockwise positive)
      const wx = c.P.x + p.ox * ct - p.oy * st;
      const wy = c.P.y + p.ox * st + p.oy * ct;
      for (const r of lv.solids) {
        const hit = circleRect(wx, wy, p.r, r);
        if (!hit) continue;
        c.P.x += hit.nx * hit.pen; c.P.y += hit.ny * hit.pen;
        const vn = c.V.x * hit.nx + c.V.y * hit.ny;
        if (vn < 0) {
          c.V.x -= vn * hit.nx; c.V.y -= vn * hit.ny;
          c.V.x *= 0.92; c.V.y *= 0.92;
        }
        if (p.cake && c.bumpCD <= 0 && g.state === 'play') {
          c.bumpCD = 0.5;
          const sev = Math.min(1, Math.abs(vn) / 220 + 0.35);
          bumpCake(g, sev, hit.nx, r);
        }
      }
    }
    c.bumpCD -= dt;
  }

  function bumpCake(g, sev, nx, rect) {
    const c = g.char;
    c.cake.squash = Math.max(c.cake.squash, sev);
    c.cake.wobV += (nx || (Math.random() < 0.5 ? -1 : 1)) * 6 * sev;
    for (const d of c.decos) {
      if (d.lost) continue;
      d.hopV -= 160 * sev;
      if (sev > 0.45) { d.seated = false; d.v += (nx || 0) * 50 * sev + (d.d >= 0 ? 1 : -1) * 70 * sev; }
    }
    emit(g, { type: 'bump', sev, hazard: !!(rect && rect.hazard) });
    c.lastBump = { t: g.time, hazard: !!(rect && rect.hazard) };
  }

  function weightOffset(c) {
    const pl = plantedLegs(c);
    if (pl.length === 0) return 0;
    if (pl.length === 1) return c.P.x - pl[0].foot.x;
    const lo = Math.min(pl[0].foot.x, pl[1].foot.x), hi = Math.max(pl[0].foot.x, pl[1].foot.x);
    const m = Math.min(10, (hi - lo) * 0.25);
    if (c.P.x < lo + m) return (c.P.x - (lo + m));
    if (c.P.x > hi - m) return (c.P.x - (hi - m));
    return 0;
  }

  function updateTorso(g, dt) {
    const c = g.char;
    const o = weightOffset(c);
    c.offset = o;
    const tgt = CFG.thetaMax * Math.tanh(o / CFG.leanScale);
    c.thetaTarget = tgt;
    const acc = CFG.kTheta * (tgt - c.theta) - CFG.cTheta * c.omega - CFG.jTheta * c.A.x;
    c.omega += acc * dt;
    c.theta += c.omega * dt;
    const kl = 1 - Math.exp(-dt / CFG.decoLag);
    c.thetaLag += (c.theta - c.thetaLag) * kl;
    if (c.support === 1) c.singleT += dt;
    // short history of the lean so a failure can be explained by its real cause
    c.histT = (c.histT || 0) + dt;
    if (c.histT > 0.1) {
      c.histT = 0;
      const pl = plantedLegs(c);
      (c.hist || (c.hist = [])).push({ t: g.time, o: o, th: c.theta, sup: pl.length, leg: pl.length === 1 ? pl[0].side : -1, len: pl.length === 1 ? restLen(pl[0].f) : 0 });
      if (c.hist.length > 25) c.hist.shift();
    }
  }

  function updateCake(g, dt, settling) {
    const c = g.char, ck = c.cake;
    const th = c.theta;
    const st = Math.sin(th), ct = Math.cos(th);
    // tray acceleration ~ pelvis accel + tangential from rotation
    const alpha = 0; // keep simple
    const ax = (c.A.x + alpha) * CFG.inertia, ay = c.A.y * CFG.inertia;
    const At = CFG.g * st - (ax * ct + ay * st);
    let Np = CFG.g * ct + (ax * st - ay * ct);
    if (Np < 150) Np = 150;
    const F = At - CFG.kDish * ck.s;
    if (ck.stuck) {
      if (Math.abs(F) > CFG.muS * Np) ck.stuck = false;
      else ck.v = 0;
    }
    if (!ck.stuck) {
      const dir = ck.v !== 0 ? sign(ck.v) : sign(F);
      const acc = F - CFG.muK * Np * dir - CFG.bCake * ck.v;
      const nv = ck.v + acc * dt;
      if (ck.v !== 0 && sign(nv) !== sign(ck.v) && Math.abs(F) <= CFG.muS * Np) { ck.v = 0; ck.stuck = true; }
      else ck.v = nv;
    }
    ck.s += ck.v * dt;
    ck.slideMax = Math.max(ck.slideMax, Math.abs(ck.s));
    // jelly wobble (visual + feeds decorations)
    const wobAcc = -260 * ck.wob - 7 * ck.wobV - (ax * ct + ay * st) * 0.004;
    ck.wobV += wobAcc * dt; ck.wob += ck.wobV * dt;
    ck.squash = Math.max(0, ck.squash - dt * 2.5);
    c.maxTilt = Math.max(c.maxTilt, Math.abs(th));

    if (!settling && g.state === 'play' && Math.abs(ck.s) > CFG.trayHalf - 1) {
      ck.fallen = true;
      failGame(g, 'cake');
      return;
    }

    // decorations (lagged)
    const tl = c.thetaLag + ck.wob * 0.5;
    const sl = Math.sin(tl), cl = Math.cos(tl);
    const cakeAcc = (ck.v - (ck.vPrev || 0)) / dt;
    ck.vPrev = ck.v;
    const dAt = CFG.g * sl - (ax * cl + ay * sl) * 0.8 - cakeAcc * 0.3;
    const dN = Math.max(150, CFG.g * cl + (ax * sl - ay * cl));
    let danger = Math.abs(ck.v) / 25 + Math.max(0, Math.abs(th) - 0.12) * 4;
    for (const d of c.decos) {
      if (d.lost) {
        if (d.fallT < 3) {
          d.fallT += dt; d.fallVY += CFG.g * 0.9 * dt;
          d.fallX += d.fallVX * dt; d.fallY += d.fallVY * dt; d.fallR += d.fallVX * 0.02 * dt;
        }
        continue;
      }
      // hop
      d.hopV += (-d.hop * 400 - d.hopV * 12) * dt; d.hop += d.hopV * dt;
      if (d.hop > 0) { d.hop = 0; if (d.hopV > 0) d.hopV *= -0.3; }
      if (d.seated) {
        // wobble in cream; dislodge after sustained push
        const over = Math.abs(dAt) > CFG.decoGrip;
        d.gripT = over ? d.gripT + dt : Math.max(0, d.gripT - dt * 2);
        d.wob += ((dAt / 900) * 6 - d.wob) * Math.min(1, dt * 14);
        d.d = d.a0 + d.wob * 1.5;
        if (d.gripT > CFG.decoGripTime && !settling) {
          d.seated = false; d.v = sign(dAt) * 12;
          emit(g, { type: 'decoLoose', kind: d.kind });
        }
        danger = Math.max(danger, d.gripT / CFG.decoGripTime * 0.8);
      } else {
        const lim = CFG.decoMuS * dN;
        if (d.v === 0 && Math.abs(dAt) <= lim) {
          // resting
        } else {
          const dir = d.v !== 0 ? sign(d.v) : sign(dAt);
          const acc = dAt - CFG.decoMuK * dN * dir - CFG.decoB * d.v;
          const nv = d.v + acc * dt;
          if (d.v !== 0 && sign(nv) !== sign(d.v) && Math.abs(dAt) <= lim) d.v = 0; else d.v = nv;
        }
        d.d += d.v * dt;
        d.wob *= 0.95;
        // a resting berry sinks back into the cream once things calm down
        if (d.v === 0 && Math.abs(tl) < 0.07) { d.calm = (d.calm || 0) + dt; if (d.calm > 0.6) { d.seated = true; d.a0 = d.d; d.gripT = 0; d.calm = 0; emit(g, { type: 'decoSeat', kind: d.kind }); } }
        else d.calm = 0;
        danger = Math.max(danger, Math.abs(d.v) / 20 + 0.25);
        if (Math.abs(d.d) > CFG.cakeHalf - 2 && !settling) {
          d.lost = true;
          d.fallT = 0;
          // world position at the moment of falling
          const wp = decoWorld(c, d);
          d.fallX = wp.x; d.fallY = wp.y;
          d.fallVX = c.V.x + sign(d.d) * 60 + d.v * 2; d.fallVY = c.V.y - 120; d.fallR = 0;
          emit(g, { type: 'decoFall', kind: d.kind, x: wp.x, y: wp.y, cause: c.lastBump && g.time - c.lastBump.t < 1 ? 'bump' : 'tilt' });
        }
      }
    }
    // relief tracking
    c.danger = danger;
    if (!settling) {
      if (danger > 0.75) { c.dangerT += dt; c.calmT = 0; if (c.dangerT > 0.4) c.wasDanger = true; }
      else {
        c.calmT += dt; c.dangerT = Math.max(0, c.dangerT - dt);
        if (c.wasDanger && c.calmT > 0.45) { c.wasDanger = false; emit(g, { type: 'relief' }); }
      }
    }
  }

  // tray/cake/deco world positions (used by renderer too)
  function bodyPoint(c, ox, oy) {
    const st = Math.sin(c.theta), ct = Math.cos(c.theta);
    return { x: c.P.x + ox * ct - oy * st, y: c.P.y + ox * st + oy * ct };
  }
  function decoWorld(c, d) {
    return bodyPoint(c, c.cake.s + d.d, -(CFG.trayOff + CFG.cakeH + 4));
  }

  function failGame(g, kind) {
    if (g.state !== 'play') return;
    const c = g.char;
    g.state = 'fail';
    // the worst lean in the last ~2.5 s is what pushed the cake off
    let w = null;
    for (const h of c.hist || []) if (!w || Math.abs(h.th) > Math.abs(w.th)) w = h;
    const sup = plantedLegs(c);
    if (!w) w = { th: c.theta, o: c.offset || 0, sup: sup.length, leg: sup.length === 1 ? sup[0].side : -1, len: 0 };
    const cause = {
      kind,
      tiltDeg: Math.round(Math.abs(w.th) * 180 / Math.PI),
      maxTiltDeg: Math.round(c.maxTilt * 180 / Math.PI),
      support: w.sup,
      supportLeg: w.leg,
      supportLen: Math.round(w.len),
      offset: Math.round(w.o),
      bump: !!(c.lastBump && g.time - c.lastBump.t < 1.2),
      hazard: !!(c.lastBump && c.lastBump.hazard && g.time - c.lastBump.t < 1.2),
      dir: sign(c.cake.s),
      singleT: c.singleT,
    };
    g.failCause = cause;
    emit(g, { type: 'fail', cause });
  }

  function checkGoal(g, dt) {
    const lv = g.level, c = g.char;
    if (!lv.goal) return;
    const gl = lv.goal;
    const inGoal = (L) => L.planted && L.foot.x >= gl.x0 && L.foot.x <= gl.x1 && Math.abs(L.foot.y - gl.y) < 4;
    // checkpoints
    for (const cp of lv.checkpoints) {
      const inCp = (L) => L.planted && L.foot.x >= cp.x0 && L.foot.x <= cp.x1;
      if (inCp(c.legs[0]) && inCp(c.legs[1]) && (!g.checkpoint || g.checkpoint.id !== cp.id) && c.cake.stuck && Math.abs(c.theta) < 0.2) {
        if (!g.checkpoint || cp.x0 > g.checkpoint.x0) {
          g.checkpoint = snapshotCheckpoint(g, cp);
          emit(g, { type: 'checkpoint', id: cp.id });
        }
      }
    }
    if (inGoal(c.legs[0]) && inGoal(c.legs[1]) && Math.abs(c.cake.v) < 10 && Math.abs(c.theta) < 0.16 && Math.abs(c.cake.s) < CFG.trayHalf - 6) {
      g.winT += dt;
      if (g.winT > 0.45) {
        g.state = 'win';
        emit(g, { type: 'win', decos: c.decos.filter((d) => !d.lost).length });
      }
    } else g.winT = 0;
  }

  function snapshotCheckpoint(g, cp) {
    const c = g.char;
    return {
      id: cp.id, x0: cp.x0,
      feet: [[c.legs[0].foot.x, c.legs[0].foot.y], [c.legs[1].foot.x, c.legs[1].foot.y]],
      fluid: [c.legs[0].f, c.legs[1].f], pool: c.pool,
      decos: c.decos.map((d) => ({ kind: d.kind, a0: d.a0, d: d.lost ? d.a0 : d.d, seated: d.seated, lost: d.lost })),
    };
  }

  // advance the world by `time` seconds in fixed sub-steps (frameUpdate every 4 steps)
  function advance(g, time) {
    let n = Math.round(time / CFG.dt);
    for (let i = 0; i < n; i++) {
      if (i % 4 === 0) frameUpdate(g);
      physicsStep(g, CFG.dt, false);
      if (g.state !== 'play') { // keep simulating a little for visuals (cake fall handled by renderer)
        if (g.state === 'fail') break;
      }
    }
  }

  // deep copy of a running game (used by the level solver)
  function cloneGame(g) {
    const c = g.char;
    const legs = c.legs.map((L) => Object.assign({}, L, { foot: { x: L.foot.x, y: L.foot.y }, target: null }));
    const ch = Object.assign({}, c, {
      P: { x: c.P.x, y: c.P.y }, V: { x: c.V.x, y: c.V.y }, A: { x: c.A.x, y: c.A.y },
      legs, cake: Object.assign({}, c.cake), decos: c.decos.map((d) => Object.assign({}, d)),
      pulses: c.pulses.map((p) => Object.assign({}, p)), lastBump: c.lastBump ? Object.assign({}, c.lastBump) : null,
    });
    return Object.assign({}, g, { char: ch, events: [], history: [] });
  }

  const api = {
    cloneGame,
    CFG, createGame, resetChar, tap, frameUpdate, physicsStep, advance, predict,
    restLen, droopEq, tapPreview, twoFootEq, triApex, raycast, legAngleFromUp, freeFoot, bodyPoint, decoWorld, plantedLegs,
    prepareLevel, weightOffset, clamp,
  };
  root.LegSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
