const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

// All routes to test
const allRoutes = [
  // English versions (from website links)
  { url: '/features', name: 'Features (EN)', expected: 'ok' },
  { url: '/pricing', name: 'Pricing (EN)', expected: 'ok' },
  { url: '/integrations', name: 'Integrations (EN)', expected: 'MISSING' },
  { url: '/academies', name: 'Academies (EN)', expected: 'MISSING' },
  { url: '/help', name: 'Help (EN)', expected: 'MISSING' },
  { url: '/about', name: 'About (EN)', expected: 'MISSING' },
  { url: '/contact', name: 'Contact (EN)', expected: 'MISSING' },

  // Spanish versions (might exist in code)
  { url: '/academias', name: 'Academias (ES)', expected: 'check' },
  { url: '/onboarding', name: 'Onboarding', expected: 'ok' },
  { url: '/login', name: 'Login (short)', expected: 'check' },
  { url: '/auth/login', name: 'Auth Login', expected: 'ok' },
];

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔍 VERIFICANDO RUTAS EXISTENTES EN EL CÓDIGO\n');

  const results = [];

  for (const route of allRoutes) {
    await page.goto(`${BASE_URL}${route.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    const title = await page.title();
    const url = page.url();

    // Check if it's actually showing the right page
    const bodyText = await page.textContent('body');
    const isHome = bodyText.includes('El software definitivo') || bodyText.includes('academia');

    results.push({
      url: route.url,
      name: route.name,
      title: title.substring(0, 50),
      isHomeContent: isHome,
      status: isHome ? '❌ FALLBACK TO HOME' : '✅ OK'
    });
  }

  console.log('| URL | Nombre | ¿Muestra Home? | Estado |');
  console.log('|-----|--------|----------------|--------|');
  for (const r of results) {
    console.log(`| ${r.url} | ${r.name} | ${r.isHomeContent ? 'Sí' : 'No'} | ${r.status} |`);
  }

  console.log('\n✅ Verificación completada!');
  await browser.close();
})();
