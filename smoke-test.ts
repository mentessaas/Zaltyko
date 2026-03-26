import { chromium } from '@playwright/test';

async function runSmokeTest() {
  console.log('🚀 Starting Zaltyko Smoke Test...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors = [];
  const appUrl = 'https://zaltyko.vercel.app';
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  
  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  try {
    // 1. Test Login Page
    console.log('📋 Test 1: Login Page');
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 30000 });
    const loginTitle = await page.title();
    console.log(`   Title: ${loginTitle}`);
    
    // Wait for redirect to auth page
    await page.waitForURL('**/auth/**', { timeout: 10000 }).catch(() => {});
    console.log(`   Redirected to: ${page.url()}`);
    
    // Check if login page has some content (email input, buttons, etc)
    const pageContent = await page.content();
    const hasLoginContent = pageContent.includes('email') || pageContent.includes('login') || pageContent.includes('sign');
    console.log(`   Login page has content: ${hasLoginContent}`);
    
    if (!hasLoginContent) {
      errors.push('Login page content not found');
    }
    console.log('   ✅ Login page loaded\n');

    // 2. Test Dashboard (try direct access if logged in, or redirect)
    console.log('📋 Test 2: Dashboard Access');
    try {
      // Try accessing dashboard directly
      await page.goto(`${appUrl}/dashboard`, { waitUntil: 'networkidle', timeout: 30000 });
      const dashboardUrl = page.url();
      console.log(`   Current URL: ${dashboardUrl}`);
      
      // If redirected to login, that's expected for unauthenticated
      if (dashboardUrl.includes('login') || dashboardUrl.includes('signin')) {
        console.log('   ⚠️  Redirected to login (expected for unauthenticated)');
      } else {
        console.log('   ✅ Dashboard accessible');
      }
    } catch (e) {
      errors.push(`Dashboard test failed: ${(e as Error).message}`);
    }

    // 3. Test API Health (optional - just ping the API)
    console.log('📋 Test 3: API Health Check');
    try {
      const response = await page.request.get(`${appUrl}/api/health`).catch(() => null);
      if (response && response.ok()) {
        console.log('   ✅ API Health check passed');
      } else {
        console.log('   ⚠️  API health endpoint not available (may be expected)');
      }
    } catch (e) {
      console.log('   ⚠️  API check skipped');
    }

  } catch (e) {
    errors.push(`Critical error: ${(e as Error).message}`);
  } finally {
    await browser.close();
  }

  // Report Results
  console.log('\n' + '='.repeat(50));
  console.log('📊 SMOKE TEST RESULTS');
  console.log('='.repeat(50));
  
  if (errors.length === 0) {
    console.log('✅ All tests passed!');
    console.log('\nHEARTBEAT_OK');
  } else {
    console.log(`❌ ${errors.length} error(s) found:\n`);
    errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err}`);
    });
    console.log('\n--- END OF SMOKE TEST REPORT ---');
    process.exit(1);
  }
}

runSmokeTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
