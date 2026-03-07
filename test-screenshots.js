const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('📸 Capturando screenshots de todas las páginas...\n');

  const pages = [
    { url: '/', name: '01-home' },
    { url: '/features', name: '02-features' },
    { url: '/pricing', name: '03-pricing' },
    { url: '/academias', name: '04-academias' },
    { url: '/onboarding', name: '05-onboarding' },
    { url: '/auth/login', name: '06-login' },
  ];

  for (const p of pages) {
    console.log(`📄 ${p.name}: ${p.url}`);
    await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: `tests/screenshots/${p.name}.png`, fullPage: true });
  }

  console.log('\n✅ Screenshots guardados en tests/screenshots/');

  // Also verify the pages work
  console.log('\n🔍 Verificando que las páginas funcionan...\n');

  // Home
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const homeText = await page.textContent('body');
  console.log('Home:', homeText.includes('academia') ? '✅' : '❌');

  // Features
  await page.goto(`${BASE_URL}/features`, { waitUntil: 'networkidle' });
  const featuresText = await page.textContent('body');
  console.log('Features:', featuresText.includes('gestión') ? '✅' : '❌');

  // Pricing
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });
  const pricingText = await page.textContent('body');
  console.log('Pricing:', pricingText.includes('Plan') ? '✅' : '❌');

  // Academias
  await page.goto(`${BASE_URL}/academias`, { waitUntil: 'networkidle' });
  const academiasText = await page.textContent('body');
  console.log('Academias:', academiasText.includes('Academia') ? '✅' : '❌');

  // Login
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  const loginText = await page.textContent('body');
  console.log('Login:', loginText.includes('email') ? '✅' : '❌');

  // Onboarding
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle' });
  const onboardingText = await page.textContent('body');
  console.log('Onboarding:', onboardingText.includes('cuenta') || onboardingText.includes('academy') ? '✅' : '❌');

  console.log('\n✅ Todo verificado!');

  await browser.close();
})();
