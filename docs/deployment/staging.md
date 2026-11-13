# Staging: staging.zaltyko.com

Fecha: 12 de noviembre de 2026. Entorno creado ese día para probar candidatas
SQL y funciones antes de llevarlas a producción.

## Regla

**Toda candidata SQL se instala y se prueba primero en staging.** Solo después
se pide la autorización de Elvis para producción, con el archivo, el hash y el
destino exactos. Que funcione en staging no autoriza producción. Lo mismo vale
para las semillas de referencia (ver «Instalar o actualizar el esquema»).

## Qué es

| Pieza | Staging | Producción |
|---|---|---|
| URL | https://staging.zaltyko.com | https://zaltyko.com |
| Vercel | proyecto `zaltyko-staging` (mismo equipo que `zaltyko`) | proyecto `zaltyko` |
| Supabase | «Zaltyko Staging», ref `oucxnnrtfmjjlnffldfc`, región eu-north-1 | «Zaltyko», ref `jegxfahsvugilbthbked`, PostgreSQL 17.6 |
| Auth | «Confirm email» **desactivado**; Site URL y redirecciones de staging | Confirmación de email según `docs/producto/invitaciones-equipo.md` |
| Indexación | `X-Robots-Tag: noindex, nofollow` en todas las rutas | Indexable según `docs/SEO.md` |
| Redis (rate limit) | **Compartido con producción**, solo para contadores | El mismo |
| DNS | CNAME `staging` en Hostinger hacia Vercel | Dominio principal |

La sandbox E2E (`aeeootdmuiqkfeernskw`) se pausó el 12-11-2026 para liberar
cupo de proyectos activos en Supabase. Se puede reanudar durante un año. Mientras
esté pausada, las pruebas E2E que apuntan a ella no se pueden ejecutar.

## Desplegar

`vercel.json` tiene `git.deploymentEnabled: false`: no hay despliegue por push.
Se despliega a mano, con build remoto en Vercel (nunca en el Mac):

```bash
# 1. Clon limpio de lo que se quiere probar, fuera del checkout de trabajo
git clone https://github.com/mentessaas/Zaltyko.git zaltyko-staging-deploy
cd zaltyko-staging-deploy
git checkout <rama o SHA>

# 2. Enlazar con el proyecto de staging (no con `zaltyko`)
vercel link --yes --project zaltyko-staging --scope mentessaas-projects
# Si `vercel link` deja un .env.local con valores, borrarlo en ese momento.
rm -f .env.local

# 3. Configuración alternativa: vercel.json de main + cabecera noindex
#    (ver el bloque de abajo), guardada como vercel.staging.json
vercel deploy --prod --yes --scope mentessaas-projects --local-config vercel.staging.json
```

`--prod` publica en el destino de producción **del proyecto `zaltyko-staging`**,
que es el que sirve `staging.zaltyko.com`. Antes de ejecutarlo, comprobar con
`cat .vercel/project.json` que `projectName` es `zaltyko-staging`.

`vercel.staging.json` es el `vercel.json` de `main` con este bloque añadido.
Hoy no está en el repositorio:

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
  }
]
```

Staging puede llevar ramas aún sin fusionar. Por ejemplo, el despliegue del
12-11 llevaba el código de los PR #290 (alta en cualquier país) y #291
(subdominios reservados) para poder probar el alta en Argentina. Sin #291, el
middleware trata `staging` como el subdominio de una academia y responde 404.

Comprobaciones rápidas después de desplegar: `/`, `/auth/login` y
`/api/health/live` responden 200; `/api/health` responde 200 con la base de
datos en buen estado, y la respuesta lleva `X-Robots-Tag: noindex, nofollow`
(`curl -sI https://staging.zaltyko.com/ | grep -i x-robots-tag`).

### Variables de entorno

Viven en el proyecto `zaltyko-staging` de Vercel. Nunca se copian al
repositorio, a documentos ni a mensajes. Los nombres están en `.env.example`.
Las de Supabase y base de datos (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL*`)
deben apuntar a «Zaltyko Staging», nunca a producción. Las URL públicas
(`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`) apuntan a
`https://staging.zaltyko.com`. Para probar el acceso del equipo,
`ZALTYKO_TEAM_ACCESS_ENABLED=true`.

## Instalar o actualizar el esquema

Se hace con `psql` contra la conexión de staging, guardada en una variable de
entorno de la sesión (aquí `STAGING_DATABASE_URL`). Su valor nunca se escribe
en archivos ni comandos guardados. Antes de cada paso, comprobar que la
conexión es la de staging:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -c "select current_database(), version();"
```

### Instalación desde cero (como el 12-11-2026)

1. **Snapshot base** `supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql`,
   **sin** las líneas `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin`: el
   rol `postgres` de Supabase no es `supabase_admin` y no puede cambiar sus
   defaults.

   ```bash
   grep -v '^ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin ' \
     supabase/schema-snapshots/20261024172153_sandbox_schema_snapshot_baseline.sql \
     > "$TMPDIR/staging-snapshot.sql"
   psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$TMPDIR/staging-snapshot.sql"
   ```

   El snapshot es solo esquema: no trae filas (lo dice su cabecera).
2. **Migraciones posteriores al snapshot**, en orden:
   `20261024193934_rls_guard_missing_public_tables.sql`,
   `20261024223700_seed_owner_bootstrap_sport_profiles.sql` y
   `20261104120000_product_discovery_preferences.sql`, más las que se añadan
   después a `supabase/migrations`.
3. **Semillas de referencia** (sin ellas el registro y el alta fallan; ver
   `docs/qa/owner-signup-reference-seeds-incident-2026-11-12.md`):
   - `zaltyko.owner_signup_consent_policy`: una fila con la versión vigente de
     los términos. Hoy es `v1-2026-10-26`, la fecha de `/terminos` y
     `/politica-privacidad`.

     ```sql
     insert into zaltyko.owner_signup_consent_policy (singleton, policy_version)
     values (true, 'v1-2026-10-26')
     on conflict (singleton) do update
       set policy_version = excluded.policy_version,
           rollout_at = clock_timestamp();
     ```

     Cambiar la versión en una base con cuentas obliga a aceptar de nuevo los
     términos. Solo se cambia al publicar términos nuevos.
   - `zaltyko.sport_profiles`: España (artística y rítmica) llega con la
     migración `20261024223700` del paso 2. México llega con la candidata
     `20261104121000_mx_general_identity_candidate.sql`.
4. **Candidatas activadas** (`docs/deployment/candidates/`), una a una y
   comprobando el hash antes (`shasum -a 256 <archivo>`). Orden obligado: la de
   objetivos (`20261111120000_athlete_progress`) antes que la del guion
   (`20261111200000_session_plans`). La de alta en cualquier país
   (`20261112120000_general_market_identity`) llega con el PR #290.
   **No** se instala aquí `20261025202902_canonical_domain_installation_candidate.sql`:
   el esquema canónico ya viene del snapshot.

### Actualizar con una candidata nueva

1. Revisar el hash y la sección de la candidata en
   `docs/deployment/candidates/README.md`.
2. Instalarla en staging: `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f <archivo>`.
3. Comprobar el catálogo como en producción: tablas nuevas con RLS `ENABLE` y
   `FORCE`, sin privilegios para `anon` ni `authenticated`.
4. Comprobar que las tablas de referencia que use la función tienen filas.
5. Desplegar el código que la usa y probar el recorrido en staging.
6. Con eso, pedir la autorización de producción.

## Cuentas de prueba

- **Registro de dueña:** por el formulario de la web. Como «Confirm email» está
  desactivado, la cuenta entra sin abrir ningún correo. Es la única forma de
  probar el consentimiento de alta completo.
- **Cuentas auxiliares** (por ejemplo, la persona que acepta una invitación):
  con la Admin API de Supabase y la clave service role de **staging**. Esa
  clave salta RLS: solo se usa desde una terminal propia, nunca en el navegador
  ni en el código cliente.

  ```bash
  # STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY, QA_EMAIL y QA_PASSWORD
  # se definen en la sesión; sus valores no se escriben en ningún archivo.
  jq -n --arg email "$QA_EMAIL" --arg password "$QA_PASSWORD" \
    '{email: $email, password: $password, email_confirm: true}' |
  curl -sS -X POST "$STAGING_SUPABASE_URL/auth/v1/admin/users" \
    -H "apikey: $STAGING_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $STAGING_SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    --data @- | jq '{id, email}'
  ```

  Estas cuentas no pasan por el consentimiento de alta de dueña.
- Usar correos de prueba propios del equipo. Las contraseñas se guardan en el
  gestor de contraseñas, nunca en el repositorio ni en informes.
- Solo datos sintéticos. No copiar datos de producción (hay datos de menores).

## Probado en staging el 12-11-2026

- Registro de dueña.
- Alta de academia en España y en Argentina.
- Invitación y aceptación de una entrenadora, y su vista restringida.
- Clase con titular.
- Guion de la sesión.
- Solicitudes de prueba.

## Límites y diferencias con producción

- **Correo:** el SMTP por defecto de Supabase solo envía a miembros del equipo
  del proyecto. Por eso «Confirm email» está desactivado. Un flujo que dependa
  de un correo no queda probado en staging.
- **Rate limit compartido:** las claves son `rate_limit:<identificador>`, sin
  prefijo de entorno (`src/lib/rate-limit.ts`). Las pruebas en staging gastan
  los mismos contadores que producción para la misma IP o el mismo correo. No
  hacer pruebas de carga ni repeticiones masivas.
- **Sin garantía de paridad de datos:** el esquema sale del snapshot del
  24-10, no de producción. Antes de pedir una autorización, comparar el
  catálogo de staging con el de producción en las tablas que toca la candidata.
- **Cobros:** este documento no cubre Stripe en staging. No asumir que los
  cobros funcionan ni hacer compras reales.
- **Plan de Supabase:** el cupo de proyectos activos obligó a pausar la
  sandbox E2E. Reanudarla puede exigir pausar otro proyecto.

## Siguiente paso

- Versionar `vercel.staging.json` en el repositorio para no rehacerlo a mano.
- Script de comprobación de semillas de referencia, común a staging y
  producción.
- Decidir si el rate limit de staging usa un Redis o un prefijo propio.
