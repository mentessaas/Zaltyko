const { chromium } = require('@playwright/test');

const BASE_URL = 'http://localhost:3003';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔐 Probando login en local...\n');

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  console.log('Página de login cargada');

  await page.fill('input[type="email"]', 'mitotabot@gmail.com');
  await page.fill('input[type="password"]', 'Mitotabot550501@#_');

  await page.click('button[type="submit"]');

  console.log('Esperando redirect...');
  await page.waitForTimeout(8000);

  console.log('URL actual:', page.url());
  console.log('Título:', await page.title());

  await page.screenshot({ path: 'tests/screenshots/local-dashboard.png', fullPage: true });

  const body = await page.locator('body').textContent();
  console.log('\nContenido:');
  console.log(body.substring(0, 300));

  await browser.close();
})();
