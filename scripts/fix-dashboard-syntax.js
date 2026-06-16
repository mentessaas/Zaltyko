#!/usr/bin/env node

const fs = require('fs');

const filePath = 'src/components/dashboard/DashboardPage.tsx';

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Corregir comentarios mal formateados en línea 131
  content = content.replace(
    /{\/\*\/\/ Prioridad: \*\/} Grupos → Entrenadores/,
    '// Prioridad: Grupos → Entrenadores'
  );
  
  // Corregir comentarios mal formateados en línea 185
  content = content.replace(
    /{\/\*\/\/ KPIs principales \(solo 4: \*\/} Atletas, Entrenadores, Grupos, % Asistencia\)/,
    '// KPIs principales (solo 4: Atletas, Entrenadores, Grupos, % Asistencia)'
  );
  
  // Corregir comentarios en JSX que están mal formateados
  content = content.replace(
    /{\/\*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps \*\/}/g,
    ''
  );
  
  // Eliminar comentarios vacíos o mal formateados
  content = content.replace(
    /{\/\*\/\/ \*\/}/g,
    ''
  );
  
  // Corregir cualquier otro comentario mal formateado similar
  content = content.replace(
    /{\/\*\/\/ (.+?) \*\/}/g,
    '{/* $1 */}'
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('✅ DashboardPage.tsx corregido - sintaxis de comentarios arreglada');
} catch (error) {
  console.error('❌ Error al corregir DashboardPage.tsx:', error.message);
}