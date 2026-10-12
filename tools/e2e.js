// End-to-end: play each stage in a real (headless) browser with a tap route, in real time.
// usage: node tools/e2e.js <routes.json> [tapGapMs=470]
// routes.json: { "1": "LLR...", "2": "..." }  ('W' = wait one beat)
const path = require('path');
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

(async () => {
  const routes = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const gap = parseInt(process.argv[3] || '470');
  const browser = await pw.chromium.launch();
  let ok = true;
  for (const [lv, seq] of Object.entries(routes)) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?level=' + lv);
    await page.waitForTimeout(700);
    for (const ch of seq) {
      if (ch !== 'W') await page.evaluate((i) => window.__dariya.tap(i), ch === 'L' ? 0 : 1);
      await page.waitForTimeout(ch === 'W' ? gap + 150 : gap);
      const st = await page.evaluate(() => window.__dariya.game.state);
      if (st !== 'play') break;
    }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => { const g = window.__dariya.game; return { state: g.state, decos: g.char.decos.filter((d) => !d.lost).length, taps: g.taps, screen: window.__dariya.screen }; });
    console.log(`stage ${lv}: ${r.state} decos=${r.decos} taps=${r.taps} screen=${r.screen}` + (errors.length ? ' ERRORS ' + errors.join(' | ') : ''));
    if (r.state !== 'win' || errors.length) ok = false;
    await page.close();
  }
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
