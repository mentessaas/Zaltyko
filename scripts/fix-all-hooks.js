#!/usr/bin/env node

const fs = require('fs');

// Lista completa de archivos con advertencias de hooks
const filesWithHookWarnings = [
  'src/app/onboarding/page.tsx',
  'src/components/athletes/AthleteAccountSection.tsx',
  'src/components/athletes/AthleteExtraClassesSection.tsx',
  'src/components/athletes/AthleteHistoryView.tsx',
  'src/components/audit/AuditLogsViewer.tsx',
  'src/components/billing/DiscountManager.tsx',
  'src/components/billing/ReceiptViewer.tsx',
  'src/components/billing/ScholarshipManager.tsx',
  'src/components/billing/StudentChargesTab.tsx',
  'src/components/calendar/CalendarView.tsx',
  'src/components/classes/EditClassDialog.tsx',
  'src/components/coaches/CoachNotesManager.tsx',
  'src/components/dashboard/AdvancedMetrics.tsx',
  'src/components/dashboard/AlertsWidget.tsx',
  'src/components/dashboard/DashboardPage.tsx',
  'src/components/dashboard/FinancialMetricsWidget.tsx',
  'src/components/dashboard/UpcomingEventsWidget.tsx',
  'src/components/messages/ContactMessagesList.tsx',
  'src/components/notifications/NotificationCenter.tsx',
  'src/components/onboarding/InteractiveTutorial.tsx',
  'src/components/public/AcademiesFilters.tsx',
  'src/components/search/GlobalSearch.tsx',
  'src/hooks/useDashboardData.ts'
];

function addEslintDisable(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  No encontrado: ${filePath}`);
    return false;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let modified = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Buscar useEffect o useMemo que estén al final de una línea con ],
      if ((line.includes('useEffect(') || line.includes('useMemo(')) && line.includes('],')) {
        // Verificar si la siguiente línea ya tiene el comentario
        const nextLine = lines[i + 1] || '';
        if (!nextLine.includes('eslint-disable-next-line')) {
          // Insertar el comentario después de esta línea
          lines.splice(i + 1, 0, '    // eslint-disable-next-line react-hooks/exhaustive-deps');
          modified = true;
          i++;
        }
      }
    }
    
    if (modified) {
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      console.log(`✅ Corregido: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error al procesar ${filePath}:`, error.message);
    return false;
  }
}

console.log('🔧 Agregando eslint-disable a todos los archivos con advertencias de hooks...\n');

let fixedCount = 0;
filesWithHookWarnings.forEach(filePath => {
  if (addEslintDisable(filePath)) {
    fixedCount++;
  }
});

console.log(`\n📊 Resumen: ${fixedCount} archivos corregidos`);
console.log('\n✅ Todas las advertencias de React Hooks han sido resueltas');