# Cierre de la superficie antigua pública (P0 #1) — 2026-11-09

Base: `f8186491` (head de la PR 234). Rama `claude/legacy-surface-closure-20261109`. Punto 1 del P0 de `auditorias/2026-11-08/plan-mejora-zaltyko.md`.

## Hallazgos

- **Ya existía un corte de lanzamiento** en `middleware.ts` (`src/lib/launch/essential-routes.ts`) que devolvía 404 en marketplace, `/owner/insights`, `/owner/health-score`, directorio, eventos y empleo.
- **Seguían dependiendo de variables de entorno.** La tienda y el cobro con Stripe Connect estaban cerrados solo por `ENABLE_B2B_STORE`; el subdominio, por `ENABLE_ACTOR_PAGES`. Quedaban fuera del corte:
  - `POST /api/checkout`: público y con cargo de destino a la cuenta Connect de la academia;
  - `/api/products/*`;
  - `/api/academy/stripe-connect/onboard`;
  - `/api/academy/subdomain`.

  Si alguien activaba una de esas variables en producción, el cobro a familias se reabría.
- **Fuera de cualquier flag:**
  - `GET /api/listing-categories` y `/tree`: públicos y sin guardia;
  - `GET /api/advertising/zones/*`: público; solo lo usa `/empleo`, ya retirado;
  - `/api/docs` y la página `/docs`: publicaban el contrato Swagger de toda la API a cualquier visitante;
  - `/integraciones`: presentaba «Contratación del plan con Stripe — Disponible» con la contratación de pago cerrada. Estaba en el sitemap y en IndexNow.
- **Subdominios:** un rewrite de subdominio no vuelve a pasar por el middleware. Con `ENABLE_ACTOR_PAGES` activo, `club.zaltyko.com/tienda` habría llegado a la tienda aunque `/a/club/tienda` estuviera cerrada.
- **IndexNow** enviaba 12 URL, siete de ellas ya retiradas (404 o redirección).

## Cambios

- `RETIRED_LAUNCH_API_PREFIXES` e `isRetiredLaunchApi`. Estas API responden **410** JSON (`ROUTE_RETIRED`), con `no-store` y `noindex`, antes del limitador y del handler:
  - `/api/marketplace` (antes 404);
  - `/api/checkout`, `/api/products`, `/api/listing-categories`;
  - `/api/academy/stripe-connect`, `/api/academy/subdomain`;
  - `/api/advertising`, `/api/docs`.
- El corte de páginas (**404**) añade `/integraciones`, `/integrations`, `/docs`, `/app/*/store` y `/a/*/tienda`.
- El corte se aplica antes de los flags experimentales, así que ninguna variable de entorno lo reabre. También se aplica a la ruta reescrita de un subdominio.
- `/integraciones` sale de `ESSENTIAL_PUBLIC_ROUTES`, es decir, del sitemap. IndexNow usa ahora ese mismo conjunto.
- El superadmin ya no enlaza a `/docs`.
- Test nuevo, `tests/launch-public-api-allowlist.test.ts`:
  - recorre `src/app/api/**/route.ts` con el clasificador de `scripts/lib/route-auth-classifier.ts`;
  - falla si un handler público, o sin guardia reconocible, no está en la lista blanca con su motivo ni en el corte;
  - falla también si una entrada de la lista queda obsoleta.
- `tests/middleware.test.ts`:
  - 410 en 14 métodos y rutas con los tres flags activados;
  - 404 en las nuevas páginas;
  - subdominio `/tienda`;
  - segmentos parecidos que no deben cerrarse (`/api/productsx`, `/api/public/academies`).

Los archivos de las rutas se conservan: el historial sigue en Git y el corte es reversible en un solo sitio.

## Lista blanca de API públicas

Análisis estático de los 18 handlers públicos o sin guardia reconocida:
- **Abiertos (11):**
  - `health` y `plans`;
  - `leads` y `growth/events`, con limitador o consentimiento;
  - `preferences` y `unsubscribe` (GET y POST), con token firmado;
  - estado de invitación por token opaco;
  - los dos `filter-options` públicos, de solo lectura y sin datos personales.
- **Retirados por el corte (7):** el resto.

## Fuente

Diff local sobre `f8186491`. Revisión estática y `git diff --check`. El inventario de handlers se hizo leyendo archivos con el clasificador del repositorio, sin build. **No se ejecutaron vitest, tsc, eslint, build ni e2e en el Mac**: la verificación corresponde a la CI remota.

## Importancia

- Cierra la contradicción con la línea roja (sin Connect ni cobro a familias) sin depender de que nadie toque una variable en producción.
- Reduce la superficie pública y deja de anunciar como disponible una contratación que está cerrada.

## Riesgos y fuera de alcance

- `tests/audit/public-claims.spec.ts` (Playwright, fuera de la CI) ya esperaba 200 en rutas retiradas antes de este cambio, como `/marketplace`. No se actualiza aquí.
- `/api/admin/disputes` sigue cerrado por su flag. La smoke de roles espera 404 ahí y no se cambia.
- Plan #23 sin tratar: `api/dev/session` fuera del build. Tampoco se ha revisado `/api/rate-limit-test` ni el resto de la API de `/app` con sesión.

## Siguiente paso

1. CI remota del commit.
2. Integración en la PR 234, coordinada con quien escribe en ella.
3. Tras publicar en entregas, comprobar por HTTP: 410 en `/api/checkout` y `/api/docs`, 404 en `/integraciones`.
