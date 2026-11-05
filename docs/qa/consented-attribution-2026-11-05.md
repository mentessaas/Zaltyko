# QA — consentimiento para atribución first-touch

## Corte y estado

- Worktree: `/Users/elvisvaldesinerarte/Projects/Zaltyko/trabajos/Zaltyko-attribution-consent-20261105`.
- Base: rama `codex/first-party-attribution-consent-20261105`, HEAD inicial `527d4c2dfd1425695651416c6c4d5a38a31ea251`.
- Estado: cambio local candidato; no se ejecutaron pruebas, lint, typecheck, build, SDK, servicios, SQL ni proveedores.
- La flag `NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION` solo habilita con el valor exacto `true`; esta tarea no la configura ni la publica.

## Cambio acotado

`UtmCapture` usa el estado canónico de consentimiento y la allowlist pública exacta de tracking. Captura first-touch solo si la flag está habilitada, el consentimiento actual es `granted` y `window.location.pathname` está en la allowlist. `unset`, `revoked` o flag apagada eliminan solo las claves de atribución antigua y consentida (`zaltyko_first_touch_utm` y `zaltyko_first_touch_utm_consented_v1`); los borradores de onboarding y otras claves permanecen intactos. La clave nueva guarda un envelope versión 1 con procedencia `public_route_with_analytics_consent`; valores legacy sin esa procedencia se ignoran y limpian. Las reglas puras existentes de normalización y first-touch en `src/lib/growth/utm.ts` no se modifican.

`OwnerOnboardingForm` no lee ni envía atribución. La revisión independiente detectó que el servidor aceptaba el campo UTM directamente, sin un contrato verificable de consentimiento. Se retira del DTO Owner y de la librería compartida de creación: los campos persistidos nuevos quedan en NULL y los hitos esenciales `academy_created` siguen existiendo sin UTM. El parser descarta el campo heredado sin bloquear el alta; no se modifican datos históricos. El helper de lectura consentida permanece como preparación aislada y comprobable, sin consumidor en el alta actual.

El circuito legacy de analítica pública se cierra también: cliente sin generar/leer un visitor ID persistente ni leer referrer/UTMs; receptor `/api/growth/events` devuelve404 antes de leer el body o importar servicios de persistencia, incluso con flags activas. Esto no cierra los formularios de contacto ni los hitos operativos autenticados. El contacto usa un identificador opaco por solicitud explícita y conserva el mismo cuerpo en su replay; no lo reutiliza entre visitas.

## Regresiones preparadas

- Flag ausente o distinta de `true` bloquea captura y lectura.
- Consentimiento no otorgado bloquea captura y lectura; al revocar se borran solo las claves UTM y se conservan los borradores.
- Solo una ruta pública exacta puede capturar; una query en Owner no reemplaza ni crea first-touch.
- La clave legacy no se lee ni se importa; se elimina al sincronizar y una captura pública nueva consentida sí se puede releer.
- El primer conjunto válido conserva prioridad y onboarding no obtiene UTMs desde su query actual.
- Se conserva el borrador `zaltyko:owner-onboarding-draft:v1` al borrar atribución.

Los casos están en `tests/consented-attribution.test.ts` y `tests/consented-attribution-capture.test.tsx`; no se ejecutaron. Las pruebas existentes de `src/lib/growth/utm.ts` se conservaron sin retirar aserciones.

## Límites

- No se añadió una CMP ni un escritor UI del consentimiento. La lectura se mantiene default-deny; sin flag y consentimiento vigentes no hay atribución de navegador.
- `.env.example` documenta `NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION=false`; no se cambia ninguna variable alojada ni se afirma que haya campañas activas.
- Se modifica la frontera de atribución opcional y se mantienen los hitos esenciales sin esa atribución. No hay consentimiento servidor acreditado ni opt-in UI visible; una flag o un campo declarado por cliente no los sustituyen.
- No se afirma runtime, CI, preview, despliegue ni publicación. El backend de alta se incluye en esta integración; el módulo staff se revisa por separado.

## Siguiente paso

Revisión del diff y ejecución autorizada de las pruebas nuevas en CI. Mantener `NEXT_PUBLIC_ENABLE_UTM_ATTRIBUTION` sin habilitar hasta que exista un flujo visible de consentimiento y se apruebe la atribución first-party correspondiente.
