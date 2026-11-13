# Incidente: registro de dueñas roto por falta de semillas de referencia (25-10 → 12-11-2026)

Postmortem breve. Corregido en producción el 12-11-2026.

## Hallazgos

- **Síntoma.** El registro de dueñas fallaba en producción con el mensaje «No
  podemos comprobar ahora los términos vigentes…» (`src/components/RegisterForm.tsx`).
- **Causa 1: términos.** `zaltyko.owner_signup_consent_policy` estaba vacía.
  El servicio de consentimiento lee esa fila y, si no hay una versión válida,
  lanza `CONSENT_STORE_UNAVAILABLE`
  (`src/modules/organizations/application/owner-signup-consent.ts`).
- **Causa 2: perfiles deportivos.** `zaltyko.sport_profiles` también estaba
  vacía. Aunque el registro hubiera pasado, el alta de academia habría fallado:
  el bootstrap exige el perfil de identidad del país y la disciplina, y falla
  cerrado si no existe.
- **Desde cuándo.** Desde la instalación canónica del 25-10-2026
  (`docs/qa/canonical-production-application-2026-10-25.md`). Esa instalación
  creó el esquema vacío a propósito: el candidato «no incluye filas» y la
  verificación posterior anotó que las 92 tablas nuevas estaban vacías. Las
  filas de referencia que el historial sí traía no se cargaron:
  - `supabase/migrations/20261013235142_owner_signup_consent_canonical.sql`
    inserta la versión de términos junto a la tabla;
  - `supabase/migrations/20261024223700_seed_owner_bootstrap_sport_profiles.sql`
    siembra los perfiles de España.
- **Por qué no se vio.** El informe del 25-10 ya avisaba de que no acreditaba
  «datos/configuración iniciales», pero ningún paso del procedimiento obligaba
  a cargarlos ni a comprobarlos. Las pruebas de CI y E2E siembran sus propias
  filas (por ejemplo `scripts/e2e-local/owner-signup-consent-policy.sql`) o
  recorren el historial de migraciones, que sí las inserta, así que no podían
  detectar la falta en producción.
- **Corrección (12-11-2026, producción).**
  - Versión de términos `v1-2026-10-26`, la fecha de actualización que publican
    `/terminos` y `/politica-privacidad` («26 de octubre de 2026»).
  - Semilla `20261024223700` (España, artística y rítmica).
  - Candidata `20261104121000_mx_general_identity_candidate.sql` (México).
  - El registro de dueña y el alta de academia se probaron también en staging
    (`docs/deployment/staging.md`).
- **Impacto.** Este informe no mide cuántas personas intentaron registrarse
  entre el 25-10 y el 12-11 ni cuántas se quedaron sin cuenta.

## Fuente

- Comprobación en la base de producción del 12-11-2026 (tablas vacías antes de
  la corrección; filas presentes después).
- `docs/qa/canonical-production-application-2026-10-25.md` («Importancia»: el
  esquema queda vacío y no acredita datos iniciales).
- `docs/deployment/candidates/README.md`, sección de la instalación canónica
  («No incluye filas…»).
- Código citado en «Hallazgos».

## Importancia

Alta. El registro es la puerta de entrada del producto y estuvo cerrado unas
dos semanas y media sin que nada avisara. La falta no es solo de esta
instalación: cualquier esquema instalado desde un snapshot o un candidato de
solo esquema necesita después sus semillas de referencia. Staging se montó el
mismo 12-11 con ese paso explícito.

## Siguiente paso

1. **Procedimiento (hecho en esta revisión).** El paso «semillas de
   referencia» queda en:
   - `docs/deployment/candidates/README.md`, «Criterio de revisión y
     aplicación futura», punto 7;
   - `docs/deployment/mvp-release-procedure-2026-10-25.md`, paso 3;
   - `docs/deployment/staging.md`, «Instalar o actualizar el esquema».
2. **Inventario.** Revisar las tablas del esquema canónico que la aplicación
   lee como catálogo o configuración y listar las filas mínimas de cada una.
   Este informe solo confirma dos: `owner_signup_consent_policy` y
   `sport_profiles`.
3. **Comprobación automática.** Un chequeo de solo lectura (en `/api/health` o
   en un script de verificación) que falle si alguna tabla de referencia está
   vacía. Requiere su propia PR.
4. **Impacto.** Si se quiere medir, contar en Auth los intentos de registro del
   periodo sin cuenta de academia, sin extraer datos personales a informes.
5. **Términos.** Al publicar términos nuevos, actualizar la versión en la misma
   ventana que las páginas legales.
