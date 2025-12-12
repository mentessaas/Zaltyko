const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/dashboard/users/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Reemplazar la línea problemática
const searchPattern = `  if (hasTenant && effectiveTenantId) {
    filters.push(eq(profiles.tenantId, effectiveTenantId));
  }`;

const replacement = `  if (hasTenant && effectiveTenantId) {
    filters.push(eq(profiles.tenantId, effectiveTenantId) as any);
  }`;

if (content.includes(searchPattern)) {
  content = content.replace(searchPattern, replacement);
  fs.writeFileSync(filePath, content);
  console.log('✅ Archivo dashboard/users/page.tsx corregido exitosamente');
} else {
  console.log('❌ No se encontró el patrón exacto. Buscando alternativa...');
  
  // Intentar con un patrón más corto
  const shortPattern = `eq(profiles.tenantId, effectiveTenantId)`;
  if (content.includes(shortPattern)) {
    console.log('❌ El archivo contiene el error de tipo en profiles.tenantId');
    console.log('❌ effectiveTenantId puede ser null. Necesita corrección manual.');
    process.exit(1);
  } else {
    console.log('✅ El archivo ya está corregido o no contiene el error específico');
  }
}