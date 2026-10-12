// Beam-search solver: verifies a level can be delivered and reports a tap sequence.
// usage: node tools/solve.js <levelId> [beam] [pause] [maxDepth]
const S = require('../js/sim.js');
const LEVELS = require('../js/levels.js');
const id = parseInt(process.argv[2] || '1');
const BEAM = parseInt(process.argv[3] || '200');
const PAUSE = parseFloat(process.argv[4] || '0.45');
const MAXD = parseInt(process.argv[5] || '160');
for (const k of Object.keys(process.env)) if (k.startsWith('CFG_')) S.CFG[k.slice(4)] = parseFloat(process.env[k]);
const def = process.env.LEVEL_JSON ? JSON.parse(require('fs').readFileSync(process.env.LEVEL_JSON, 'utf8')) : JSON.parse(JSON.stringify(LEVELS.find((l) => l.id === id)));
if (process.env.FLUID) def.start.fluid = process.env.FLUID.split(',').map(Number);
if (process.env.POOL) def.start.pool = parseInt(process.env.POOL);
const root = S.createGame(def);
function run(g, t) {
  const n = Math.round(t / S.CFG.dt);
  for (let i = 0; i < n; i++) {
    if (i % 4 === 0) S.frameUpdate(g);
    S.physicsStep(g, S.CFG.dt, false);
    if (g.state !== 'play') break;
  }
  g.events.length = 0;
}
function key(g) {
  const c = g.char;
  return c.legs.map((L) => L.planted ? `${Math.round(L.foot.x / 4)},${Math.round(L.foot.y / 4)}` : 'f').join('|') + `|${c.legs[0].f},${c.legs[1].f},${c.pool}`;
}
function score(g) {
  const c = g.char, gl = def.goal;
  const feet = c.legs.filter((L) => L.planted).map((L) => L.foot.x);
  const minFoot = feet.length ? Math.min(...feet) : c.P.x;
  const decos = c.decos.filter((d) => !d.lost).length;
  const inGoal = c.legs.filter((L) => L.planted && L.foot.x >= gl.x0 && L.foot.x <= gl.x1 && Math.abs(L.foot.y - gl.y) < 4).length;
  const mid = (gl.x0 + gl.x1) / 2;
  const px = c.P.x > mid ? mid - (c.P.x - mid) : c.P.x;
  return Math.min(minFoot, mid) + px * 0.5 + inGoal * 60 + decos * 120 - Math.abs(c.cake.s) * 2 - (c.support === 2 ? 0 : 10);
}
let beam = [{ g: root, seq: '' }];
const seen = new Map();
let best = null;
const t0 = Date.now();
for (let depth = 0; depth < MAXD; depth++) {
  const next = [];
  for (const node of beam) {
    for (const leg of [0, 1, 2]) {
      const g = S.cloneGame(node.g);
      if (leg < 2) { const r = S.tap(g, leg); if (r === 'full') continue; }
      else if (node.seq.endsWith('W')) continue;
      run(g, leg < 2 ? PAUSE : 0.6);
      if (g.state === 'fail') continue;
      const seq = node.seq + 'LRW'[leg];
      if (g.state === 'win') {
        const decos = g.char.decos.filter((d) => !d.lost).length;
        if (!best || decos > best.decos || (decos === best.decos && seq.length < best.seq.length)) best = { seq, decos };
        continue;
      }
      const k = key(g);
      const sc = score(g);
      const prev = seen.get(k);
      if (prev != null && prev >= sc) continue;
      seen.set(k, sc);
      next.push({ g, seq, sc });
    }
  }
  if (best && best.decos === 3) break;
  next.sort((a, b) => b.sc - a.sc);
  beam = next.slice(0, BEAM);
  if (!beam.length) break;
  if (depth % 10 === 0) {
    const b = beam[0].g.char;
    process.stderr.write(`d${depth} beam${beam.length} bestP ${b.P.x.toFixed(0)} decos ${b.decos.filter((d) => !d.lost).length} ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }
}
if (best) console.log(`LEVEL ${id} SOLVED taps=${best.seq.length} decos=${best.decos} seq=${best.seq}`);
else { console.log(`LEVEL ${id} NOT SOLVED (best P.x ${beam.length ? beam[0].g.char.P.x.toFixed(0) : '?'})`); if (beam.length) console.log('bestseq', beam[0].seq); }
