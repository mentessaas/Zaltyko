# Setup local reproducible

## Requisitos

- Git, Node 20 LTS (paridad con CI) y pnpm 9.15.x. El snapshot se auditó con Node 22.22.3: hoy no existe `engines` para impedir drift.
- Docker/PostgreSQL local si se ejecutan migraciones; no usar `db:migrate` contra un host remoto.
- Proyecto Supabase aislado para pruebas autenticadas. No reutilizar producción.

## Instalación segura

```bash
git clone <repo>
cd Zaltyko
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm typecheck
pnpm lint
pnpm dev
```

Completar `.env.local` solo con credenciales locales/sandbox. No copiar valores a documentación ni a la vault. La app acepta una DB dummy en desarrollo para compilar, pero los flujos de datos requieren PostgreSQL real.

## Base de datos

1. Crear PostgreSQL/Supabase de desarrollo separado.
2. Definir `DATABASE_URL` y, si corresponde, `DATABASE_URL_DIRECT`.
3. Revisar SQL generado antes de aplicar.
4. Usar `pnpm db:migrate` solo contra PostgreSQL local. Para SQL versionado, `pnpm db:migrate:ledger` es dry-run y `--apply` requiere revisión y autoridad explícita.
5. Ejecutar `pnpm db:seed` únicamente en el entorno aislado.

## Auth y E2E por rol

Usar cuentas de prueba distintas para `owner`, `coach`, `parent`/`viewer`, `athlete` y `super_admin`. Primero:

```bash
pnpm test:e2e:verify-supabase
BASE_URL=http://127.0.0.1:3000 E2E_AUTH_EMAIL=... E2E_AUTH_PASSWORD=... pnpm test:e2e:auth
```

Luego configurar `E2E_ACADEMY_ID` y `E2E_STORAGE_STATE`. El aprovisionamiento requiere `E2E_ALLOW_PROVISIONING=true` y una academia aislada aprobada. Esta auditoría no ejecutó Playwright/axe ni aprovisionó usuarios.

## Comandos de calidad

| Comando | Propósito | Resultado del snapshot |
|---|---|---|
| `pnpm typecheck` | Contratos TypeScript | Pasa secuencialmente |
| `pnpm lint` | ESLint | Pasa |
| `pnpm exec vitest run` | 91 archivos / 643 tests | 643 pasan |
| `pnpm build` | Build de producción | Pasa, 219 páginas |
| `pnpm audit:api-routes:strict` | Cobertura auth API | Pasa, 294 rutas; `risky=[]`, `semanticRisks=[]` |
| `pnpm validate:rls` | Declaración RLS | Pasa, 69/69; no valida semántica de rol |
| `pnpm check:migrations` | Integridad del ledger | Pasa, 6 + 38 |
| `pnpm audit --prod --json` | Advisories | No concluyente: endpoint legacy devuelve HTTP 410 |

## Troubleshooting

- Si typecheck falla en `.next/types` mientras build corre, detener build, borrar solo artefactos generados con autorización y ejecutar secuencialmente.
- Si `/` redirige al cluster, es el comportamiento actual de `middleware.ts`; no es problema de caché.
- Si no hay KV, el rate limit permite todas las peticiones y emite warning; no asumir protección.
- Si build intenta conectar a DB, revisar imports server-side y no proporcionar credenciales de producción.
- El aviso `allowedDevOrigins` aparece al usar `127.0.0.1` con un puerto distinto; configurar solo para desarrollo.

## Hallazgos de setup

| ID | Archivo | Problema y evidencia | Severidad | Riesgo | Recomendación | Responsable |
|---|---|---|---|---|---|---|
| DX-001 | `package.json`; `.github/workflows/**` | CI usa Node 20, auditoría local Node 22 y no existe `engines`. | Media | Resultados divergentes y upgrades accidentales. | Fijar Node 20.x y `packageManager`; documentar actualización coordinada. | Terra |
| DX-002 | `src/db/index.ts`; build | `pnpm build` abrió una conexión real. | Media | Build con side effects/indisponible sin red. | Añadir contrato de build sin DB y testarlo en CI con valores dummy. | Sol |
| TEST-001 | suite Vitest completa | Baseline histórico 479 tests quedó obsoleto; snapshot actual ejecuta 91 archivos/643 tests y pasa. | Baja | La documentación histórica puede inducir a ejecutar un gate incorrecto. | Mantener el conteo derivado del comando y actualizarlo cuando cambie el árbol de tests. | Terra |
| SEC-007 | pnpm 9 audit | Auditoría usa endpoint npm retirado y devuelve 410. | Media | Vulnerabilidades nuevas pueden quedar sin señal. | Actualizar pnpm o integrar scanner mantenido/SBOM en CI; no aceptar “0 vulnerabilidades” hasta obtener un resultado válido. | Sol |
