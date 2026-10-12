// A rote policy (push past the front foot by `past`, switch, reach when the ring is ahead).
// Shows where a fixed rhythm breaks down, i.e. where a level asks for reading.
// usage: node tools/naive.js <levelId> [past=22] [pause=0.6]
const S = require('../js/sim.js');
const LEVELS = require('../js/levels.js');
const id = parseInt(process.argv[2] || '1');
const PAST = parseFloat(process.argv[3] || '22');
const PAUSE = parseFloat(process.argv[4] || '0.6');
const g = S.createGame(LEVELS.find((l) => l.id === id));
let n = 0, last = '';
for (; n < 220 && g.state === 'play'; n++) {
  const c = g.char;
  let leg;
  if (c.support === 2) {
    const front = c.legs[0].foot.x > c.legs[1].foot.x ? 0 : 1, back = 1 - front;
    const eq = S.twoFootEq(c, c.legs[0].f, c.legs[1].f) || c.P;
    const pv = S.tapPreview(g, back);
    leg = eq.x - c.legs[front].foot.x > PAST || pv.kind === 'release' || pv.kind === 'full' ? front : back;
  } else {
    const Fi = c.legs[0].planted ? 1 : 0, F = c.legs[Fi], Sp = c.legs[1 - Fi];
    const tg = F.target;
    const good = tg && !tg.none && tg.x > Sp.foot.x + 30;
    const canPush = S.tapPreview(g, Sp.side).kind === 'push' && F.f > 0;
    leg = good || !canPush ? Fi : Sp.side;
  }
  S.tap(g, leg);
  last += 'LR'[leg];
  for (let k = 0; k < Math.round(PAUSE / S.CFG.dt); k++) { if (k % 4 === 0) S.frameUpdate(g); S.physicsStep(g, S.CFG.dt, false); }
  if (g.state === 'play') {
    // detect being stuck: no forward progress in the last 30 taps
    g.hist2 = g.hist2 || [];
    g.hist2.push(Math.min(...c.legs.filter((L) => L.planted).map((L) => L.foot.x)));
    if (g.hist2.length > 30 && g.hist2[g.hist2.length - 1] <= g.hist2[g.hist2.length - 31]) break;
  }
}
const c = g.char;
console.log(`L${id} past=${PAST}: ${g.state} after ${n} taps, P.x=${c.P.x.toFixed(0)} decos=${c.decos.filter((d) => !d.lost).length}` + (g.failCause ? ' ' + JSON.stringify(g.failCause) : ''));
