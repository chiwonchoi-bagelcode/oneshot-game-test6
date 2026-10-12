/* 다리야, 가지 마! — procedural WebAudio sound (no external files) */
(function (root) {
  'use strict';

  const A = {
    ctx: null, master: null, sfx: null, music: null, verb: null,
    on: true, musicOn: true, started: false,
    slideGain: null, slideFilter: null, creakGain: null,
    musicTimer: null, step: 0, nextT: 0, tension: 0,
  };

  function init() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    A.ctx = ctx;
    A.master = ctx.createGain(); A.master.gain.value = A.on ? 0.9 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    A.master.connect(comp); comp.connect(ctx.destination);
    A.sfx = ctx.createGain(); A.sfx.gain.value = 2.6; A.sfx.connect(A.master);
    A.music = ctx.createGain(); A.music.gain.value = A.musicOn ? 0.55 : 0; A.music.connect(A.master);
    // small room reverb
    A.verb = ctx.createConvolver();
    A.verb.buffer = impulse(ctx, 1.4, 2.6);
    const vg = ctx.createGain(); vg.gain.value = 0.22;
    A.verb.connect(vg); vg.connect(A.master);
    // continuous slide / creak bed
    const nb = noiseBuffer(ctx, 2);
    const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
    A.slideFilter = ctx.createBiquadFilter(); A.slideFilter.type = 'bandpass'; A.slideFilter.frequency.value = 1400; A.slideFilter.Q.value = 1.4;
    A.slideGain = ctx.createGain(); A.slideGain.gain.value = 0;
    ns.connect(A.slideFilter); A.slideFilter.connect(A.slideGain); A.slideGain.connect(A.sfx);
    ns.start();
    const co = ctx.createOscillator(); co.type = 'sawtooth'; co.frequency.value = 92;
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 700; cf.Q.value = 9;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13;
    const lfoG = ctx.createGain(); lfoG.gain.value = 18;
    lfo.connect(lfoG); lfoG.connect(co.frequency);
    A.creakGain = ctx.createGain(); A.creakGain.gain.value = 0;
    co.connect(cf); cf.connect(A.creakGain); A.creakGain.connect(A.sfx);
    co.start(); lfo.start();
    A.started = true;
    startMusic();
  }

  function impulse(ctx, dur, decay) {
    const n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }
  function noiseBuffer(ctx, dur) {
    const n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  let NB = null;
  function noise(t, dur, f0, f1, q, gain, type, dest) {
    const ctx = A.ctx;
    if (!NB) NB = noiseBuffer(ctx, 1);
    const s = ctx.createBufferSource(); s.buffer = NB;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || A.sfx);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    return g;
  }
  function tone(t, dur, f0, f1, type, gain, opts) {
    const ctx = A.ctx;
    opts = opts || {};
    const o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (opts.glide || dur));
    const g = ctx.createGain();
    const atk = opts.atk || 0.006;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + atk); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; f.Q.value = opts.q || 0.7; o.connect(f); node = f; }
    node.connect(g); g.connect(opts.dest || A.sfx);
    if (opts.verb) g.connect(A.verb);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function now() { return A.ctx.currentTime + 0.005; }
  function ok() { return A.ctx && A.on; }

  // gibberish voice: saw through two formant filters
  const VOW = { a: [800, 1200], o: [500, 900], u: [350, 750], i: [300, 2300], e: [450, 1900] };
  function voice(syll, pitch, t0) {
    if (!ok()) return;
    const ctx = A.ctx;
    let t = t0 || now();
    for (const s of syll) {
      const [v, dur, p0, p1] = s;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(pitch * p0, t); o.frequency.exponentialRampToValueAtTime(pitch * p1, t + dur);
      const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = pitch * 0.03; vib.connect(vg); vg.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.16, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const [f1, f2] = VOW[v];
      const b1 = ctx.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = f1; b1.Q.value = 6;
      const b2 = ctx.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = f2; b2.Q.value = 8;
      const mix = ctx.createGain(); mix.gain.value = 1.6;
      o.connect(b1); o.connect(b2); b1.connect(mix); b2.connect(mix); mix.connect(g); g.connect(A.sfx); g.connect(A.verb);
      o.start(t); o.stop(t + dur + 0.05); vib.start(t); vib.stop(t + dur + 0.05);
      t += dur * 0.9;
    }
  }

  const sfx = {
    click() { if (!ok()) return; const t = now(); tone(t, 0.06, 900, 1300, 'triangle', 0.25); },
    pump(leg, planted, f) {
      if (!ok()) return; const t = now();
      const base = leg === 0 ? 150 : 185;
      tone(t, 0.16, base * 1.4, base * 0.7, 'sine', 0.38, { glide: 0.12 });
      noise(t, 0.12, 900, 300, 3, 0.12);
      // bubbles through the hose
      for (let i = 0; i < 3; i++) tone(t + 0.05 + i * 0.04, 0.05, 500 + Math.random() * 500, 900 + Math.random() * 600, 'sine', 0.06);
      // rubbery stretch: pitch follows the resulting length
      const p = 320 + (f || 5) * 45;
      const o = tone(t + 0.06, 0.22, p * 0.8, p * 1.25, 'sawtooth', planted ? 0.06 : 0.045, { lp: 1400, q: 6, glide: 0.18 });
    },
    shrink(leg) { if (!ok()) return; const t = now() + 0.02; tone(t, 0.16, 520, 300, 'sawtooth', 0.07, { lp: 1000, q: 5 }); },
    full(planted) {
      if (!ok()) return; const t = now();
      tone(t, 0.22, 210, 180, 'sawtooth', 0.08, { lp: 900, q: 8 });
      tone(t + 0.02, 0.18, 260, 240, 'square', 0.03, { lp: 700 });
      if (!planted) for (let i = 0; i < 4; i++) tone(t + i * 0.05, 0.04, 1400 + i * 120, 1700 + i * 100, 'sine', 0.05);
    },
    plant(speed) {
      if (!ok()) return; const t = now();
      const g = Math.min(0.5, 0.22 + speed / 600);
      noise(t, 0.08, 3000, 400, 0.8, g, 'lowpass');
      tone(t, 0.14, 170, 60, 'sine', 0.5, { glide: 0.1 });
      tone(t + 0.035, 0.07, 1100, 1900, 'sine', 0.08); // sticky "쪽"
    },
    pop() {
      if (!ok()) return; const t = now();
      tone(t, 0.07, 260, 1100, 'sine', 0.4, { glide: 0.05 });
      noise(t, 0.03, 4000, 2000, 1, 0.2);
    },
    drain(n) {
      if (!ok()) return; const t = now() + 0.05;
      for (let i = 0; i < Math.min(8, 2 + n); i++) tone(t + i * 0.045, 0.06, 700 - i * 40 + Math.random() * 80, 380 - i * 20, 'sine', 0.07);
    },
    bump() { if (!ok()) return; const t = now(); noise(t, 0.18, 600, 120, 0.8, 0.45, 'lowpass'); tone(t, 0.2, 120, 70, 'sine', 0.35); },
    decoLoose() { if (!ok()) return; voice([['o', 0.14, 1.2, 1.5]], 330); },
    decoFall() {
      if (!ok()) return; const t = now();
      tone(t, 0.45, 1100, 280, 'sine', 0.12, { glide: 0.45 });
      tone(t + 0.5, 0.08, 400, 200, 'sine', 0.25); noise(t + 0.5, 0.1, 1800, 500, 2, 0.15);
      voice([['a', 0.1, 1.3, 1.6], ['u', 0.22, 1.2, 0.8]], 300, t + 0.1);
    },
    decoSeat() { if (!ok()) return; const t = now(); tone(t, 0.08, 1500, 1800, 'sine', 0.05); },
    relief() {
      if (!ok()) return; const t = now();
      noise(t, 0.7, 1300, 450, 2.5, 0.12);
      voice([['u', 0.32, 1.1, 0.75]], 260, t + 0.02);
      tone(t + 0.2, 0.9, 880, 880, 'sine', 0.07, { verb: true });
      tone(t + 0.3, 0.9, 1320, 1320, 'sine', 0.05, { verb: true });
    },
    hup() { if (!ok()) return; voice([['u', 0.09, 1.0, 1.25]], 280 + Math.random() * 40); },
    worry() { if (!ok()) return; voice([['o', 0.12, 1.3, 1.1], ['o', 0.16, 1.4, 1.0]], 320); },
    whoa() { if (!ok()) return; voice([['o', 0.1, 1.0, 1.5], ['a', 0.2, 1.6, 1.1]], 300); },
    checkpoint() { if (!ok()) return; const t = now(); [784, 988, 1175].forEach((f, i) => tone(t + i * 0.08, 0.5, f, f, 'triangle', 0.12, { verb: true })); },
    win() {
      if (!ok()) return; const t = now();
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      notes.forEach((f, i) => { tone(t + i * 0.11, 0.4, f, f, 'triangle', 0.16, { verb: true }); tone(t + i * 0.11, 0.3, f * 2, f * 2, 'sine', 0.04); });
      voice([['a', 0.1, 1.2, 1.5], ['i', 0.25, 1.6, 1.9]], 300, t + 0.1);
    },
    fail() {
      if (!ok()) return; const t = now();
      noise(t, 0.35, 900, 150, 0.7, 0.5, 'lowpass');
      tone(t + 0.25, 0.45, 330, 300, 'sawtooth', 0.09, { lp: 900 });
      tone(t + 0.7, 0.8, 300, 200, 'sawtooth', 0.09, { lp: 800, glide: 0.7 });
      voice([['o', 0.18, 1.2, 1.0], ['u', 0.4, 1.0, 0.6]], 280, t + 0.15);
    },
    stars(n) { if (!ok()) return; const t = now(); for (let i = 0; i < n; i++) tone(t + 0.25 + i * 0.22, 0.4, 1047 + i * 262, 1047 + i * 262, 'triangle', 0.13, { verb: true }); },
  };

  // continuous danger bed: slide hiss + creak
  function setDanger(slide, creak) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.slideGain.gain.setTargetAtTime(A.on ? Math.min(0.22, slide * 0.16) : 0, t, 0.05);
    A.slideFilter.frequency.setTargetAtTime(900 + slide * 900, t, 0.08);
    A.creakGain.gain.setTargetAtTime(A.on ? Math.min(0.05, creak * 0.05) : 0, t, 0.08);
    A.tension = Math.max(slide, creak);
  }

  // ---------------------------------------------------------- music box loop
  const SCALE = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.0, A: 440.0, B: 493.88 };
  function n(name, oct) { return SCALE[name] * Math.pow(2, oct); }
  const CHORDS = [['C', 'E', 'G'], ['A', 'C', 'E'], ['F', 'A', 'C'], ['G', 'B', 'D']];
  const BASS = ['C', 'A', 'F', 'G'];
  const MEL = [
    ['E', 1], null, ['G', 1], null, ['C', 2], null, ['G', 1], ['E', 1], ['D', 1], null, ['E', 1], null, ['C', 1], null, null, null,
    ['C', 1], null, ['E', 1], null, ['A', 1], null, ['G', 1], ['E', 1], ['C', 1], null, ['D', 1], null, ['E', 1], null, null, null,
    ['F', 1], null, ['A', 1], null, ['C', 2], null, ['A', 1], ['F', 1], ['E', 1], null, ['F', 1], null, ['A', 1], null, null, null,
    ['G', 1], null, ['B', 1], null, ['D', 2], null, ['B', 1], ['G', 1], ['F', 1], null, ['E', 1], null, ['D', 1], null, ['B', 0], null,
  ];
  function startMusic() {
    if (A.musicTimer) return;
    A.nextT = A.ctx.currentTime + 0.2;
    A.step = 0;
    A.musicTimer = setInterval(schedule, 60);
  }
  function pluck(t, f, g, dur) {
    tone(t, dur || 0.6, f, f, 'triangle', g, { dest: A.music, atk: 0.004 });
    tone(t, (dur || 0.6) * 0.5, f * 2, f * 2, 'sine', g * 0.35, { dest: A.music, atk: 0.002 });
  }
  function schedule() {
    if (!A.ctx || A.ctx.state !== 'running') return;
    const spb = 60 / 104 / 2; // eighth notes
    while (A.nextT < A.ctx.currentTime + 0.25) {
      const t = A.nextT, s = A.step % 64, bar = Math.floor(s / 16);
      const m = MEL[s];
      if (m && A.musicOn) pluck(t, n(m[0], m[1]), 0.12 * (1 - A.tension * 0.5), 0.55);
      if (s % 8 === 0) tone(t, 0.7, n(BASS[bar], -1), n(BASS[bar], -1), 'triangle', 0.16, { dest: A.music, lp: 600 });
      if (s % 4 === 2) CHORDS[bar].forEach((c, i) => tone(t + i * 0.012, 0.3, n(c, 0), n(c, 0), 'sine', 0.035, { dest: A.music }));
      if (s % 2 === 1) noise(t, 0.04, 7000, 6000, 1.5, 0.02 + A.tension * 0.03, 'highpass', A.music);
      A.nextT += spb;
      A.step++;
    }
  }

  function setOn(v) { A.on = v; if (A.master) A.master.gain.setTargetAtTime(v ? 0.9 : 0, A.ctx.currentTime, 0.05); }
  function setMusic(v) { A.musicOn = v; if (A.music) A.music.gain.setTargetAtTime(v ? 0.55 : 0, A.ctx.currentTime, 0.1); }

  root.Sound = { init, sfx, setDanger, setOn, setMusic, voice, state: A };
})(typeof window !== 'undefined' ? window : globalThis);
