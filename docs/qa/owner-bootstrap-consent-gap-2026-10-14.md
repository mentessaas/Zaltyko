# Bootstrap canónico — aceptación contractual pendiente

## Hallazgo

En el corte `105a1de5`, RegisterForm recoge aceptación y transporta versión/
referencia por Auth metadata. La ruta canónica
`/api/v1/organizations/bootstrap` verifica identidad, pero no persiste ni
comprueba esa evidencia antes de crear organización, sede y membership Owner.
El recorder existente solo se invoca en el alta legacy, cuya página redirige
al bootstrap nuevo. Callback Google actualiza metadata; no acredita persistencia.

Fuente: auditoría Backend, rutas y `src/lib/consent/owner-consent-store.ts`.
51 pruebas focales existentes y verificador bootstrap PostgreSQL PASS no
cubren este gate; no representan aprobación de tratamiento de datos reales.

## Decisión de implementación

- Verificar usuario Auth en servidor y política vigente desde configuración.
- Metadata es una autodeclaración de entrada, no autoridad para roles ni prueba
  criptográfica: el `consent_proof` existente solo valida formato/origen.
- Persistir aceptación y evento de auditoría atómicamente e idempotentemente.
- Exigir fila vigente granted, sin revocación, antes del bootstrap; ausencia,
  revocación, versión antigua o error de configuración no generan organización.
- No reotorgar consentimiento automáticamente desde metadata si existe una
  revocación. Recuperación requiere aceptación explícita, no repetir registro.
- No conceder analítica: su consentimiento browser es independiente.
- No inventar textos jurídicos, ni crear fixtures de consentimiento por SQL o
  Supabase Admin para ocultar el hueco del walkthrough.

Backend es dueño del store, ruta y pruebas. Frontend conserva su corrección
de errores de red. Cualquier dependencia de perfiles legacy o nueva UI de
reaceptación se revisará antes de ampliar el contrato. No se aplicaron cambios
de esquema ni remotos durante la auditoría inicial.

## Implementación backend local — 2026-10-14

- Las tablas canónicas están en `zaltyko`; el estado referencia directamente
  `auth.users.id`. El evento append-only no tiene FK y sobrevive a borrar el
  estado/identidad. No requiere ni crea `public.profiles`.
- La versión actual (`v1-2026-08-01`) y `rollout_at` se leen de la configuración
  canónica. Metadata de versión solo se admite para una identidad Auth cuya
  `created_at` sea igual o posterior al rollout. Metadata histórica de cuentas
  anteriores no crea un grant.
- DTO para Setup: `getOwnerContractualConsentRequirement(verifiedAuthUser)` →
  `{ policyVersion, requiresAcceptance, reason }`. Para cuentas previas,
  revocadas o con versión obsoleta el bootstrap acepta el envelope opcional
  `{ contractualAcceptance: { accepted: true, policyVersion } }`; sin él no
  registra grant ni crea organización. Una reaceptación se audita como
  `re_grant` y `source=setup`.
- La prueba se construye en servidor con el hash SHA-256 de la clave idempotente;
  no se conserva metadata completa ni prueba en crudo. El actor queda ligado al
  subject Auth verificado mediante `user_id`.
- Comando de harness local aislado: `pnpm test:owner-signup-consent:local`.
  Incluye freshness antiguo/nuevo, concurrencia, rollback de audit, RLS,
  denegación anon, ausencia de perfil y rechazo de `TRUNCATE`. No se ejecutó
  contra Supabase remoto ni constituye E2E de registro UI.
- Evidencia: 57/57 pruebas Vitest focales PASS; harness PostgreSQL temporal PASS;
  `pnpm typecheck`, ESLint focal, `pnpm check:migrations`, `pnpm validate:rls`
  y `pnpm validate:rls:semantics` PASS. La UI de aceptación explícita y el E2E
  navegador de alta siguen en el frente de Frontend/QA.
