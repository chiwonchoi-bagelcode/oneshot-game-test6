/* 다리야, 가지 마! — game shell: loop, input, camera, HUD, control panel, screens */
(function () {
  'use strict';
  const S = window.LegSim, R = window.Render, SND = window.Sound, LEVELS = window.LEVELS;
  const CFG = S.CFG, COL = R.COL, FONT = R.FONT;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const app = document.getElementById('app');

  const view = { W: 390, H: 780, dpr: 1, sceneH: 600, panelH: 180, hudH: 52, safeT: 0, safeB: 0 };
  const cam = { x: 0, y: -80, scale: 1, panX: 0, panHold: 0 };
  const fx = { parts: [], texts: [], shake: 0, customerMood: 'idle', fallingCake: null, showGrip: true, t: 0 };
  const face = { mood: 'idle', moodT: 0, lookX: 1, lookY: 0, flail: 0, sweat: 0 };
  const ui = { press: [0, 0], hint: null, hintsDone: {}, resultT: 0, failShown: false, winShown: false, timeScale: 1, slowT: 0 };

  let screen = 'title';
  let game = null;
  let levelIdx = 0;
  let acc = 0, last = 0, clock = 0;
  let demo = null; // title background game

  // ------------------------------------------------------------------ storage
  const store = {
    load() { try { return JSON.parse(localStorage.getItem('dariya-save') || '{}'); } catch (e) { return {}; } },
    save(d) { try { localStorage.setItem('dariya-save', JSON.stringify(d)); } catch (e) { /* private mode */ } },
  };
  const save = Object.assign({ stars: {}, unlocked: 1, sound: true, music: true }, store.load());

  // ------------------------------------------------------------------ layout
  function measureSafe() {
    const probe = document.getElementById('safe-probe');
    if (!probe) return;
    const cs = getComputedStyle(probe);
    view.safeT = parseFloat(cs.paddingTop) || 0;
    view.safeB = parseFloat(cs.paddingBottom) || 0;
  }
  function resize() {
    measureSafe();
    const iw = window.innerWidth, ih = window.innerHeight;
    let W = iw, H = ih;
    if (iw > 620 || iw / ih > 0.62) { // desktop / landscape: phone-shaped frame
      H = Math.min(ih - 24, 900);
      W = Math.min(iw - 24, Math.round(H * 0.5));
      app.classList.add('framed');
    } else app.classList.remove('framed');
    app.style.width = W + 'px'; app.style.height = H + 'px';
    view.W = W; view.H = H;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * view.dpr); canvas.height = Math.round(H * view.dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    view.panelH = Math.round(Math.max(168, Math.min(230, H * 0.27))) + view.safeB;
    view.sceneH = H - view.panelH;
    view.hudH = 50 + view.safeT;
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ game control
  function startLevel(i, fromCheckpoint) {
    levelIdx = i;
    const def = LEVELS[i];
    const keepCp = fromCheckpoint && game && game.checkpoint && game.level.id === def.id ? game.checkpoint : null;
    game = S.createGame(def, keepCp ? { fromCheckpoint: keepCp } : null);
    if (keepCp) game.checkpoint = keepCp;
    game.char.time = 0;
    fx.parts.length = 0; fx.texts.length = 0; fx.fallingCake = null; fx.delivery = null; fx.customerMood = 'idle';
    ui.failShown = false; ui.winShown = false; ui.resultT = 0; ui.timeScale = 1; ui.slowT = 0;
    ui.hint = null;
    ui.hintsDone = {};
    showIntro(def);
    snapCamera();
    screen = 'play';
    hideOverlay();
  }

  function doTap(i) {
    if (screen !== 'play' || !game || game.state !== 'play') return;
    SND.init();
    ui.press[i] = 1;
    const r = S.tap(game, i);
    if (r === 'pump' || r === 'switch') {
      const L = game.char.legs[i];
      if (L.planted) { face.mood = 'push'; face.moodT = 0.45; }
    }
  }

  // ------------------------------------------------------------------ events -> fx + sound
  const PLAT_CRUMB = { biscuit: '#d99a4e', choco: '#5b2f1d', wafer: '#e7bf76', sponge: '#fff3d6', macaron: '#ff9fbc', table: '#ffffff' };
  function addText(x, y, text, col, size, rot) { fx.texts.push({ x, y, text, col, size: size || 18, rot: rot || 0, age: 0, life: 0.95 }); }
  function burst(x, y, n, col, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = (opt.a0 != null ? opt.a0 : -Math.PI) + Math.random() * (opt.spread != null ? opt.spread : Math.PI);
      const sp = (opt.speed || 120) * (0.4 + Math.random() * 0.8);
      fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: opt.g != null ? opt.g : 500, life: opt.life || 0.6, age: 0, size: opt.size || 3, col, shape: opt.shape || 'sq', rot: Math.random() * 3, vr: (Math.random() - 0.5) * 10 });
    }
  }

  function handleEvents() {
    const c = game.char;
    for (const e of game.events) {
      switch (e.type) {
        case 'pump': {
          if (e.src === 'none') break;
          SND.sfx.pump(e.leg, e.planted, e.f);
          if (e.src === 'leg') SND.sfx.shrink(1 - e.leg);
          if (e.planted && Math.random() < 0.35) SND.sfx.hup();
          fx.parts.push({ x: c.P.x, y: c.P.y, vx: 0, vy: 0, g: 0, life: 0.35, age: 0, size: 12, col: COL.fluid, shape: 'ring' });
          break;
        }
        case 'full': {
          SND.sfx.full(e.planted);
          const L = c.legs[e.leg];
          const p = L.planted ? { x: (L.foot.x + c.P.x) / 2, y: (L.foot.y + c.P.y) / 2 } : S.freeFoot(c, L);
          addText(p.x + (e.leg ? 18 : -18), p.y, e.planted ? '꽉!' : '두리번', COL.legDark[e.leg], 15);
          break;
        }
        case 'plant': {
          SND.sfx.plant(e.speed || 0);
          const col = PLAT_CRUMB[(e.rect && e.rect.kind) || 'biscuit'];
          burst(e.x, e.y - 2, 9, col, { speed: 110, a0: -Math.PI * 0.95, spread: Math.PI * 0.9, size: 3, life: 0.5 });
          fx.parts.push({ x: e.x + 2, y: e.y, vx: 0, vy: 0, g: 0, life: 0.45, age: 0, size: 14, col: COL.leg[e.leg], shape: 'ring' });
          addText(e.x + 4, e.y - 30, '착!', COL.legDark[e.leg], 20, (Math.random() - 0.5) * 0.3);
          fx.shake = Math.max(fx.shake, 0.25);
          break;
        }
        case 'fold':
        case 'pop':
        case 'switch': {
          SND.sfx.pop();
          if (e.drained) SND.sfx.drain(e.drained);
          burst(e.x, e.y - 4, 6, COL.fluid, { speed: 140, a0: -Math.PI * 0.9, spread: Math.PI * 0.8, size: 2.6, shape: 'drop', life: 0.55 });
          addText(e.x, e.y - 26, '뽁!', COL.legDark[e.leg], 18, (Math.random() - 0.5) * 0.4);
          if (e.type === 'switch') {
            const other = 1 - e.leg;
            addText(c.P.x, c.P.y - 150, '갈아타기!', COL.legDark[other], 16);
          }
          if (e.type === 'pop') { face.mood = 'pop'; face.moodT = 0.5; SND.sfx.whoa(); }
          break;
        }
        case 'bump': {
          SND.sfx.bump();
          const cp = S.bodyPoint(c, c.cake.s, -(CFG.trayOff + CFG.cakeH));
          burst(cp.x, cp.y, 10, '#fffaf0', { speed: 160, size: 4, shape: 'puff', life: 0.5, g: 200 });
          addText(cp.x, cp.y - 24, '퍽!', '#c2415a', 20);
          fx.shake = Math.max(fx.shake, 0.6);
          break;
        }
        case 'decoLoose': SND.sfx.decoLoose(); face.mood = 'worry'; face.moodT = 0.6; break;
        case 'decoSeat': {
          SND.sfx.decoSeat();
          const cp = S.bodyPoint(c, c.cake.s, -(CFG.trayOff + CFG.cakeH + 8));
          burst(cp.x, cp.y, 4, '#ffe27a', { speed: 50, size: 4, shape: 'star', life: 0.5, g: 0 });
          break;
        }
        case 'decoFall': {
          SND.sfx.decoFall();
          addText(e.x, e.y - 18, '앗!', '#c2415a', 18);
          face.mood = 'panic'; face.moodT = 0.7;
          break;
        }
        case 'relief': {
          SND.sfx.relief();
          face.mood = 'relief'; face.moodT = 1.2;
          const hp = S.bodyPoint(c, -30, -50);
          addText(hp.x - 10, hp.y, '휴~', '#3aa59a', 18, -0.15);
          fx.parts.push({ x: hp.x - 4, y: hp.y + 10, vx: -40, vy: -10, g: 0, life: 0.8, age: 0, size: 6, col: 'rgba(255,255,255,0.8)', shape: 'puff' });
          break;
        }
        case 'checkpoint': {
          SND.sfx.checkpoint();
          addText(c.P.x, c.P.y - 160, '중간 저장!', '#d18a12', 16);
          burst(c.P.x, c.P.y - 120, 8, '#ffd25e', { speed: 110, size: 5, shape: 'star', life: 0.8, g: 80 });
          break;
        }
        case 'win': {
          SND.sfx.win();
          fx.customerMood = 'happy';
          face.mood = 'win'; face.moodT = 99;
          const best = save.stars[game.level.id] || 0;
          save.stars[game.level.id] = Math.max(best, e.decos);
          save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIdx + 2));
          store.save(save);
          game.result = { decos: e.decos, taps: game.taps };
          const cp = S.bodyPoint(c, 0, -110);
          burst(cp.x, cp.y, 22, '#ffd25e', { speed: 220, size: 6, shape: 'star', life: 1.2, g: 150, spread: Math.PI * 2 });
          const from = S.bodyPoint(c, c.cake.s, -(CFG.trayOff + 1));
          const gl = game.level.goal;
          fx.delivery = { t: -0.35, from, to: { x: gl.x1 - 16, y: gl.y - 2 }, r: c.theta, decos: c.decos.filter((d) => !d.lost).map((d) => Object.assign({}, d)) };
          addText(gl.x1 + 30, gl.y - 120, '고마워요!', '#e8455a', 18);
          ui.resultT = 0;
          break;
        }
        case 'fail': {
          SND.sfx.fail();
          face.mood = 'fail'; face.moodT = 99;
          ui.timeScale = 0.35; ui.slowT = 1.1;
          const ck = c.cake;
          const cp = S.bodyPoint(c, ck.s, -(CFG.trayOff));
          fx.fallingCake = { x: cp.x, y: cp.y, vx: c.V.x + Math.sign(ck.s) * 90, vy: c.V.y - 60, r: c.theta, vr: Math.sign(ck.s) * 4, decos: c.decos.filter((d) => !d.lost).map((d) => Object.assign({}, d)) };
          for (const d of c.decos) d.lost = true, d.fallT = 99;
          ui.resultT = 0;
          break;
        }
      }
    }
    game.events.length = 0;
  }

  // ------------------------------------------------------------------ fx update
  function updateFx(dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.age += dt;
      if (p.age > p.life) { fx.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
    }
    for (let i = fx.texts.length - 1; i >= 0; i--) {
      fx.texts[i].age += dt;
      if (fx.texts[i].age > fx.texts[i].life) fx.texts.splice(i, 1);
    }
    if (fx.fallingCake) {
      const f = fx.fallingCake;
      f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt;
      if (f.y > 215 && !f.splashed) {
        f.splashed = true;
        burst(f.x, 212, 16, '#fff8ec', { speed: 200, size: 5, shape: 'puff', life: 0.7, g: 600 });
        burst(f.x, 212, 8, '#ffd98a', { speed: 160, size: 4, life: 0.7, g: 600 });
        f.vy *= 0.15; f.vx *= 0.3;
      }
      if (f.splashed) { f.vy = Math.min(f.vy, 40); }
    }
    if (fx.delivery) {
      fx.delivery.t += dt;
      if (fx.delivery.t >= 0 && game && !game.char.cake.delivered) game.char.cake.delivered = true;
      if (fx.delivery.t > 0.9 && !fx.delivery.landed) {
        fx.delivery.landed = true;
        SND.sfx.plant(60);
        burst(fx.delivery.to.x, fx.delivery.to.y - 10, 12, '#ffd25e', { speed: 140, size: 5, shape: 'star', life: 0.9, g: 120, spread: Math.PI * 2 });
      }
    }
    fx.shake = Math.max(0, fx.shake - dt * 2.5);
    ui.press[0] = Math.max(0, ui.press[0] - dt * 5);
    ui.press[1] = Math.max(0, ui.press[1] - dt * 5);
  }

  function updateFace(dt) {
    const c = game.char;
    face.moodT -= dt;
    const ck = c.cake;
    const danger = c.danger || 0;
    if (face.moodT <= 0) {
      if (Math.abs(ck.s) > 32 || danger > 1.3) face.mood = 'panic';
      else if (danger > 0.55 || Math.abs(c.theta) > 0.22) face.mood = 'worry';
      else face.mood = 'idle';
    }
    face.flail += ((danger > 0.6 ? Math.min(1, danger) : 0) - face.flail) * Math.min(1, dt * 6);
    face.sweat += ((danger > 0.5 ? 1 : 0) - face.sweat) * Math.min(1, dt * 3);
    // gaze: toward a landing target, otherwise forward / up at a sliding cake
    let lx = 1, ly = 0;
    const F = c.legs.find((L) => !L.planted && L.target && !L.target.none);
    if (face.mood === 'worry' || face.mood === 'panic') { lx = Math.sign(ck.s) || 1; ly = -1; }
    else if (F) { const dx = F.target.x - c.P.x, dy = F.target.y - c.P.y; const d = Math.hypot(dx, dy) || 1; lx = dx / d; ly = dy / d; }
    else if (clock % 6 > 4.6) { lx = 0.2; ly = -1; } // idle: a nervous glance up at the cake
    face.lookX += (lx - face.lookX) * Math.min(1, dt * 8);
    face.lookY += (ly - face.lookY) * Math.min(1, dt * 8);
  }

  // ------------------------------------------------------------------ camera
  function camTarget() {
    const c = game.char;
    let xs = [c.P.x - 50, c.P.x + 60];
    let ys = [c.P.y - 125, c.P.y + 40];
    for (const L of c.legs) {
      const f = L.planted ? L.foot : S.freeFoot(c, L);
      xs.push(f.x); ys.push(f.y + 30);
      if (!L.planted && L.target && !L.target.none) { xs.push(L.target.x + 40); ys.push(L.target.y + 30); }
    }
    xs.push(c.P.x + 190); // look ahead
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const visH = view.sceneH - view.hudH - 30;
    const base = view.W / 470;
    let sc = Math.min(base, (view.W - 30) / (maxX - minX), visH / (maxY - minY));
    sc = Math.max(base * 0.62, sc);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2 - 30 / sc;
    return { x: cx, y: cy, scale: sc };
  }
  function snapCamera() { const t = camTarget(); cam.x = t.x; cam.y = t.y; cam.scale = t.scale; cam.panX = 0; }
  function updateCamera(dt) {
    const t = camTarget();
    const k = 1 - Math.exp(-dt * 3.2);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k;
    cam.scale += (t.scale - cam.scale) * (1 - Math.exp(-dt * 2));
    if (!drag.active) { cam.panHold -= dt; if (cam.panHold <= 0) cam.panX *= Math.exp(-dt * 3); }
  }
  function worldToScreen(x, y) {
    const cy = view.hudH + (view.sceneH - view.hudH) / 2;
    return { x: (x - cam.x - cam.panX) * cam.scale + view.W / 2, y: (y - cam.y) * cam.scale + cy };
  }
  function screenToWorld(x, y) {
    const cy = view.hudH + (view.sceneH - view.hudH) / 2;
    return { x: (x - view.W / 2) / cam.scale + cam.x + cam.panX, y: (y - cy) / cam.scale + cam.y };
  }

  // ------------------------------------------------------------------ hints
  // level 1 hints always play (tutorial); the rest show once per profile
  const HINTS = [
    { id: 'push', lv: 1, when: (g) => g.taps === 0, done: (g) => g.taps > 1,
      text: '<b class="m">왼다리</b>를 눌러 보세요. 디딘 발은 붙어 있고, 다리가 늘어나 <b>몸을 발 반대쪽</b>으로 밀어요.' },
    { id: 'share', lv: 1, when: (g) => g.taps >= 1 && g.char.support === 2 && !anySwitchReady(g), done: (g) => anySwitchReady(g) || g.char.support === 1,
      text: '동력액은 함께 써요. 한쪽이 늘면 <b>다른 다리는 줄어요</b>. 몸통 아래 <b>추</b>가 <b>앞발</b>을 넘어가게 <b>뒷다리</b>로 계속 밀어 보세요.' },
    { id: 'switch', lv: 1, when: (g) => anySwitchReady(g), done: (g) => g.char.support === 1,
      text: '추가 앞발을 넘었어요! 이제 그 <b>앞발</b>을 누르면 그 발로 <b>갈아타고</b>, 뒷다리는 접혀서 동력액이 골반으로 돌아가요.' },
    { id: 'reach', lv: 1, when: (g) => g.char.support === 1 && g.char.legs.some((L) => !L.planted), done: (g) => g.char.support === 2,
      text: '<b>공중 다리</b>를 누르면 점선을 따라 뻗어 고리에 \'착\' 붙어요. <b>×숫자</b>는 남은 탭 수예요.' },
    { id: 'brace', lv: 1, when: (g) => g.char.support === 2 && g.taps > 4, done: (g, t) => t > 5 || g.taps > 14,
      text: '착! 추가 두 발 사이에 있으면 쟁반이 평평해요. 다시 <b>뒷다리</b>로 밀고, 앞발을 넘으면 갈아타요.' },
    { id: 'tilt', lv: 1, when: (g) => Math.abs(g.char.offset || 0) > 40, done: (g) => Math.abs(g.char.offset || 0) < 6,
      text: '추가 발 바깥으로 멀리 나가면 <b>쟁반이 기울어</b> 케이크가 미끄러져요. 다른 발을 디뎌 받쳐 주세요!' },
    { id: 'gap', lv: 2, once: true, when: (g) => g.taps === 0, done: (g, t) => g.taps > 3 || t > 7,
      text: '틈이 넓어요. 몸을 앞발 너머로 <b>더 많이 밀고</b> 갈아타면, 기운 만큼 공중 다리가 <b>더 멀리</b> 뻗어요.' },
    { id: 'release', lv: 0, once: true, when: (g) => g.char.support === 2 && (S.tapPreview(g, 0).kind === 'release' || S.tapPreview(g, 1).kind === 'release'),
      done: (g, t) => g.char.support === 1 || t > 6,
      text: '<b>밀며 떼기</b>: 한 번 더 밀면 앞발이 떨어지고 뒷다리 하나로 더 멀리 버텨요. 대신 쟁반이 크게 기울어요!' },
    { id: 'height', lv: 3, once: true, when: (g) => g.taps === 0, done: (g, t) => g.taps > 4 || t > 7,
      text: '높은 발판은 몸이 높아야 닿아요. 디딘 다리를 <b>더 밀어</b> 몸을 올린 뒤 공중 다리를 뻗어 보세요.' },
    { id: 'pillar', lv: 4, once: true, when: (g) => g.taps === 0, done: (g, t) => g.taps > 4 || t > 7,
      text: '마카롱 기둥은 좁아요. <b>고리</b>가 기둥 위에 올 때까지 몸을 밀거나 덜 밀어 맞춰 보세요.' },
    { id: 'ceiling', lv: 5, once: true, when: (g) => g.taps === 0, done: (g, t) => g.taps > 5 || t > 8,
      text: '휘핑크림에 케이크가 닿으면 장식이 떨어져요! 다리를 <b>짧게</b>, 두 발을 <b>넓게</b> 벌리면 몸이 낮아져요.' },
  ];
  function anySwitchReady(g) {
    if (g.char.support !== 2) return false;
    return S.tapPreview(g, 0).kind === 'switch' || S.tapPreview(g, 1).kind === 'switch';
  }
  function updateHints(dt) {
    if (!game || game.state !== 'play') { ui.hint = null; return; }
    const lvId = game.level.id;
    if (ui.hint) {
      ui.hint.t += dt;
      if (ui.hint.t > 1.2 && ui.hint.done(game, ui.hint.t)) {
        ui.hintsDone[ui.hint.id] = true;
        if (ui.hint.once) { save.hints = save.hints || {}; save.hints[ui.hint.id] = true; store.save(save); }
        ui.hint = null;
      }
    }
    if (!ui.hint) {
      for (const h of HINTS) {
        if (ui.hintsDone[h.id]) continue;
        if (h.lv && h.lv !== lvId) continue;
        if (h.lv === 0 && lvId === 1) continue;
        if (h.once && save.hints && save.hints[h.id]) continue;
        if (h.when(game)) { ui.hint = h; h.t = 0; break; }
      }
    }
  }

  // ------------------------------------------------------------------ predicted button actions
  function legAction(i) {
    const c = game.char, L = c.legs[i];
    const pv = S.tapPreview(game, i);
    const toward = (L.planted ? Math.atan2(c.P.y - L.foot.y, c.P.x - L.foot.x) : Math.atan2(Math.cos(L.dirA), Math.sin(L.dirA)));
    switch (pv.kind) {
      case 'switch': return { verb: '갈아타기', kind: 'switch' };
      case 'release': return { verb: '밀며 떼기', kind: 'push', ang: toward };
      case 'push': return { verb: '밀기', kind: 'push', ang: toward };
      case 'full': return { verb: '가득 참', kind: 'full' };
      case 'reach': return { verb: pv.k <= 1 ? '디디기' : '뻗기 ×' + pv.k, kind: 'reach', ang: toward };
      default: return { verb: '찾기', kind: 'search', ang: toward };
    }
  }

  // ------------------------------------------------------------------ drawing: HUD + panel
  function drawHUD() {
    const W = view.W, top = view.safeT;
    ctx.save();
    // level pill
    const lv = game.level;
    ctx.font = '15px ' + FONT;
    const label = lv.id + ' · ' + lv.name;
    const lw = ctx.measureText(label).width + 26;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    R.rr(ctx, 10, top + 9, lw, 32, 16); ctx.fill();
    ctx.strokeStyle = 'rgba(74,47,39,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = COL.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(label, 23, top + 26);
    // decorations
    const decos = game.char.decos;
    const dx0 = W - 56 - decos.length * 30;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    R.rr(ctx, dx0 - 8, top + 9, decos.length * 30 + 10, 32, 16); ctx.fill(); ctx.stroke();
    decos.forEach((d, i) => {
      ctx.save();
      ctx.translate(dx0 + 12 + i * 30, top + 34);
      ctx.scale(1.25, 1.25);
      if (d.lost) ctx.globalAlpha = 0.25;
      R.drawDeco(ctx, d, 0, 0, clock, 0);
      ctx.restore();
      if (d.lost) {
        ctx.strokeStyle = '#c2415a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(dx0 + 4 + i * 30, top + 18); ctx.lineTo(dx0 + 20 + i * 30, top + 34); ctx.stroke();
      }
    });
    // pause button
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.beginPath(); ctx.arc(W - 27, top + 25, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.ink;
    R.rr(ctx, W - 33, top + 18, 4.5, 14, 2); ctx.fill();
    R.rr(ctx, W - 25.5, top + 18, 4.5, 14, 2); ctx.fill();
    ctx.restore();
  }

  function legButtonRects() {
    const W = view.W, y0 = view.sceneH + 58, h = view.panelH - 58 - 12 - view.safeB;
    const gap = 10, w = (W - 24 - gap) / 2;
    return [{ x: 12, y: y0, w, h }, { x: 12 + w + gap, y: y0, w, h }];
  }

  function drawPanel() {
    const W = view.W, y0 = view.sceneH, H = view.H;
    ctx.save();
    // counter
    const g = ctx.createLinearGradient(0, y0, 0, H);
    g.addColorStop(0, '#fbe3c4'); g.addColorStop(1, '#f2c99c');
    ctx.fillStyle = g;
    R.rr(ctx, 0, y0 - 6, W, H - y0 + 12, 18); ctx.fill();
    ctx.strokeStyle = 'rgba(160,100,60,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(14, y0 - 5); ctx.lineTo(W - 14, y0 - 5); ctx.stroke();
    drawGauge(y0 + 10);
    const rects = legButtonRects();
    for (let i = 0; i < 2; i++) drawLegButton(i, rects[i]);
    ctx.restore();
  }

  function drawGauge(y) {
    const c = game.char;
    const W = view.W;
    const x0 = 16, w = W - 32, h = 30;
    const T = CFG.T;
    const a = c.legs[0].fa, p = c.poolA, b = c.legs[1].fa;
    const tot = Math.max(0.001, a + p + b);
    const wa = w * a / tot, wp = w * p / tot;
    ctx.save();
    ctx.fillStyle = COL.ink;
    R.rr(ctx, x0 - 2, y - 2, w + 4, h + 4, (h + 4) / 2); ctx.fill();
    ctx.save();
    R.rr(ctx, x0, y, w, h, h / 2); ctx.clip();
    // ownership regions
    ctx.fillStyle = COL.legSoft[0]; ctx.fillRect(x0, y, wa, h);
    ctx.fillStyle = '#ffe0e6'; ctx.fillRect(x0 + wa, y, wp, h);
    ctx.fillStyle = COL.legSoft[1]; ctx.fillRect(x0 + wa + wp, y, w - wa - wp, h);
    // fluid units as drops
    for (let i = 0; i < T; i++) {
      const cx = x0 + (i + 0.5) * w / T;
      const owner = cx < x0 + wa ? 0 : cx < x0 + wa + wp ? 2 : 1;
      const r = Math.min(h * 0.34, w / T * 0.36);
      ctx.fillStyle = COL.fluid;
      ctx.beginPath(); ctx.arc(cx, y + h / 2 + 1, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = owner === 2 ? '#e8455a' : COL.leg[owner]; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(cx - r * 0.3, y + h / 2 - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // dividers
    ctx.fillStyle = COL.ink;
    ctx.fillRect(x0 + wa - 1.5, y - 3, 3, h + 6);
    ctx.fillRect(x0 + wa + wp - 1.5, y - 3, 3, h + 6);
    // labels
    ctx.font = '12px ' + FONT; ctx.textBaseline = 'top';
    const lt = '왼다리 ' + c.legs[0].f, rt = c.legs[1].f + ' 오른다리', pt = '골반 ' + c.pool;
    const lw = ctx.measureText(lt).width, rw = ctx.measureText(rt).width, pw = ctx.measureText(pt).width;
    ctx.textAlign = 'left'; ctx.fillStyle = COL.legDark[0]; ctx.fillText(lt, x0 + 4, y + h + 4);
    ctx.textAlign = 'right'; ctx.fillStyle = COL.legDark[1]; ctx.fillText(rt, x0 + w - 4, y + h + 4);
    if (c.pool > 0) {
      const lo = x0 + 4 + lw + 8 + pw / 2, hi = x0 + w - 4 - rw - 8 - pw / 2;
      const px = Math.max(lo, Math.min(hi, x0 + wa + wp / 2));
      ctx.textAlign = 'center'; ctx.fillStyle = '#c2415a'; ctx.fillText(pt, px, y + h + 4);
    }
    ctx.restore();
  }

  function drawLegButton(i, r) {
    const c = game.char, L = c.legs[i];
    const act = legAction(i);
    const pr = ui.press[i];
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    const s = 1 - pr * 0.05;
    ctx.scale(s, s);
    ctx.translate(-r.w / 2, -r.h / 2);
    // base
    ctx.fillStyle = COL.legDark[i];
    R.rr(ctx, 0, 4, r.w, r.h - 2, 20); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, r.h);
    g.addColorStop(0, i ? '#ffb27a' : '#6fe0c2'); g.addColorStop(1, COL.leg[i]);
    ctx.fillStyle = g;
    R.rr(ctx, 0, pr * 3, r.w, r.h - 4, 20); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 2.5;
    R.rr(ctx, 0, pr * 3, r.w, r.h - 4, 20); ctx.stroke();
    if (pr > 0) { ctx.fillStyle = 'rgba(255,255,255,' + pr * 0.35 + ')'; R.rr(ctx, 0, pr * 3, r.w, r.h - 4, 20); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    R.rr(ctx, 10, 6 + pr * 3, r.w - 20, 8, 4); ctx.fill();
    // content is laid out for ~112px tall buttons; shrink it on short screens
    const k = Math.min(1, (r.h - 6) / 112);
    if (k < 1) { ctx.translate(r.w / 2, 2); ctx.scale(k, k); ctx.translate(-r.w / 2, 0); }
    // label
    ctx.fillStyle = '#fff'; ctx.font = '20px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = COL.legDark[i]; ctx.lineJoin = 'round';
    const ly = 22 + pr * 3;
    ctx.strokeText(i ? '오른다리' : '왼다리', r.w / 2, ly);
    ctx.fillText(i ? '오른다리' : '왼다리', r.w / 2, ly);
    // state chip
    const st = L.planted ? '디딤' : (L.f > 0 ? '공중' : '접힘');
    ctx.font = '12px ' + FONT;
    const cw = ctx.measureText(st).width + 14;
    ctx.fillStyle = L.planted ? '#fff' : 'rgba(255,255,255,0.55)';
    R.rr(ctx, r.w / 2 - cw / 2, ly + 14, cw, 18, 9); ctx.fill();
    ctx.fillStyle = COL.ink; ctx.fillText(st, r.w / 2, ly + 23.5);
    // shoe icon showing the shoe's current state
    const iy = ly + 54;
    ctx.save();
    ctx.translate(r.w * 0.3, iy);
    if (!L.planted) ctx.rotate(-0.35);
    ctx.scale(1.2, 1.2);
    drawShoeIcon(i, L.planted);
    ctx.restore();
    // action verb + direction arrow
    ctx.save();
    ctx.translate(r.w * 0.66, iy - 4);
    if (act.ang != null) {
      ctx.save();
      ctx.rotate(act.ang);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-11, -3.5); ctx.lineTo(4, -3.5); ctx.lineTo(4, -9); ctx.lineTo(14, 0); ctx.lineTo(4, 9); ctx.lineTo(4, 3.5); ctx.lineTo(-11, 3.5); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (act.kind === 'switch') {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.font = '14px ' + FONT; ctx.fillText('⇄', 0, 1);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COL.ink; ctx.font = '13px ' + FONT; ctx.fillText('•', 0, 1);
    }
    ctx.restore();
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = COL.ink;
    ctx.fillText(act.verb, r.w * 0.66, iy + 19);
    ctx.restore();
  }

  function drawShoeIcon(i, planted) {
    ctx.fillStyle = '#4a2c22';
    R.rr(ctx, -12, -3.5, 30, 4.5, 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -2); ctx.lineTo(16, -2); ctx.quadraticCurveTo(19, -3, 18, -6); ctx.quadraticCurveTo(16, -11, 6, -12);
    ctx.lineTo(1, -14); ctx.lineTo(-7, -15); ctx.quadraticCurveTo(-13, -14, -12, -2); ctx.closePath();
    ctx.fillStyle = '#fffaf2'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = COL.legDark[i];
    ctx.fillRect(-5, -16, 13, 15);
    ctx.restore();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.stroke();
    if (planted) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 3.5); ctx.lineTo(20, 3.5); ctx.stroke(); }
  }

  function drawHintCard() {
    const h = ui.hint;
    const el = document.getElementById('hint');
    if (!h || screen !== 'play' || game.state !== 'play') { el.classList.remove('show'); return; }
    if (el.dataset.id !== h.id) { el.dataset.id = h.id; el.innerHTML = h.text; }
    el.style.top = (view.hudH + 6) + 'px';
    el.classList.add('show');
  }

  // ------------------------------------------------------------------ render
  function render() {
    const d = view.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, view.W, view.H);
    const g = screen === 'play' || screen === 'pause' || screen === 'result' ? game : demo;
    if (!g) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, view.W, view.sceneH + 8); ctx.clip();
    R.drawBackground(ctx, view, cam, clock);
    const sh = fx.shake * fx.shake * 6;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    const cy = view.hudH + (view.sceneH - view.hudH) / 2;
    ctx.setTransform(d * cam.scale, 0, 0, d * cam.scale, d * (view.W / 2 - (cam.x + cam.panX) * cam.scale + sx), d * (cy - cam.y * cam.scale + sy));
    g.char.time = clock;
    R.drawWorld(ctx, g, cam, view, clock, fx, face);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.restore();
    if (g === game) { drawHUD(); drawPanel(); }
    else drawTitlePanel();
  }

  function drawTitlePanel() {
    const y0 = view.sceneH, W = view.W, H = view.H;
    const gr = ctx.createLinearGradient(0, y0, 0, H);
    gr.addColorStop(0, '#fbe3c4'); gr.addColorStop(1, '#f2c99c');
    ctx.fillStyle = gr;
    R.rr(ctx, 0, y0 - 6, W, H - y0 + 12, 18); ctx.fill();
  }

  // ------------------------------------------------------------------ main loop
  function frame(ts) {
    const dt = Math.min(0.05, (ts - (last || ts)) / 1000);
    last = ts;
    clock += dt;
    if (screen === 'play' || screen === 'result') {
      if (ui.slowT > 0) { ui.slowT -= dt; if (ui.slowT <= 0) ui.timeScale = 1; }
      acc += dt * ui.timeScale;
      let n = 0;
      while (acc >= 1 / 60 && n < 5) {
        S.frameUpdate(game);
        for (let i = 0; i < 4; i++) S.physicsStep(game, CFG.dt, false);
        acc -= 1 / 60; n++;
      }
      if (n >= 5) acc = 0;
      handleEvents();
      updateFace(dt);
      updateHints(dt);
      updateDangerAudio();
      if (game.state === 'win' && !ui.winShown) { ui.resultT += dt; if (ui.resultT > 2.1) { ui.winShown = true; showWin(); } }
      if (game.state === 'fail' && !ui.failShown) { ui.resultT += dt; if (ui.resultT > 1.5) { ui.failShown = true; showFail(); } }
      if (game.state === 'play') {
        const gl = game.level.goal, c = game.char;
        fx.customerMood = c.P.x > gl.x0 - 220 ? 'near' : 'idle';
      }
      updateCamera(dt);
    } else if (screen === 'title' || screen === 'select') {
      if (demo) {
        demoAI(dt);
        S.frameUpdate(demo);
        for (let i = 0; i < 4; i++) S.physicsStep(demo, CFG.dt, false);
        demo.events.length = 0;
        const t = { x: demo.char.P.x + 20, y: demo.char.P.y - 20 };
        cam.x += (t.x - cam.x) * 0.05; cam.y += (t.y - cam.y) * 0.05; cam.scale = view.W / 300 * Math.min(1, view.H / 820);
        face.mood = 'idle'; face.lookX = 1;
      }
    } else if (screen === 'pause') {
      // frozen
    }
    updateFx(dt);
    drawHintCard();
    render();
    requestAnimationFrame(frame);
  }

  function updateDangerAudio() {
    const c = game.char;
    if (game.state !== 'play') { SND.setDanger(0, 0); return; }
    const slide = Math.abs(c.cake.v) / 25 + c.decos.reduce((m, d) => Math.max(m, d.lost || d.seated ? 0 : Math.abs(d.v) / 25), 0);
    const creak = Math.max(0, Math.abs(c.theta) - 0.18) * 4;
    SND.setDanger(slide, creak);
  }

  // title-screen demo: a calm walker (push with the back leg, switch, reach)
  let demoT = 0;
  function demoAI(dt) {
    demoT += dt;
    const c = demo.char;
    if (demo.state !== 'play' || c.P.x > 1300) { makeDemo(); return; }
    if (demoT < 0.75) return;
    demoT = 0;
    if (c.support === 2) {
      const front = c.legs[0].foot.x > c.legs[1].foot.x ? 0 : 1, back = 1 - front;
      const eq = S.twoFootEq(c, c.legs[0].f, c.legs[1].f) || c.P;
      const past = eq.x - c.legs[front].foot.x;
      const pv = S.tapPreview(demo, back);
      S.tap(demo, past > 22 || pv.kind === 'release' || pv.kind === 'full' ? front : back);
    } else {
      const Fi = c.legs[0].planted ? 1 : 0, F = c.legs[Fi], Sp = c.legs[1 - Fi];
      const tg = F.target;
      const good = tg && !tg.none && tg.x > Sp.foot.x + 40;
      const canPush = S.tapPreview(demo, Sp.side).kind === 'push' && F.f > 0;
      S.tap(demo, good || !canPush ? Fi : Sp.side);
    }
  }

  // ------------------------------------------------------------------ input
  const drag = { active: false, id: null, x: 0, y: 0, moved: 0 };
  function local(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', (e) => {
    SND.init();
    if (screen !== 'play') return;
    const p = local(e);
    e.preventDefault();
    if (p.y > view.sceneH - 4) {
      const rects = legButtonRects();
      for (let i = 0; i < 2; i++) {
        const r = rects[i];
        if (p.x >= r.x - 4 && p.x <= r.x + r.w + 4 && p.y >= r.y - 30) { doTap(i); return; }
      }
      return;
    }
    // HUD pause
    if (Math.hypot(p.x - (view.W - 27), p.y - (view.safeT + 25)) < 24) { showPause(); return; }
    // tap a leg directly in the scene
    if (game.state === 'play') {
      const w = screenToWorld(p.x, p.y);
      const c = game.char;
      let best = -1, bd = 34 / cam.scale;
      c.legs.forEach((L, i) => {
        const f = L.planted ? L.foot : S.freeFoot(c, L);
        const hip = c.P;
        // distance to the leg segment
        const dx = f.x - hip.x, dy = f.y - hip.y, l2 = dx * dx + dy * dy || 1;
        const tt = Math.max(0.15, Math.min(1, ((w.x - hip.x) * dx + (w.y - hip.y) * dy) / l2));
        const d = Math.hypot(w.x - (hip.x + dx * tt), w.y - (hip.y + dy * tt));
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) { doTap(best); return; }
    }
    drag.active = true; drag.id = e.pointerId; drag.x = p.x; drag.y = p.y; drag.moved = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    const p = local(e);
    const dx = p.x - drag.x;
    drag.moved += Math.abs(dx);
    cam.panX -= dx / cam.scale;
    cam.panX = Math.max(-260, Math.min(420, cam.panX));
    drag.x = p.x; drag.y = p.y;
  });
  const endDrag = (e) => { if (drag.active && e.pointerId === drag.id) { drag.active = false; cam.panHold = 1.2; } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key;
    if (screen === 'play') {
      if (k === 'a' || k === 'A' || k === 'ArrowLeft' || k === 'ㅁ') { SND.init(); doTap(0); }
      else if (k === 'd' || k === 'D' || k === 'ArrowRight' || k === 'ㅇ') { SND.init(); doTap(1); }
      else if (k === 'Escape' || k === 'p' || k === 'P') showPause();
      else if (k === 'r' || k === 'R') startLevel(levelIdx, true);
    } else if (screen === 'pause' && (k === 'Escape' || k === 'p' || k === 'P')) resume();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') showPause(); });
  // iOS/Safari only unlock audio on certain gestures: try on all of them
  ['touchend', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, () => SND.init(), { passive: true }));
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  function showIntro(def) {
    const el = document.getElementById('intro');
    el.innerHTML = '<span class="n">' + def.id + '</span><span class="t">' + def.name + '</span><span class="s">' + (def.sub || '') + '</span>';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  // ------------------------------------------------------------------ overlays
  function hideOverlay() { overlay.className = 'hidden'; overlay.innerHTML = ''; }
  function showOverlay(cls, html) {
    overlay.className = cls;
    overlay.innerHTML = html;
    overlay.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); SND.init(); SND.sfx.click(); ACT[b.dataset.act](b.dataset.arg); });
    });
  }
  const ACT = {
    start: () => startLevel(Math.min(save.unlocked, LEVELS.length) - 1 >= 0 ? firstUnfinished() : 0),
    select: () => showSelect(),
    level: (i) => startLevel(parseInt(i, 10)),
    title: () => showTitle(),
    resume: () => resume(),
    retry: () => startLevel(levelIdx, true),
    restart: () => { if (game) game.checkpoint = null; startLevel(levelIdx, false); },
    next: () => { if (levelIdx + 1 < LEVELS.length) startLevel(levelIdx + 1); else showSelect(); },
    sound: () => { save.sound = !save.sound; SND.setOn(save.sound); store.save(save); refreshToggles(); },
    music: () => { save.music = !save.music; SND.setMusic(save.music); store.save(save); refreshToggles(); },
    howto: () => showHowTo(),
  };
  function firstUnfinished() {
    for (let i = 0; i < LEVELS.length; i++) if (!save.stars[LEVELS[i].id] && i < save.unlocked) return i;
    return Math.min(save.unlocked, LEVELS.length) - 1;
  }
  function refreshToggles() {
    overlay.querySelectorAll('[data-act=sound]').forEach((b) => { b.textContent = save.sound ? '🔊 소리 켬' : '🔇 소리 끔'; });
    overlay.querySelectorAll('[data-act=music]').forEach((b) => { b.textContent = save.music ? '♪ 음악 켬' : '♪ 음악 끔'; });
  }
  function starStr(n, total) { let s = ''; for (let i = 0; i < (total || 3); i++) s += i < n ? '★' : '☆'; return s; }

  function makeDemo() {
    demo = S.createGame({
      start: { feet: [[0, 0], [70, 0]], fluid: [6, 6], pool: 0 },
      platforms: [{ x: -400, y: 0, w: 2000, kind: 'biscuit' }],
      goal: null,
    });
    cam.x = 40; cam.y = -100; cam.scale = view.W / 300 * Math.min(1, view.H / 820);
  }

  function showTitle() {
    screen = 'title';
    if (!demo) makeDemo();
    showOverlay('title', `
      <div class="logo"><span class="l1">다리야,</span><span class="l2">가지 마!</span></div>
      <p class="tag">늘어나는 두 다리로 케이크를 지켜 배달하세요</p>
      <div class="col">
        <button class="big" data-act="start">배달 시작</button>
        <button data-act="select">스테이지 선택</button>
        <button data-act="howto">조작 방법</button>
        <div class="row"><button class="small" data-act="sound"></button><button class="small" data-act="music"></button></div>
      </div>`);
    refreshToggles();
  }
  function showHowTo() {
    showOverlay('panel howto', `
      <h2>조작 방법</h2>
      <ul>
        <li><b class="m">왼다리</b> / <b class="o">오른다리</b> 버튼(또는 화면 속 다리)을 탭하면 붉은 동력액 한 칸이 그 다리로 흘러가요.</li>
        <li>바닥에 <b>디딘 발</b>은 붙어 있어요. 다리가 늘어나면 몸을 <b>발 반대쪽</b>으로 밀어요. 버튼 이름 방향이 아니에요!</li>
        <li>동력액은 함께 써요. 한쪽이 늘면 다른 다리는 줄어요. 다 빠진 다리는 접혀서 떨어져요.</li>
        <li>몸통 아래 <b>추</b>가 앞발을 넘었을 때 그 앞발을 누르면 <b>갈아타기</b>. 뒷다리는 접히고 동력액은 골반으로 돌아가요.</li>
        <li>앞발을 넘었는데도 뒷다리를 더 밀면 <b>밀며 떼기</b>: 앞발이 떨어지고 한 다리로 더 멀리 버티지만, 무게가 쏠려 쟁반이 크게 기울어요.</li>
        <li><b>공중 다리</b>를 누르면 점선을 따라 뻗어 고리 위치에 '착' 붙어요. ×숫자는 남은 탭. 고리는 몸의 기울기를 따라 움직여요.</li>
        <li>추가 발 바깥으로 나가면 쟁반이 기울어 케이크가 미끄러져요. 장식(★)을 지켜 배달하세요.</li>
      </ul>
      <p class="keys">키보드: A / ← 왼다리 · D / → 오른다리 · R 다시 · Esc 일시정지<br>화면을 끌면 앞쪽을 미리 볼 수 있어요.</p>
      <div class="row"><button data-act="${screen === 'pause' ? 'resume' : 'title'}">${screen === 'pause' ? '돌아가기' : '확인'}</button></div>`);
  }
  function showSelect() {
    screen = 'select';
    if (!demo) makeDemo();
    const cards = LEVELS.map((lv, i) => {
      const locked = i >= save.unlocked;
      const st = save.stars[lv.id] || 0;
      return `<button class="card ${locked ? 'locked' : ''}" ${locked ? 'disabled' : `data-act="level" data-arg="${i}"`}>
        <span class="num">${lv.id}</span><span class="nm">${lv.name}</span>
        <span class="st">${locked ? '🔒' : (save.stars[lv.id] != null ? starStr(st) : '새 배달')}</span></button>`;
    }).join('');
    showOverlay('panel select', `<h2>스테이지 선택</h2><div class="grid">${cards}</div><div class="row"><button data-act="title">처음으로</button></div>`);
  }
  function showPause() {
    if (screen !== 'play') return;
    screen = 'pause';
    SND.setDanger(0, 0);
    showOverlay('panel pause', `<h2>잠깐 멈춤</h2>
      <div class="col"><button class="big" data-act="resume">계속하기</button>
      ${game.checkpoint ? '<button data-act="retry">중간 저장에서 다시</button>' : ''}
      <button data-act="restart">처음부터 다시</button>
      <button data-act="howto">조작 방법</button>
      <button data-act="select">스테이지 선택</button>
      <div class="row"><button class="small" data-act="sound"></button><button class="small" data-act="music"></button></div></div>`);
    refreshToggles();
  }
  function resume() { if (screen === 'pause' || overlay.classList.contains('howto')) { screen = 'play'; hideOverlay(); last = 0; } }

  function failText(cause) {
    const legName = (i) => (i === 0 ? '<b class="m">왼다리</b>' : '<b class="o">오른다리</b>');
    const dirW = cause.dir > 0 ? '앞으로' : '뒤로';
    if (cause.hazard) return { t: '천장 크림에 쿵!', d: '케이크가 매달린 휘핑크림에 부딪혔어요. 크림 아래에서는 다리를 짧게 유지해 몸을 낮춰 지나가세요. 두 발을 넓게 벌릴수록 몸이 낮아져요.' };
    if (cause.support === 1) return { t: '한 발로 너무 멀리 버텼어요', d: `${legName(cause.supportLeg)} 하나로 서 있는데 몸(추)이 발보다 <b>${Math.abs(cause.offset)}</b>만큼 ${dirW} 나가 쟁반이 <b>${cause.tiltDeg}°</b> 기울었어요. 덜 밀고 갈아타거나, 공중 다리를 먼저 디뎌 케이크를 받쳐 주세요.` };
    if (cause.support === 2) return { t: '몸이 두 발 밖으로 쏠렸어요', d: `두 발 바깥으로 몸(추)이 <b>${Math.abs(cause.offset)}</b>만큼 나가 쟁반이 <b>${cause.tiltDeg}°</b> 기울었어요. 추가 앞발을 살짝 넘었을 때 앞발로 갈아타면 덜 기울어요.` };
    return { t: '케이크가 떨어졌어요', d: '쟁반이 오래 기울어 케이크가 미끄러졌어요.' };
  }
  function showFail() {
    screen = 'result';
    const f = failText(game.failCause || {});
    showOverlay('panel result fail', `<h2>${f.t}</h2><p class="why">${f.d}</p>
      <div class="col">${game.checkpoint ? '<button class="big" data-act="retry">중간 저장에서 다시</button><button data-act="restart">처음부터</button>' : '<button class="big" data-act="restart">다시 하기</button>'}
      <button data-act="select">스테이지 선택</button></div>`);
  }
  function showWin() {
    screen = 'result';
    const r = game.result || { decos: 0, taps: 0 };
    SND.sfx.stars(r.decos);
    const msg = ['케이크는 무사해요… 장식은 다음에!', '장식 하나를 지켰어요!', '거의 완벽한 배달!', '완벽한 배달이에요!'][r.decos];
    const last = levelIdx + 1 >= LEVELS.length;
    showOverlay('panel result win', `<h2>배달 완료!</h2><div class="stars">${starStr(r.decos)}</div><p class="why">${msg}<br><span class="sub">탭 ${r.taps}번</span></p>
      <div class="col">${last ? '<button class="big" data-act="select">모든 배달 완료! 🎂</button>' : '<button class="big" data-act="next">다음 배달</button>'}
      <button data-act="restart">다시 하기</button><button data-act="select">스테이지 선택</button></div>`);
  }

  // ------------------------------------------------------------------ boot
  resize();
  SND.setOn(save.sound); SND.setMusic(save.music);
  document.fonts && document.fonts.load && document.fonts.load('16px Jua').catch(() => {});
  const q = new URLSearchParams(location.search);
  if (q.has('level')) startLevel(Math.max(0, Math.min(LEVELS.length - 1, parseInt(q.get('level'), 10) - 1)));
  else showTitle();
  requestAnimationFrame(frame);

  // debug hooks for automated tests
  window.__dariya = { get game() { return game; }, tap: doTap, startLevel, get screen() { return screen; }, view, cam };
})();
