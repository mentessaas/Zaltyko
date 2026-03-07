const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Pricing
  console.log('=== PRICING ===');
  await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle' });

  // Wait for content to load
  await page.waitForTimeout(3000);

  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  // Check if there's content in main
  const mainContent = await page.locator('main').textContent().catch(() => 'NO MAIN');
  console.log('Main content length:', mainContent?.length || 0);
  console.log('Main content preview:', mainContent?.substring(0, 200) || 'NONE');

  // Scroll down
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'tests/debug-pricing2.png', fullPage: true });
  console.log('Screenshot saved');

  // Check for pricing cards
  const pricingText = await page.textContent('body');
  console.log('\nPricing page contains:');
  console.log('  - "Plan":', pricingText.includes('Plan'));
  console.log('  - "Free":', pricingText.includes('Free'));
  console.log('  - "€":', pricingText.includes('€'));
  console.log('  - "mes":', pricingText.includes('mes'));

  await browser.close();
})();
