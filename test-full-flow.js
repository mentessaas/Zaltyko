const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';
const EMAIL = 'mitotabot@gmail.com';
const PASSWORD = 'Mitotabot550501@#_';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect errors
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  console.log('=== TESTING ONBOARDING & LOGIN ===\n');

  try {
    // 1. Test Login Page
    console.log('1. Testing login page...');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('   ✅ Login page loaded');

    // 2. Test Login
    console.log('\n2. Testing login...');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForTimeout(5000);
    console.log('   URL after login:', page.url());

    // 3. Test Dashboard redirect
    if (page.url().includes('/onboarding')) {
      console.log('   ✅ Redirected to onboarding');

      // Complete onboarding
      console.log('\n3. Testing onboarding...');
      await page.waitForTimeout(3000);

      // Check for form elements
      const body = await page.textContent('body');
      if (body.includes('Nombre de tu academia')) {
        console.log('   ✅ Onboarding form detected');

        // Try to fill the form
        await page.fill('input[name="name"]', 'Academia Test');
        await page.waitForTimeout(1000);

        // Check for country dropdown
        const countrySelect = await page.$('select[name="country"]');
        if (countrySelect) {
          console.log('   ✅ Country dropdown found');
          await page.selectOption('select[name="country"]', 'ES');
        }

        // Look for submit button
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(3000);
          console.log('   ✅ Submit clicked, URL:', page.url());
        }
      }
    } else if (page.url().includes('/dashboard')) {
      console.log('   ✅ Redirected to dashboard');
    }

    // 4. Test Dashboard pages
    console.log('\n4. Testing dashboard pages...');

    const dashboardPages = [
      { url: '/dashboard/academies', name: 'Academies' },
      { url: '/dashboard/athletes', name: 'Athletes' },
      { url: '/dashboard/coaches', name: 'Coaches' },
      { url: '/dashboard/events', name: 'Events' },
      { url: '/dashboard/users', name: 'Users' },
      { url: '/dashboard/calendar', name: 'Calendar' },
    ];

    for (const p of dashboardPages) {
      try {
        await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 15000 });
        const pageErrors = errors.filter(e => e.includes('Page Error'));
        console.log(`   ${pageErrors.length === 0 ? '✅' : '⚠️'} ${p.name} - ${page.url().includes('error') || pageErrors.length > 0 ? 'ERROR' : 'OK'}`);
      } catch (e) {
        console.log(`   ❌ ${p.name} - ${e.message}`);
      }
    }

    // 5. Take screenshot of dashboard
    await page.goto(`${BASE_URL}/dashboard/academies`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/screenshots/test-dashboard-full.png', fullPage: true });
    console.log('\n   📸 Screenshot saved');

  } catch (error) {
    console.log('\n❌ TEST FAILED:', error.message);
  }

  // Report errors
  if (errors.length > 0) {
    console.log('\n=== ERRORS FOUND ===');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('\n✅ NO ERRORS FOUND');
  }

  console.log('\n=== TEST COMPLETE ===');
  await browser.close();
})();
