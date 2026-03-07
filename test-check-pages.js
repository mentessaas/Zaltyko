const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔍 Revisando páginas con posible contenido faltante...\n');

  const pagesToCheck = [
    { url: '/features', name: 'Características' },
    { url: '/pricing', name: 'Precios' },
    { url: '/integrations', name: 'Integraciones' },
    { url: '/academies', name: 'Academias' },
    { url: '/help', name: 'Ayuda' },
    { url: '/about', name: 'About' },
    { url: '/contact', name: 'Contacto' },
  ];

  for (const p of pagesToCheck) {
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });

    // Check main content
    const mainContent = await page.locator('main').textContent().catch(() => 'NO MAIN');
    const hasContent = mainContent && mainContent.length > 100;

    // Check for 404 or error messages
    const pageText = await page.textContent('body');
    const is404 = pageText.includes('404') || pageText.includes('Not Found');

    console.log(`${p.name} (${p.url}):`);
    console.log(`  - ¿Tiene contenido?: ${hasContent ? '✅ Sí' : '❌ NO'}`);
    console.log(`  - ¿Es 404?: ${is404 ? '❌ SÍ' : '✅ No'}`);
    console.log(`  - Título: ${await page.title()}`);
    console.log('');
  }

  // Check pricing page for specific content
  console.log('💰 Revisando página de precios...\n');
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });

  const pricingCards = await page.locator('[class*="card"], [class*="plan"], [class*="price"]').count();
  console.log(`Tarjetas de precios encontradas: ${pricingCards}`);

  await page.screenshot({ path: 'tests/e2e-pricing.png', fullPage: true });
  console.log('📸 Screenshot de precios guardado');

  // Check integrations
  console.log('\n🔌 Revisando integraciones...\n');
  await page.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle' });

  const integrationsContent = await page.locator('main').textContent().catch(() => '');
  console.log(`Contenido: ${integrationsContent.substring(0, 200)}...`);

  await page.screenshot({ path: 'tests/e2e-integrations.png', fullPage: true });
  console.log('📸 Screenshot de integraciones guardado');

  await browser.close();
  console.log('\n✅ Revisión completada!');
})();
