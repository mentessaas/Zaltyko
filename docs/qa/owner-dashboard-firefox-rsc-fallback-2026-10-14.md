# Firefox: fallback RSC y navegación abortada — 14-10-2026

## Alcance

Registro de dos ejecuciones Firefox locales del flujo Owner. La correlación
temporal entre el error RSC y la navegación documental abortada no identifica
causa raíz. No se modificó el service worker ni se repitió el runner en esta
revisión.

## Cronología

- **SHA `2fa03896d6967f49df5a5a05fa3ddc03a2b1522c`:** el pago manual ya había
  terminado correctamente. La página `/owner/payments` respondió 200. A las
  `05:33:22.050Z`, la consola registró `Failed to fetch RSC payload for
  /owner/payments Falling back to browser navigation`; 5 ms después, el GET
  documental a `/owner` terminó con `NS_BINDING_ABORTED`. No se observó una
  navegación principal posterior a `/owner`.
- **SHA `a08ba34adc930289dfea0cf13ad37f5ac3c45516`:** el PATCH de activación de
  inscripción había tenido éxito. En `createAndActivateEnrollment`, la página
  `/owner/enrollments` respondió 200. A las `05:43:48.257Z`, la consola
  registró `Failed to fetch RSC payload for /owner/enrollments Falling back
  to browser navigation`; 16 ms después, el GET documental a
  `/owner/enrollments` terminó con `NS_BINDING_ABORTED`. La prueba se detuvo
  antes del resto del flujo.

En ambas pasadas aparecieron también errores al cargar recursos de Vercel
Insights/Speed Insights desde el service worker. No hay evidencia de que esos
errores provocaran los fallos RSC.

## Contrato y código revisados

`vault/02-Tecnologia/Arquitectura.md` establece que el service worker solo
cachea assets estáticos y que APIs, HTML privado y mutaciones offline no se
cachean ni se reproducen. En la auditoría previa, `public/sw.js` usaba
`respondWith(fetch(request))` para solicitudes dinámicas no estáticas y no
había un contrato RSC específico que confirmara el bypass completo; por ello
no se aplicó entonces un bypass especulativo. Después de la revisión de Main,
el commit integrado `d6ac3265` deja el transporte RSC a cargo del navegador.

## Estado de QA

- Chromium: PASS en `0e145bb0a1a517b34535b64d533f31bcf9373357`.
- WebKit: PASS en el mismo SHA.
- Firefox: fallos en los puntos descritos; el recorrido y sus gates posteriores
  no quedaron validados.
- Firefox en el commit integrado `d6ac32654c0faa506212cb1eb21a677207069947`:
  **PASS**, una sola ejecución del proyecto Firefox, 1/1 test en 54,9 s,
  exit 0. Pasó `tests/e2e-owner-local-setup.spec.ts` (alta Owner sintética y
  operaciones Owner desde la UI). El harness apagó el stack Supabase local y
  eliminó los volúmenes desechables; el checkout quedó limpio y no se
  detectaron procesos del runner ni contenedores `zaltyko-e2e-local`.
- Chromium: **PASS**, una ejecución, 1/1 test en 29,7 s, exit 0 y cleanup
  confirmado. El checkout se verificó en `d6ac3265` al iniciar; durante la
  ejecución, Main avanzó la rama compartida mediante commits de restore
  harness/QA. La comparación posterior mostró cambios solo en documentación,
  scripts y tests de restore, sin cambios en `src`, `public/sw.js`, el spec
  Owner ni `package.json`. La pasada evaluó, por tanto, el mismo código de
  producto, aunque el HEAD de la rama al finalizar ya era `7acde8c5`.
- WebKit: **PASS**, una ejecución sobre worktree detached fijado a
  `d6ac32654c0faa506212cb1eb21a677207069947`, 1/1 test en 34,5 s, exit 0 y
  cleanup confirmado. El worktree de la rama compartida no se movió para esta
  corrida.
- El test de contrato integrado comprueba que RSC señalado por `RSC: 1` o por
  query `_rsc` no recibe `respondWith`; el bypass ocurre antes del resto de
  rutas del service worker. La pasada Firefox terminó en éxito y no conservó
  traza, así que no hay evidencia directa de cabeceras/requests RSC reales de
  esa navegación. El PASS posterior al cambio no prueba por sí solo que el
  bypass fuera la causa de los fallos anteriores.
- Cleanup de las tres pasadas: stacks locales y volúmenes desechables eliminados;
  no se confirmó causa raíz ni compatibilidad de producción.
- Restauración local PostgreSQL posterior revisada por Main: **FAIL** en el
  verificador de estado del fixture; cleanup **PASS**, sin PostgreSQL activo.
  Este resultado no cambia el diagnóstico Firefox ni valida el flujo E2E.
- El fallo `a08ba34a` conserva su estado histórico, sin causa raíz establecida;
  las pasadas verdes acreditan el flujo en el código de producto de
  `d6ac3265` y en entornos locales desechables. No se ejecutaron navegadores
  remotos ni se obtuvo evidencia de compatibilidad con producción.
