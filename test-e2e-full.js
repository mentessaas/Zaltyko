const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const results = {
    pages: [],
    errors: [],
    screenshots: []
  };

  const pagesToTest = [
    { url: '/', name: 'Home' },
    { url: '/features', name: 'Características' },
    { url: '/pricing', name: 'Precios' },
    { url: '/integrations', name: 'Integraciones' },
    { url: '/academies', name: 'Directorio Academias' },
    { url: '/help', name: 'Centro de Ayuda' },
    { url: '/about', name: 'Sobre Nosotros' },
    { url: '/contact', name: 'Contacto' },
    { url: '/onboarding', name: 'Registro' },
    { url: '/auth/login', name: 'Login' },
  ];

  console.log('🧪 Probando páginas de Zaltyko...\n');

  for (const p of pagesToTest) {
    try {
      console.log(`📄 Probando: ${p.name} (${p.url})`);
      await page.goto(`${BASE_URL}${p.url}`, { waitUntil: 'networkidle', timeout: 30000 });

      // Get page title
      const title = await page.title();

      // Count buttons
      const buttons = await page.locator('button, a[href]').count();

      // Check for console errors
      const errors = [];
      page.on('console', msg => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      results.pages.push({
        name: p.name,
        url: p.url,
        title,
        buttons,
        status: '✅ OK'
      });

      console.log(`   ✓ Title: ${title}`);
      console.log(`   ✓ Botones/Enlaces: ${buttons}`);

    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.errors.push({ page: p.name, error: err.message });
    }
  }

  // Test navigation menu
  console.log('\n🔗 Probando navegación...\n');

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Find all menu links
  const menuLinks = await page.locator('nav a, header a').all();
  console.log(`Encontrados ${menuLinks.length} enlaces en el menú/header`);

  // Test clicking on main CTA buttons
  console.log('\n🎯 Probando botones principales...\n');

  const ctaButtons = [
    { selector: 'text=Crear', name: 'Botón Crear Academia' },
    { selector: 'text=Iniciar sesión', name: 'Botón Login' },
  ];

  for (const btn of ctaButtons) {
    try {
      const element = page.locator(btn.selector).first();
      if (await element.isVisible({ timeout: 5000 })) {
        console.log(`✓ ${btn.name} está visible`);
      }
    } catch (e) {
      console.log(`⚠️ ${btn.name} no encontrado`);
    }
  }

  // Test login page form
  console.log('\n📝 Probando formulario de login...\n');
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });

  const emailInput = page.locator('input[type="email"]');
  const passwordInput = page.locator('input[type="password"]');
  const submitBtn = page.locator('button[type="submit"]');

  if (await emailInput.isVisible()) {
    console.log('✓ Campo email encontrado');
    await emailInput.fill('test@example.com');
  }

  if (await passwordInput.isVisible()) {
    console.log('✓ Campo password encontrado');
    await passwordInput.fill('testpassword');
  }

  if (await submitBtn.isVisible()) {
    console.log('✓ Botón submit encontrado');
    await page.screenshot({ path: 'tests/e2e-login-form.png', fullPage: true });
    console.log('📸 Screenshot guardado: tests/e2e-login-form.png');
  }

  // Test registration page form
  console.log('\n📝 Probando formulario de registro...\n');
  await page.goto(`${BASE_URL}/onboarding`, { waitUntil: 'networkidle' });

  const nameInput = page.locator('input[name="name"], input[placeholder*="nombre"], input[placeholder*="Nombre"]').first();
  const regEmailInput = page.locator('input[type="email"]').first();
  const regPasswordInput = page.locator('input[type="password"]').first();
  const regSubmitBtn = page.locator('button[type="submit"]');

  if (await nameInput.isVisible()) {
    console.log('✓ Campo nombre encontrado');
    await nameInput.fill('Usuario Prueba');
  }

  if (await regEmailInput.isVisible()) {
    console.log('✓ Campo email encontrado');
    await regEmailInput.fill('test@example.com');
  }

  if (await regPasswordInput.isVisible()) {
    console.log('✓ Campo password encontrado');
    await regPasswordInput.fill('TestPassword123!');
  }

  await page.screenshot({ path: 'tests/e2e-registration-form.png', fullPage: true });
  console.log('📸 Screenshot guardado: tests/e2e-registration-form.png');

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 RESUMEN DE PRUEBAS');
  console.log('='.repeat(50));
  console.log(`\nTotal páginas probadas: ${results.pages.length}`);
  console.log(`Errores encontrados: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\n❌ Errores:');
    results.errors.forEach(e => console.log(`   - ${e.page}: ${e.error}`));
  }

  console.log('\n✅ Pruebas completadas!');

  await browser.close();
})();
