/**
 * E2E Full Flow Test - Test all user role dashboards
 */

import { chromium, Page } from 'playwright';

const BASE_URL = "http://localhost:3000";

const ROLES = {
  super_admin: { email: "test-superadmin@zaltyko.demo", password: "Test123!@#", dashboard: "/super-admin" },
  owner: { email: "test-owner@zaltyko.demo", password: "Test123!@#", dashboard: "/dashboard/academies" },
  admin: { email: "test-admin@zaltyko.demo", password: "Test123!@#", dashboard: "/dashboard/academies" },
};

const PAGES_BY_ROLE = {
  super_admin: [
    '/super-admin/dashboard',
    '/super-admin/academies',
    '/super-admin/users',
    '/super-admin/billing',
    '/super-admin/logs',
    '/super-admin/support'
  ],
  owner: [
    '/dashboard/academies',
    '/dashboard/athletes',
    '/dashboard/coaches',
    '/dashboard/events',
    '/dashboard/calendar',
    '/dashboard/assessments',
    '/dashboard/profile'
  ],
  admin: [
    '/dashboard/academies',
    '/dashboard/athletes',
    '/dashboard/coaches',
    '/dashboard/events',
    '/dashboard/calendar'
  ]
};

async function testPage(page: Page, path: string): Promise<{ path: string, status: 'ok' | 'error' | 'redirect', title: string, consoleErrors: number }> {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('api/dev/session')) {
      errors.push(msg.text());
    }
  });
  
  try {
    const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
    const status = response?.status() ?? 0;
    const title = await page.title();
    
    return {
      path,
      status: status >= 200 && status < 300 ? 'ok' : status >= 300 && status < 400 ? 'redirect' : 'error',
      title,
      consoleErrors: errors.length
    };
  } catch (e: any) {
    return { path, status: 'error', title: e.message.substring(0, 50), consoleErrors: 0 };
  }
}

async function testRole(role: string, config: typeof ROLES.super_admin) {
  console.log(`\n👤 ${role.toUpperCase()}`);
  console.log("=".repeat(60));
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // Login
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.fill('input[type="email"]', config.email);
    await page.fill('input[type="password"]', config.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    
    const loggedIn = page.url().includes('/dashboard') || page.url().includes('/super-admin');
    console.log(`  ${loggedIn ? '✅' : '❌'} Login: ${loggedIn ? 'OK' : 'FAILED'}`);
    
    if (!loggedIn) {
      console.log(`     URL: ${page.url()}`);
      return;
    }
    
    // Test pages
    const pages = PAGES_BY_ROLE[role as keyof typeof PAGES_BY_ROLE] || [];
    let ok = 0, errors = 0;
    
    for (const path of pages) {
      const result = await testPage(page, path);
      const icon = result.status === 'ok' ? '✅' : result.status === 'redirect' ? '🔄' : '❌';
      const errorNote = result.consoleErrors > 0 ? ` [${result.consoleErrors} errors]` : '';
      console.log(`  ${icon} ${path}${errorNote}`);
      if (result.status === 'ok') ok++; else errors++;
    }
    
    console.log(`\n  📊 Result: ${ok} OK, ${errors} with issues`);
    
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("🧪 E2E Full Flow Test - All Roles");
  console.log("================================\n");
  
  for (const [role, config] of Object.entries(ROLES)) {
    await testRole(role, config);
  }
  
  console.log("\n\n✅ All tests completed!");
}

main().catch(console.error);
