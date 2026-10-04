const { chromium } = require('/home/maheshkoria/tools/camofox-browser/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/maheshkoria/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  const fails = [];
  page.on('response', r => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url().split('/').pop()); });
  await page.goto('https://mustang-stealth-built-koria1.vercel.app/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/launch-3d-mid.png' });
  console.log('CONSOLE:', logs.filter(l => /3d|stealth|error|warn/i.test(l)).slice(0, 5).join(' || '));
  console.log('FAILS:', fails.slice(0, 8).join(' | '));
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });