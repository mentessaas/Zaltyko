const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔍 Revisando páginas una por una...\n');

  // Home
  console.log('=== HOME ===');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  await page.screenshot({ path: 'tests/debug-home.png', fullPage: true });

  // Features
  console.log('\n=== FEATURES ===');
  await page.goto(`${BASE_URL}/features`, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  await page.screenshot({ path: 'tests/debug-features.png', fullPage: true });

  // Pricing
  console.log('\n=== PRICING ===');
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  await page.screenshot({ path: 'tests/debug-pricing.png', fullPage: true });

  // Integrations
  console.log('\n=== INTEGRATIONS ===');
  await page.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  await page.screenshot({ path: 'tests/debug-integrations.png', fullPage: true });

  // Check page content
  const bodyContent = await page.textContent('body');
  console.log('Body content length:', bodyContent?.length || 0);

  await browser.close();
  console.log('\n✅ Done!');
})();
