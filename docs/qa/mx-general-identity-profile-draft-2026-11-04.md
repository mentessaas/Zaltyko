# Borrador de perfil general de identidad para México

**Estado:** propuesta para revisión. El SQL de este documento no está en `supabase/migrations` y no se ha ejecutado.

## Hallazgos

- `organization_sports.sport_profile_id` es obligatorio y la FK compuesta exige un perfil cuyo `country_code` coincida con el de la organización.
- `sport_profiles` permite un perfil `MX/general/unconfigured/identity-v1` con estado `identity_only` y configuración vacía. Ese perfil identifica la cobertura general; no contiene categorías, niveles ni reglas federativas.
- La migración fundacional concede escritura de catálogo a `service_role` y solo SELECT a `authenticated`. El rol efectivo de la conexión `DATABASE_URL` usada por el servicio no está verificado en este alcance. Por eso el bootstrap no intenta crear perfiles ni ampliar grants: falla cerrado si no encuentra el perfil general exacto.
- Los programas de artística y rítmica conservan las disciplinas elegidas y pueden apuntar a una única identidad deportiva general. No se presenta esa identidad como cobertura federativa mexicana.

## Fuente

- [Modelo Drizzle de perfiles y relación deportiva](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/src/db/schema/zaltyko-core.ts:1142)
- [Migración fundacional y privilegios de catálogo](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/supabase/migrations/20261013100000_model_sport_profiles_and_complementary_activities.sql:15)
- [Perfiles de identidad actuales de España](/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-main-bridge-20261025/supabase/migrations/20261024223700_seed_owner_bootstrap_sport_profiles.sql:1)

## Borrador SQL incremental

Este bloque es candidato de revisión, no una migración activa. Solo añade el perfil general de MX; no modifica ES, políticas ni permisos.

```sql
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key = 'general'
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND (
        status IS DISTINCT FROM 'identity_only'::zaltyko.sport_profile_status
        OR configuration_schema_version IS DISTINCT FROM 1
        OR configuration IS DISTINCT FROM '{}'::jsonb
      )
  ) THEN
    RAISE EXCEPTION
      'MX general identity profile exists with an unexpected shape';
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
    'general',
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

  IF NOT EXISTS (
    SELECT 1
    FROM zaltyko.sport_profiles
    WHERE country_code = 'MX'
      AND discipline_key = 'general'
      AND federation_code = 'unconfigured'
      AND profile_version = 'identity-v1'
      AND status = 'identity_only'
      AND configuration_schema_version = 1
      AND configuration = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION
      'MX general identity profile was not created in the expected shape';
  END IF;
END
$migration$;
```

## Importancia

Hasta que el perfil esté disponible en el destino y el recorrido de MX pase aceptación, el alta administrativa MX responderá con error `422` antes de crear organización, sede, membresía o programa. España conserva sus perfiles y defaults actuales.

## Siguiente paso

Revisar el SQL y confirmar, por separado, el rol de conexión de la aplicación y la autorización para una migración incremental. No anunciar el autoservicio mexicano como disponible antes de aplicar el cambio autorizado y completar la aceptación remota.
