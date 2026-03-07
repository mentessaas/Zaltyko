const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔐 Login...\n');

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'mitotabot@gmail.com');
  await page.fill('input[type="password"]', 'Mitotabot550501@#_');
  await page.click('button[type="submit"]');

  console.log('Esperando redirect...');
  await page.waitForTimeout(8000);

  console.log('URL actual:', page.url());
  console.log('Título:', await page.title());

  await page.screenshot({ path: 'tests/screenshots/debug-dashboard.png', fullPage: true });

  // Check for any content
  const body = await page.locator('body').textContent();
  console.log('\nContenido del body:');
  console.log(body.substring(0, 500));

  // Try different navigation
  console.log('\n\nProbando clicks en la página...');

  // Look for any links
  const allLinks = await page.locator('a').all();
  console.log(`\nTotal de enlaces en la página: ${allLinks.length}`);

  // Print first 10 links
  for (let i = 0; i < Math.min(10, allLinks.length); i++) {
    try {
      const href = await allLinks[i].getAttribute('href');
      const text = await allLinks[i].textContent();
      if (href || text) {
        console.log(`  ${i + 1}. ${text?.substring(0, 30)} -> ${href}`);
      }
    } catch (e) {}
  }

  await browser.close();
})();
