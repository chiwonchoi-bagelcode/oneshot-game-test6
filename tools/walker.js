// Heuristic walker: plays a level with a simple policy and prints a compact trace.
const S = require('../js/sim.js');
const level = {
  id: 0, name: 'probe',
  start: { feet: [[0, 0], [80, 0]], fluid: [6, 6] },
  platforms: [{ x: -300, y: 0, w: 1400 }],
  goal: { x0: 9999, x1: 9999, y: 0 },
};
const margin = parseFloat(process.argv[2] || '20');
const pause = parseFloat(process.argv[3] || '0.5');
const maxTaps = parseInt(process.argv[4] || '40');
const g = S.createGame(level);
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
let line = '';
for (let n = 0; n < maxTaps && g.state === 'play'; n++) {
  const c = g.char; const [A, B] = c.legs;
  let leg;
  if (A.planted && B.planted) {
    const front = A.foot.x > B.foot.x ? A : B, back = front === A ? B : A;
    leg = (c.P.x - front.foot.x > margin) ? front.side : back.side;
  } else {
    const F = A.planted ? B : A;
    leg = F.side;
  }
  const r = S.tap(g, leg);
  S.advance(g, pause);
  const ev = g.events.filter((e) => e.type !== 'pump' && e.type !== 'decoLoose').map((e) => e.type).join(',');
  g.events.length = 0;
  const c2 = g.char;
  console.log(`${n.toString().padStart(2)} ${'LR'[leg]}${r === 'switch' ? '*' : ' '} P(${c2.P.x.toFixed(0)},${c2.P.y.toFixed(0)}) th${deg(c2.theta)} pool${c2.pool} f[${c2.legs[0].f},${c2.legs[1].f}] ${c2.legs.map((l) => l.planted ? l.foot.x.toFixed(0) : '~').join('/')} cake${c2.cake.s.toFixed(0)} decos${c2.decos.filter((d) => !d.lost).length} ${ev}`);
}
