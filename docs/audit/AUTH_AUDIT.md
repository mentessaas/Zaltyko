# Auditoría de autenticación

## Sistema real

La identidad activa es Supabase Auth, no NextAuth. El browser usa `@supabase/ssr`; Server Components/handlers resuelven cookie o bearer y verifican usuario con Supabase. `middleware.ts` reconstruye cookies chunked, valida HS256 con `SUPABASE_JWT_SECRET` o consulta `/auth/v1/user` como fallback para super-admin.

## Flujos

| Flujo | Entrada | Camino | Salida/error |
|---|---|---|---|
| Registro | `/auth/register` | Supabase signup → callback/perfil/onboarding | verificación email, perfil/tenant o error |
| Password | `/auth/login` | email/password Supabase | redirect por perfil/rol |
| Magic link | login | OTP email → `/auth/callback` | sesión SSR |
| Google | login | OAuth Supabase → callback | sesión SSR |
| Recuperación | auth recovery/update | OTP → cambio password | sesión/confirmación |
| Invitación | `/invite/[token]`, APIs invitations | token → usuario/membership/link | aceptada, expirada o inválida |
| Logout | UI/auth action | `supabase.auth.signOut` | cookies invalidadas |
| Bearer | APIs mobile/family | `Authorization` → `auth.getUser(token)` | contexto tenant o 401 |

## Resolución de tenant

`withTenant` obtiene user/profile, resuelve academia efectiva y tenant por ownership/membership, valida presencia y consulta la tabla de permisos registrada. `withBearerTenant` cubre clientes sin cookies. El middleware protege super-admin, pero la autorización de negocio debe seguir ocurriendo en API.

## Hallazgos

| ID | Archivo/símbolo | Problema y evidencia | Severidad | Riesgo de producción | Recomendación concreta | Responsable |
|---|---|---|---|---|---|---|
| AUTH-001 | `src/lib/authz.ts:275-293`; `permissions-service.ts:48-90` | Si existe `requiredPermission` pero el miembro baseline no tiene fila `roleMembers`, `roleId` es `null` y el `if` omite la denegación. Un coach/viewer no-owner queda autorizado por membership sin permiso efectivo. | Crítica | Acceso API directo no autorizado a datos/acciones de academia, incluidos menores y operaciones administrativas. | Hacer deny-by-default: evaluar siempre el permiso; mapear roles baseline a capacidades y exceptuar solo owner/super_admin verificados. Añadir pruebas negativas por método/rol. | Sol |
| AUTH-002 | `AGENTS.md`, `.env.example`, `package.json` | El código activo usa Supabase Auth SSR; se retiró la dependencia sin imports `next-auth` y se eliminó `NEXTAUTH_SECRET` del contrato local. La documentación histórica fuera de `docs/audit/` queda marcada como legado y no es fuente operativa. | Baja | Referencias históricas pueden inducir una configuración innecesaria si se leen como runtime actual. | Mantener Supabase Auth como fuente canónica y archivar/re-etiquetar documentación histórica durante la próxima limpieza documental. | Terra |
| AUTH-003 | `middleware.ts`; handlers | Middleware solo hace gate especial de super-admin; el resto depende de wrappers y permisos por ruta. | Media | Una ruta nueva mal clasificada puede heredar una expectativa falsa de protección global. | Mantener auditor estricto y añadir regla que exija declaración de auth + permiso para toda ruta mutante/sensible. | Sol |
| AUTH-004 | cobertura E2E | No hubo sesión dinámica disponible en el navegador integrado; no se revalidaron recuperación, invitación y logout end-to-end. | Media | Regresiones de cookie/callback pueden escapar a esta radiografía. | Ejecutar matriz E2E en Supabase aislado con cuentas reales de cada rol antes del go/no-go. | Terra |

## Controles positivos

- El super-admin no confía en claims sin verificar: HS256 o consulta Auth remota.
- Bearer llama `auth.getUser(token)`.
- El login observado tiene labels, password manager/autocomplete, magic link y OAuth; desktop y 375 px fueron estables.

## Estado Día 3

- AUTH-001 permanece cerrado con tests ejecutables: permiso baseline sin `roleId`, owner A/B, rol custom activo/expirado y cookie/bearer comparten deny-by-default.
- El auditor estricto ahora cruza método y capability y bloquea `tenantId` controlable por cliente fuera de la excepción super-admin documentada.
- La evidencia detallada y el inventario reproducible están en `API_AUTHORIZATION_MATRIX.md`. ROUTE-004 queda cerrado con 292/292 handlers clasificados y `resourceScopeManualReview=0`.
