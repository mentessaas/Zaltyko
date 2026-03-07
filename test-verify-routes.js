const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Routes to test (corrected)
  const routes = [
    { url: '/', expected: 'home' },
    { url: '/features', expected: 'features' },
    { url: '/pricing', expected: 'pricing' },
    { url: '/academias', expected: 'academies' },  // NOTE: it's academias NOT academies
    { url: '/onboarding', expected: 'onboarding' },
    { url: '/auth/login', expected: 'login' },
    { url: '/integrations', expected: '404' },
    { url: '/help', expected: '404' },
    { url: '/contact', expected: '404' },
    { url: '/about', expected: '404' },
  ];

  console.log('🧪 VERIFICACIÓN FINAL DE RUTAS\n');
  console.log('='.repeat(60));

  for (const route of routes) {
    const response = await page.goto(`${BASE_URL}${route.url}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    const status = response.status();
    const title = await page.title();
    const text = await page.textContent('body').catch(() => '');

    const is404 = status === 404 || text.includes('404') || text.includes('no encontrada');

    let result = '❌';
    if (route.expected === '404' && is404) {
      result = '✅ 404 correcto';
    } else if (route.expected !== '404' && !is404 && status === 200) {
      result = '✅ OK';
    } else if (is404) {
      result = '❌ 404 inesperado';
    } else {
      result = '⚠️ ' + status;
    }

    console.log(`${result} ${route.url.padEnd(15)} | ${title.substring(0, 35)}`);
  }

  console.log('='.repeat(60));

  // Test navbar clicks
  console.log('\n🔗 Probando clicks del navbar...\n');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const navTests = [
    { text: 'Academias', check: '/academias' },
    { text: 'Precios', check: '/pricing' },
    { text: 'Crear academy', check: '/onboarding' },
    { text: 'Iniciar sesión', check: '/auth/login' },
  ];

  for (const nav of navTests) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    try {
      await page.click(`text=${nav.text}`, { timeout: 5000 });
      await page.waitForTimeout(1000);
      const url = page.url();
      const works = url.includes(nav.check);
      console.log(`${works ? '✅' : '❌'} Click "${nav.text}" -> ${url.replace(BASE_URL, '')}`);
    } catch (e) {
      console.log(`❌ Click "${nav.text}" falló`);
    }
  }

  console.log('\n✅ Verificación completada!');
  await browser.close();
})();
