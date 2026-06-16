#!/usr/bin/env node

const fs = require('fs');

// Revertir cambios de imágenes que causaron errores
const filesToFix = [
  'src/app/(site)/Navbar.tsx',
  'src/app/(site)/Footer.tsx',
  'src/components/navigation/GlobalTopNav.tsx',
  'src/components/dashboard/DashboardPage.tsx'
];

filesToFix.forEach(filePath => {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  No encontrado: ${filePath}`);
      return;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Revertir Image de vuelta a img
    content = content.replace(/import Image from "next\/image";\n/g, '');
    content = content.replace(/<Image/g, '<img');
    content = content.replace(/\/>\n/g, ' />\n');
    
    // Corregir rutas de imágenes que se convirtieron en expresiones regulares
    content = content.replace(/src=\{(\/[^}]+\/[^}]+\/[^}]+\.svg)\}/g, 'src="$1"');
    content = content.replace(/src=\{(\/branding\/zaltyko\/[^}]+\.svg)\}/g, 'src="$1"');
    
    // Corregir comentarios mal formateados en DashboardPage
    content = content.replace(/{\/\*\/\/ Determinar si debe mostrar \*\/} CTA/g, '// Determinar si debe mostrar CTA');
    content = content.replace(/{\/\*\/\/ Determinar si debe mostrar \*\/} clases/g, '// Determinar si debe mostrar clases');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Revertido: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error al revertir ${filePath}:`, error.message);
  }
});

console.log('\n✅ Cambios de imágenes revertidos correctamente');
console.log('📝 Los archivos ahora usan <img> en lugar de <Image>');