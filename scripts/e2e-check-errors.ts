/**
 * E2E Test - Check what causes 500 errors on dashboard
 */

import { chromium } from 'playwright';

const BASE_URL = "http://localhost:3000";

async function checkDashboardErrors() {
  console.log("🔍 Investigating 500 errors on dashboard...\n");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const errors: string[] = [];
  const requests: { url: string, status: number }[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('response', response => {
    if (response.status() >= 500) {
      requests.push({ url: response.url(), status: response.status() });
    }
  });
  
  try {
    // Login as super_admin
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"]', "test-superadmin@zaltyko.demo");
    await page.fill('input[type="password"]', "Test123!@#");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    console.log("📍 Current URL:", page.url());
    console.log("\n📊 500 Errors detected:");
    
    for (const req of requests) {
      console.log(`  ❌ ${req.status}: ${req.url}`);
    }
    
    console.log("\n📝 Console errors:");
    for (const err of errors) {
      console.log(`  - ${err.substring(0, 150)}`);
    }
    
    // Check which dashboard pages work
    console.log("\n🧪 Testing individual dashboard pages:");
    const pages = [
      '/dashboard/academies',
      '/dashboard/athletes', 
      '/dashboard/coaches',
      '/dashboard/events',
      '/dashboard/calendar',
      '/super-admin/dashboard',
      '/super-admin/academies',
      '/super-admin/users'
    ];
    
    for (const path of pages) {
      requests.length = 0;
      errors.length = 0;
      
      await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
      const has500 = requests.filter(r => r.status >= 500).length;
      const status = has500 > 0 ? `❌ ${has500} errors` : '✅';
      console.log(`  ${status} ${path}`);
      
      if (has500 > 0) {
        requests.filter(r => r.status >= 500).forEach(r => {
          console.log(`       → ${r.url.replace(BASE_URL, '')}`);
        });
      }
    }
    
  } finally {
    await browser.close();
  }
}

checkDashboardErrors().catch(console.error);
