import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: '.auth/user.json' });
const page = await ctx.newPage();

const academyId = 'c0346990-e49f-44c5-84e7-1ad2c6579b7c';
const paths = ['dashboard', 'athletes', 'athletes/new', 'groups', 'classes', 'billing', 'settings', 'assessments', 'evaluations', 'messages', 'events'];

const results = [];
for (const path of paths) {
  try {
    await page.goto(`http://localhost:3000/app/${academyId}/${path}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);
    const errors = await page.getByText(/Failed query|This page could not be found|Application error/i).count();
    const status = errors > 0 ? '❌ ERROR' : '✓ OK';
    results.push(`${status} /${path} → ${page.url()}`);
  } catch (e) {
    results.push(`✗ GOTO FAIL /${path} → ${e.message.split('\n')[0]}`);
  }
}

console.log(results.join('\n'));
await browser.close();
