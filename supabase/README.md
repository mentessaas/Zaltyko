# Supabase RLS Policies

Este directorio contiene las políticas de Row Level Security (RLS) para Zaltyko SaaS.

## 📁 Archivos

### ✅ Archivo Activo

- **`rls-consolidated.sql`** - **USAR ESTE ARCHIVO**
  - Archivo maestro consolidado con todas las políticas RLS
  - Última actualización: 2025-11-26
  - Este es el único archivo que debe ser usado y modificado

### ⚠️ Archivos Deprecados

- **`rls.sql`** - DEPRECADO (mantener solo para referencia)
- **`rls-policies.sql`** - DEPRECADO (mantener solo para referencia)

Estos archivos serán eliminados en futuras versiones. **NO modificar**.

## 🚀 Cómo Aplicar las Políticas

### Opción 1: Supabase Dashboard (Recomendado)

1. Ir a [Supabase Dashboard](https://app.supabase.com)
2. Seleccionar tu proyecto
3. Ir a **SQL Editor**
4. Copiar y pegar el contenido de `rls-consolidated.sql`
5. Ejecutar el script

### Opción 2: CLI de Supabase

```bash
# Desde la raíz del proyecto
supabase db push
```

### Opción 3: Aplicar manualmente

```bash
psql -h <host> -U <user> -d <database> -f supabase/rls-consolidated.sql
```

## 📋 Validación de Políticas

Para validar que no hay políticas duplicadas y que todas las tablas tienen políticas:

```bash
npm run validate:rls
# o
npx tsx scripts/validate-rls.ts
```

El script de validación verificará:
- ✅ No hay políticas duplicadas
- ✅ Todas las tablas esperadas tienen políticas
- ✅ Cobertura de políticas RLS

## 🏗️ Estructura de las Políticas

Las políticas están organizadas por secciones:

1. **Helper Functions** - Funciones auxiliares para RLS
   - `get_current_profile()` - Obtiene el perfil del usuario actual
   - `get_current_tenant()` - Obtiene el tenant_id del usuario actual
   - `is_admin()` - Verifica si el usuario es admin
   - `is_super_admin()` - Verifica si el usuario es super_admin
   - `academy_in_current_tenant()` - Verifica si una academia pertenece al tenant

2. **Enable RLS** - Habilita RLS en todas las tablas

3. **Políticas por Tabla** - Organizadas por tipo:
   - Tablas con acceso por `tenant_id`
   - Tablas con acceso por `academy_id`
   - Tablas con acceso público + tenant
   - Tablas con acceso solo para super_admin
   - Tablas con acceso por `user_id`

## 🔒 Patrones de Seguridad

### Patrón Estándar (Tenant-scoped)

```sql
DROP POLICY IF EXISTS "table_select" ON table_name;
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );
```

### Patrón de Academia (Academy-scoped)

```sql
DROP POLICY IF EXISTS "table_select" ON table_name;
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    is_admin() OR academy_in_current_tenant(academy_id)
  );
```

### Patrón de Usuario (User-scoped)

```sql
DROP POLICY IF EXISTS "table_select" ON table_name;
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (user_id = auth.uid());
```

### Patrón Público + Tenant

```sql
DROP POLICY IF EXISTS "table_select" ON table_name;
CREATE POLICY "table_select" ON table_name
  FOR SELECT USING (
    is_public = true  -- Acceso público
    OR is_admin()
    OR tenant_id = get_current_tenant()
  );
```

## ✏️ Cómo Agregar Nuevas Políticas

1. **Editar solo** `rls-consolidated.sql`
2. Seguir el patrón existente para el tipo de tabla
3. Agregar comentarios descriptivos
4. Ejecutar validación: `npm run validate:rls`
5. Aplicar en Supabase
6. Verificar con tests

### Ejemplo de Nueva Política

```sql
-- ============================================================================
-- NUEVA_TABLA
-- ============================================================================

DROP POLICY IF EXISTS "nueva_tabla_select" ON nueva_tabla;
CREATE POLICY "nueva_tabla_select" ON nueva_tabla
  FOR SELECT USING (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "nueva_tabla_select" ON nueva_tabla IS 
  'Permite a admins y usuarios del mismo tenant ver registros';

DROP POLICY IF EXISTS "nueva_tabla_modify" ON nueva_tabla;
CREATE POLICY "nueva_tabla_modify" ON nueva_tabla
  FOR ALL USING (
    is_admin() OR tenant_id = get_current_tenant()
  ) WITH CHECK (
    is_admin() OR tenant_id = get_current_tenant()
  );

COMMENT ON POLICY "nueva_tabla_modify" ON nueva_tabla IS 
  'Permite a admins y usuarios del mismo tenant modificar registros';
```

## 🧪 Testing de Políticas RLS

Las políticas RLS deben ser probadas en:

1. **Tests unitarios** - `tests/tenancy.test.ts`
2. **Tests de integración** - Verificar aislamiento entre tenants
3. **Tests manuales** - Probar en Supabase Dashboard

### Verificar Aislamiento de Tenants

```sql
-- Como usuario del tenant A
SELECT * FROM athletes; -- Solo debe ver atletas del tenant A

-- Como usuario del tenant B
SELECT * FROM athletes; -- Solo debe ver atletas del tenant B

-- Como super_admin
SELECT * FROM athletes; -- Debe ver todos los atletas
```

## 📚 Referencias

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Zaltyko Architecture](../architecture.md)

## 🔄 Historial de Cambios

### 2025-11-26 - Consolidación de Políticas RLS
- ✅ Creado archivo consolidado `rls-consolidated.sql`
- ✅ Migradas todas las políticas de `rls.sql` y `rls-policies.sql`
- ✅ Agregada documentación completa con comentarios
- ✅ Creado script de validación `scripts/validate-rls.ts`
- ✅ Deprecados archivos antiguos

---

> **Nota**: Mantener este README actualizado cuando se agreguen nuevas políticas o se modifiquen las existentes.
