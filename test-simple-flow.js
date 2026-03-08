const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';
const EMAIL = 'mitotabot@gmail.com';
const PASSWORD = 'Mitotabot550501@#_';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: undefined // Start fresh
  });
  const page = await context.newPage();

  console.log('=== TESTING WITH SESSION MAINTAINED ===\n');

  try {
    // 1. Login
    console.log('1. Logging in...');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(5000);

    console.log('   URL after login:', page.url());

    // 2. Check what's on the page
    const bodyText = await page.textContent('body');
    console.log('   Page contains:', bodyText.substring(0, 200));

    // 3. If redirected to onboarding, try to complete it
    if (page.url().includes('onboarding')) {
      console.log('\n2. Onboarding detected, trying to fill form...');

      // Wait for form to load
      await page.waitForTimeout(2000);

      // Check for academy name input
      const nameInput = await page.$('input[name="name"]');
      if (nameInput) {
        await nameInput.fill('Academia Prueba');
        console.log('   ✅ Filled academy name');
      }

      // Check for country select
      const countrySelect = await page.$('select[name="country"]');
      if (countrySelect) {
        await countrySelect.selectOption('ES');
        console.log('   ✅ Selected country');
      }

      // Check for submit button
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForTimeout(5000);
        console.log('   ✅ Submitted, URL:', page.url());
      }
    }

    // 4. Try to access dashboard
    console.log('\n3. Testing dashboard access...');
    await page.goto(`${BASE_URL}/dashboard/academies`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(3000);
    console.log('   URL:', page.url());

    // Check what's on the page
    const dashboardContent = await page.textContent('body');
    console.log('   Contains:', dashboardContent.substring(0, 300));

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);
  }

  console.log('\n=== DONE ===');
  await browser.close();
})();
