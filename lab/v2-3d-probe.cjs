const { chromium } = require('/home/maheshkoria/tools/camofox-browser/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/maheshkoria/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome',
    args: ['--headless=new', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--enable-webgl2', '--ignore-gpu-blocklist', '--no-sandbox']
  });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.goto('https://mustang-stealth-built-koria1.vercel.app/', { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(9000); // reels + depth stream in
  const boot = await page.evaluate(() => ({ ver: window.Stealth3D && window.Stealth3D.version, active: window.Stealth3D && window.Stealth3D.isActive() }));
  console.log('BOOT:', JSON.stringify(boot));
  console.log('3D:', logs.filter(l => /stealth-3d/i.test(l)).slice(0, 2).join(' || '));
  // A1 early vs late: same spot, camera path should differ visibly
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.005));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-3d-a1-early.png' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.055));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-3d-a1-late.png' });
  // A3 orbit: early vs late within act 3
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.30));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-3d-a3-early.png' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.42));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v2-3d-a3-late.png' });
  console.log('SHOTS DONE');
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });