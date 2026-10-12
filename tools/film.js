// Replay a tap sequence in the real page and capture frames into a contact sheet.
// usage: node tools/film.js <level> <seq> <out.png> [everyNthTap=1] [tapGapMs=450] [cols=4]
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

(async () => {
  const [level, seq, out] = process.argv.slice(2, 5);
  const every = parseInt(process.argv[5] || '1');
  const gap = parseInt(process.argv[6] || '450');
  const cols = parseInt(process.argv[7] || '4');
  const tmp = out + '.frames';
  fs.mkdirSync(tmp, { recursive: true });
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?level=' + level);
  await page.waitForTimeout(700);
  const files = [];
  let n = 0;
  const snap = async (label) => {
    const f = path.join(tmp, String(files.length).padStart(3, '0') + '.png');
    await page.screenshot({ path: f });
    files.push({ f, label });
  };
  await snap('start');
  for (const ch of seq) {
    if (ch !== 'W') await page.evaluate((i) => window.__dariya.tap(i), ch === 'L' ? 0 : 1);
    else await page.waitForTimeout(150);
    n++;
    await page.waitForTimeout(gap);
    if (n % every === 0) await snap(n + ch);
    const st = await page.evaluate(() => window.__dariya.game.state);
    if (st !== 'play') { await page.waitForTimeout(1800); await snap(st); break; }
  }
  await browser.close();
  // tile with PIL
  const py = `
import sys
from PIL import Image, ImageDraw
files = sys.argv[3:]
cols = int(sys.argv[2])
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
sc = 0.5
tw, th = int(w*sc), int(h*sc)
rows = (len(ims)+cols-1)//cols
sheet = Image.new('RGB', (cols*tw, rows*th), (255,255,255))
for i, im in enumerate(ims):
    im = im.resize((tw, th))
    d = ImageDraw.Draw(im)
    d.rectangle([0,0,40,14], fill=(0,0,0))
    d.text((2,1), str(i), fill=(255,255,255))
    sheet.paste(im, ((i%cols)*tw, (i//cols)*th))
sheet.save(sys.argv[1])
`;
  execFileSync('python3', ['-c', py, out, String(cols), ...files.map((x) => x.f)]);
  console.log('frames', files.length, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors');
})();
