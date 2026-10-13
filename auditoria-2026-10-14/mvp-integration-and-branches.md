# MVP: integración, ramas y siguiente bloque — 14-10-2026

## Hallazgos clave

- La integración `31a0dd02` reúne las entregas locales de mensualidades y está
  publicada en `codex/zaltyko-plan-implementation`, PR #226.
- La issue #227 exige seis pasos operativos desde una academia vacía. La
  facturación ahora tiene API/UI; el recorrido autenticado completo continúa
  sin evidencia suficiente.
- Tres chats activos comparten la base 31a0dd02 y tienen ownership separado:
  Backend revisa ledger/cuotas; Frontend revisa pasos Owner y móvil; QA revisa
  login, navegador y CI. Tech Lead mantiene integración y vault.
- CI `38477410346` arrancó para esa base; no se presume resultado. El local
  Chromium anterior falló en login después del relleno de campos.
- El PR #225 tiene checks exitosos y `REVIEW_REQUIRED`; @elvisvaldes tiene
  write y solicitud de review activa. Producción aún no contiene el hotfix.

## Decisión sobre ramas abiertas

| PRs | Decisión en este bloque | Motivo y siguiente acción |
| --- | --- | --- |
| #226 | Mantener como integración del MVP | Recibe los tres frentes; demostrar #227 antes de release. |
| #225 | Mantener separado y prioritario | Cierre del cron legacy; revisión independiente requerida por GitHub. |
| #224 | Conservar para comparar, no fusionar a ciegas | Tiene cuatro commits que no son ancestros de 31a0dd02; revisar equivalencia de patches antes de descartarlo. |
| #213–223 | Posponer integración masiva | Incluyen upgrades mayores (Tailwind, Zod, dropzone, tipos Node, Analytics, SSR, herramientas). Evaluar seguridad/compatibilidad individualmente. |
| #126, #116, #115, #112, #99 | Fuera del siguiente bloque operativo | Admin, rendimiento, SEO y refactors antiguos; conservar hasta revisar diff y reglas útiles. |
| #80, #73 | Fuera del MVP operativo | Instrumentación y documentación de marketing; no introducirlas durante el cierre del recorrido. |
| #66 | Revisar como antecedente de consentimiento | Preservar reglas válidas; contrastar con consentimiento ya implementado antes de cerrar. |

No se borró ninguna rama ni checkout. Posponer integración no demuestra que un
patch sea inútil; el descarte definitivo exige comparación de código y pruebas.

### Comparación adicional de #224

`git cherry HEAD origin/codex/rebrand-zaltyko-live-20261008` identifica el
patch de seguridad `9e4ba9a1` como equivalente ya integrado. Los otros tres
commits no tienen equivalencia de patch. La comparación de árboles confirma
39 archivos distintos en web pública, branding, emails y configuración visual,
incluidas imágenes editoriales ausentes en la integración. Por tanto #224 **no
es una rama redundante**: conservar su trabajo de marca y evaluar una integración
separada cuando el recorrido MVP esté probado. No mezclar automáticamente su
copy con las decisiones posteriores de facturación manual/opcional automática.

## Criterios del siguiente bloque

1. Backend: dos sedes de una familia no se bloquean incorrectamente entre sí;
   reintentar emisión tras registrar pago no duplica ni modifica el ledger.
2. Frontend: enlaces conservan organización/sede, móvil «Más» funciona con
   disclosure nativo y teclado; pasos del MVP tienen acción accesible.
3. QA: causa del login aislada, sesión real sintética y pasos completos
   probados; Chromium, Firefox y WebKit ejecutados en CI. Mocks no prueban el
   recorrido de producto.
4. Tech Lead: revisar commits, integrar, actualizar #226/#227 y verificar el
   deployment del SHA. Producción se libera por bloques que hayan pasado su
   evidencia y los requisitos efectivos del repositorio.

## Fuentes observadas

Actualización de despliegue: `dpl_Q8nww8URJ6XqSnyxBnrvp1akWQbQ` está
`READY`, target Preview (null), SHA `31a0dd02`, comprobado con la API de Vercel.
[Vista previa](https://zaltyko-pywyqioeq-mentessaas-projects.vercel.app).
Build CI también pasó; los E2E seguían ejecutándose al consultar. Esto no
demuestra un recorrido autenticado ni una publicación en producción.

Actualización E2E: el job experimental `115571409266` terminó con fallo en
Chromium, Firefox y WebKit. Los tres fallan en login sin observar POST a Auth;
las longitudes posteriores fueron 0/40, 0/0 y 0/0 respectivamente, sin errores
de página reportados. El log confirma limpieza del stack y volúmenes
desechables. La causa no está establecida; QA recibió esta evidencia para
verificar hidratación, eventos y navegación antes de atribuir un origen.
El job autenticado remoto aún estaba activo al consultar.

Resultado final CI `38477410346`: failure. El job autenticado Owner registra
32 tests aprobados y uno fallido: WebKit, `common breakpoints`, navegación a
la misma URL interrumpida por otra navegación (también en los reintentos).
La navegación móvil «Más» pasa en los tres navegadores. QA investiga el nuevo
fallo; no se atribuye automáticamente a producto o harness sin aislarlo.

- [PR #226](https://github.com/mentessaas/Zaltyko/pull/226).
- [MVP #227](https://github.com/mentessaas/Zaltyko/issues/227).
- [Hotfix #225](https://github.com/mentessaas/Zaltyko/pull/225).
- [CI 38477410346](https://github.com/mentessaas/Zaltyko/actions/runs/38477410346).
- `git fetch`, lista de PRs abiertos, `git worktree list`, comparación
  `HEAD...origin/codex/rebrand-zaltyko-live-20261008` (89/4 commits distintos).

Accionable: sí. Siguiente paso: integrar los tres cierres y su evidencia. No
DEMO-READY ni PILOT-READY en este corte.
