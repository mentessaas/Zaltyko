const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';
const EMAIL = 'mitotabot@gmail.com';
const PASSWORD = 'Mitotabot550501@#_';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔐 Haciendo login...\n');

  // Login first
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  if (!page.url().includes('/dashboard')) {
    console.log('❌ Login falló');
    await browser.close();
    return;
  }

  console.log('✅ Login exitoso!\n');

  // Try different dashboard routes
  const routes = [
    '/dashboard',
    '/dashboard/athletes',
    '/dashboard/coaches',
    '/dashboard/calendar',
    '/dashboard/events',
    '/dashboard/academies',
    '/dashboard/profile',
    '/dashboard/settings',
    '/dashboard/users',
    '/dashboard/sessions',
    '/app',
    '/app/academia-demo',
  ];

  console.log('=== PROBANDO RUTAS ===\n');

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const text = await page.textContent('body');
    const is404 = text.includes('404') || text.includes('no encontrada');

    const status = is404 ? '❌' : '✅';
    const content = is404 ? '404' : text.substring(0, 50).replace(/\s+/g, ' ');

    console.log(`${status} ${route.padEnd(25)} -> ${content}...`);
  }

  console.log('\n=== PROBANDO CLIC EN SIDEBAR ===\n');

  // Go back to dashboard and click sidebar
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Look for sidebar navigation
  const sidebarItems = await page.locator('[class*="sidebar"] a, nav a').all();

  console.log(`Encontrados ${sidebarItems.length} enlaces`);

  for (const item of sidebarItems.slice(0, 10)) {
    try {
      const href = await item.getAttribute('href');
      const text = await item.textContent();
      if (href && text && text.trim().length > 0) {
        console.log(`  -> ${text.trim()} (${href})`);
      }
    } catch (e) {}
  }

  console.log('\n✅ PRUEBAS COMPLETADAS!');
  await browser.close();
})();
