/**
 * E2E Auth Flow Test with Playwright
 * Tests login and dashboard access for each user role
 */

import { chromium, Browser, Page } from 'playwright';

const BASE_URL = "http://localhost:3000";

const TEST_USERS = [
  { email: "test-superadmin@zaltyko.demo", password: "Test123!@#", role: "super_admin" },
  { email: "test-owner@zaltyko.demo", password: "Test123!@#", role: "owner" },
  { email: "test-admin@zaltyko.demo", password: "Test123!@#", role: "admin" },
  { email: "test-coach@zaltyko.demo", password: "Test123!@#", role: "coach" },
  { email: "test-athlete@zaltyko.demo", password: "Test123!@#", role: "athlete" },
  { email: "test-parent@zaltyko.demo", password: "Test123!@#", role: "parent" },
];

async function testLoginFlow(browser: Browser, user: typeof TEST_USERS[0]) {
  console.log(`\n👤 Testing ${user.role.toUpperCase()}`);
  console.log("-".repeat(50));
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console error: ${msg.text()}`);
    }
  });
  
  try {
    // 1. Go to login page
    console.log(`  📄 Going to ${BASE_URL}/auth/login`);
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 });
    const loginTitle = await page.title();
    console.log(`  ✓ Page loaded: "${loginTitle}"`);
    
    // 2. Fill login form
    console.log(`  🔐 Logging in as ${user.email}`);
    await page.fill('input[type="email"]', user.email);
    await page.fill('input[type="password"]', user.password);
    
    // 3. Click login button
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    // 4. Check where we ended up
    const finalUrl = page.url();
    console.log(`  📍 Final URL: ${finalUrl}`);
    
    // 5. Check for errors
    if (errors.length > 0) {
      console.log(`  ⚠️ Console errors (${errors.length}):`);
      errors.slice(0, 3).forEach(e => console.log(`     - ${e.substring(0, 100)}`));
    } else {
      console.log(`  ✅ No console errors`);
    }
    
    // 6. Check page title
    const finalTitle = await page.title();
    console.log(`  📄 Final title: "${finalTitle}"`);
    
    // 7. Determine if redirected to dashboard or still on login
    if (finalUrl.includes('/dashboard') || finalUrl.includes('/super-admin')) {
      console.log(`  ✅ SUCCESS: Redirected to dashboard!`);
    } else if (finalUrl.includes('/onboarding')) {
      console.log(`  🔄 REDIRECTED to onboarding (profile incomplete)`);
    } else if (finalUrl.includes('/auth/login')) {
      console.log(`  ❌ FAILED: Still on login page`);
    } else {
      console.log(`  🔄 URL: ${finalUrl}`);
    }
    
  } catch (error: any) {
    console.log(`  ❌ Error: ${error.message.substring(0, 100)}`);
  } finally {
    await context.close();
  }
}

async function runTests() {
  console.log("🧪 E2E Auth Flow Tests with Playwright");
  console.log("====================================\n");
  
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    console.log("✅ Browser launched");
    
    for (const user of TEST_USERS) {
      await testLoginFlow(browser, user);
    }
    
  } catch (error: any) {
    console.error("Browser error:", error.message);
  } finally {
    if (browser) await browser.close();
  }
  
  console.log("\n\n✅ All tests completed!");
}

runTests().catch(console.error);
