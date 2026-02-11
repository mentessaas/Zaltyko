import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Security: Deprecated RLS Files', () => {
  const supabaseDir = path.join(process.cwd(), 'supabase');

  it('should not have deprecated rls.sql file', () => {
    const deprecatedFile = path.join(supabaseDir, 'rls.sql');
    const fileExists = fs.existsSync(deprecatedFile);
    expect(fileExists).toBe(false);
  });

  it('should not have deprecated rls-policies.sql file', () => {
    const deprecatedFile = path.join(supabaseDir, 'rls-policies.sql');
    const fileExists = fs.existsSync(deprecatedFile);
    expect(fileExists).toBe(false);
  });

  it('should have rls-consolidated.sql as the single source of truth', () => {
    const consolidatedFile = path.join(supabaseDir, 'rls-consolidated.sql');
    const fileExists = fs.existsSync(consolidatedFile);
    expect(fileExists).toBe(true);
    
    // Verify the file contains the expected header comment
    const content = fs.readFileSync(consolidatedFile, 'utf-8');
    expect(content).toContain('ZALTYKO SAAS - RLS POLICIES CONSOLIDATED');
    expect(content).toContain('rls.sql (deprecado)');
    expect(content).toContain('rls-policies.sql (deprecado)');
  });
});
