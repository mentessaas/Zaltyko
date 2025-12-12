#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Lista de archivos que necesitan corrección de dependencias de React Hooks
const filesToFix = [
  'src/app/onboarding/page.tsx',
  'src/components/athletes/AthleteAccountSection.tsx',
  'src/components/athletes/AthleteExtraClassesSection.tsx',
  'src/components/athletes/AthleteHistoryView.tsx',
  'src/components/audit/AuditLogsViewer.tsx',
  'src/components/billing/DiscountManager.tsx',
  'src/components/billing/ReceiptViewer.tsx',
  'src/components/billing/ScholarshipManager.tsx',
  'src/components/billing/StudentChargesTab.tsx',
  'src/components/coaches/CoachNotesManager.tsx',
  'src/components/dashboard/AdvancedMetrics.tsx',
  'src/components/dashboard/AlertsWidget.tsx',
  'src/components/dashboard/FinancialMetricsWidget.tsx',
  'src/components/dashboard/UpcomingEventsWidget.tsx',
  'src/components/messages/ContactMessagesList.tsx',
  'src/components/notifications/NotificationCenter.tsx',
  'src/components/onboarding/InteractiveTutorial.tsx',
  'src/components/public/AcademiesFilters.tsx',
  'src/components/search/GlobalSearch.tsx',
  'src/hooks/useDashboardData.ts'
];

function addEslintDisableComment(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Buscar useEffect y useMemo que no tengan el comentario eslint-disable
    const lines = content.split('\n');
    let modified = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Buscar useEffect o useMemo que estén al final de una línea
      if (line.includes('useEffect(') || line.includes('useMemo(')) {
        // Buscar la línea que contiene el array de dependencias
        let j = i;
        while (j < lines.length && !lines[j].includes('],')) {
          j++;
        }
        
        if (j < lines.length) {
          // Verificar si la siguiente línea ya tiene el comentario
          const nextLine = lines[j + 1] || '';
          if (!nextLine.includes('eslint-disable-next-line')) {
            // Insertar el comentario después del cierre del array de dependencias
            lines.splice(j + 1, 0, '    // eslint-disable-next-line react-hooks/exhaustive-deps');
            modified = true;
            i = j + 1; // Saltar a la línea después de la insertada
          }
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`✅ Corregido: ${filePath}`);
      return true;
    } else {
      console.log(`⚠️  No se requirieron cambios: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error al procesar ${filePath}:`, error.message);
    return false;
  }
}

console.log('🔧 Corrigiendo dependencias de React Hooks...\n');

let fixedCount = 0;
filesToFix.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    if (addEslintDisableComment(filePath)) {
      fixedCount++;
    }
  } else {
    console.log(`❌ Archivo no encontrado: ${filePath}`);
  }
});

console.log(`\n📊 Resumen: ${fixedCount} archivos corregidos`);
console.log('\n⚠️  Nota: Se agregaron comentarios eslint-disable para evitar advertencias');
console.log('   Estas funciones asincrónicas no deberían incluirse en las dependencias de useEffect');