# Borrador de perfiles de identidad disciplinar para México

**Estado:** propuesta para revisión. El SQL de este documento no está en `supabase/migrations` y no se ha ejecutado.

## Hallazgos

- `organization_sports.sport_profile_id` es obligatorio y la FK compuesta exige un perfil cuyo `country_code` coincida con el de la organización.
- `sport_profiles` ya modela la disciplina con `discipline_key`; MX puede tener filas `artistic` y `rhythmic` en estado `identity_only`, `configuration_schema_version = 1` y configuración vacía. El bootstrap vuelve a exigir esa forma al leerlas. No contienen categorías, niveles ni reglas federativas.
- La cobertura comercial `general_identity_only` sigue indicando que no se aplican reglas federativas mexicanas; no es una clave disciplinar almacenada como `general`.
- La migración fundacional concede escritura de catálogo a `service_role` y solo SELECT a `authenticated`. El rol efectivo de la conexión `DATABASE_URL` usada por el servicio no está verificado en este alcance. Por eso el bootstrap no intenta crear perfiles ni ampliar grants: falla cerrado si falta la identidad de alguna disciplina solicitada.
- Cada programa de gimnasia conserva `activity_key = NULL` y apunta a su `organization_sport`; este a su vez apunta al perfil disciplinar canónico. El nombre del programa permanece editable, pero ya no es la única señal de artística o rítmica.

## Fuente

- [Modelo Drizzle de perfiles y relación deportiva](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/src/db/schema/zaltyko-core.ts:1142)
- [Migración fundacional y privilegios de catálogo](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/supabase/migrations/20261013100000_model_sport_profiles_and_complementary_activities.sql:15)
- [Perfiles de identidad actuales de España](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/supabase/migrations/20261024223700_seed_owner_bootstrap_sport_profiles.sql:1)

## Borrador SQL incremental

Este bloque es candidato de revisión, no una migración activa. Solo añade dos perfiles de identidad MX. Es incremental e idempotente: no modifica ni borra filas existentes, y falla si encuentra una de esas claves con forma inesperada. No modifica ES, el esquema, políticas ni permisos. Si ya existe la fila MX/general previa, queda intacta y el bootstrap deja de depender de ella.

```sql
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES ('artistic'), ('rhythmic')) AS expected(discipline_key)
    JOIN zaltyko.sport_profiles profile
      ON profile.country_code = 'MX'
     AND profile.discipline_key = expected.discipline_key
     AND profile.federation_code = 'unconfigured'
     AND profile.profile_version = 'identity-v1'
    WHERE profile.status IS DISTINCT FROM 'identity_only'::zaltyko.sport_profile_status
       OR profile.configuration_schema_version IS DISTINCT FROM 1
       OR profile.configuration IS DISTINCT FROM '{}'::jsonb
  ) THEN
    RAISE EXCEPTION
      'MX disciplinary identity profile exists with an unexpected shape';
  END IF;

  INSERT INTO zaltyko.sport_profiles (
    country_code,
    discipline_key,
    federation_code,
    profile_version,
    status,
    configuration_schema_version,
    configuration
  )
  VALUES (
    'MX',
    'artistic',
    'unconfigured',
    'identity-v1',
    'identity_only',
    1,
    '{}'::jsonb
  ), (
    'MX',
    'rhythmic',
    'unconfigured',
    'identity-v1',
    'identity_only',
    1,
    '{}'::jsonb
  )
  ON CONFLICT (
    country_code,
    discipline_key,
    federation_code,
    profile_version
  ) DO NOTHING;

  IF (
    SELECT count(*)
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key IN ('artistic', 'rhythmic')
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND status = 'identity_only'
      AND configuration_schema_version = 1
      AND configuration = '{}'::jsonb
  ) <> 2 THEN
    RAISE EXCEPTION
      'MX disciplinary identity profiles were not created in the expected shape';
  END IF;
END
$migration$;
```

## Importancia

Hasta que estén disponibles ambos perfiles disciplinarios MX y el recorrido de MX pase aceptación, el alta administrativa responderá con error `422` antes de crear organización, sede, membresía o programa cuando falte alguna disciplina solicitada. La respuesta conserva la cobertura `general_identity_only`, que significa que no se aplican reglas federativas. España conserva sus perfiles y defaults actuales.

## Siguiente paso

Revisar el SQL y confirmar, por separado, el rol de conexión de la aplicación y la autorización para ejecutar el candidato incremental. No anunciar el autoservicio mexicano como disponible antes de aplicar el cambio autorizado y completar la aceptación remota.
