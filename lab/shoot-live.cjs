// Mustang stealth-built scroll QA shots (.cjs)
const path = require('path');
const { chromium } = require('/home/maheshkoria/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const outDir = '/home/maheshkoria/mustang-build/lab/shots-live';
  require('fs').mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('https://maheshkoriacourse.github.io/mustang-stealth-built/', { waitUntil: 'networkidle' });

  // wait for loader gate to finish (loader gets is-loaded)
  try {
    await page.waitForSelector('#loader.is-loaded', { timeout: 30000 });
    console.log('loader done');
  } catch (e) {
    console.log('LOADER TIMEOUT — is-loaded never applied');
  }
  await page.waitForTimeout(1500);

  const positions = [0.02, 0.06, 0.25, 0.42, 0.53, 0.63, 0.71, 0.86, 0.97];
  for (const frac of positions) {
    await page.evaluate((f) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round(f * max));
    }, frac);
    // wait for lerp/scrub settle
    await page.waitForTimeout(1600);
    const name = `pos-${String(Math.round(frac*100)).padStart(3,'0')}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    const info = await page.evaluate(() => ({
      y: Math.round(window.scrollY),
      copies: Array.from(document.querySelectorAll('[data-sc-copy]')).map(el => Math.round(+getComputedStyle(el).opacity * 100) / 100).join(','),
      progress: document.getElementById('progress-fill') ? document.getElementById('progress-fill').style.width : 'none'
    }));
    console.log(name, 'scrollY=' + info.y, 'copyOpacity=[' + info.copies + ']', 'progress=' + info.progress);
  }
  await browser.close();
  console.log('SHOTS DONE');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
