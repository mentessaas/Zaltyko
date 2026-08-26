## BLOCKED — live browser gate ZAL-882

El gate no pasa y ZAL-876 debe permanecer bloqueado. Se creó el follow-up [ZAL-963](/ZAL/issues/ZAL-963), asignado a Web Developer.

### Evidencia reproducible

Comando:

`BASE_URL=https://zaltyko-9d3lj2w4n-mentessaas-projects.vercel.app pnpm exec playwright test tests/security-headers-preview.test.ts --project=chromium --workers=1`

Salida literal relevante:

```
Running 2 tests using 1 worker
{"path":"/","status":200,"finalUrl":"https://vercel.com/login?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fzaltyko-9d3lj2w4n-mentessaas-projects.vercel.app%252F%26nonce%3Dbb8f374e57f6a32e6ddaf763b655d87dee0660f5f4ec1981325ed7724dab3eb3","requiredHeaders":{"strict-transport-security":"max-age=31536000; includeSubDomains; preload","x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"origin-when-cross-origin","permissions-policy":null,"content-security-policy":"default-src 'self' vercel.com *.vercel.com *.vercel.sh vercel.live *.stripe.com twitter.com *.twitter.com *.google.com *.github.com *.codesandbox.io https://risk.clearbit.com wss://*.vercel.com localhost:* chrome-extension://*;script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: www.google.com www.gstatic.com *.youtube.com *.youtube-nocookie.com *.ytimg.com *.twimg.com cdn.ampproject.org *.googleapis.com *.fides-cdn.ethyca.com *.ethyca.com cdn.ethyca.com cdn.vercel-insights.com va.vercel-scripts.com cdp.vercel.com vercel.com *.vercel.com *.vercel.sh vercel.live *.stripe.com twitter.com *.twitter.com *.google.com *.github.com *.codesandbox.io https://risk.clearbit.com wss://*.vercel.com localhost:* chrome-extension://*;child-src *.youtube.com *.youtube-nocookie.com *.stripe.com www.google.com github.com calendly.com *.vusercontent.net *.vercel.run vercel.com *.vercel.com *.vercel.sh vercel.live *.stripe.com twitter.com *.twitter.com *.google.com *.github.com *.codesandbox.io https://risk.clearbit.com wss://*.vercel.com localhost:* chrome-extension://*;style-src 'self' 'unsafe-inline' *.googleapis.com vercel.com *.vercel.com *.vercel.sh vercel.live *.stripe.com twitter.com *.twitter.com *.google.com *.github.com *.codesandbox.io https://risk.clearbit.com wss://*.vercel.com localhost:* chrome-extension://*;img-src * blob: data:;media-src 'self' videos.ctfassets.net user-images.githubusercontent.com replicate.delivery *.public.blob.vercel-storage.com *.private.blob.vercel-storage.com blob: data: vercel.com *.vercel.com *.vercel.sh vercel.live *.stripe.com twitter.com *.twitter.com *.google.com *.github.com *.codesandbox.io https://risk.clearbit.com wss://*.vercel.com localhost:* chrome-extension://*;connect-src wss://ws-us3.pusher.com data: * https://*.contentful.com cdp.vercel.com;font-src 'self' *.vercel.com *.gstatic.com vercel.live;frame-ancestors 'self' https://vercel.com https://app.contentful.com https://*.contentful.com https://*.vercel.sh https://*.vercel.com;worker-src 'self' *.vercel.com blob:"}}
Error: / missing required security headers
Expected: []
Received: ["permissions-policy"]
1 failed
1 did not run
```

El preview respondió inicialmente 302 a `https://vercel.com/sso-api?...`; el status 200 es la página final de Vercel SSO, no la app Zaltyko. Por eso Chromium no llegó a `/pricing`, `/contact` ni `/es/gimnasia-artistica`; el header observado tampoco es evidencia válida del preview. No se observaron mensajes CSP antes del bloqueo.

Redirect smoke separado:

```
Running 1 test using 1 worker
{"wwwStatus":200,"wwwLocation":null}
Error: Expected: 301
Received: 200
1 failed
```

Esto no cumple `www → apex` con 301; respondió 200 sin `Location`.

### Evidencia de archivos y artefactos

```
$ ls -la tests/security-headers-preview.test.ts
-rw-r--r--@ 1 ... 2636 Aug 24 23:30 tests/security-headers-preview.test.ts
$ wc -l tests/security-headers-preview.test.ts
48 tests/security-headers-preview.test.ts
$ grep -c "  it(" tests/security-headers-preview.test.ts
0
```

La suite Playwright no usa `it(`; el conteo de casos queda documentado por `Running 2 tests using 1 worker`, no por Vitest.

Trazas:

```
$ ls -la test-results/security-headers-preview-Z-6e206-d-no-CSP-console-violations-chromium-retry1/trace.zip
-rw-r--r--@ 1 ... 28955 Aug 24 23:27 .../trace.zip
$ ls -la test-results/security-headers-preview-Z-b768b-01-and-apex-remains-non-www-chromium-retry1/trace.zip
-rw-r--r--@ 1 ... 28955 Aug 24 23:27 .../trace.zip
```

### Acción exacta

Web Developer debe habilitar el preview autorizado sin SSO para Chromium externo, emitir `Permissions-Policy` junto con los seis headers requeridos y configurar/verificar `www.zaltyko.com → https://zaltyko.com/` con 301. QA reejecutará la suite; solo entonces podrá cambiar a PASS.

**Veredicto: BLOCKED.**
