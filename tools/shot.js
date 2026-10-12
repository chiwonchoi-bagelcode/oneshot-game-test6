// Playwright smoke test + screenshots.
// usage: node tools/shot.js <outdir> [script]
// script: comma separated actions: title | level:N | tap:L | tap:R | wait:ms | shot:name | click:x,y | mouse
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

(async () => {
  const out = process.argv[2] || 'shots';
  const script = (process.argv[3] || 'shot:title').split(',');
  fs.mkdirSync(out, { recursive: true });
  const touch = !script.includes('mouse');
  const browser = await pw.chromium.launch({ executablePath: fs.existsSync('/opt/pw-browsers/chromium') ? undefined : undefined });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(url);
  await page.waitForTimeout(600);
  for (const step of script) {
    const [cmd, arg] = step.split(':');
    if (cmd === 'level') { await page.evaluate((n) => window.__dariya.startLevel(n - 1), parseInt(arg)); await page.waitForTimeout(300); }
    else if (cmd === 'tap') { await page.evaluate((i) => window.__dariya.tap(i), arg === 'L' ? 0 : 1); await page.waitForTimeout(450); }
    else if (cmd === 'taps') { for (const ch of arg) { await page.evaluate((i) => window.__dariya.tap(i), ch === 'L' ? 0 : 1); await page.waitForTimeout(ch === ch.toLowerCase() ? 250 : 550); } }
    else if (cmd === 'wait') await page.waitForTimeout(parseInt(arg));
    else if (cmd === 'shot') await page.screenshot({ path: path.join(out, arg + '.png') });
    else if (cmd === 'click') { const [x, y] = arg.split(';').map(Number); if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); await page.waitForTimeout(300); }
    else if (cmd === 'sel') { await page.click(arg.replace(/~/g, ' ')); await page.waitForTimeout(400); }
    else if (cmd === 'state') {
      const s = await page.evaluate(() => { const g = window.__dariya.game; if (!g) return null; const c = g.char; return { state: g.state, P: [Math.round(c.P.x), Math.round(c.P.y)], f: [c.legs[0].f, c.legs[1].f], pool: c.pool, planted: c.legs.map((l) => l.planted), theta: +(c.theta * 57.3).toFixed(1), cake: +c.cake.s.toFixed(1), decos: c.decos.filter((d) => !d.lost).length, taps: g.taps }; });
      console.log('STATE', JSON.stringify(s));
    }
  }
  console.log(errors.length ? errors.join('\n') : 'no errors');
  await browser.close();
})();
