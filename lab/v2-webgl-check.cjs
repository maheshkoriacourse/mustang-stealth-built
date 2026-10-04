const { chromium } = require('/home/maheshkoria/tools/camofox-browser/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/maheshkoria/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text()));
  await page.goto('https://mustang-stealth-built-koria1.vercel.app/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(8000);
  const t0 = await page.evaluate(() => {
    const c = document.getElementById('stage');
    try { return { gl2: !!c.getContext('webgl2'), ver: window.Stealth3D && window.Stealth3D.version }; }
    catch (e) { return { gl2: 'ctx-err', ver: window.Stealth3D && window.Stealth3D.version }; }
  });
  console.log('BOOT:', JSON.stringify(t0));
  console.log('LOGS:', logs.filter(l => /3d/i.test(l)).slice(0, 3).join(' || '));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-a1-early.png' });
  await page.evaluate((h) => window.scrollTo(0, document.documentElement.scrollHeight * 0.06), 0);
  await page.waitForTimeout(4500);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-a1-late.png' });
  await browser.close();
  console.log('SHOTS DONE');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });