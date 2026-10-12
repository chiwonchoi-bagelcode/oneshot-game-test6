/* 다리야, 가지 마! — canvas renderer (world + character + effects) */
(function (root) {
  'use strict';
  const S = root.LegSim;
  const CFG = S.CFG;

  const COL = {
    leg: ['#2fbf9b', '#ff8a3d'],
    legDark: ['#18806a', '#c45a17'],
    legSoft: ['#bff0e2', '#ffd9bd'],
    fluid: '#e3203d', fluidHi: '#ff7a8c', fluidDark: '#9e0f26',
    ink: '#4a2f27', inkSoft: 'rgba(74,47,39,0.55)',
    cream: '#fffaf0',
  };
  const FONT = '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

  // deterministic hash noise for decorative details
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ------------------------------------------------------------ background
  function drawBackground(ctx, v, cam, t) {
    const W = v.W, H = v.sceneH;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffe7cf');
    g.addColorStop(0.55, '#ffdcc8');
    g.addColorStop(1, '#f7c7b9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // wallpaper stripes (parallax 0.12)
    const sx = -cam.x * cam.scale * 0.12;
    ctx.save();
    ctx.globalAlpha = 0.35;
    const sw = 34;
    let x0 = ((sx % (sw * 2)) + sw * 2) % (sw * 2) - sw * 2;
    ctx.fillStyle = '#fff3e6';
    for (let x = x0; x < W + sw; x += sw * 2) ctx.fillRect(x, 0, sw, H);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffd1c1';
    for (let x = x0 + sw; x < W + sw; x += sw * 2) {
      for (let y = 14; y < H; y += 44) {
        ctx.beginPath(); ctx.arc(x + sw / 2, y + ((Math.floor(x / sw) & 1) ? 22 : 0), 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // windows (parallax 0.2)
    const wx = -cam.x * cam.scale * 0.2;
    const wy = H * 0.18 - (cam.y + 120) * cam.scale * 0.1;
    for (let i = -1; i < 4; i++) {
      const px = ((wx + i * 520) % 1560 + 1560) % 1560 - 260;
      drawWindow(ctx, px, wy, 150, 120, t);
    }
    // shelf with jars (parallax 0.35)
    const shx = -cam.x * cam.scale * 0.35;
    const shy = H * 0.5 - (cam.y + 120) * cam.scale * 0.25;
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = -1; i < 6; i++) {
      const px = ((shx + i * 300) % 1800 + 1800) % 1800 - 300;
      ctx.fillStyle = '#e9a98f';
      rr(ctx, px, shy, 210, 9, 4); ctx.fill();
      for (let j = 0; j < 4; j++) {
        const jx = px + 18 + j * 48, h = 30 + hash(i * 7 + j) * 26;
        const hue = ['#f4b6a6', '#f9cf9d', '#c9e3d6', '#f2b8c6'][(i + j + 8) % 4];
        ctx.fillStyle = hue;
        rr(ctx, jx, shy - h, 32, h, 7); ctx.fill();
        ctx.fillStyle = '#e39a83';
        rr(ctx, jx - 2, shy - h - 6, 36, 8, 3); ctx.fill();
      }
    }
    ctx.restore();

    // bunting along the top (screen space)
    ctx.save();
    const cols = ['#ff9eb0', '#ffd27a', '#8fdcc4', '#ffb27a'];
    ctx.strokeStyle = 'rgba(120,70,60,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const bOff = (-cam.x * cam.scale * 0.5) % 36;
    for (let x = -40; x < W + 40; x += 6) ctx.lineTo(x, v.hudH + 6 + Math.sin((x - bOff) / 90) * 5);
    ctx.stroke();
    for (let k = -2, x = bOff - 36; x < W + 36; x += 36, k++) {
      const y = v.hudH + 6 + Math.sin((x - bOff) / 90) * 5;
      ctx.fillStyle = cols[((k % 4) + 4 + Math.floor(-cam.x * cam.scale * 0.5 / 36) * 0) % 4];
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.lineTo(x, y + 16); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawWindow(ctx, x, y, w, h, t) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#f6b8a2';
    rr(ctx, x - 8, y - 8, w + 16, h + 16, 14); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#bfe6ff'); g.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = g;
    rr(ctx, x, y, w, h, 10); ctx.fill();
    ctx.save();
    rr(ctx, x, y, w, h, 10); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const cx = x + ((t * 6) % (w + 80)) - 40;
    cloud(ctx, cx, y + h * 0.35, 1);
    cloud(ctx, cx - 90, y + h * 0.7, 0.7);
    ctx.restore();
    ctx.strokeStyle = '#f6b8a2'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    // curtain swags
    ctx.fillStyle = '#ff9eb0';
    ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.quadraticCurveTo(x + 20, y + 40, x - 10, y + h * 0.75); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + w + 10, y - 10); ctx.quadraticCurveTo(x + w - 20, y + 40, x + w + 10, y + h * 0.75); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 14 * s, y - 6 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(x + 30 * s, y, 11 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------ milk sea (below the stage)
  function drawMilk(ctx, cam, v, t, front) {
    const y0 = 210;
    const x0 = cam.x - v.W / cam.scale, x1 = cam.x + v.W / cam.scale;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 400);
    for (let x = x0; x <= x1 + 20; x += 16) ctx.lineTo(x, y0 + Math.sin(x / 40 + t * 1.6) * 4 + Math.sin(x / 17 - t * 2.3) * 2 + (front ? 6 : 0));
    ctx.lineTo(x1 + 20, y0 + 400);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - 6, 0, y0 + 180);
    if (front) { g.addColorStop(0, 'rgba(255,248,236,0.92)'); g.addColorStop(1, 'rgba(244,214,190,0.98)'); }
    else { g.addColorStop(0, '#fff3e3'); g.addColorStop(1, '#efcdb0'); }
    ctx.fillStyle = g;
    ctx.fill();
    if (front) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = x0; x <= x1 + 20; x += 16) ctx.lineTo(x, y0 + 6 + Math.sin(x / 40 + t * 1.6) * 4 + Math.sin(x / 17 - t * 2.3) * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ platforms
  const KIND = {
    biscuit: { top: '#f3c272', body: '#e3a14f', dark: '#b8752f', edge: '#8f5523' },
    choco: { top: '#8a5236', body: '#6b3a25', dark: '#4e2717', edge: '#2f160c' },
    wafer: { top: '#f7dba0', body: '#ecc47c', dark: '#cf9d52', edge: '#a7773a' },
    sponge: { top: '#fff7ec', body: '#ffd987', dark: '#e9b55b', edge: '#b9853d' },
    macaron: { top: '#ffc2d4', body: '#ffb0c6', dark: '#ec8aa6', edge: '#b9587a' },
    table: { top: '#ffffff', body: '#e85a6b', dark: '#c23d50', edge: '#7a2633' },
  };

  function drawPlatform(ctx, p, idx, cam, v) {
    const k = KIND[p.kind] || KIND.biscuit;
    const vis = Math.min(p.h, 280);
    const x = p.x, y = p.y, w = p.w;
    // drop shadow
    ctx.save();
    ctx.fillStyle = 'rgba(120,60,50,0.12)';
    rr(ctx, x + 6, y + 8, w, vis, 12); ctx.fill();
    ctx.restore();
    if (p.kind === 'macaron') return drawMacaronPillar(ctx, p, k, vis);
    if (p.kind === 'table') return drawTable(ctx, p, k, vis);
    // body
    const g = ctx.createLinearGradient(0, y, 0, y + vis);
    g.addColorStop(0, k.body); g.addColorStop(0.7, k.dark); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    rr(ctx, x, y, w, vis, 10); ctx.fill();
    ctx.save();
    rr(ctx, x, y, w, vis, 10); ctx.clip();
    if (p.kind === 'biscuit') {
      ctx.fillStyle = 'rgba(140,80,30,0.45)';
      for (let i = 0; i < Math.floor(w / 22); i++) for (let j = 0; j < 4; j++) {
        const hx = x + 14 + i * 22 + (j & 1) * 11, hy = y + 20 + j * 22;
        if (hx < x + w - 8) { ctx.beginPath(); ctx.arc(hx, hy, 2.3, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = 'rgba(255,230,170,0.35)'; ctx.lineWidth = 3;
      rr(ctx, x + 6, y + 8, w - 12, vis, 8); ctx.stroke();
    } else if (p.kind === 'choco') {
      ctx.strokeStyle = 'rgba(30,10,4,0.45)'; ctx.lineWidth = 2;
      for (let cx = x + 36; cx < x + w - 6; cx += 36) { ctx.beginPath(); ctx.moveTo(cx, y + 6); ctx.lineTo(cx, y + vis); ctx.stroke(); }
      for (let cy = y + 34; cy < y + vis; cy += 30) { ctx.beginPath(); ctx.moveTo(x, cy); ctx.lineTo(x + w, cy); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,200,160,0.25)';
      for (let cx = x + 2; cx < x + w; cx += 36) { ctx.beginPath(); ctx.moveTo(cx + 2, y + 8); ctx.lineTo(cx + 2, y + vis); ctx.stroke(); }
    } else if (p.kind === 'wafer') {
      ctx.strokeStyle = 'rgba(160,110,50,0.4)'; ctx.lineWidth = 1.5;
      for (let d = -vis; d < w + vis; d += 12) {
        ctx.beginPath(); ctx.moveTo(x + d, y); ctx.lineTo(x + d + vis, y + vis); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + d + vis, y); ctx.lineTo(x + d, y + vis); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,248,230,0.85)';
      for (let cy = y + 26; cy < y + vis; cy += 30) ctx.fillRect(x, cy, w, 6);
    } else if (p.kind === 'sponge') {
      ctx.fillStyle = 'rgba(220,150,60,0.35)';
      for (let i = 0; i < w * vis / 140; i++) {
        const hx = x + hash(idx * 31 + i) * w, hy = y + 10 + hash(idx * 17 + i * 3) * (vis - 10);
        ctx.beginPath(); ctx.arc(hx, hy, 1 + hash(i) * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#fffaf1'; ctx.fillRect(x, y + 30, w, 7);
      ctx.fillStyle = '#e8455a'; ctx.fillRect(x, y + 37, w, 4);
      ctx.fillStyle = '#fffaf1'; ctx.fillRect(x, y + 76, w, 6);
    }
    ctx.restore();
    // top surface
    ctx.fillStyle = k.top;
    rr(ctx, x - 1, y - 2, w + 2, 12, 6); ctx.fill();
    if (p.kind === 'sponge') {
      // cream frosting with drips
      ctx.fillStyle = '#fffaf1';
      ctx.beginPath();
      ctx.moveTo(x - 1, y - 3);
      ctx.lineTo(x + w + 1, y - 3);
      ctx.lineTo(x + w + 1, y + 8);
      for (let dx = w; dx > 0; dx -= 14) {
        const dd = 8 + hash(idx * 9 + dx) * 10;
        ctx.quadraticCurveTo(x + dx - 3, y + 8 + dd, x + dx - 7, y + 8 + dd * 0.5);
        ctx.quadraticCurveTo(x + dx - 10, y + 6, x + dx - 14, y + 8);
      }
      ctx.lineTo(x - 1, y + 8);
      ctx.closePath(); ctx.fill();
      // sprinkles
      for (let i = 0; i < w / 10; i++) {
        ctx.fillStyle = ['#ff7aa2', '#7ad8ff', '#ffd25e', '#8fe388'][i % 4];
        const sxp = x + 5 + hash(idx * 5 + i) * (w - 10);
        ctx.save(); ctx.translate(sxp, y + 1 + hash(i * 7 + idx) * 3); ctx.rotate(hash(i * 13) * 3);
        ctx.fillRect(-2.5, -0.9, 5, 1.8); ctx.restore();
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      rr(ctx, x + 4, y - 1, w - 8, 3, 2); ctx.fill();
    }
    ctx.strokeStyle = k.edge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 4, y - 2); ctx.lineTo(x + w - 4, y - 2); ctx.stroke();
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x, y + vis * 0.7); ctx.moveTo(x + w, y + 4); ctx.lineTo(x + w, y + vis * 0.7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawMacaronPillar(ctx, p, k, vis) {
    const x = p.x, y = p.y, w = p.w;
    // breadstick pole
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#d79c5b'); g.addColorStop(0.5, '#f0c27e'); g.addColorStop(1, '#c48444');
    ctx.fillStyle = g;
    rr(ctx, x + w * 0.3, y + 10, w * 0.4, vis, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let yy = y + 26; yy < y + vis; yy += 16) { ctx.beginPath(); ctx.ellipse(x + w * 0.45, yy, 2, 1.2, 0.4, 0, Math.PI * 2); ctx.fill(); }
    // macaron on top
    const cx = x + w / 2;
    const shell = (yy, h) => {
      const gg = ctx.createLinearGradient(0, yy, 0, yy + h);
      gg.addColorStop(0, '#ffd4e1'); gg.addColorStop(1, k.dark);
      ctx.fillStyle = gg;
      rr(ctx, x - 4, yy, w + 8, h, h / 2); ctx.fill();
      ctx.strokeStyle = k.edge; ctx.lineWidth = 1.5; ctx.stroke();
    };
    shell(y + 9, 12);
    ctx.fillStyle = '#fff6f0';
    rr(ctx, x - 1, y + 6, w + 2, 6, 3); ctx.fill();
    // frilly feet
    ctx.fillStyle = k.dark;
    for (let fx = x - 2; fx < x + w + 2; fx += 4) { ctx.beginPath(); ctx.arc(fx, y + 6, 1.6, 0, Math.PI * 2); ctx.fill(); }
    shell(y - 3, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    rr(ctx, cx - w * 0.3, y - 1, w * 0.5, 2.5, 1.2); ctx.fill();
  }

  function drawTable(ctx, p, k, vis) {
    const x = p.x, y = p.y, w = p.w;
    // legs
    ctx.fillStyle = '#b77a4a';
    rr(ctx, x + 18, y + 20, 14, vis, 5); ctx.fill();
    rr(ctx, x + w - 32, y + 20, 14, vis, 5); ctx.fill();
    // checkered cloth
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 2); ctx.lineTo(x + w + 6, y - 2); ctx.lineTo(x + w + 10, y + 34);
    for (let dx = w + 10; dx > -10; dx -= 20) ctx.quadraticCurveTo(x + dx - 5, y + 42, x + dx - 10, y + 34);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = 'rgba(232,80,100,0.85)';
    for (let i = 0; i * 12 < w + 24; i++) for (let j = 0; j < 4; j++) if ((i + j) & 1) ctx.fillRect(x - 6 + i * 12, y - 2 + j * 12, 12, 12);
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,40,50,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 6, y - 2); ctx.lineTo(x + w + 6, y - 2); ctx.stroke();
  }

  // ------------------------------------------------------------ hazards (hanging whipped cream)
  function drawHazard(ctx, h, idx, t) {
    const x = h.x, w = h.w, top = h.y, b = h.y + h.h;
    const cx = x + w / 2;
    ctx.save();
    // rolling-pin rail it hangs from
    ctx.fillStyle = '#d9a774';
    rr(ctx, x - 16, top - 12, w + 32, 24, 12); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    rr(ctx, x - 10, top - 8, w + 20, 5, 3); ctx.fill();
    // stacked piped cream tiers, bulging and slightly swaying
    const tierH = 34;
    const n = Math.max(2, Math.ceil((h.h - 30) / tierH));
    for (let i = 0; i < n; i++) {
      const cy = top + 14 + i * ((h.h - 34) / n) + tierH * 0.5;
      const sway = Math.sin(t * 1.2 + idx + i * 0.6) * 1.5;
      const ww = w * (0.94 - 0.05 * Math.sin(i * 1.7 + idx));
      const g = ctx.createLinearGradient(cx - ww / 2, 0, cx + ww / 2, 0);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fff6ee'); g.addColorStop(1, '#f1d9cf');
      ctx.fillStyle = g;
      ctx.strokeStyle = 'rgba(176,120,104,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx + sway, cy, ww / 2, tierH * 0.72, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // swirl ridges
      ctx.strokeStyle = 'rgba(214,170,150,0.75)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(cx + sway + ww * 0.08, cy + 2, ww * 0.32, tierH * 0.36, -0.2, 0.2, Math.PI * 1.3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.ellipse(cx + sway - ww * 0.22, cy - tierH * 0.25, ww * 0.12, tierH * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
    }
    // drips at the tip
    const tipY = b - 16;
    for (let i = 0; i < 3; i++) {
      const dx = cx + (i - 1) * w * 0.26;
      const len = 10 + hash(idx * 7 + i) * 9 + Math.sin(t * 1.5 + i * 2) * 2;
      ctx.fillStyle = '#fffaf4'; ctx.strokeStyle = 'rgba(176,120,104,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx - 7, tipY - 4); ctx.quadraticCurveTo(dx - 6, tipY + len, dx, tipY + len + 4); ctx.quadraticCurveTo(dx + 6, tipY + len, dx + 7, tipY - 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // clearance line: the cake must stay below this
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = 'rgba(232,80,100,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 6, b + 2); ctx.lineTo(x + w + 6, b + 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ------------------------------------------------------------ checkpoints & goal
  function drawDoily(ctx, cp, y, active, t) {
    const x = cp.x0, w = cp.x1 - cp.x0;
    ctx.save();
    ctx.fillStyle = active ? 'rgba(255,236,170,0.95)' : 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y - 1);
    for (let dx = 0; dx <= w; dx += 8) ctx.arc(x + dx, y - 1, 4, Math.PI, 0);
    ctx.lineTo(x + w, y + 2); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
    // flag
    const fx = x + w - 10;
    ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fx, y - 2); ctx.lineTo(fx, y - 40); ctx.stroke();
    ctx.fillStyle = active ? '#ffcc33' : '#e9e1d6';
    ctx.beginPath(); ctx.moveTo(fx, y - 40); ctx.lineTo(fx + 18 + Math.sin(t * 4) * 2, y - 34); ctx.lineTo(fx, y - 28); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCustomer(ctx, lv, t, mood) {
    const gl = lv.goal;
    const x = gl.x1 + 28, y = gl.y;
    const kind = lv.customer || 'bear';
    const hop = mood === 'happy' ? Math.abs(Math.sin(t * 9)) * 8 : Math.abs(Math.sin(t * 2)) * 1.5;
    ctx.save();
    ctx.translate(x, y - hop);
    const furs = { bear: ['#b98457', '#8d5c37'], rabbit: ['#f4efe9', '#d9cfc5'], cat: ['#f2b45a', '#c9822f'], dog: ['#e8d1b0', '#b3906a'], owl: ['#a98ac9', '#7d5fa3'], party: ['#ff9eb0', '#e0708a'] };
    const [fur, furD] = furs[kind] || furs.bear;
    // body
    ctx.fillStyle = fur;
    rr(ctx, -16, -40, 32, 40, 14); ctx.fill();
    ctx.fillStyle = '#fff';
    rr(ctx, -11, -32, 22, 30, 9); ctx.fill(); // apron
    ctx.fillStyle = '#ff8fa3';
    ctx.beginPath(); ctx.arc(0, -22, 3, 0, Math.PI * 2); ctx.fill();
    // arms
    ctx.strokeStyle = fur; ctx.lineWidth = 7; ctx.lineCap = 'round';
    const wave = mood === 'happy' ? Math.sin(t * 12) * 0.6 : (mood === 'near' ? Math.sin(t * 6) * 0.4 : 0);
    ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(-24, -44 - wave * 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, -30); ctx.lineTo(22, -18); ctx.stroke();
    // head
    ctx.fillStyle = fur;
    if (kind === 'rabbit') { rr(ctx, -12, -84, 8, 26, 4); ctx.fill(); rr(ctx, 3, -86, 8, 28, 4); ctx.fill(); }
    else if (kind === 'cat') { ctx.beginPath(); ctx.moveTo(-15, -60); ctx.lineTo(-11, -76); ctx.lineTo(-3, -64); ctx.fill(); ctx.beginPath(); ctx.moveTo(15, -60); ctx.lineTo(11, -76); ctx.lineTo(3, -64); ctx.fill(); }
    else if (kind === 'owl') { ctx.beginPath(); ctx.moveTo(-15, -62); ctx.lineTo(-14, -74); ctx.lineTo(-6, -66); ctx.fill(); ctx.beginPath(); ctx.moveTo(15, -62); ctx.lineTo(14, -74); ctx.lineTo(6, -66); ctx.fill(); }
    else if (kind === 'dog') { ctx.fillStyle = furD; ctx.beginPath(); ctx.ellipse(-15, -54, 5, 11, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(15, -54, 5, 11, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = fur; }
    else { ctx.beginPath(); ctx.arc(-12, -66, 6, 0, Math.PI * 2); ctx.arc(12, -66, 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, -54, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-3, -48, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
    // eyes: look toward the player (left)
    ctx.fillStyle = COL.ink;
    if (mood === 'happy') {
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-8, -56, 3, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.arc(4, -56, 3, Math.PI, 0); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-9, -56, 2.6, 0, Math.PI * 2); ctx.arc(3, -56, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = COL.ink;
    ctx.beginPath(); ctx.ellipse(-3, -49, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,140,0.5)';
    ctx.beginPath(); ctx.arc(-13, -49, 3, 0, Math.PI * 2); ctx.arc(8, -49, 3, 0, Math.PI * 2); ctx.fill();
    if (kind === 'party') {
      ctx.fillStyle = '#7ad8ff';
      ctx.beginPath(); ctx.moveTo(-8, -68); ctx.lineTo(8, -68); ctx.lineTo(0, -92); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd25e'; ctx.beginPath(); ctx.arc(0, -93, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // sign
    ctx.save();
    ctx.translate(gl.x1 + 70, y);
    ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -58); ctx.stroke();
    ctx.fillStyle = '#fff6e0';
    rr(ctx, -26, -86, 52, 30, 8); ctx.fill();
    ctx.strokeStyle = '#e8455a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8455a'; ctx.font = '14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('배달!', 0, -70);
    ctx.restore();
    // goal mat
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,214,90,0.55)';
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(214,140,30,0.9)'; ctx.lineWidth = 2;
    rr(ctx, gl.x0, gl.y - 6, gl.x1 - gl.x0, 8, 4); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ------------------------------------------------------------ the toy
  function legCurve(c, L, hip) {
    let foot;
    if (L.planted) foot = { x: L.foot.x, y: L.foot.y - 5 };
    else foot = S.freeFoot(c, L);
    const dx = foot.x - hip.x, dy = foot.y - hip.y;
    const d = Math.hypot(dx, dy) || 1;
    const rest = S.restLen(L.fa);
    const nx = -dy / d, ny = dx / d;
    // bow: compressed legs bulge, free legs sag a little
    let bow = 0;
    if (L.planted) bow = Math.max(-6, Math.min(14, (rest - d) * 0.6));
    else bow = 4 + Math.sin(L.liftT * 7) * 3 * Math.exp(-L.liftT * 2);
    const side = L.side === 0 ? -1 : 1;
    const cx = hip.x + dx * 0.5 + nx * bow * side, cy = hip.y + dy * 0.5 + ny * bow * side;
    return { hip, foot, cx, cy, d, rest, nx, ny };
  }

  function qpt(q, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t;
    return { x: a * q.hip.x + b * q.cx + cc * q.foot.x, y: a * q.hip.y + b * q.cy + cc * q.foot.y };
  }

  function strokeQ(ctx, q, off) {
    ctx.beginPath();
    ctx.moveTo(q.hip.x + q.nx * off, q.hip.y + q.ny * off);
    ctx.quadraticCurveTo(q.cx + q.nx * off, q.cy + q.ny * off, q.foot.x + q.nx * off, q.foot.y + q.ny * off);
    ctx.stroke();
  }

  function drawLeg(ctx, c, L, far, fx) {
    const hip = S.bodyPoint(c, L.side === 0 ? -5 : 5, 4);
    const q = legCurve(c, L, hip);
    const ratio = q.rest / Math.max(20, q.d);
    let w = 11.5 * Math.max(0.62, Math.min(1.35, Math.sqrt(ratio)));
    w *= 1 + L.squeeze * 0.25 * Math.sin(L.squeeze * 20);
    ctx.save();
    ctx.lineCap = 'round';
    if (far) ctx.globalAlpha = 0.92;
    ctx.strokeStyle = far ? '#5d3a31' : COL.ink;
    ctx.lineWidth = w + 3.5;
    strokeQ(ctx, q, 0);
    ctx.strokeStyle = far ? '#f0cfc6' : '#fde6df';
    ctx.lineWidth = w;
    strokeQ(ctx, q, 0);
    // fluid core: more fluid -> fuller tube
    const fill = Math.max(0.25, Math.min(0.72, 0.3 + L.fa * 0.05));
    ctx.strokeStyle = far ? '#c41a35' : COL.fluid;
    ctx.lineWidth = w * fill;
    strokeQ(ctx, q, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1.5, w * 0.18);
    strokeQ(ctx, q, -w * 0.25);
    // bands spread apart when stretched
    const nb = Math.max(2, Math.round(q.rest / 15));
    ctx.fillStyle = far ? COL.legDark[L.side] : COL.leg[L.side];
    ctx.strokeStyle = far ? '#3d2620' : COL.ink;
    ctx.lineWidth = 1.2;
    for (let i = 1; i < nb; i++) {
      const tt = i / nb;
      const p = qpt(q, tt), p2 = qpt(q, Math.min(1, tt + 0.01));
      const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      rr(ctx, -1.6, -w * 0.62, 3.2, w * 1.24, 1.5); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    // fluid pulses travelling through this leg
    for (const pu of c.pulses) {
      let tt = -1;
      if (pu.to === L.side) tt = (pu.t - 0.45) / 0.55; // from pelvis down to the shoe
      else if (pu.from === L.side) tt = 1 - pu.t / 0.45; // from shoe up into the pelvis
      if (tt < 0 || tt > 1) continue;
      const p = qpt(q, tt);
      const r = w * (0.62 + (pu.n ? 0.25 : 0));
      ctx.fillStyle = far ? '#c41a35' : COL.fluid;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.15, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.3, 0, Math.PI * 2); ctx.fill();
    }
    // force arrows: a fed, planted leg pushes from the shoe toward the pelvis
    if (L.planted && L.pushT > 0) {
      const a = Math.min(1, L.pushT / 0.2);
      for (let j = 0; j < 2; j++) {
        const tt = 0.72 - j * 0.22 - (0.35 - L.pushT) * 0.6;
        if (tt < 0.1 || tt > 0.9) continue;
        const p = qpt(q, tt), p2 = qpt(q, tt - 0.02);
        const ang = Math.atan2(p2.y - p.y, p2.x - p.x);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y); ctx.rotate(ang);
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 6.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(4, 0); ctx.lineTo(-5, 9); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-5, -9); ctx.lineTo(4, 0); ctx.lineTo(-5, 9); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    drawShoe(ctx, c, L, q, far, fx);
    return q;
  }

  function drawShoe(ctx, c, L, q, far, fx) {
    let ang, sx = 1, sy = 1;
    let px, py;
    if (L.planted) {
      px = L.foot.x; py = L.foot.y;
      ang = 0;
      const k = Math.max(0, 1 - L.plantT / 0.35);
      sy = 1 - 0.28 * k * Math.cos(L.plantT * 30) * (L.plantT < 0.35 ? 1 : 0);
      sx = 1 + 0.18 * k;
      // heel peel when this shoe is pulled or about to fold
      const peel = Math.max(0, Math.min(1, (L.stretch - 0.12) / 0.2)) + (L.f === 0 ? 0.4 : 0);
      ang = -peel * 0.18;
    } else {
      const f = S.freeFoot(c, L);
      px = f.x; py = f.y + 4;
      ang = -L.dirA * 0.7 + Math.sin(c.time * 9 + L.side) * 0.08 * L.wiggle + Math.sin(c.time * 23) * 0.12 * L.wiggle;
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.scale(sx, sy);
    if (far) ctx.globalAlpha = 0.95;
    // contact shadow + suction ring
    if (L.planted) {
      ctx.fillStyle = 'rgba(80,40,30,0.25)';
      ctx.beginPath(); ctx.ellipse(2, 1, 17, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    // sole
    ctx.fillStyle = '#4a2c22';
    rr(ctx, -12, -3.5, 30, 4.5, 2); ctx.fill();
    // upper
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(16, -2);
    ctx.quadraticCurveTo(19, -3, 18, -6);
    ctx.quadraticCurveTo(16, -11, 6, -12);
    ctx.lineTo(1, -14);
    ctx.lineTo(-7, -15);
    ctx.quadraticCurveTo(-13, -14, -12, -2);
    ctx.closePath();
    ctx.fillStyle = '#fffaf2';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = far ? COL.legDark[L.side] : COL.leg[L.side];
    ctx.beginPath(); ctx.moveTo(-5, -16); ctx.lineTo(9, -16); ctx.quadraticCurveTo(11, -8, 8, -1); ctx.lineTo(-6, -1); ctx.quadraticCurveTo(-8, -8, -5, -16); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6; ctx.stroke();
    // laces
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-1, -12); ctx.lineTo(4, -10); ctx.moveTo(0, -9.5); ctx.lineTo(5, -7.5); ctx.stroke();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(13, -7, 2.4, 1.2, -0.5, 0, Math.PI * 2); ctx.fill();
    // sock cuff
    ctx.fillStyle = COL.legSoft[L.side];
    rr(ctx, -8, -19, 11, 6, 2.5); ctx.fill();
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
    if (L.planted && fx && fx.showGrip) {
      // grip marks in leg colour: readable "this shoe is holding"
      ctx.save();
      ctx.strokeStyle = COL.leg[L.side];
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(px - 14, py + 4); ctx.lineTo(px + 18, py + 4); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function drawPelvis(ctx, c, t) {
    const P = c.P;
    const r = 13.5;
    ctx.save();
    ctx.translate(P.x, P.y);
    ctx.rotate(c.theta);
    const pump = c.pulses.length ? 1 + 0.12 * Math.sin(t * 40) : 1;
    ctx.scale(pump, 1 / pump);
    ctx.fillStyle = '#3b4a7a';
    rr(ctx, -16, -16, 32, 10, 4); ctx.fill(); // belt
    ctx.beginPath(); ctx.arc(0, 0, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = COL.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ffd9dd');
    ctx.fillStyle = g; ctx.fill();
    // fluid level: base + pool
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2); ctx.clip();
    const lvl = 0.25 + Math.min(0.7, c.poolA / 7 * 0.7);
    const sy = r - lvl * 2 * r;
    ctx.fillStyle = COL.fluid;
    ctx.beginPath();
    ctx.moveTo(-r, r);
    for (let x = -r; x <= r; x += 3) ctx.lineTo(x, sy + Math.sin(x * 0.4 + t * 8) * 1.4 - c.omega * x * 0.05);
    ctx.lineTo(r, r); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.ellipse(-5, -6, 4, 2.5, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawTorso(ctx, c, t, face) {
    ctx.save();
    ctx.translate(c.P.x, c.P.y);
    ctx.rotate(c.theta);
    // arms (behind) reaching the tray
    const flail = face.flail || 0;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const wob = Math.sin(t * 14 + s) * 6 * flail;
      ctx.strokeStyle = COL.ink; ctx.lineWidth = 7.5;
      ctx.beginPath(); ctx.moveTo(s * 19, -48); ctx.quadraticCurveTo(s * 33, -54 + wob, s * 30, -64 + wob * 0.5); ctx.stroke();
      ctx.strokeStyle = '#f6efe2'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(s * 19, -48); ctx.quadraticCurveTo(s * 33, -54 + wob, s * 30, -64 + wob * 0.5); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(s * 30, -64 + wob * 0.5, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // body tin
    const bw = 44, top = -60, bot = -10;
    ctx.fillStyle = COL.ink;
    rr(ctx, -bw / 2 - 2, top - 2, bw + 4, bot - top + 4, 13); ctx.fill();
    const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    g.addColorStop(0, '#fff7e4'); g.addColorStop(0.35, '#ffeccc'); g.addColorStop(1, '#f2d3a6');
    ctx.fillStyle = g;
    rr(ctx, -bw / 2, top, bw, bot - top, 12); ctx.fill();
    // stripes + collar
    ctx.save();
    rr(ctx, -bw / 2, top, bw, bot - top, 12); ctx.clip();
    ctx.fillStyle = '#3b4a7a';
    ctx.fillRect(-bw / 2, bot - 13, bw, 13);
    ctx.fillStyle = '#e8455a';
    ctx.fillRect(-bw / 2, bot - 15, bw, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-bw / 2 + 4, top + 3, 4, bot - top - 20);
    ctx.restore();
    // bow tie
    ctx.fillStyle = '#e8455a'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(1, -28); ctx.lineTo(1, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -24); ctx.lineTo(15, -28); ctx.lineTo(15, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
    // rivets
    ctx.fillStyle = '#c9a77a';
    for (const [rx, ry] of [[-17, -55], [17, -55], [-17, -27], [17, -27]]) { ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2); ctx.fill(); }
    drawFace(ctx, c, t, face);
    ctx.restore();
  }

  function drawFace(ctx, c, t, face) {
    const mood = face.mood;
    const lookX = face.lookX || 0, lookY = face.lookY || 0;
    const eyes = [[2, -43], [15, -43]];
    const blink = (Math.sin(t * 1.3) > 0.985) || mood === 'relief';
    // cheeks
    ctx.fillStyle = 'rgba(255,120,140,' + (mood === 'panic' ? 0.25 : 0.45) + ')';
    ctx.beginPath(); ctx.ellipse(-4, -34, 4, 2.5, 0, 0, Math.PI * 2); ctx.ellipse(20, -34, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 2; i++) {
      const [ex, ey] = eyes[i];
      let er = mood === 'panic' ? 6.2 : mood === 'worry' ? 5.6 : 5;
      if (mood === 'push') er = 4.6;
      if (blink || mood === 'win') {
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.beginPath();
        if (mood === 'win' || mood === 'relief') ctx.arc(ex, ey + 1.5, 3.5, Math.PI * 1.1, Math.PI * 1.9);
        else { ctx.moveTo(ex - 4, ey); ctx.lineTo(ex + 4, ey); }
        ctx.stroke();
        continue;
      }
      if (mood === 'fail') {
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ex - 3.5, ey - 3.5); ctx.lineTo(ex + 3.5, ey + 3.5); ctx.moveTo(ex + 3.5, ey - 3.5); ctx.lineTo(ex - 3.5, ey + 3.5); ctx.stroke();
        continue;
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(ex, ey, er * 0.85, er, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const pr = mood === 'panic' ? 1.8 : 2.6;
      ctx.fillStyle = COL.ink;
      ctx.beginPath(); ctx.arc(ex + lookX * 2.2, ey + lookY * 2.4, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex + lookX * 2.2 - 0.8, ey + lookY * 2.4 - 1, 0.8, 0, Math.PI * 2); ctx.fill();
    }
    // brows
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    const bt = mood === 'worry' || mood === 'panic' ? 1 : mood === 'push' ? -1 : 0;
    ctx.beginPath();
    ctx.moveTo(-2, -51 - bt * 1.5); ctx.lineTo(5, -51 + bt * 1.5);
    ctx.moveTo(12, -51 + bt * 1.5); ctx.lineTo(19, -51 - bt * 1.5);
    ctx.stroke();
    // mouth
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (mood === 'panic' || mood === 'pop') { ctx.fillStyle = '#7a2a2a'; ctx.ellipse(9, -31, 3.2, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    else if (mood === 'worry') { ctx.moveTo(5, -30); ctx.quadraticCurveTo(9, -33, 13, -30); ctx.stroke(); }
    else if (mood === 'push') { ctx.moveTo(4, -31); ctx.lineTo(14, -31); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -31); ctx.lineTo(12, -31); ctx.stroke(); }
    else if (mood === 'relief') { ctx.fillStyle = '#7a2a2a'; ctx.ellipse(11, -31, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (mood === 'fail') { ctx.moveTo(4, -29); ctx.quadraticCurveTo(9, -34, 14, -29); ctx.stroke(); }
    else { ctx.moveTo(4, -32); ctx.quadraticCurveTo(9, -27, 14, -32); ctx.stroke(); }
    // sweat
    if (face.sweat > 0.05) {
      ctx.fillStyle = 'rgba(120,200,255,' + Math.min(1, face.sweat) + ')';
      const sy = -50 + ((t * 30) % 14);
      ctx.beginPath(); ctx.moveTo(-14, sy - 5); ctx.quadraticCurveTo(-10, sy, -14, sy + 2); ctx.quadraticCurveTo(-18, sy, -14, sy - 5); ctx.fill();
    }
  }

  function drawTrayCake(ctx, c, t, face) {
    const ck = c.cake;
    ctx.save();
    ctx.translate(c.P.x, c.P.y);
    ctx.rotate(c.theta);
    const ty = -CFG.trayOff;
    // tray
    ctx.fillStyle = COL.ink;
    rr(ctx, -CFG.trayHalf - 3, ty - 2, CFG.trayHalf * 2 + 6, 8, 4); ctx.fill();
    const g = ctx.createLinearGradient(0, ty - 2, 0, ty + 6);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#d5dbe6'); g.addColorStop(1, '#9aa4b8');
    ctx.fillStyle = g;
    rr(ctx, -CFG.trayHalf - 1.5, ty - 0.5, CFG.trayHalf * 2 + 3, 5, 3); ctx.fill();
    // rim marks show how far the cake can go
    ctx.fillStyle = '#7d879c';
    ctx.fillRect(-CFG.trayHalf - 1, ty - 5, 2.5, 6); ctx.fillRect(CFG.trayHalf - 1.5, ty - 5, 2.5, 6);
    // spirit level on the tray front
    const lvX = 0, lvY = ty + 4.5;
    ctx.fillStyle = COL.ink; rr(ctx, lvX - 13, lvY - 1, 26, 7, 3.5); ctx.fill();
    const tiltN = Math.max(-1, Math.min(1, c.theta / 0.42));
    const danger = Math.abs(c.theta) > 0.2 || !ck.stuck;
    ctx.fillStyle = danger ? (Math.abs(c.theta) > 0.33 ? '#ff6b6b' : '#ffd25e') : '#a8f0c6';
    rr(ctx, lvX - 11.5, lvY, 23, 5, 2.5); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(lvX - tiltN * 8.5, lvY + 2.5, 3.2, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(74,47,39,0.6)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(lvX - 4, lvY); ctx.lineTo(lvX - 4, lvY + 5); ctx.moveTo(lvX + 4, lvY); ctx.lineTo(lvX + 4, lvY + 5); ctx.stroke();

    // cake (skewed by jelly wobble)
    if (!ck.fallen && !ck.delivered) {
      ctx.save();
      ctx.translate(ck.s, ty - 1);
      const sk = Math.max(-0.5, Math.min(0.5, ck.wob * 0.7 + ck.v * 0.006));
      const sq = 1 - ck.squash * 0.15;
      ctx.transform(1, 0, -sk, 1, 0, 0);
      ctx.scale(1 + ck.squash * 0.08, sq);
      drawCake(ctx, c, t);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawCake(ctx, c, t) {
    const hw = CFG.cakeHalf, H = CFG.cakeH;
    // sponge body
    ctx.fillStyle = COL.ink;
    rr(ctx, -hw - 2, -H - 2, hw * 2 + 4, H + 3, 7); ctx.fill();
    ctx.fillStyle = '#ffd98a';
    rr(ctx, -hw, -H, hw * 2, H, 6); ctx.fill();
    ctx.fillStyle = '#fffaf2';
    ctx.fillRect(-hw, -H * 0.55, hw * 2, 4);
    ctx.fillStyle = '#e8455a';
    ctx.fillRect(-hw, -H * 0.55 + 4, hw * 2, 2.5);
    // pores
    ctx.fillStyle = 'rgba(214,150,60,0.5)';
    for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(-hw + 3 + hash(i) * (hw * 2 - 6), -H * 0.3 + hash(i * 3) * H * 0.25, 0.9, 0, Math.PI * 2); ctx.fill(); }
    // frosting with drips
    ctx.fillStyle = '#fffdf8';
    ctx.beginPath();
    ctx.moveTo(-hw - 1, -H - 1);
    ctx.lineTo(hw + 1, -H - 1);
    ctx.lineTo(hw + 1, -H + 6);
    for (let x = hw; x > -hw; x -= 8.66) {
      const dd = 3 + hash(x * 3.1) * 6;
      ctx.quadraticCurveTo(x - 2, -H + 6 + dd, x - 4.3, -H + 6 + dd * 0.6);
      ctx.quadraticCurveTo(x - 6.5, -H + 5, x - 8.66, -H + 6);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,140,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    // piped rosettes along the top edge
    for (let x = -hw + 3; x <= hw - 3; x += 7.5) {
      ctx.fillStyle = '#fffdf8';
      ctx.beginPath(); ctx.arc(x, -H - 1.5, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,170,150,0.7)'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.arc(x, -H - 1.5, 1.8, 0.5, 4.5); ctx.stroke();
    }
    // decorations
    for (const d of c.decos) {
      if (d.lost) continue;
      const dx = d.d, dy = -H - 4 + d.hop;
      drawDeco(ctx, d, dx, dy, t, d.seated ? d.wob * 0.15 : d.d * 0.08 + d.v * 0.01);
    }
  }

  function drawDeco(ctx, d, x, y, t, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (d.kind === 'candle') {
      ctx.fillStyle = COL.ink; rr(ctx, -3.3, -17, 6.6, 18, 2); ctx.fill();
      ctx.fillStyle = '#fff'; rr(ctx, -2.2, -16, 4.4, 16, 1.5); ctx.fill();
      ctx.fillStyle = '#7ad8ff';
      for (let i = 0; i < 4; i++) { ctx.save(); ctx.beginPath(); ctx.rect(-2.2, -16, 4.4, 16); ctx.clip(); ctx.translate(0, -14 + i * 4.5); ctx.rotate(-0.5); ctx.fillRect(-5, 0, 10, 1.6); ctx.restore(); }
      const fl = 1 + Math.sin(t * 23) * 0.12 + Math.sin(t * 37) * 0.08;
      const fg = ctx.createRadialGradient(0, -21, 0.5, 0, -21, 6 * fl);
      fg.addColorStop(0, '#fffbe0'); fg.addColorStop(0.5, '#ffcf4a'); fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.ellipse(Math.sin(t * 7) * 0.6, -21, 3.2 * fl, 5.5 * fl, 0, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === 'cherry') {
      ctx.strokeStyle = '#4c7a2a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(2, -14, 6, -16); ctx.stroke();
      ctx.fillStyle = COL.ink; ctx.beginPath(); ctx.arc(0, -3.5, 6, 0, Math.PI * 2); ctx.fill();
      const cg = ctx.createRadialGradient(-2, -6, 0.5, 0, -3.5, 5);
      cg.addColorStop(0, '#ff6b7f'); cg.addColorStop(1, '#b3122e');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, -3.5, 4.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(-1.8, -5.5, 1.2, 0, Math.PI * 2); ctx.fill();
    } else {
      // strawberry
      ctx.fillStyle = COL.ink;
      ctx.beginPath(); ctx.moveTo(-6.6, -9); ctx.quadraticCurveTo(-7, 1, 0, 2.2); ctx.quadraticCurveTo(7, 1, 6.6, -9); ctx.quadraticCurveTo(0, -12, -6.6, -9); ctx.fill();
      ctx.fillStyle = '#ef2f4b';
      ctx.beginPath(); ctx.moveTo(-5.4, -8.6); ctx.quadraticCurveTo(-5.6, 0, 0, 1); ctx.quadraticCurveTo(5.6, 0, 5.4, -8.6); ctx.quadraticCurveTo(0, -10.5, -5.4, -8.6); ctx.fill();
      ctx.fillStyle = '#ffe58a';
      for (const [sx, sy] of [[-2.5, -5], [2, -6], [0, -2], [-3, -1.5], [3, -2.5]]) { ctx.beginPath(); ctx.ellipse(sx, sy, 0.6, 0.9, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#4fae4a';
      ctx.beginPath(); ctx.moveTo(-5, -9.5); ctx.lineTo(-1.5, -11); ctx.lineTo(0, -14); ctx.lineTo(1.5, -11); ctx.lineTo(5, -9.5); ctx.lineTo(0, -8.5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawFallenDecos(ctx, c, t) {
    for (const d of c.decos) {
      if (!d.lost || d.fallT > 2.5) continue;
      drawDeco(ctx, d, d.fallX, d.fallY, t, d.fallR * 10);
    }
  }

  // ------------------------------------------------------------ support & weight readouts
  function groundBelow(level, x, y) {
    const h = S.raycast(level, x, y, 0, 1, 900);
    return h ? h.y : null;
  }

  function drawSupport(ctx, game, t) {
    const c = game.char;
    const pl = S.plantedLegs(c);
    if (!pl.length) return;
    ctx.save();
    // support span bar
    if (pl.length === 2) {
      ctx.strokeStyle = 'rgba(58,165,154,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(pl[0].foot.x, pl[0].foot.y + 6); ctx.lineTo(pl[1].foot.x, pl[1].foot.y + 6); ctx.stroke();
      ctx.setLineDash([]);
    }
    // plumb line from the pelvis
    const gy = groundBelow(game.level, c.P.x, c.P.y + 16);
    const off = c.offset || 0;
    const bad = Math.abs(off) > 14;
    const col = bad ? (Math.abs(off) > 55 ? 'rgba(232,69,90,0.9)' : 'rgba(240,150,40,0.85)') : 'rgba(58,165,154,0.7)';
    const endY = gy != null ? gy : c.P.y + 260;
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(c.P.x, c.P.y + 15); ctx.lineTo(c.P.x, endY - 9); ctx.stroke();
    ctx.setLineDash([]);
    // bob (a little brass plumb weight hanging from the pelvis)
    const by = Math.min(endY - 12, c.P.y + 15 + 34);
    ctx.fillStyle = bad ? col : '#e2b04a';
    ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(c.P.x, by + 11); ctx.quadraticCurveTo(c.P.x + 6.5, by + 3, c.P.x, by - 3); ctx.quadraticCurveTo(c.P.x - 6.5, by + 3, c.P.x, by + 11); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col;
    if (gy != null) {
      ctx.beginPath(); ctx.ellipse(c.P.x, gy - 1, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    // lean arrow when the weight hangs outside the support
    if (bad && pl.length) {
      const ref = pl.length === 1 ? pl[0].foot.x : (off > 0 ? Math.max(pl[0].foot.x, pl[1].foot.x) : Math.min(pl[0].foot.x, pl[1].foot.x));
      const ay = (gy != null ? gy : pl[0].foot.y) + 14;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ref, ay); ctx.lineTo(c.P.x, ay); ctx.stroke();
      const dir = Math.sign(c.P.x - ref) || 1;
      ctx.beginPath(); ctx.moveTo(c.P.x, ay); ctx.lineTo(c.P.x - dir * 6, ay - 4); ctx.lineTo(c.P.x - dir * 6, ay + 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ref, ay - 5); ctx.lineTo(ref, ay + 5); ctx.stroke();
    }
    // switch opportunity: the shoe the body already hangs past glows with ⇄
    if (pl.length === 2 && game.state === 'play') {
      for (let i = 0; i < 2; i++) {
        const pv = S.tapPreview(game, i);
        const L = c.legs[i];
        if (pv.kind === 'switch') {
          const pulse = 1 + Math.sin(t * 7) * 0.12;
          ctx.strokeStyle = COL.leg[i]; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(L.foot.x + 3, L.foot.y, 22 * pulse, 7 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
          bubble(ctx, L.foot.x + 3, L.foot.y + 20, '⇄', COL.leg[i]);
        } else if (pv.kind === 'release') {
          // the *other* shoe would let go if this leg pushes again
          const O = c.legs[1 - i];
          ctx.fillStyle = '#e8455a';
          ctx.font = '14px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
          ctx.fillText('!', O.foot.x + 3, O.foot.y - 26);
          ctx.globalAlpha = 1;
        }
      }
    }
    ctx.restore();
  }

  function drawPreview(ctx, game, t) {
    const c = game.char;
    for (const F of c.legs) {
      if (F.planted) continue;
      const tg = F.target;
      const foot = S.freeFoot(c, F);
      const col = COL.leg[F.side];
      const tucked = F.f <= 0;
      if (tucked && (!tg || tg.none)) { if (c.support === 1) drawTuckHint(ctx, c, F, t); continue; }
      ctx.save();
      if (tucked) ctx.globalAlpha = 0.55;
      if (!tg || tg.none) {
        // no landing spot in reach: show the searching ray fading out
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([3, 6]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(foot.x, foot.y); ctx.lineTo(foot.x + Math.sin(F.dirA) * 80, foot.y + Math.cos(F.dirA) * 80); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        bubble(ctx, foot.x + 16, foot.y + 10, '?', col);
        ctx.restore();
        continue;
      }
      const path = tg.path || [];
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash([2, 6]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(foot.x, foot.y);
      for (const p of path) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      // one pip per tap still needed
      for (let i = 1; i < path.length; i++) {
        const p = path[i];
        ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // landing ghost
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = 0.45 * ga;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(tg.x + 3, tg.y - 1, 16 * pulse, 4 * pulse, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = ga;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(tg.x + 3, tg.y - 1, 19 * pulse, 5.5 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
      // taps-needed badge
      const k = tg.k;
      bubble(ctx, tg.x + 3, tg.y - 22, k === 0 ? '착' : '×' + k, col);
      ctx.restore();
    }
  }

  function drawTuckHint(ctx, c, F, t) {
    const foot = S.freeFoot(c, F);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 4);
    ctx.strokeStyle = COL.leg[F.side]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(foot.x + 2, foot.y + 2, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function bubble(ctx, x, y, text, col) {
    ctx.save();
    ctx.font = '13px ' + FONT;
    const w = Math.max(20, ctx.measureText(text).width + 12);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    rr(ctx, x - w / 2, y - 10, w, 19, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = COL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }

  // ------------------------------------------------------------ particles & comic text
  function drawParticles(ctx, fx) {
    for (const p of fx.parts) {
      const a = Math.max(0, 1 - p.age / p.life);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.fillStyle = p.col;
      if (p.shape === 'star') {
        star(ctx, 0, 0, p.size, p.size * 0.45, 5);
        ctx.fill();
      } else if (p.shape === 'drop') {
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.35, 0, Math.PI * 2); ctx.fill();
      } else if (p.shape === 'ring') {
        ctx.strokeStyle = p.col; ctx.lineWidth = 2.5 * a;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * (1 + p.age / p.life * 1.5), p.size * 0.3 * (1 + p.age / p.life * 1.5), 0, 0, Math.PI * 2); ctx.stroke();
      } else if (p.shape === 'puff') {
        ctx.beginPath(); ctx.arc(0, 0, p.size * (1 + p.age / p.life), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      }
      ctx.restore();
    }
  }
  function star(ctx, x, y, r1, r2, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i & 1 ? r2 : r1, a = i * Math.PI / n - Math.PI / 2;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function drawTexts(ctx, fx) {
    for (const tx of fx.texts) {
      const k = tx.age / tx.life;
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const s = k < 0.12 ? 0.6 + k / 0.12 * 0.55 : 1.15 - Math.min(0.15, (k - 0.12));
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(tx.x, tx.y - k * 18);
      ctx.rotate(tx.rot || 0);
      ctx.scale(s, s);
      ctx.font = (tx.size || 18) + 'px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
      ctx.strokeText(tx.text, 0, 0);
      ctx.fillStyle = tx.col || COL.ink;
      ctx.fillText(tx.text, 0, 0);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ whole world
  function drawWorld(ctx, game, cam, v, t, fx, face) {
    const c = game.char, lv = game.level;
    drawMilk(ctx, cam, v, t, false);
    lv.platforms.forEach((p, i) => drawPlatform(ctx, p, i, cam, v));
    for (const cp of lv.checkpoints) {
      const pf = lv.platforms.find((p) => cp.x0 >= p.x - 1 && cp.x1 <= p.x + p.w + 1);
      drawDoily(ctx, cp, pf ? pf.y : 0, game.checkpoint && game.checkpoint.id === cp.id, t);
    }
    if (lv.goal) drawCustomer(ctx, lv, t, fx.customerMood);
    drawMilk(ctx, cam, v, t, true);
    lv.hazards.forEach((h, i) => drawHazard(ctx, h, i, t));
    drawSupport(ctx, game, t);
    if (game.state === 'play') drawPreview(ctx, game, t);
    // character: far (left) leg, body, near (right) leg
    drawLeg(ctx, c, c.legs[0], true, fx);
    drawTorso(ctx, c, t, face);
    drawPelvis(ctx, c, t);
    drawLeg(ctx, c, c.legs[1], false, fx);
    drawTrayCake(ctx, c, t, face);
    drawFallenDecos(ctx, c, t);
    if (fx.fallingCake) drawFallingCake(ctx, fx.fallingCake, t);
    if (fx.delivery) drawDelivery(ctx, fx.delivery, t);
    drawParticles(ctx, fx);
    drawTexts(ctx, fx);
  }

  function drawDelivery(ctx, dv, t) {
    if (dv.t < 0) return;
    const k = Math.min(1, dv.t / 0.9);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = dv.from.x + (dv.to.x - dv.from.x) * e;
    const y = dv.from.y + (dv.to.y - dv.from.y) * e - Math.sin(Math.PI * e) * 70;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dv.r * (1 - e));
    ctx.scale(0.9 + 0.1 * (1 - e), 0.9 + 0.1 * (1 - e));
    drawCake(ctx, { decos: dv.decos, cake: {} }, t);
    ctx.restore();
  }

  function drawFallingCake(ctx, fc, t) {
    ctx.save();
    ctx.translate(fc.x, fc.y);
    ctx.rotate(fc.r);
    const fake = { decos: fc.decos, cake: {} };
    drawCake(ctx, fake, t);
    ctx.restore();
  }

  root.Render = {
    COL, FONT, rr, drawBackground, drawWorld, drawDeco, drawShoe, bubble, star, hash,
  };
})(typeof window !== 'undefined' ? window : globalThis);
