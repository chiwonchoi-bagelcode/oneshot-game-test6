// Quick probe: run scripted taps on a test level and print the body state after each tap.
// usage: node tools/probe.js "LLLRRR..." [pause]
const S = require('../js/sim.js');

const level = {
  id: 0, name: 'probe',
  start: { feet: [[0, 0], [80, 0]], fluid: [6, 6] },
  platforms: [
    { x: -300, y: 0, w: 1400 },
  ],
  goal: { x0: 9999, x1: 9999, y: 0 },
};

const seq = (process.argv[2] || 'LLLLRRRR').toUpperCase();
const pause = parseFloat(process.argv[3] || '0.6');
const g = S.createGame(level);
const deg = (r) => (r * 180 / Math.PI).toFixed(1);
function show(label) {
  const c = g.char;
  const L = c.legs.map((l) => {
    if (l.planted) return `${l.side ? 'R' : 'L'}[f${l.f} @${l.foot.x.toFixed(0)},${l.foot.y.toFixed(0)} d${l.d.toFixed(0)} st${(l.stretch * 100).toFixed(0)}%]`;
    const ff = S.freeFoot(c, l);
    const t = l.target && !l.target.none ? ` tgt(k${l.target.k} ${l.target.x.toFixed(0)},${l.target.y.toFixed(0)})` : (l.target && l.target.none ? ' tgt:none' : '');
    return `${l.side ? 'R' : 'L'}(f${l.f} free foot ${ff.x.toFixed(0)},${ff.y.toFixed(0)} len${l.len.toFixed(0)}${t})`;
  }).join(' ');
  console.log(`${label.padEnd(4)} P(${c.P.x.toFixed(0)},${c.P.y.toFixed(0)}) th${deg(c.theta)} off${(c.offset || 0).toFixed(0)} pool${c.pool} cake s${c.cake.s.toFixed(1)} ${c.cake.stuck ? 'stk' : 'SLD'} decos[${c.decos.map((d) => d.lost ? 'X' : (d.seated ? 'o' : '~') + d.d.toFixed(0)).join(' ')}] ${L}`);
}
show('init');
for (const ch of seq) {
  if (ch === '.') { S.advance(g, pause); show('wait'); continue; }
  const r = S.tap(g, ch === 'L' ? 0 : 1);
  S.advance(g, pause);
  const ev = g.events.map((e) => e.type + (e.type==='pump'&&e.switched?'(sw)':'')).filter((t) => t !== 'pump').join(',');
  g.events.length = 0;
  show(ch + (r === 'full' ? '!' : '')); if (ev) console.log('     events:', ev);
  if (g.state !== 'play') { console.log('STATE', g.state, JSON.stringify(g.failCause)); break; }
}
