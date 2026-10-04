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
  await page.waitForTimeout(9000);
  const boot = await page.evaluate(() => ({ ver: window.Stealth3D && window.Stealth3D.version, active: window.Stealth3D && window.Stealth3D.isActive() }));
  console.log('BOOT:', JSON.stringify(boot));
  console.log('4D:', logs.filter(l => /stealth-4d|4d/i.test(l)).slice(0, 2).join(' || '));
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  // sample 5 camera positions across the reel — proof of continuous camera flight
  const spots = [0.005, 0.10, 0.30, 0.42, 0.55, 0.75];
  for (let i = 0; i < spots.length; i++) {
    await page.evaluate((f) => window.scrollTo(0, document.documentElement.scrollHeight * f), spots[i]);
    await page.waitForTimeout(4200);
    await page.screenshot({ path: '/home/maheshkoria/.hermes/cache/scratch/v4-spot-' + i + '.png' });
  }
  console.log('SHOTS DONE');
  await browser.close();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });