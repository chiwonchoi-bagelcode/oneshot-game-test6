// Replay a tap sequence on a level and print a per-tap trace.
// usage: node tools/replay.js <levelId> <seq> [pause]
const S = require('../js/sim.js');
const LEVELS = require('../js/levels.js');
for (const k of Object.keys(process.env)) if (k.startsWith('CFG_')) S.CFG[k.slice(4)] = parseFloat(process.env[k]);
const def = JSON.parse(JSON.stringify(LEVELS.find((l) => l.id === parseInt(process.argv[2]))));
if (process.env.FLUID) def.start.fluid = process.env.FLUID.split(',').map(Number);
const seq = process.argv[3] || '';
const pause = parseFloat(process.argv[4] || '0.45');
const g = S.createGame(def);
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
let i = 0;
for (const ch of seq) {
  const r = ch === 'W' ? 'wait' : S.tap(g, ch === 'L' ? 0 : 1);
  const n = Math.round((ch === 'W' ? 0.6 : pause) / S.CFG.dt);
  for (let k = 0; k < n; k++) { if (k % 4 === 0) S.frameUpdate(g); S.physicsStep(g, S.CFG.dt, false); }
  const c = g.char;
  const ev = g.events.filter((e) => !['pump', 'decoLoose', 'decoSeat'].includes(e.type)).map((e) => e.type).join(',');
  g.events.length = 0;
  const legs = c.legs.map((L) => L.planted ? `${'LR'[L.side]}@${L.foot.x.toFixed(0)},${L.foot.y.toFixed(0)}` : `${'LR'[L.side]}~${L.target && !L.target.none ? 'k' + L.target.k + '->' + L.target.x.toFixed(0) : '-'}`).join(' ');
  console.log(`${String(i++).padStart(3)} ${ch}${r === 'switch' ? '*' : r === 'full' ? '!' : ' '} P(${c.P.x.toFixed(0)},${c.P.y.toFixed(0)}) th${deg(c.theta)} off${(c.offset || 0).toFixed(0)} f${c.legs[0].f}/${c.pool}/${c.legs[1].f} ${legs} cake${c.cake.s.toFixed(0)} d${c.decos.filter((d) => !d.lost).length} ${ev}`);
  if (g.state !== 'play') { console.log(g.state, JSON.stringify(g.failCause || {})); break; }
}
