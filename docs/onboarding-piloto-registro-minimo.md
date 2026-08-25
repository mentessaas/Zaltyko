---
status: draft
owner: customer-support
issue: ZAL-860
last_reviewed: 2026-08-20
requires_peer_verification: C-2
peer_verification_owner: platform-and-security
c2_iteration: 2
c2_round_1_verdict: adjustments_needed
c2_round_1_reference: ZAL-862#comment-e468718d
c2_round_1_adjustments_applied:
  - Q1 consent_doc_hash SHA-256
  - Q2 categoria_objeción array<int> 1..8 marcado explícito
  - Q3 nota_operador_revisada + linter PII + sweep semanal P&S
  - Q4 marca_mobile=true + escalación separada con timestamp
  - Q5 retención 30d last-write-wins + freeze S0/S1 + metadatos
runbook_piloto:
  rev: 2
  sha: a8219014
  section: §5 (registro con minimización)
---
# Registro mínimo del piloto — qué SÍ y qué NO se transcribe

> Material complementario al runbook concierge rev 2 `a8219014`, §5.
> Define **qué campos se registran** en `pilot/academia-<hash>/pilot_log.json`
> y **qué campos NO** se transcriben al ticket, comentario o log. La
> promesa al dueño de academia es "privacidad por diseño", no "cumplimiento
> RGPD garantizado".
>
> **Este doc requiere peer-verification C-2 de Platform & Security antes
> de cerrar ZAL-860 como `done`.** Iteración 2 (2026-08-20) incorpora los
> 5 ajustes obligatorios de la revisión C-2 round 1
> ([ZAL-862#comment-e468718d](/ZAL/issues/ZAL-862#comment-e468718d-3b7b-4c9c-a43e-5d84f75b1eab)):
> integridad de consentimiento, marcado explícito de objeciones, controles
> PII sobre la nota del operador, escalación separada para `mobile`, y
> retención/freeze del log. Hasta que C-2 emita un veredicto positivo,
> el doc sigue tratado como **borrador**.

## Principios

1. **Minimización por defecto.** Si un campo no es necesario para operar
   el piloto, NO se registra.
2. **Anonimización estructural.** Nombres propios de personas se sustituyen
   por tokens estables por academia (`atleta-1`, `atleta-2`, `tutor-A`,
   `tutor-B`, `clase-X`, `clase-Y`, `staff-S1`, `staff-S2`). El mapeo
   nombre↔token vive solo en el panel owner, no en el log del piloto.
3. **Hash de academia.** El identificador de academia en el log es un
   hash estable (no el nombre público). Esto evita que un leak del log
   exponga la academia.
4. **Retención 30 días desde último evento (last-write-wins).** El plazo
   se mide desde el `timestamp_evento` más reciente registrado en el log,
   NO desde `log_created_at`. Si no hay eventos en 30 días corridos, el
   log se elimina. **No se archiva en backups separados.** En incidentes
   con `severidad` `S0` o `S1`, el log queda **freeze**: se interrumpe
   la cuenta y se preserva hasta que Platform & Security lo destrabe
   explícitamente.
5. **Sin secretos.** Ningún token, password, API key, link de magic-link
   ni credencial entra al log del piloto.
6. **Integridad del consentimiento.** El `timestamp_consentimiento` se
   acompaña SIEMPRE del SHA-256 del artefacto firmado por el owner
   (`consent_doc_hash`). Sin hash no se demuestra integridad y el evento
   `consentimiento_ok` no se considera válido (GDPR Art. 7(1)).

## Convención de anonimización

| Tipo | Formato | Ejemplo |
| --- | --- | --- |
| Academia | `academia-<hash8>` | `academia-3a7f9b1c` |
| Gimnasta | `atleta-<n>` | `atleta-1`, `atleta-2` |
| Tutor / familiar | `tutor-<letra>` | `tutor-A`, `tutor-B` |
| Coach / staff | `staff-<S><n>` | `staff-S1`, `staff-S2` |
| Clase | `clase-<X>` | `clase-X`, `clase-Y` |
| Sesión | `sesion-<YYYYMMDD-HHMM>-<clase>` | `sesion-20260820-1830-clase-X` |
| Ticket / comentario | `ticket-<n>` | `ticket-1` |

## Campos SÍ se registran (mínimo viable)

Estos campos son los necesarios para operar el piloto y emitir evidencia
honesta. Todo va en `pilot/academia-<hash>/pilot_log.json`.

| Campo | Tipo | Origen | Por qué SÍ |
| --- | --- | --- | --- |
| `academia_hash` | string | calculado | Identifica la academia sin exponer nombre. |
| `log_created_at` | ISO-8601 UTC | reloj servidor | Cuándo se creó el log. NO se usa para calcular la retención. |
| `timestamp_evento` | ISO-8601 UTC | reloj servidor | Cuándo ocurrió cada hito. **Es la base del cómputo de retención 30d.** |
| `log_frozen_at` | ISO-8601 UTC \| null | reloj servidor | Cuándo se aplicó freeze por incidente S0/S1. `null` si nunca se froze. |
| `log_freeze_reason` | string \| null | operador + P&S | Razón del freeze (ej. `incidente_S0_<ticket>`). `null` si nunca se froze. |
| `log_deleted_at` | ISO-8601 UTC \| null | reloj servidor | Cuándo se eliminó el log por vencimiento 30d o por orden de P&S. `null` mientras esté activo. |
| `log_delete_actor` | enum \| null | sistema / P&S | Quién lo eliminó: `retention_job` automático o `platform-and-security` por orden manual. |
| `timestamp_consentimiento` | ISO-8601 UTC | panel owner | Cuándo el owner firmó consentimiento escrito (§0 runbook). |
| `consent_doc_hash` | string (SHA-256 hex) | cálculo sobre artefacto subido | Hash SHA-256 del PDF/imagen firmado. **Requerido**: sin este campo, el evento `consentimiento_ok` no se considera válido. Justifica integridad ante GDPR Art. 7(1). |
| `evento` | enum | runbook §1, §4, §6 | Hito del piloto (consentimiento_ok, primer_registro_atleta, primer_cobro_intentado, cierre_sesion, etc.). |
| `severidad` | enum S0–S3 | runbook §2 | Severidad declarada por el operador. `S0`/`S1` disparan freeze del log. |
| `estado_canal` | enum | runbook §2 | Canal usado (email, panel, magic-link, etc.). |
| `id_plantilla_cierre` | enum | runbook §6 | Cuál de las 5 plantillas se aplicó (activado, riesgo, incidente, abandono, sin_conversion). |
| `intervencion_dN` | enum d0/d3/d7/d14 | runbook §4 + `Customer success.md` | Qué intervención de customer success se aplicó. |
| `escalado_a` | lista de roles | runbook §3 | A quién se escaló (engineering, mobile, platform, ceo, qa). Ver §"Marca mobile y escalación separada" para reglas de fila adicional. |
| `marca_mobile` | bool | FAQ §8 | Si el flanco era mobile-only. `true` implica fila de escalación separada (ver §"Marca mobile y escalación separada"). |
| `categoria_objeción` | array<int> 1..8 | operador (marcado explícito) | Cuáles de las 8 objeciones se respondieron en este evento. **Marcado explícito por el operador en panel/checklist** — nunca inferido de texto libre. `[]` si no aplica. |
| `nota_operador` | string ≤200 | operador | Nota libre, sin PII. **No se publica tal cual**: pasa por linter pre-commit de PII y revisión semanal de Platform & Security. |
| `nota_operador_revisada` | bool | linter + P&S | `true` solo cuando (a) el linter pre-commit pasó sin hallazgos y (b) fue firmada en el sweep semanal de P&S. Mientras sea `false`, la nota no se considera evidencia publicable. |
| `referencia_runbook_sha` | string | catálogo | SHA del runbook vigente usado en la sesión. |

## Campos NO se registran / NO se transcriben

Estos campos **nunca** entran al log, ticket, comentario, captura,
transcripción ni chat interno. Si el operador los recibe, los descarta
inmediatamente.

| Campo | Por qué NO |
| --- | --- |
| Nombre completo de gimnasta | PII de menor. Vive solo en el panel owner. |
| Nombre completo de tutor / familiar | PII de adulto responsable. |
| Email de tutor / familiar | PII; además habilita contacto fuera del canal oficial. |
| Teléfono de tutor / familiar | PII; mismo razonamiento. |
| Dirección física | PII; no es necesaria para el piloto. |
| Fecha de nacimiento del gimnasta | Dato sensible de menor; suficiente con `categoria` (pre-infantil, infantil, juvenil, etc.) si la academia lo declara. |
| Datos de salud del gimnasta (lesiones, alergias, medicación) | Dato sensible; no se registra ni se transcribe. Si la academia lo comparte, escalación a Platform & Security + CEO. |
| Foto del gimnasta | Dato biométrico de menor. |
| Foto del tutor | Dato biométrico. |
| Links de magic-link completos | Credencial de acceso; caduca y no debe loguearse. Si el operador necesita uno, lo usa y descarta. |
| Tokens, API keys, passwords | Credenciales. |
| Resultados de evaluación técnica (puntajes, notas) | Datos de progreso del menor; no son necesarios para el piloto. |
| Identificadores fiscales (NIF/CIF, número de factura) | No se registran hasta validar facturación electrónica. |
| Datos de pago (PAN, CVV, IBAN) | Datos de pago sensibles; viven solo en Stripe. |
| Grabaciones de pantalla / audio | Prohibidas; ver regla §5 del runbook. |
| IP de origen del owner / coach | Telemetría interna; no entra al log del piloto. |

## Cómo anonimizar al transcribir

Si el operador necesita referirse a una persona concreta en un comentario
o ticket, usa el token, nunca el nombre:

- ❌ "María López no pudo entrar"
- ✅ "`tutor-A` reportó problema de acceso en `clase-X`"

Si la academia envía un email con nombres propios, el operador responde
desde el canal oficial usando los tokens y NO hace eco del nombre
completo.

## Reglas operativas

1. **Antes de transcribir**: revisá esta lista. Si el campo no está en
   "SÍ se registran", NO va al log.
2. **Si recibís un campo NO**: descartalo inmediatamente. Si el campo es
   recurrente (ej. la academia insiste en mandar emails con PII),
   escalación a Platform & Security.
3. **Si dudás**: NO registres. Es preferible un log incompleto a un log
   con PII.
4. **Hash de academia**: se calcula una vez al abrir el log y se mantiene
   durante toda la vida del piloto.

## Controles PII sobre `nota_operador`

`nota_operador` es el único campo con texto libre. Por eso lleva **tres
controles superpuestos**, no uno. La regla "`nota_operador_revisada: true`"
exige que los tres pasen.

1. **Linter pre-commit de PII** (automatizado). Corre sobre cada commit
   que toca `pilot_log.json`. Detecta y bloquea:
   - Nombres propios (heurística + lista corta configurable por academia).
   - Emails (regex RFC 5322 simplificado).
   - Teléfonos (E.164 y formatos locales).
   - URLs de magic-link (regex sobre el dominio de Zaltyko).
   - Fechas de nacimiento (calendario + edad implícita).
   - Direcciones físicas (palabras clave + números).
   Si encuentra algo, el commit se rechaza y el operador edita antes de
   reintentar.
2. **Flag `nota_operador_revisada: bool` por evento**. Mientras el linter
   no haya pasado o la nota no haya sido firmada por P&S, el flag queda
   en `false`. **Una nota con `nota_operador_revisada: false` no puede
   usarse como evidencia publicable** (no se cita en PRs, no se incluye
   en reportes a CEO, no se exporta a analytics).
3. **Sweep semanal de Platform & Security**. Complemento humano al linter:
   recorre todas las notas nuevas, confirma el hash y firma el flag.
   Frecuencia: lunes 09:00 UTC. Owner: P&S. Si el sweep detecta PII
   embebida que el linter no atrapó (p. ej. seudónimos que combinados
   con `timestamp_evento` y `clase` re-identifican a un gimnasta), el
   log se **congela** y se escalación a CEO + Engineering Lead.

Estos tres controles **no son intercambiables**. El linter atrapa
texto literal; el sweep detecta re-identificación contextual. Sacar
cualquiera de los dos deja un hueco.

## Marca mobile y escalación separada

`marca_mobile: true` indica que el flanco del problema es **solo o
primariamente mobile**. Por convención de la matriz de escalación
del runbook §3, esto **no se resuelve dentro del mismo evento**.

Reglas:

- `marca_mobile` es un flag booleano dentro del evento del runbook.
  Convive con el resto de los campos.
- Cuando es `true`, el operador **debe** crear una fila de escalación
  **separada** en la tabla de escalaciones, con:
  - `escalado_a: ["engineering-mobile", "product-lead"]` (mínimo).
  - `timestamp_escalacion_mobile`: ISO-8601 UTC propio, distinto del
    `timestamp_evento` del runbook (puede ser posterior si la
    severidad mobile se detecta al cierre de la sesión).
  - `motivo_mobile`: enum libre acotado (`crash_app`, `login_fail`,
    `push_perdido`, `install_onboarding`, `pago_stuck_native`,
    `otro_con_descripcion`).
  - Mismas reglas de minimización: PII prohibido, tokens estables.
- Engineering-mobile y product-led deben acuse dentro del plazo del
  runbook §3.2 según severidad (S0 30 min, S1 2 h, S2 24 h, S3 72 h).
- Si en el sweep semanal de P&S o en la revisión de cierre se detecta
  un `marca_mobile: true` sin fila de escalación separada, se reabre
  el ticket y se escala a QA + Engineering Lead.

## Retención, freeze y eliminación del log

| Estado | Disparador | Acción | Campos tocados |
| --- | --- | --- | --- |
| Activo | Log recién creado o con evento < 30 días | Acepta nuevos eventos. | `log_created_at`, `timestamp_evento` |
| Vencido | Sin `timestamp_evento` en 30 días corridos | `retention_job` marca `log_deleted_at = now()` y `log_delete_actor = retention_job`. Borra el archivo. | `log_deleted_at`, `log_delete_actor` |
| Frozen | `severidad ∈ {S0, S1}` en cualquier evento del log | La cuenta de 30 días **se pausa**. `log_frozen_at = now()`. `log_freeze_reason = "incidente_S<n>_<ticket_id>"`. Acepta nuevos eventos pero no progresa hacia vencimiento. | `log_frozen_at`, `log_freeze_reason` |
| Destrabado (manual) | Platform & Security confirma resolución | `log_frozen_at` se conserva como histórico; la cuenta de 30 días **se reanuda** desde el último `timestamp_evento` previo al freeze. | `timestamp_evento` (re-anclaje), `log_frozen_at` (histórico) |
| Eliminado manual | Orden explícita de Platform & Security (ej. PII detectada en sweep) | `log_deleted_at = now()`, `log_delete_actor = platform-and-security`. Borra el archivo. | `log_deleted_at`, `log_delete_actor` |

**Nunca se archive el log en backups separados.** El sistema de
retención es el único camino de eliminación. Si P&S necesita
preservar evidencia de incidente, lo hace en el sistema de
incidencias, no copiando el `pilot_log.json`.

## Preguntas abiertas para peer-verification C-2 (round 1 → resueltas)

Estado al 2026-08-20 tras la revisión C-2 round 1 en
[ZAL-862#comment-e468718d](/ZAL/issues/ZAL-862#comment-e468718d-3b7b-4c9c-a43e-5d84f75b1eab).
Los 5 ajustes obligatorios fueron incorporados al cuerpo del doc:

| # | Pregunta original | Resolución C-2 round 1 | Dónde quedó |
| --- | --- | --- | --- |
| Q1 | ¿`timestamp_consentimiento` requiere hash del documento? | **SÍ**. Campo `consent_doc_hash` (SHA-256 hex) obligatorio. Sin hash, `consentimiento_ok` no es válido. Cita: GDPR Art. 7(1). | Tabla "Campos SÍ" + Principio 6 |
| Q2 | ¿`categoria_objeción` inferido o explícito? | **Explícito por el operador.** Tipo `array<int> 1..8`, marcado en panel/checklist. Nunca inferido de texto libre. | Tabla "Campos SÍ" |
| Q3 | ¿`nota_operador` admite re-identificación combinada? | **No.** Triple control: linter pre-commit PII + flag `nota_operador_revisada: bool` + sweep semanal P&S. Los tres son obligatorios; ninguno es suficiente solo. | Sección "Controles PII sobre nota_operador" |
| Q4 | ¿`marca_mobile=true` requiere ticket separado? | **Convive en el mismo evento PERO dispara fila de escalación separada** a `engineering-mobile` + `product-lead`, con `timestamp_escalacion_mobile` propio. | Sección "Marca mobile y escalación separada" |
| Q5 | ¿Retención 30d desde creación o último evento? | **Desde último evento (last-write-wins)**, no desde creación. Freeze automático en `severidad ∈ {S0, S1}`. Metadatos: `log_created_at`, `log_frozen_at`, `log_freeze_reason`, `log_deleted_at`, `log_delete_actor`. | Sección "Retención, freeze y eliminación del log" + Principio 4 |

Pendiente C-2 round 2: validación de que la implementación de los 5
ajustes es coherente con las políticas internas de Platform & Security
y con la matriz de escalación vigente. **Esta iteración NO cierra
ZAL-860 por sí sola**; necesita veredicto positivo de C-2 round 2.

## Referencias cruzadas

- Runbook concierge piloto rev 2: `a8219014` (§0 consentimiento, §5
  registro, §7 no-acuse).
- Mensajes aprobados: `vault/04-Marketing/Mensajes aprobados.md`.
- Customer success (desactualizado): `vault/04-Marketing/Customer success.md`.
- FAQ de objeciones: `docs/onboarding-piloto-faq-objecciones.md`.
- Cierre de sesión: `docs/onboarding-piloto-cierre-sesion.md`.
- Peer-verification C-2 round 1: [ZAL-862#comment-e468718d](/ZAL/issues/ZAL-862#comment-e468718d-3b7b-4c9c-a43e-5d84f75b1eab)
  — veredicto `adjustments_needed`, 5 ajustes obligatorios.
- Macro `L-NO-PRECIO` rev 3: `e7314ba7`.
