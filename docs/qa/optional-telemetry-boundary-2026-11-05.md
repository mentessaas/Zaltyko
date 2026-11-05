# Barrera de telemetría opcional del navegador

## Hallazgo y cambio

El layout cargaba Analytics y Speed Insights sin consultar el estado de consentimiento de la aplicación. Google Ads dependía de su identificador. Es un hallazgo estático: no se inspeccionaron variables reales ni tráfico de cuentas, por lo que no acredita una transmisión concreta de datos.

Vercel Analytics y Speed Insights exigen activación explícita (por defecto desactivada), consentimiento vigente y ruta pública de una allowlist exacta. Sus filtros comprueban ruta y consentimiento al enviar. Rutas privadas, dinámicas, Auth e invitaciones quedan excluidas. Google Ads no se carga y sus funciones exportadas son inertes hasta disponer de un contrato separado de consentimiento publicitario. No se activa una CMP.

PostHog queda **hard-disabled**, incluso con `NEXT_PUBLIC_ENABLE_POSTHOG=true`, hasta que haya una API soportada para impedir reintentos de requests después de revocar consentimiento. El código conserva `request_batching: false` como defensa futura, pero eso solo evita la cola de batching. La copia local preservada de `posthog-js` 1.427.2 muestra una `RetryQueue` separada: reintenta la request serializada sin volver a ejecutar `before_send`. No encontramos una opción configurable de retry-off en el código/declaraciones locales inspeccionadas; la dependencia transitiva `@posthog/types@1.409.0` no está disponible en esa copia, así que su contrato TypeScript completo queda sin verificar. No se accede a `_retryQueue` ni se intenta vaciar estado privado.

La revocación bloquea capturas futuras de esta integración; no cancela requests ya iniciadas ni permite prometer que el SDK no reintentará requests retenidas por una sesión que ya lo cargó. El sanitizer fuerza `$process_person_profile: false` en el payload final y descarta un `true` aportado por el caller. Persistencia en memoria, ausencia de autocapture/pageleave/Replay y saneamiento de propiedades se conservan como defensa si se habilita bajo un contrato seguro. Los eventos de registro del navegador con usuario/UTMs se retiran. Los hitos first-party del servidor no cambian. Analytics permite solo pageviews; Speed Insights mantiene su contrato de vital con URL/ruta saneadas.

## Comprobaciones preparadas

Las regresiones preparadas cubren el hard-disable real de PostHog aunque el flag público esté activo, la configuración defensiva `request_batching: false`, el saneamiento de `$process_person_profile` y el ciclo grant → revoke → regrant sobre la misma URL (dos llamadas a `opt_in_capturing` sin repetir pageview). También cubren rutas privadas, metadata, contratos distintos de Vercel, importación tardía y Google Ads inactivo incluso con ID/flag.

El trabajo anterior registró `git diff --check` como única verificación local; esta corrección no ejecutó checks. No se ejecutaron tests, lint, typecheck, build ni código del SDK en el Mac. La UI actual no dispone de un emisor de consentimiento comprobado; los proveedores opcionales siguen apagados por defecto y no hay aceptación/revocación validada en una preview. Pendientes revisión QA independiente, CI remota y comprobación de red del candidato aprobado.

## Fuente, importancia y siguiente paso

Fuente: layout, `OptionalTelemetryBoundary`, `PostHogProvider`, `analytics`, `optional-tracking-policy`, `google-ads`, `GoogleAdsTracking`, `RegisterForm` y suites del diff. Contratos primarios: [Vercel Analytics](https://github.com/vercel/analytics/blob/main/packages/web/src/types.ts), [Speed Insights](https://vercel.com/docs/speed-insights/package), [PostHog](https://posthog.com/docs/libraries/js/config), [Google consentimiento](https://developers.google.com/tag-platform/security/concepts/consent-mode). Importancia: delimitar las superficies opcionales de medición antes de abrir a clientes. Siguiente paso: revisión QA independiente y CI remota; mantener PostHog inactivo hasta que una API pública permita una revocación compatible con su cola de reintentos. Sin cambios en cuentas, SQL, Live, ensayo ni producción.
