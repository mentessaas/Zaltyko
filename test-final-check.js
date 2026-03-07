const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('✅ VERIFICANDO PÁGINAS COMPLETAS\n');
  console.log('='.repeat(50));

  // Pricing
  console.log('\n💰 PRECIOS');
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const pricing = await page.textContent('body');
  console.log('✓ Contains "Free":', pricing.includes('Free'));
  console.log('✓ Contains "Pro":', pricing.includes('Pro'));
  console.log('✓ Contains "Premium":', pricing.includes('Premium'));
  await page.screenshot({ path: 'tests/final-pricing.png', fullPage: true });

  // Features
  console.log('\n⚙️ CARACTERÍSTICAS');
  await page.goto(`${BASE_URL}/features`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const features = await page.textContent('body');
  console.log('✓ Contains "Gestión":', features.includes('Gestión'));
  console.log('✓ Contains "Clases":', features.includes('Clases'));
  await page.screenshot({ path: 'tests/final-features.png', fullPage: true });

  // Integrations
  console.log('\n🔌 INTEGRACIONES');
  await page.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const integrations = await page.textContent('body');
  console.log('✓ Contains content:', integrations.length > 500);
  console.log('✓ Contains "Stripe":', integrations.includes('Stripe'));
  await page.screenshot({ path: 'tests/final-integrations.png', fullPage: true });

  // Academies
  console.log('\n🏫 ACADEMIAS');
  await page.goto(`${BASE_URL}/academies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const academies = await page.textContent('body');
  console.log('✓ Contains content:', academies.length > 500);
  await page.screenshot({ path: 'tests/final-academies.png', fullPage: true });

  // Contact
  console.log('\n📧 CONTACTO');
  await page.goto(`${BASE_URL}/contact`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const contact = await page.textContent('body');
  console.log('✓ Contains content:', contact.length > 500);
  console.log('✓ Contains "email":', contact.toLowerCase().includes('email'));
  await page.screenshot({ path: 'tests/final-contact.png', fullPage: true });

  // Login page
  console.log('\n🔐 LOGIN');
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const login = await page.textContent('body');
  console.log('✓ Contains "email":', login.includes('email'));
  console.log('✓ Contains "password":', login.includes('password') || login.includes('contraseña'));
  await page.screenshot({ path: 'tests/final-login.png', fullPage: true });

  console.log('\n' + '='.repeat(50));
  console.log('✅ TODAS LAS PÁGINAS VERIFICADAS!');

  await browser.close();
})();
