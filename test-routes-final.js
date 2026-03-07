const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Test each route more carefully
  const routes = [
    '/',
    '/features',
    '/pricing',
    '/integrations',
    '/academies',
    '/help',
    '/contact',
    '/about',
    '/onboarding',
    '/auth/login',
  ];

  console.log('🧪 PRUEBA DETALLADA DE RUTAS\n');

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 30000 });

    const title = await page.title();
    const url = page.url();

    // Get actual visible content
    const mainText = await page.locator('main').textContent().catch(() => '');
    const hasMainContent = mainText && mainText.length > 50;

    // Check for 404
    const has404 = await page.locator('text=404').count() > 0;

    let status = '❌';
    if (has404) {
      status = '❌ 404';
    } else if (hasMainContent) {
      status = '✅ OK';
    } else if (url.includes('#')) {
      status = '🔄 Anchor';
    }

    console.log(`${status} ${route.padEnd(18)} → ${url.replace(BASE_URL, '').padEnd(25)} | ${title.substring(0, 30)}`);
  }

  // Test buttons on home
  console.log('\n🎮 Probando navegación...\n');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Find nav links
  const navLinks = await page.locator('nav a').allTextContents();
  console.log('Links en nav:', navLinks.slice(0, 5).join(', '));

  // Click each nav link
  for (const linkText of ['Características', 'Precios', 'Academias']) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    try {
      const link = page.locator(`nav a:has-text("${linkText}")`).first();
      if (await link.isVisible()) {
        await link.click();
        await page.waitForTimeout(1000);
        console.log(`✅ Click "${linkText}" → ${page.url().replace(BASE_URL, '')}`);
      }
    } catch (e) {
      console.log(`❌ Click "${linkText}" no encontrado`);
    }
  }

  await browser.close();
  console.log('\n✅ Completado!');
})();
