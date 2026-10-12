// Render each sound effect offline and report peak / RMS so nothing is silent or clipping.
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
(async () => {
  const b = await pw.chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  const res = await p.evaluate(async () => {
    const names = [['pump', [0, true, 5]], ['pump', [1, false, 3]], ['shrink', [0]], ['full', [true]], ['plant', [100]], ['pop', []], ['drain', [6]], ['bump', []],
      ['decoLoose', []], ['decoFall', []], ['relief', []], ['hup', []], ['whoa', []], ['checkpoint', []], ['win', []], ['fail', []], ['stars', [3]], ['click', []]];
    const out = [];
    const RealAC = window.AudioContext;
    for (const [n, args] of names) {
      const off = new OfflineAudioContext(2, 44100 * 2.5, 44100);
      window.AudioContext = function () { return off; };
      Sound.state.ctx = null; Sound.state.musicTimer = 1; // keep music off
      Sound.state.on = true;
      Sound.init();
      Sound.sfx[n](...args);
      const buf = await off.startRendering();
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
      out.push(n + ' peak=' + peak.toFixed(3) + ' rms=' + Math.sqrt(sum / d.length).toFixed(4));
    }
    window.AudioContext = RealAC;
    return out;
  });
  console.log(res.join('\n'));
  await b.close();
})();
