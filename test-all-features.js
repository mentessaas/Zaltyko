const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('🔐 Haciendo login y manteniendo sesión...\n');

  // Login
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'mitotabot@gmail.com');
  await page.fill('input[type="password"]', 'Mitotabot550501@#_');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  console.log('URL después de login:', page.url());

  if (!page.url().includes('dashboard')) {
    console.log('❌ Login falló');
    await browser.close();
    return;
  }

  console.log('✅ Login exitoso!\n');

  // Test the main pages by clicking through the sidebar
  console.log('=== PROBANDO PÁGINAS ===\n');

  // First save dashboard screenshot
  await page.screenshot({ path: 'tests/screenshots/full-dashboard.png', fullPage: true });
  console.log('✅ Dashboard\n');

  // Look for sidebar links and click them
  // The sidebar should have navigation items
  const sidebarSelectors = [
    'nav a',
    '[class*="sidebar"] a',
    '[class*="menu"] a',
    'aside a',
    '[role="navigation"] a'
  ];

  let foundLinks = [];

  for (const selector of sidebarSelectors) {
    const links = await page.locator(selector).all();
    for (const link of links) {
      try {
        const href = await link.getAttribute('href');
        const text = await link.textContent();
        if (href && text && text.trim().length > 0 && href !== '#') {
          foundLinks.push({ href, text: text.trim() });
        }
      } catch (e) {}
    }
    if (foundLinks.length > 0) break;
  }

  console.log(`Encontrados ${foundLinks.length} enlaces de navegación:`);
  for (const link of foundLinks.slice(0, 15)) {
    console.log(`  -> ${link.text} (${link.href})`);
  }

  // Try clicking on navigation items
  console.log('\n=== NAVEGANDO ===\n');

  const testLinks = [
    { name: 'Atletas', partialUrl: 'athlete' },
    { name: 'Clases', partialUrl: 'class' },
    { name: 'Eventos', partialUrl: 'event' },
    { name: 'Pagos', partialUrl: 'billing' },
    { name: 'Comunicación', partialUrl: 'message' },
    { name: 'Configuración', partialUrl: 'setting' },
    { name: 'Perfil', partialUrl: 'profile' },
  ];

  for (const test of testLinks) {
    // Find a link that contains the partial URL or name
    try {
      const link = page.locator(`a:has-text("${test.name}")`).first();
      if (await link.isVisible({ timeout: 3000 })) {
        await link.click();
        await page.waitForTimeout(2000);

        const url = page.url();
        const text = await page.textContent('body');
        const is404 = text.includes('404') || text.includes('no encontrada');

        const status = is404 ? '❌' : '✅';
        console.log(`${status} ${test.name} -> ${url.replace(BASE_URL, '')}`);

        if (!is404) {
          await page.screenshot({ path: `tests/screenshots/full-${test.name.toLowerCase()}.png`, fullPage: true });
        }

        // Go back to dashboard
        await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
      }
    } catch (e) {
      console.log(`⚠️ ${test.name} no encontrado`);
    }
  }

  // Also check page content
  console.log('\n=== CONTENIDO PRINCIPAL ===\n');

  // Get dashboard content
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const dashboardText = await page.textContent('body');

  console.log('Dashboard muestra:');
  console.log('  - "Bienvenido":', dashboardText.includes('Bienvenido') ? '✅' : '❌');
  console.log('  - "Atletas":', dashboardText.includes('Atletas') ? '✅' : '❌');
  console.log('  - "Clases":', dashboardText.includes('Clases') ? '✅' : '❌');
  console.log('  - "Pagos":', dashboardText.includes('Pagos') ? '✅' : '❌');
  console.log('  - "Eventos":', dashboardText.includes('Eventos') ? '✅' : '❌');

  console.log('\n✅ PRUEBAS COMPLETADAS!');
  await browser.close();
})();
