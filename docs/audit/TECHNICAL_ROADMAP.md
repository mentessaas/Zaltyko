# Roadmap técnico priorizado

## Criterio

P0 bloquea producción; P1 se resuelve en el mismo ciclo de hardening; P2 reduce riesgo/deuda próxima; P3 es mantenimiento/pulido. El registro deduplica hallazgos equivalentes y enlaza sus IDs de área.

| P | Hallazgo maestro / IDs relacionados | Resultado requerido | Depende de | Esfuerzo | Responsable | Horizonte |
|---|---|---|---|---|---|---|
| P0 | Permisos baseline: AUTH-001, ROLE-001, ROUTE-004, FLOW-001, SEC-001, MT-001 | Deny-by-default y matriz API negativa por rol/método | fixtures de roles | L | Sol | Ahora |
| P0 | RLS intratenant: DB-005, FLOW-004, SEC-002, MT-002, MT-003, MT-006 | Parent/athlete/coach solo filas permitidas por Data API y servidor | mapa de grants/vínculos | XL | Sol | Ahora |
| P1 | Landing raíz: ARCH-002, ROUTE-001, UI-001 | Contrato `/` único, sin overflow y con canonical correcto | decisión producto/i18n | M | Terra + Luna | Ahora |
| P1 | TLS DB: DB-003, SEC-003 | CA validada y conexión fail-closed | bundle CA/entorno | S | Sol | Ahora |
| P1 | Entorno/readiness: ENV-001, ENV-003, ENV-004, FLOW-003, SEC-005 | features no arrancan incompletas; rate limit verificable | inventario Vercel | M | Sol | Ahora |
| P1 | TEST-001 | 643/643 tests verdes; mantener conteo y evitar regresiones | cambios de producto | S | Terra | Después |
| P2 | Uploads: SEC-006 | validación binaria central + bucket privado + escaneo | buckets/proveedores | M | Sol | Próximo |
| P1 | CSP: SEC-004 | CSP Report-Only medida y luego sin unsafe-eval | inventario scripts | L | Sol | Próximo |
| P1 | Permisos UI/recurso: ROLE-002, ROLE-003, MT-004, UI-004 | misma capability en nav/API + scope de recurso | P0 auth | L | Terra + Sol | Ahora |
| P2 | Helpers RLS: DB-001, DB-002 | schema privado, grants explícitos y roles modernos | suite SQL | M | Sol | Próximo |
| P2 | Pool/build DB: ARCH-003, ARCH-004, DX-002, DB-004 | build offline y presupuesto de conexiones | observabilidad DB | M | Sol | Próximo |
| P2 | Supply chain: SEC-007 | `pnpm audit` sin vulnerabilidades + SBOM en CI | upgrade tooling | S | Sol | Próximo |
| P3 | Auth/docs drift: ARCH-001, AUTH-002, ENV-002 | contrato Supabase canónico y documentos legacy etiquetados | confirmación de consumidores | S | Terra | Ahora |
| P2 | Env parity: ENV-005 | comparación de nombres Preview/Prod sin secretos | acceso Vercel | M | Terra | Próximo |
| P2 | Roles divergentes: ROLE-004, MT-005 | precedencia/invariantes/revocación probadas | P0 auth | M | Terra | Próximo |
| P2 | Estados/a11y: UI-002, UI-003, A11Y-001, A11Y-002 | matriz visual y WCAG por rol/flujo; corregir contraste público y repetir axe | deploy + sesiones E2E | L | Luna | Ahora |
| P2 | API contracts: ROUTE-003, SEC-008 | errores/respuestas/redacción consistentes | P0 auth | L | Terra + Sol | Después |
| P2 | Webhook replay: FLOW-002, SEC-009 | entrega firmada observada tras redeploy, replay/rotación/SCA sandbox | deployment Ready + credenciales test | M | Sol | Próximo |
| P3 | Node parity: DX-001 | runtime fijado (`engines`, `.nvmrc`, CI Node 20) | CI | S | Terra | Ahora |
| P3 | Legacy: ROUTE-002 | retirada solo tras seis meses de telemetría | métricas | L | Terra | Después |
| P3 | Middleware expectativa: AUTH-003 | declaración auth/permission obligatoria | P0 auth | M | Sol | Después |
| P3 | Auth E2E gap: AUTH-004 | callback/recovery/logout/invite por rol | sandbox | M | Terra | Próximo |

## Avance Día 2

- DB-002, DB-003 y MT-006: cerrados en código/tooling y migración Día 2/3 aplicada por ledger el 2026-07-21; falta validar PostgREST/Realtime.
- DB-001, DB-005, MT-002 y MT-003: parciales; el lote core tiene evidencia PostgreSQL, los dominios secundarios continúan en roadmap P0/P2.
- DB-004: mitigado a pool 5/instancia, sin declarar capacidad global hasta observar conexiones y límites del pooler.
- ARCH-003/004: la ruta pública de coach deja de enumerar DB en build y el acceso DB durante `NEXT_PHASE` falla antes de abrir socket.

## Avance Día 3

- AUTH-001/ROLE-001/MT-001: cerrados y revalidados con owner A/B, baseline/custom y cookie/bearer.
- ROUTE-004/ROLE-002/ROLE-003/MT-004: cerrados en el alcance automatizado con 292 rutas clasificadas, cero scopes manuales y negativas BOLA por recurso. Las suites históricas ya están modernizadas e integradas: 86 archivos, 618/618 tests, sin exclusiones Vitest.
- Día 2 + Día 3 pasan en PostgreSQL local aislado y reversible, incluidas las tres tablas de comunicación y el rol anónimo. La siguiente unidad de trabajo es Día 4: promoción revisada en entorno controlado y validación PostgREST/Realtime con identidades aisladas; producción permanece fuera de alcance hasta esos gates.

## Gates de producción

1. Cero P0 abiertos.
2. TLS y readiness P1 cerrados.
3. Tests, lint, typecheck, build, API auditor, RLS semántica y migraciones verdes.
4. Evidencia autenticada de owner/coach/parent/athlete/super-admin en desktop y 375 px.
5. Riesgo residual firmado con go/no-go explícito.

## Avance Día 4

- FLOW-003/ENV-004/SEC-005 quedan mitigados o cerrados en código: readiness por feature, Brevo fail-closed y KV fail-closed en producción. ENV-005 continúa externo.
- FLOW-002/SEC-009 quedan parciales: firma, tolerancia, idempotencia, aislamiento Connect, refund acumulado, invitaciones y leases tienen cobertura local; la rotación 2FA se completó el 2026-07-21 y solo falta observar la entrega firmada en el deployment nuevo, además de SCA en sandbox.
- Nuevas deudas acotadas: hash de tokens de invitación, nonce ledger Mailgun, paginación/observabilidad de cron y resolución real de destinatarios email programados.
- El 2026-07-21 se aplicaron transaccionalmente las migraciones Día 2/3 mediante el ledger; se revisó el changelog reciente de Supabase antes de ejecutar SQL.

## Avance Día 5 — 2026-07-21

- La compilación local `next start` se verificó read-only con el navegador integrado en 375×812 y 1440×900. `/` redirige de forma estable a `/es/gimnasia-artistica`; `scrollWidth === innerWidth` en ambos tamaños y las tarjetas se apilan sin clipping.
- Se conservaron capturas nuevas en `docs/audit/evidence/ui/10-day5-public-mobile-viewport.png`, `11-day5-public-desktop-viewport.png`, `13-day5-root-mobile-375.png`, `14-day5-public-320px.png` y `14-day5-public-768px.png`. La captura de login fue descartada/sobrescrita al detectar autofill local; no se registra ningún secreto.
- Con autorización explícita se ejecutó Playwright: Chromium autenticado pasó 12/13 pruebas; responsive falló por timeout/afirmación de overflow. axe público landing/login pasó; axe autenticado quedó bloqueado por fallos de carga antes de ejecutar el análisis.

## Avance Día 6 — 2026-07-21

- `pnpm verify:production` pasa completo: 293 APIs sin `risky`/`semanticRisks`, RLS 69/69, 6+40 migraciones, typecheck, lint, 90 archivos/640 tests y build de 219 páginas.
- Se fijó la paridad de runtime con `package.json` (`engines.node >=20 <23`, `pnpm 9.15.3`), `.nvmrc=20` y CI Node 20.
- `pnpm audit --audit-level high --json` detectó inicialmente `protobufjs@7.6.4` (CVE-2026-59877); el override se actualizó a `^7.6.5`, lockfile regenerado y la segunda ejecución devuelve 0 vulnerabilidades.
- SBOM/policy añadidos a CI: `pnpm audit:dependencies --prod`, `pnpm audit:env` y CycloneDX como artifact. En este workspace el generador CycloneDX no terminó por el árbol `node_modules` concurrente; CI parte de checkout limpio y queda como gate verificable.

## Actualización externa — 2026-07-21

- Brevo: se generó una clave API de servicio con expiración 2027-07-21; se almacenó únicamente en `.env.local` (0600) y en Vercel como `BREVO_API_KEY` Sensitive para Production y Preview. La comprobación read-only de `/v3/account` devuelve HTTP 200 y no se envió ningún mensaje real.
- Vercel: el redeploy manual con la variable nueva fue creado. El despliegue posterior de `main` (`64b653c`, PR #53) estaba `Building`/en cola al congelar la evidencia; no se declara axe público cerrado hasta verlo `Ready` y repetirlo.
- El workflow GitHub `Deploy` sigue verde pero no prueba por sí mismo un deploy Vercel gestionado por CLI; los identificadores/token de ese workflow siguen ausentes.
- Supabase CLI se intentó con `--include-all`; el SQL era idempotente hasta encontrar el conflicto histórico de dos migraciones `0009`. El ledger propio conserva y verifica los 40 archivos; el historial `supabase_migrations` remoto fue reconciliado para las migraciones ya ejecutadas. No se borró ni se reescribió SQL histórico.
- Stripe test mode: cuenta HTTP 200, endpoint Connect habilitado con 5 eventos y PaymentIntent 3DS alcanzó `requires_action` y fue cancelado. La rotación del secreto Connect se completó con 2FA y se propagó a Vercel Production; el redeploy `CugHPvZEr` aún debe alcanzar `Ready` y registrar una entrega firmada 2xx.
- E2E: owner production y axe público landing/login pasan; athletes axe pasa. El dashboard axe excedió 120 s y las sesiones coach/parent/athlete/super-admin guardadas no autentican de forma reproducible, salvo la sesión owner.
- E2E actualizado: se provisionaron/actualizaron coach y super-admin E2E y se regeneraron sus sesiones; role smoke pasa 10/10. Parent/athlete también tienen sesiones nuevas y llegan a `/dashboard/profile`; PR #54 (`f8c307d`) está desplegado y su axe pasa con cero violaciones.

## Cierre Día 7 — 2026-07-21: decisión go/no-go

### Regresión local reproducible

- `pnpm test:security`: 91 archivos, 643/643 tests.
- `pnpm verify:production`: PASS completo (API 293, RLS fuente 69/69, migraciones 6+40, env/dependency gates, typecheck, lint, build 219 páginas).
- `pnpm audit:api-routes:strict`: `risky=[]`, `semanticRisks=[]`, `resourceScopeManualReview=0`.
- `pnpm validate:rls:semantics`: PASS estático; `pnpm check:migrations`: PASS.
- Navegador integrado read-only: `/` → `/es/gimnasia-artistica` sin overflow en 320/375/768/1440 px; no se mutó producción.

### Correcciones locales posteriores

- Supabase Auth es canónico: `next-auth` retirado, `NEXTAUTH_SECRET` eliminado del ejemplo y el gate exige `INTERNAL_AUTH_SECRET`.
- Uploads endurecidos con MIME, magic bytes, límites y rutas aleatorias; bucket `uploads` privado y verificado con 50 MiB y MIME de imagen/vídeo. Antimalware y URLs firmadas/proxy continúan como control externo.
- CI añade `pnpm audit:env`, `pnpm audit:dependencies --prod` y artifact CycloneDX.

### Decisión

**NO-GO para producción en este snapshot.** Las migraciones RLS Día 2/Día 3 ya están aplicadas por ledger y verificadas (40/40). Stripe test/SCA y URL del webhook fueron verificados; el secreto Connect ya fue rotado con 2FA y guardado en Vercel Production, pero falta que `CugHPvZEr` quede Ready y observar una entrega firmada end-to-end. El smoke por roles pasa 10/10 y axe público landing/login, owner dashboard/athletes y parent/athlete profile pasan sin violaciones. Brevo responde 200 y está configurado en Vercel; KV está conectado y la regla WAF de auth está publicada con operador `Starts with`. Siguen abiertos las alertas gestionadas (plan Hobby) y el scanner antimalware.
