const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const pages = [
    { url: '/integrations', name: 'Integraciones' },
    { url: '/help', name: 'Ayuda' },
    { url: '/contact', name: 'Contacto' },
    { url: '/about', name: 'Sobre Nosotros' },
  ];

  console.log('✅ VERIFICANDO NUEVAS PÁGINAS\n');

  for (const p of pages) {
    console.log(`📄 ${p.name}: ${p.url}`);
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `tests/screenshots/${p.name.toLowerCase().replace(' ', '-')}.png`, fullPage: true });
    console.log('   ✅Screenshot guardado');
  }

  console.log('\n✅ Todas las páginas verificadas!');
  await browser.close();
})();
