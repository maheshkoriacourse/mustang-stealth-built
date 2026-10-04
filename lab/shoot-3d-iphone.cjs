// Mustang stealth-built scroll QA shots (.cjs)
const path = require('path');
const { chromium } = require('/home/maheshkoria/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const outDir = '/home/maheshkoria/mustang-build/lab/shots-3d-iphone';
  require('fs').mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', isMobile: true, hasTouch: true }).then(c => c.newPage());
  await page.goto('https://mustang-stealth-built-koria1.vercel.app/', { waitUntil: 'load' });

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