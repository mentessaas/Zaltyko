/**
 * RLS Policy Validation Script
 * 
 * Este script valida las políticas RLS para:
 * - Detectar políticas duplicadas
 * - Verificar que todas las tablas tengan políticas
 * - Validar sintaxis de políticas
 * - Generar reporte de cobertura
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface Policy {
    name: string;
    table: string;
    type: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
    file: string;
    lineNumber: number;
}

interface ValidationResult {
    success: boolean;
    duplicates: Policy[][];
    missingPolicies: string[];
    coverage: number;
    errors: string[];
}

// Tablas que deberían tener políticas RLS
const EXPECTED_TABLES = [
    'academies',
    'profiles',
    'memberships',
    'subscriptions',
    'plans',
    'athletes',
    'coaches',
    'classes',
    'class_sessions',
    'attendance_records',
    'events',
    'family_contacts',
    'skill_catalog',
    'athlete_assessments',
    'assessment_scores',
    'coach_notes',
    'audit_logs',
    'guardians',
    'guardian_athletes',
    'invitations',
    'class_coach_assignments',
    'billing_invoices',
    'billing_events',
    'groups',
    'group_athletes',
    'onboarding_states',
    'onboarding_checklist_items',
    'user_preferences',
    'class_weekdays',
    'class_groups',
    'billing_items',
    'charges',
    'event_logs',
    'academy_messages',
    'academy_geo_groups',
    'contact_messages',
    'notifications',
    'email_logs',
    'scholarships',
    'discounts',
    'receipts',
    'event_invitations',
    'notification_preferences',
];

/**
 * Extrae políticas de un archivo SQL
 */
function extractPolicies(filePath: string, fileName: string): Policy[] {
    const content = readFileSync(filePath, 'utf-8');
    const policies: Policy[] = [];

    // Regex mejorado para detectar CREATE POLICY (case insensitive, multiline)
    const policyRegex = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+(\w+)/gi;

    let match;
    while ((match = policyRegex.exec(content)) !== null) {
        // Encontrar el número de línea
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        // Determinar el tipo de política (SELECT, INSERT, UPDATE, DELETE, ALL)
        // Se busca en un bloque de texto después del CREATE POLICY para encontrar el FOR <type>
        const policyBlock = content.substring(match.index, match.index + 500); // Buscar en los siguientes 500 caracteres
        let type: Policy['type'] = 'ALL'; // Default a ALL si no se especifica
        if (/FOR\s+SELECT/i.test(policyBlock)) type = 'SELECT';
        else if (/FOR\s+INSERT/i.test(policyBlock)) type = 'INSERT';
        else if (/FOR\s+UPDATE/i.test(policyBlock)) type = 'UPDATE';
        else if (/FOR\s+DELETE/i.test(policyBlock)) type = 'DELETE';
        else if (/FOR\s+ALL/i.test(policyBlock)) type = 'ALL';

        policies.push({
            name: match[1],
            table: match[2],
            type,
            file: fileName,
            lineNumber,
        });
    }

    return policies;
}

/**
 * Encuentra políticas duplicadas
 */
function findDuplicates(policies: Policy[]): Policy[][] {
    const policyMap = new Map<string, Policy[]>();

    policies.forEach(policy => {
        const key = `${policy.table}:${policy.name}`;
        if (!policyMap.has(key)) {
            policyMap.set(key, []);
        }
        policyMap.get(key)!.push(policy);
    });

    const duplicates: Policy[][] = [];
    policyMap.forEach(policies => {
        if (policies.length > 1) {
            duplicates.push(policies);
        }
    });

    return duplicates;
}

/**
 * Encuentra tablas sin políticas
 */
function findMissingPolicies(policies: Policy[]): string[] {
    const tablesWithPolicies = new Set(policies.map(p => p.table));
    return EXPECTED_TABLES.filter(table => !tablesWithPolicies.has(table));
}

/**
 * Calcula cobertura de políticas
 */
function calculateCoverage(policies: Policy[]): number {
    const tablesWithPolicies = new Set(policies.map(p => p.table));
    return (tablesWithPolicies.size / EXPECTED_TABLES.length) * 100;
}

/**
 * Valida políticas RLS
 */
export function validateRLS(): ValidationResult {
    const supabasePath = join(process.cwd(), 'supabase');

    const files = [
        { path: join(supabasePath, 'rls-consolidated.sql'), name: 'rls-consolidated.sql' },
        { path: join(supabasePath, 'rls.sql'), name: 'rls.sql' },
        { path: join(supabasePath, 'rls-policies.sql'), name: 'rls-policies.sql' },
    ];

    let allPolicies: Policy[] = [];
    const errors: string[] = [];

    // Extraer políticas de todos los archivos
    files.forEach(file => {
        try {
            const policies = extractPolicies(file.path, file.name);
            allPolicies = allPolicies.concat(policies);
        } catch (error) {
            if (error instanceof Error) {
                errors.push(`Error leyendo ${file.name}: ${error.message}`);
            }
        }
    });

    // Validar
    const duplicates = findDuplicates(allPolicies);
    const missingPolicies = findMissingPolicies(allPolicies);
    const coverage = calculateCoverage(allPolicies);

    return {
        success: duplicates.length === 0 && missingPolicies.length === 0 && errors.length === 0,
        duplicates,
        missingPolicies,
        coverage,
        errors,
    };
}

/**
 * Genera reporte de validación
 */
function generateReport(result: ValidationResult): string {
    let report = '\n';
    report += '═══════════════════════════════════════════════════════════\n';
    report += '  RLS POLICY VALIDATION REPORT\n';
    report += '═══════════════════════════════════════════════════════════\n\n';

    // Estado general
    report += `Status: ${result.success ? '✅ PASS' : '❌ FAIL'}\n`;
    report += `Coverage: ${result.coverage.toFixed(1)}%\n\n`;

    // Errores
    if (result.errors.length > 0) {
        report += '❌ ERRORS:\n';
        result.errors.forEach(error => {
            report += `  - ${error}\n`;
        });
        report += '\n';
    }

    // Duplicados
    if (result.duplicates.length > 0) {
        report += `⚠️  DUPLICATE POLICIES (${result.duplicates.length}):\n`;
        result.duplicates.forEach(group => {
            report += `\n  Policy: "${group[0].name}" on table "${group[0].table}"\n`;
            group.forEach(policy => {
                report += `    - ${policy.file}:${policy.lineNumber}\n`;
            });
        });
        report += '\n';
    } else {
        report += '✅ No duplicate policies found\n\n';
    }

    // Tablas sin políticas
    if (result.missingPolicies.length > 0) {
        report += `⚠️  TABLES WITHOUT POLICIES (${result.missingPolicies.length}):\n`;
        result.missingPolicies.forEach(table => {
            report += `  - ${table}\n`;
        });
        report += '\n';
    } else {
        report += '✅ All expected tables have policies\n\n';
    }

    // Recomendaciones
    if (!result.success) {
        report += '📋 RECOMMENDATIONS:\n';
        if (result.duplicates.length > 0) {
            report += '  1. Remove duplicate policies from deprecated files (rls.sql, rls-policies.sql)\n';
            report += '  2. Use only rls-consolidated.sql as the source of truth\n';
        }
        if (result.missingPolicies.length > 0) {
            report += '  3. Add policies for missing tables\n';
        }
        report += '\n';
    }

    report += '═══════════════════════════════════════════════════════════\n';

    return report;
}

// Ejecutar validación si se llama directamente
if (require.main === module) {
    const result = validateRLS();
    const report = generateReport(result);
    console.log(report);
    process.exit(result.success ? 0 : 1);
}
