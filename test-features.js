const { chromium } = require('@playwright/test');

const BASE_URL = 'https://zaltyko.vercel.app';
const EMAIL = 'mitotabot@gmail.com';
const PASSWORD = 'Mitotabot550501@#_';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔐 Haciendo login...\n');

  // Login first
  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(5000);

  console.log('URL después de login:', page.url());

  if (!page.url().includes('/dashboard')) {
    console.log('❌ Login falló');
    await browser.close();
    return;
  }

  console.log('✅ Login exitoso!\n');

  // Test navigation items
  console.log('=== PROBANDO NAVEGACIÓN ===\n');

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', check: 'Resumen' },
    { name: 'Atletas', path: '/dashboard/athletes', check: 'Atleta' },
    { name: 'Clases', path: '/dashboard/classes', check: 'Clase' },
    { name: 'Pagos', path: '/dashboard/billing', check: 'Pago' },
    { name: 'Eventos', path: '/dashboard/events', check: 'Evento' },
    { name: 'Comunicación', path: '/dashboard/messages', check: 'Mensaje' },
    { name: 'Configuración', path: '/dashboard/settings', check: 'Configuración' },
  ];

  for (const item of navItems) {
    try {
      // Try direct URL first
      await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const text = await page.textContent('body');

      let hasContent = text.length > 100;
      let status = hasContent ? '✅' : '❌';

      console.log(`${status} ${item.name} (${item.path})`);

      if (hasContent) {
        await page.screenshot({ path: `tests/screenshots/feature-${item.name.toLowerCase()}.png`, fullPage: true });
      }
    } catch (e) {
      console.log(`❌ ${item.name} - Error: ${e.message.substring(0, 50)}`);
    }
  }

  // Test sidebar menu items
  console.log('\n=== PROBANDO SIDEBAR ===\n');

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Find all sidebar links
  const sidebarLinks = await page.locator('nav a, [class*="sidebar"] a, [class*="menu"] a').all();

  console.log(`Encontrados ${sidebarLinks.length} enlaces en sidebar/menú`);

  for (const link of sidebarLinks.slice(0, 15)) {
    try {
      const href = await link.getAttribute('href');
      const text = await link.textContent();

      if (href && text && text.trim().length > 0) {
        console.log(`  - ${text.trim()} -> ${href}`);
      }
    } catch (e) {
      // Ignore
    }
  }

  // Test adding a new athlete
  console.log('\n=== PROBANDO AGREGAR ATLETA ===\n');

  await page.goto(`${BASE_URL}/dashboard/athletes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Look for "Nuevo Atleta" or similar button
  const newButtons = await page.locator('text=Nuevo, text=Agregar, text=Añadir').all();

  if (newButtons.length > 0) {
    console.log('✅ Botón para agregar encontrado');

    // Try clicking it
    try {
      await page.click('text=Nuevo', { timeout: 5000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'tests/screenshots/feature-nuevo-atleta.png', fullPage: true });
      console.log('✅ Modal/abrir formulario para nuevo atleta abierto');
    } catch (e) {
      console.log('⚠️ No se pudo abrir el formulario');
    }
  } else {
    console.log('⚠️ No se encontró botón de agregar');
  }

  // Test adding a new class
  console.log('\n=== PROBANDO AGREGAR CLASE ===\n');

  await page.goto(`${BASE_URL}/dashboard/classes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const classButtons = await page.locator('text=Nuevo, text=Agregar, text=Crear').all();
  if (classButtons.length > 0) {
    console.log('✅ Botón para crear clase encontrado');
    await page.screenshot({ path: 'tests/screenshots/feature-nueva-clase.png', fullPage: true });
  }

  // Test settings
  console.log('\n=== PROBANDO CONFIGURACIÓN ===\n');

  await page.goto(`${BASE_URL}/dashboard/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const settingsSections = await page.locator('h1, h2, h3').all();
  console.log('Secciones de configuración:');
  for (const section of settingsSections.slice(0, 5)) {
    try {
      const text = await section.textContent();
      if (text && text.trim().length > 0) {
        console.log(`  - ${text.trim()}`);
      }
    } catch (e) {}
  }

  await page.screenshot({ path: 'tests/screenshots/feature-settings.png', fullPage: true });

  // Profile
  console.log('\n=== PROBANDO PERFIL ===\n');

  await page.goto(`${BASE_URL}/dashboard/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const profileText = await page.textContent('body');
  console.log('Perfil contiene email:', profileText.includes(EMAIL) ? '✅' : '⚠️');
  console.log('Perfil contiene nombre:', profileText.includes('Elvis') ? '✅' : '⚠️');

  await page.screenshot({ path: 'tests/screenshots/feature-profile.png', fullPage: true });

  console.log('\n✅ PRUEBAS COMPLETADAS!');
  console.log('\nScreenshots guardados en tests/screenshots/');

  await browser.close();
})();
