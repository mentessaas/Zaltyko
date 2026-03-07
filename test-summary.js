const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const routes = [
    '/',
    '/features',
    '/pricing',
    '/integrations',
    '/academies',
    '/academias',
    '/help',
    '/about',
    '/contact',
    '/onboarding',
    '/auth/login',
    '/login',
  ];

  console.log('📊 RESUMEN DE RUTAS DE ZALTYKO\n');
  console.log('='.repeat(60));

  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 10000 });

    const title = await page.title();
    const url = page.url();
    const text = await page.textContent('body').catch(() => '');

    let status = '❌ 404';
    if (text.includes('404') || text.includes('no encontrada')) {
      status = '❌ 404 - No existe';
    } else if (url !== BASE_URL + '/' && url !== BASE_URL + route) {
      status = '🔄 Redirect';
    } else if (text.includes('El software definitivo')) {
      status = '🏠 Home';
    } else if (text.length > 200) {
      status = '✅ Page';
    }

    const routeExists = !status.includes('404');
    console.log(`${routeExists ? '✅' : '❌'} ${route.padEnd(15)} ${status.padEnd(20)} - ${title.substring(0, 40)}`);
  }

  console.log('='.repeat(60));

  // Now test buttons on home page
  console.log('\n🎯 Probando botones de la Home...\n');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Click "Características"
  try {
    await page.click('text=Características', { timeout: 5000 });
    console.log('✅ Click en "Características" ->', page.url());
  } catch (e) {
    console.log('❌ Click en "Características" falló');
  }

  // Go back and try another
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Click "Precios"
  try {
    await page.click('text=Precios', { timeout: 5000 });
    console.log('✅ Click en "Precios" ->', page.url());
  } catch (e) {
    console.log('❌ Click en "Precios" falló');
  }

  await browser.close();
  console.log('\n✅ Listo!');
})();
