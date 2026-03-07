const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Test /features
  console.log('=== /features ===');
  await page.goto(`${BASE_URL}/features`, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  const featuresText = await page.textContent('body');
  console.log('Contains "Gestión":', featuresText.includes('Gestión'));
  console.log('Contains "módulos":', featuresText.includes('módulos'));
  console.log('First 200 chars:', featuresText.substring(0, 200));
  await page.screenshot({ path: 'tests/check-features.png' });

  // Test /integrations
  console.log('\n=== /integrations ===');
  await page.goto(`${BASE_URL}/integrations`, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  const intText = await page.textContent('body');
  console.log('First 300 chars:', intText.substring(0, 300));
  await page.screenshot({ path: 'tests/check-integrations.png' });

  // Test /contact
  console.log('\n=== /contact ===');
  await page.goto(`${BASE_URL}/contact`, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());
  console.log('URL:', page.url());
  const contactText = await page.textContent('body');
  console.log('First 300 chars:', contactText.substring(0, 300));
  await page.screenshot({ path: 'tests/check-contact.png' });

  await browser.close();
})();
