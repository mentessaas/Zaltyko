# Regiones de datos: analítica (PostHog) y proveedores de IA

Revisión del código en la rama `contenido/planes-y-regiones` (base `main` en `c77154c4`, 14-11-2026). Solo se ha leído el código y la documentación del repositorio; no se ha consultado ningún panel de proveedor ni variable de entorno real.

## 1. PostHog (analítica de producto)

### Hallazgos

- **Desactivado por código.** `optionalTrackingFlags.posthog` es `false` fijo: no depende de ninguna variable de entorno. Mientras siga así, el navegador no inicializa PostHog y no se envía ningún evento, aunque exista `NEXT_PUBLIC_POSTHOG_KEY`.
- **Región según el código antes de esta PR: EE. UU.** Si `NEXT_PUBLIC_POSTHOG_HOST` no está definida, el SDK usaba `https://app.posthog.com`, que es la nube de EE. UU. `.env.example` también proponía ese host.
- **Cambio en esta PR:** el valor por defecto pasa a `https://eu.i.posthog.com` (nube de la UE, Fráncfort) en `src/lib/analytics.ts` y en `.env.example`. La CSP (`https://*.posthog.com` en `middleware.ts`) ya admite ese dominio. No se ha tocado ninguna variable de entorno real.
- **Qué datos se enviarían si se activase:** solo en rutas públicas de una lista cerrada (`/`, `/pricing`, `/faq`, etc.), solo con consentimiento de analítica vigente, sin autocapture, sin páginas vistas automáticas, sin grabación de sesión, sin perfiles de persona (`person_profiles: "never"`), con persistencia en memoria (sin cookies) y sin llamar nunca a `identify`. `sanitizePostHogEvent` descarta eventos y propiedades no permitidos, el referrer y los parámetros de campaña. La IP la ve PostHog al recibir la petición: el código no la manda como propiedad, pero tampoco puede impedir que el servidor la registre.

### Fuente

- `src/lib/optional-tracking-policy.ts` (`optionalTrackingFlags`, lista de rutas, `sanitizePostHogEvent`).
- `src/lib/analytics.ts` (`initAnalytics`: host por defecto y opciones de `posthog.init`).
- `middleware.ts` (CSP `script-src` y `connect-src`).
- `.env.example` (`NEXT_PUBLIC_POSTHOG_HOST`).

### Importancia

Media hoy (no sale nada porque está desactivado) y alta en cuanto se active: enviar analítica de visitantes de la UE a EE. UU. obliga a documentar una transferencia internacional (Data Privacy Framework o cláusulas contractuales tipo) en la política de privacidad y en el registro de actividades. Con la región UE ese punto desaparece.

Un proyecto de PostHog vive en una sola región. Una clave de un proyecto de EE. UU. no funciona contra `eu.i.posthog.com`, ni al revés. Por eso el host tiene que coincidir con la región del proyecto.

### Siguiente paso: qué debe confirmar Elvis en PostHog

1. En PostHog, la región del proyecto que corresponde a `NEXT_PUBLIC_POSTHOG_KEY`. Si la URL del panel es `eu.posthog.com`, está en la UE. Si es `us.posthog.com` o `app.posthog.com`, está en EE. UU.
2. En Vercel (Production, Preview y staging), si `NEXT_PUBLIC_POSTHOG_HOST` está definida y con qué valor. Si apunta a `app.posthog.com` o `us.i.posthog.com`, esa variable manda sobre el nuevo valor por defecto.
3. Si el proyecto está en EE. UU., hay que crear uno en la UE y cambiar la clave y el host antes de activar PostHog. No se migran datos porque hoy no se envía nada.
4. Firmar el DPA de PostHog antes de activarlo y añadir PostHog a la lista de encargados de la política de privacidad.

## 2. Proveedores de IA

### Hallazgos

- **No hay ningún proveedor de IA en el código.** `git grep` no encuentra SDK, endpoint, clave ni dependencia de OpenAI, Anthropic, Google Gemini/Vertex, Azure OpenAI, AWS Bedrock, Mistral, Groq, OpenRouter ni del paquete `ai` / `@ai-sdk` en `src/`, `middleware.ts`, `supabase/functions`, `package.json` ni `.env.example`. Las coincidencias de «cohere» son la palabra «coherente».
- `llms-full.txt` (`src/app/llms-full.txt/route.ts`) dice que «IA» no forma parte de esta versión, y el código lo confirma.
- Por tanto no se envían datos personales a ningún modelo de IA y no hay región que fijar.

### Fuente

- Búsqueda con `git grep -i` en el árbol versionado (excluidos `docs/`, `vault/`, Markdown, HTML de informes y contenido de blog).
- `package.json` (dependencias).

### Importancia

Baja hoy. Pasará a alta si se añade una función de IA que reciba datos de gimnastas (menores) o de familias.

### Siguiente paso

1. Nada que confirmar hoy en ningún panel de IA.
2. Antes de añadir un proveedor de IA: elegir un endpoint en la UE o con residencia de datos en la UE, no enviar datos de menores sin una base jurídica revisada, firmar el DPA, comprobar que el proveedor no entrena con los datos enviados y añadir el proveedor a la política de privacidad. Este documento debe actualizarse en la misma PR.

## 3. Fuera de alcance, para revisar aparte

- **Sentry:** la región depende del DSN (variable de entorno). La CSP admite `*.ingest.us.sentry.io`, lo que sugiere un proyecto en EE. UU. El código ya fija `sendDefaultPii: false` (`src/lib/monitoring/sentry-privacy.ts`), sin replay, y usa el túnel `/monitoring`. Elvis debe confirmar en Sentry, en los ajustes de la organización, si la región es US o EU.
- **Vercel:** las funciones se ejecutan en `arn1` (Estocolmo, UE) según `vercel.json`. La red perimetral de Vercel es global.
- **Supabase y Stripe:** la región de la base de datos y de la cuenta no se fija en el código. Se confirman en sus paneles.
