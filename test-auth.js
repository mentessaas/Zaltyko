const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🧪 Probando funcionalidades de usuario...\n');

  // Test 1: Onboarding - Registro
  console.log('=== 1. ONBOARDING - Registro ===');
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle' });
  console.log('URL:', page.url());
  console.log('Título:', await page.title());
  await page.screenshot({ path: 'tests/screenshots/test-onboarding-1.png', fullPage: true });

  // Llenar formulario de registro
  console.log('\n📝 Llenando formulario de registro...');

  // Nombre
  const nameInput = page.locator('input[name="name"], input[placeholder*="nombre"], input[id="name"]').first();
  if (await nameInput.isVisible()) {
    await nameInput.fill('Elvis Tester');
    console.log('✓ Nombre completado');
  }

  // Email
  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.isVisible()) {
    await emailInput.fill('mitotabot@gmail.com');
    console.log('✓ Email completado');
  }

  // Password
  const passwordInputs = await page.locator('input[type="password"]').all();
  if (passwordInputs.length >= 1) {
    await passwordInputs[0].fill('Mitotabot550501@#_');
    console.log('✓ Password completado');
  }
  if (passwordInputs.length >= 2) {
    await passwordInputs[1].fill('Mitotabot550501@#_');
    console.log('✓ Confirmación password completado');
  }

  await page.screenshot({ path: 'tests/screenshots/test-onboarding-2.png', fullPage: true });

  // Click en crear cuenta
  const submitBtn = page.locator('button[type="submit"]');
  if (await submitBtn.isVisible()) {
    console.log('\n🔄 Enviando formulario...');
    await submitBtn.click();
    await page.waitForTimeout(3000);
    console.log('URL después de submit:', page.url());
    await page.screenshot({ path: 'tests/screenshots/test-onboarding-3.png', fullPage: true });
  }

  // Test 2: Login
  console.log('\n=== 2. LOGIN ===');
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  console.log('URL:', page.url());
  console.log('Título:', await page.title());
  await page.screenshot({ path: 'tests/screenshots/test-login-1.png', fullPage: true });

  // Llenar formulario de login
  console.log('\n📝 Llenando formulario de login...');

  const loginEmail = page.locator('input[type="email"]');
  const loginPassword = page.locator('input[type="password"]');

  if (await loginEmail.isVisible()) {
    await loginEmail.fill('mitotabot@gmail.com');
    console.log('✓ Email completado');
  }

  if (await loginPassword.isVisible()) {
    await loginPassword.fill('Mitotabot550501@#_');
    console.log('✓ Password completado');
  }

  await page.screenshot({ path: 'tests/screenshots/test-login-2.png', fullPage: true });

  // Click en iniciar sesión
  const loginBtn = page.locator('button[type="submit"]');
  if (await loginBtn.isVisible()) {
    console.log('\n🔄 Iniciando sesión...');
    await loginBtn.click();
    await page.waitForTimeout(5000);
    console.log('URL después de login:', page.url());
    await page.screenshot({ path: 'tests/screenshots/test-login-3.png', fullPage: true });
  }

  // Verificar si hay errores
  const pageText = await page.textContent('body');
  if (pageText.includes('incorrectas') || pageText.includes('error') || pageText.includes('inválido')) {
    console.log('\n⚠️ ERROR detected in page');
  }

  console.log('\n✅ Pruebas completadas!');
  await browser.close();
})();
