const { chromium } = require('/home/maheshkoria/tools/camofox-browser/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-webgl'], executablePath: '/home/maheshkoria/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  await page.goto('https://mustang-stealth-built-koria1.vercel.app/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(6000);
  const boot = await page.evaluate(() => ({
    webgl2: (() => { try { return !!document.getElementById('stage').getContext('webgl2'); } catch(e){ return 'err'; } })(),
    loaderGone: !document.getElementById('loader') || document.getElementById('loader').classList.contains('is-loaded') || getComputedStyle(document.getElementById('loader')).opacity < 0.05,
    copyCount: document.querySelectorAll('[data-sc-copy]').length,
    scrollH: document.documentElement.scrollHeight,
    h1: (document.querySelector('h1')||{}).textContent || null,
    stealth3d: typeof window.Stealth3D !== 'undefined' && window.Stealth3D.version
  }));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/launch-mid.png' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/launch-end.png' });
  console.log('BOOT:', JSON.stringify(boot));
  console.log('CONSOLE:', logs.filter(l => /3d|error|warn|stealth/i.test(l)).slice(0,6).join(' || '));
  await browser.close();
})().catch(e => { console.error('LAUNCH-FAIL:', e.message); process.exit(1); });