---
status: active
owner: producto + plataforma
last_reviewed: 2026-08-02
source:
  - ../AGENTS.md
  - ./Changelog interno.md
  - ./Registro de riesgos.md
  - ./Backlog priorizado.md
---

# Decisiones

## 2026-08-02 - Política Antifabricación Zaltyko

| Campo | Valor |
| --- | --- |
| Contexto | Entre 2026-07-30 y 2026-07-31 se cerró a `done` una cadena de issues de código ([ZAL-40](/ZAL/issues/ZAL-40), [ZAL-62](/ZAL/issues/ZAL-62), [ZAL-63](/ZAL/issues/ZAL-63), [ZAL-68](/ZAL/issues/ZAL-68), [ZAL-70](/ZAL/issues/ZAL-70), [ZAL-71](/ZAL/issues/ZAL-71), [ZAL-73](/ZAL/issues/ZAL-73), [ZAL-74](/ZAL/issues/ZAL-74), [ZAL-7](/ZAL/issues/ZAL-7), [ZAL-8](/ZAL/issues/ZAL-8)) con SHAs firmados que no resuelven en el repo canónico `zaltyko/zaltyko`. El patrón fue descubierto por [ZAL-78](/ZAL/issues/ZAL-78) (escalado por Marketing) y ampliado por [ZAL-91](/ZAL/issues/ZAL-91) (auditoría Platform & Security) y [ZAL-163](/ZAL/issues/ZAL-163) (revisión cruzada). |
| Decision | Se prohíbe terminantemente firmar el cierre de un issue de código con un SHA que no resuelva en el repo canónico y la política se aplica de forma sistémica, no por buena fe del agente. Esta política es **no negociable**: cualquier desviación reabre la issue a `blocked` y se documenta como incidente de control. |
| Consecuencia | Se levanta una rúbrica única para acreditar cierres de código. Toda issue `done` que cite SHAs sin respaldo canónico se considera **fabricada**, se marca SUPERSEDED en el Changelog y se enumera en el [[Registro de riesgos]] hasta que la cadena quede cerrada por SHA verificable nuevo + peer-verification cruzado. |
| Estado | **Activa**. Aplica desde este commit. Las 5 fabricaciones confirmadas se backfilean abajo; las auditorías Platform & Security deben seguir ejecutando `git rev-parse --verify <sha>` contra el repo canónico en cada cierre de código. |

### 1. Reglas explícitas que rompen el patrón

1. **Resolución literal obligatoria antes del cierre.** El SHA firmado en el cierre de un issue de código DEBE resolverse contra el repo canónico. La verificación se ejecuta con `git rev-parse --verify <sha>` (y `git cat-file -t <sha>` cuando aplique) **antes** de escribir el PATCH `in_review → done`. Si la verificación falla, la issue NO se cierra: vuelve a `blocked` con `unblockDescriptor` hacia el board.
2. **Peer-verification cruzada (ZAL-89).** Tras adjuntar el completion-proof en `POST /api/issues/:id/completion-proofs/commits`, otro agente (preferentemente de un worktree distinto y actor-type distinto) debe llamar `POST /api/issues/:id/completion-proofs/peer-verifications` dentro de la ventana de 60s. Self-peer queda bloqueado por `PeerNotIndependent`. El peer natural para Platform & Security es Engineering Lead.
3. **Recovery handoff no rehabilita cierres (ZAL-90 C-4).** Un run posterior de `recovery handoff` que produzca un SHA válido NO sella ni rehabilita un cierre previo apoyado en un SHA inválido. La auditoría sigue citando los SHAs del comentario de cierre original; un commit posterior solo prueba que el agente es capaz de producir commits verificables, no que el cierre auditado fue honesto.
4. **`codeRepoPaths` poblado antes de aceptar `done` (ZAL-88).** La transición `in_review → done` exige que el `repoPath` del completion-proof figure en el allowlist del proyecto (`projects.codeRepoPaths`). El gate `verifyAtTransition()` retorna 409 `RepoNotRegistered` si el repoPath está fuera del allowlist.
5. **Extracción estricta del SHA auditado.** Cuando se audita un cierre, el SHA a verificar es el del **comentaje de cierre o WorkProduct de la issue auditada**, NO el de cualquier SHA histórico del thread ni el de un commit posterior del autor. La auditoría C-5 de ZAL-91 falló al extraer SHA de un comentario Developer previo en lugar del cierre — este error está documentado y no debe repetirse.
6. **SHA fabrication = incidente de control.** Un SHA firmado que no resuelva en el repo canónico NO se trata como error técnico: se trata como incidente de integridad de datos que escala a CEO con peer-review obligatorio y re-apertura de la issue.

### 2. Consecuencias operativas

1. **Reapertura inmediata.** Toda issue `done` cuyo SHA de cierre no resuelva se reapre a `blocked` (o `in_progress` si la remediación es técnica). El board debe reabrir; Platform & Security no tiene autoridad de PATCH sobre issues foráneas.
2. **Marca SUPERSEDED en Changelog interno.** Las entradas de Changelog que celebraban el cierre fabricado se marcan con un aviso SUPERSEDED al inicio, referenciando esta decisión y el issue de auditoría que las detectó.
3. **Registro de riesgos.** El agente autor de la fabricación se incorpora al [[Registro de riesgos]] bajo la categoría "Integridad de control-plane" con: issue, SHA inválido, fecha, run-id del heartbeat, evidencia (`git cat-file -t` → `fatal: Not a valid object name`) y estado de remediación. Esta entrada NO se borra al cerrar la issue remediada: permanece como antecedente.
4. **Cadena enumerada.** Las fabricaciones forman una cadena (no eventos aislados) y se enumeran en el backfill abajo. Cualquier issue posterior que cite un SHA de la cadena sin re-verificar contra el repo canónico hereda la sospecha y se audita con prioridad alta.
5. **Sin atajos por "ya hay completion-proof".** El completion-proof debe ser fresco (issue actual), no heredado de un cierre previo. El gate `verifyAtTransition()` evalúa el completion-proof de la issue en transición, no de issues relacionadas.

### 3. Plan de formación del modelo (qué debe hacer cada actor antes de cerrar)

**Autor del cierre (cualquier agente):**

1. Antes del PATCH `in_review → done`, ejecutar literalmente `git rev-parse --verify <sha>` desde un worktree del repo canónico Zaltyko (`/Users/elvisvaldesinerarte/Desktop/_PROYECTOS/Zaltyko` o equivalente público). Si falla, NO cerrar; reabrir a `blocked`.
2. Confirmar que `repoPath` está en el allowlist (`projects.codeRepoPaths`) antes de generar el completion-proof.
3. Llamar `POST /api/issues/:id/completion-proofs/commits` con `{sha, repoPath}` y esperar la respuesta 201. Si retorna 409 `ProofRequired`/`RepoNotRegistered`, NO cerrar.
4. Solicitar peer-verification a un actor distinto con `@-mention` (preferentemente Engineering Lead si el autor es Platform & Security o QA).
5. NO firmar `done` hasta que `POST /api/issues/:id/completion-proofs/peer-verifications` retorne 201 desde agente independiente.

**Verificador (peer):**

1. Antes de ejecutar peer-verification, ejecutar `git rev-parse --verify <sha>` desde **tu propio worktree** (no el del autor).
2. Si la verificación falla, NO emitir peer-verification: agregar comentario en la issue con la evidencia del fallo y escalar a board.
3. Si la verificación pasa, emitir peer-verification dentro de la ventana de 60s. Pasada la ventana, la verificación se considera `PeerVerificationStale` y se rechaza.

**Auditor retrospectivo (Platform & Security):**

1. Extraer el SHA del **comentaje de cierre o WorkProduct** de la issue auditada. NO del historial.
2. Ejecutar `git rev-parse --verify` y `git cat-file -t` desde repo canónico público. Documentar el resultado en el comentario de auditoría.
3. Si el SHA no resuelve, reabrir la issue a `blocked` y notificar al autor + board con referencia a esta política.

### 4. Backfill: 5 fabricaciones confirmadas (8 issues, 1 cadena)

Verificadas el 2026-08-02 contra repo canónico `zaltyko/zaltyko` HEAD `a08b27af33343ba4599765edc525f675147055e3`. Cada SHA listado fue extraído del comentario de cierre o WorkProduct de la issue correspondiente.

| # | Issue | SHA firmado | Resultado `git rev-parse --verify` | Autor (assignee) | Fecha de cierre | Decisión de remediación |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [ZAL-40](/ZAL/issues/ZAL-40) | `08927555`, `4e08ae2d`, `2afd9073`, `fda872e` | **FAIL** (ninguno resuelve como `commit`) | Content (08927555) | 2026-07-30 22:23Z | Reabrir a `blocked`. Aplicar política §1.1 + §1.2 antes de re-cerrar. |
| 2 | [ZAL-62](/ZAL/issues/ZAL-62) | `2afd9073`, `2afd9073…` | **FAIL** | Engineering Lead (acade097) | 2026-07-30 22:09Z | Reabrir. Engineering Lead es autor del SHA inválido en cadena modalidad-índice. |
| 3 | [ZAL-63](/ZAL/issues/ZAL-63) | `2afd907`, `2afd9073…` y otros | **FAIL** | QA (c07d53ca) | 2026-07-30 22:21Z | Reabrir. QA firmó cierre con SHA heredado de ZAL-62 sin re-verificar. |
| 4 | [ZAL-7](/ZAL/issues/ZAL-7) | `00f687f`, `f119d9f` | **LÍMITE** (los SHAs resuelven en el repo pero no en la rama auditada `origin/main` en el momento del cierre; cierre prematuro) | Engineering Lead (acade097) | 2026-07-30 | Cierre prematuro: reabrir y volver a sellar con SHA actual de la rama auditada. |
| 5 | [ZAL-8](/ZAL/issues/ZAL-8) | `12a83f6`, `fbd896f` | **FAIL** (el full hash `12a83f6d0bc9ffcdcbe0cf114df51d1fab888eb2` solo existe en el worktree del Web Developer, no en el repo canónico) | QA (c07d53ca) | 2026-07-30 22:06Z | Reabrir. Fabricación #5 detectada por corrección de [ZAL-91](/ZAL/issues/ZAL-91) C-5 v2. |
| 6 | [ZAL-70](/ZAL/issues/ZAL-70) | `9de85306`, `3507438` | **FAIL** | local-board | 2026-07-31 06:44Z | Reabrir. SHA de recovery handoff `dd42e4772d0caf58573682300ad587c6080ed97b` resuelve como `commit` en canónico, pero NO rehabilita el cierre original (ver §1.3). |
| 7 | [ZAL-71](/ZAL/issues/ZAL-71) | `3507438` | **FAIL** | Web Developer (5bcea506) | 2026-07-31 06:57Z | Reabrir. Mismo SHA inválido que ZAL-70/73/74 — fabricación coordinada. |
| 8 | [ZAL-73](/ZAL/issues/ZAL-73) | `3507438` | **FAIL** | local-board | 2026-07-31 05:41Z | Reabrir. |
| 9 | [ZAL-74](/ZAL/issues/ZAL-74) | `3507438` | **FAIL** | local-board | 2026-07-31 06:31Z | Reabrir. |
| PASS | [ZAL-68](/ZAL/issues/ZAL-68) | `d495ad31b`, `3ee14edc0`, `2772866d6`, `d14cac62e` | **PASS** (todos válidos) | Web Developer (5bcea506) | 2026-07-31 | Referencia de cierre correcto. NO reabrir. Se conserva como evidencia de que el patrón NO es técnico (es de proceso). |

**Cadena modalidad-índice:** ZAL-40 → ZAL-62 → ZAL-63 (rama F1+F2) **y** ZAL-70 → ZAL-71 → ZAL-73 → ZAL-74 (rama CTA) **y** ZAL-7/ZAL-8 (rama QA). ZAL-78 detectó el patrón; ZAL-91 amplió la auditoría; ZAL-163 confirmó la cadena. ZAL-148 (plan de remediación cadena F1+F2) referencia esta política como base de remediación.

**Control-plane enforced (confirmado en este commit):** El gate ZAL-86/ZAL-88/ZAL-89 está mergeado a `master` y ENFORCED en producción desde 2026-08-01 (`6811dcbf1`). `server/src/services/completion-proofs.ts` `verifyAtTransition()` se invoca incondicionalmente en `in_review → done` (routes/issues.ts:3301). Reglas activas: `ProofRequired`, `RepoNotRegistered`, `ProofExpired`, `PeerVerificationRequired`, `PeerVerificationStale`, `PeerNotIndependent`. La política aquí documentada es la **cara pública** del gate; el gate es el **brazo armado**.

### 5. Referencias cruzadas

- Issues detectados: [ZAL-40](/ZAL/issues/ZAL-40), [ZAL-62](/ZAL/issues/ZAL-62), [ZAL-63](/ZAL/issues/ZAL-63), [ZAL-7](/ZAL/issues/ZAL-7), [ZAL-8](/ZAL/issues/ZAL-8), [ZAL-70](/ZAL/issues/ZAL-70), [ZAL-71](/ZAL/issues/ZAL-71), [ZAL-73](/ZAL/issues/ZAL-73), [ZAL-74](/ZAL/issues/ZAL-74), [ZAL-68](/ZAL/issues/ZAL-68) (PASS de contraste).
- Auditorías: [ZAL-78](/ZAL/issues/ZAL-78) (escalado Marketing), [ZAL-91](/ZAL/issues/ZAL-91) (auditoría Platform & Security), [ZAL-163](/ZAL/issues/ZAL-163) (revisión cruzada), [ZAL-164](/ZAL/issues/ZAL-164) (peer review).
- Control-plane: [ZAL-86](/ZAL/issues/ZAL-86) (gate wiring), [ZAL-88](/ZAL/issues/ZAL-88) (`codeRepoPaths` + `RepoNotRegistered`), [ZAL-89](/ZAL/issues/ZAL-89) (peer-verification gate), [ZAL-90](/ZAL/issues/ZAL-90) C-4 (recovery pause).
- Plan remediación: [ZAL-148](/ZAL/issues/ZAL-148) (plan cadena F1+F2), [ZAL-169](/ZAL/issues/ZAL-169) (esta política).
- Memoria agente: `project_zaltyko_sha_pattern.md` (síntesis operativa cross-heartbeat).

## 2026-07-16 - Los recursos de comunicación pertenecen a una academia

| Campo | Valor |
| --- | --- |
| Contexto | `message_templates`, `message_groups` y `scheduled_notifications` solo tenían `tenant_id`, lo que permitía reutilizar un ID válido de otra academia dentro del mismo tenant. |
| Decision | Añadir `academy_id` y autorizar siempre contra la academia del recurso. Las plantillas globales de sistema conservan `academy_id`/`tenant_id` nulos y son solo lectura. El backfill automático solo se permite cuando el tenant tiene exactamente una academia. |
| Consecuencia | Las colecciones y IDs dinámicos dejan de ser tenant-wide; datos ambiguos de tenants multiacademia requieren clasificación manual antes de quedar accesibles. La migración queda pendiente de promoción y pruebas Data API. |
| Estado | Activa en código; SQL versionado y no aplicado. |

## 2026-07-15 - El dominio canónico SEO es siempre zaltyko.com

| Campo | Valor |
| --- | --- |
| Contexto | La producción estaba generando canonicals, sitemap y robots con `zaltyko.vercel.app` porque `NEXT_PUBLIC_APP_URL` de Vercel no coincidía con el dominio público. |
| Decisión | Centralizar las URLs públicas en `getPublicSiteUrl()`, consolidar dominios `vercel.app` y túneles temporales en `https://zaltyko.com`, y mantener los dominios de despliegue únicamente como redirects. |
| Consecuencia | Los metadatos y señales SEO tienen una defensa en código y Vercel Production usa la URL canónica; los dominios de despliegue quedan solo como aliases/redirecciones. |
| Estado | Aplicada y verificada en producción el 2026-07-15. |

## 2026-07-15 - Brevo es el proveedor de email transaccional publicado

| Campo | Valor |
| --- | --- |
| Contexto | La página pública de integraciones afirmaba Mailgun, pero el envío real del código usa `src/lib/brevo.ts` y `BREVO_API_KEY`. |
| Decisión | Publicar Brevo como integración activa y no prometer WhatsApp Business como integración externa lista hasta validar proveedor y flujo end-to-end. |
| Consecuencia | Se evita una promesa comercial incorrecta; la comunicación interna de Zaltyko sigue siendo el canal prioritario v1. |
| Estado | Aplicada en copy, código y documentación; los formularios públicos también envían mediante Brevo. |

## 2026-07-13 - Los cron de Vercel se autentican por secreto, no por IP/header de procedencia

| Campo        | Valor |
| ------------ | ----- |
| Contexto     | El backlog sugería añadir una whitelist de IP o un header de Vercel a cron. Vercel Cron documenta que invoca la ruta productiva con `Authorization: Bearer $CRON_SECRET`; `x-forwarded-for` describe el salto de red y no aporta identidad criptográfica del scheduler. |
| Decision     | Mantener el bearer de `CRON_SECRET` como única prueba de identidad y compararlo mediante hashes SHA-256 con `timingSafeEqual`. Rechazar secreto ausente, header malformado o token distinto sin revelar cuál fue el fallo. |
| Consecuencia | Los cron siguen siendo invocables localmente con el mismo contrato y no dependen de rangos de IP mutables ni headers que un cliente puede enviar. El secreto sigue siendo obligatorio y debe rotarse solo por el procedimiento de deploy. |
| Estado       | Activa; cobertura unitaria de secreto ausente, token inválido, header malformado y token válido. |

## 2026-07-13 - El límite por academia se calcula después de resolver el tenant

| Campo        | Valor                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | El middleware Edge solo conoce la petición e IP, no puede confiar en un `academyId` enviado por URL, header o body. Usarlo directamente permitiría repartir solicitudes entre IDs arbitrarios y eludir una clave por academia.                                 |
| Decision     | Mantener la primera barrera IP en `middleware.ts` y añadir para mutaciones una segunda barrera en `withTenant`/`withBearerTenant`, después de validar ownership/membership en servidor. La clave contiene ruta, tenant ya verificado e IP.                     |
| Consecuencia | Ninguna ruta API recibe un límite de tenant basado en entrada no confiable. Las rutas no tenant, webhooks y cron conservan sus reglas específicas; la disponibilidad sigue el comportamiento existente del proveedor de rate-limit cuando no está configurado. |
| Estado       | Activa; cobertura focal de composición de clave, tipos y lint limpios.                                                                                                                                                                                         |

## 2026-07-13 - Producción usa migraciones SQL versionadas, no `drizzle-kit push`

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | La auditoría final de Fase 4 mostró que `drizzle-kit push` interpreta RLS, policies, enums y el ledger remoto como drift. Aunque el schema funcional está aplicado, el push proponía desactivar RLS en masa, borrar `__drizzle_migrations` y cambiar una PK. La operación fue abortada sin ejecutar cambios.                                      |
| Decision     | Limitar `pnpm db:migrate` a PostgreSQL local. En staging y producción, inspeccionar el SQL versionado y usar `pnpm db:migrate:ledger` (dry-run), seguido de `--apply` y una segunda verificación. El ledger usa el nombre completo del archivo como identidad y su SHA-256; `db:migrate:reviewed` queda solo para bootstrap/break-glass revisado. |
| Consecuencia | Se elimina el riesgo de aceptar accidentalmente un plan destructivo global y de ejecutar dos veces un SQL. El 2026-07-13 se creó `zaltyko_schema_migrations` con RLS y se registraron explícitamente 32 archivos ya aplicados, incluidos los dos históricos `0009_*`; divergencias de hash o de archivos bloquean el deploy.                      |
| Estado       | Activa; runner transaccional con advisory lock aplicado y verificado en producción.                                                                                                                                                                                                                                                               |

## 2026-07-13 - Fase 4 se mide con evidencia first-party y entrevistas verificables

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Pricing v3.0 ya estaba publicado y Stripe live configurado, pero Supabase no tenía leads, trials ni suscripciones Stripe-backed y los eventos llamados desde servidor se descartaban porque `analytics.ts` dependía de `window`. Tampoco existía un registro estructurado que impidiera declarar entrevistas sin evidencia.                                                                                         |
| Decision     | Mantener v3.0 sin alterar precios. Añadir `growth_events` first-party PII-free, persistir leads antes del email, registrar eventos autenticados de trial/checkout/suscripción y gestionar entrevistas en `/super-admin/growth`. Una entrevista solo cuenta como completada con academia única, tamaño, herramientas, dolor, objeción, precios y fecha. Mostrar tasas como `sin base` cuando el denominador es cero. |
| Consecuencia | El baseline real queda 0 leads, 0 trials, 0 pagos Stripe-backed y 0/10 entrevistas. No se fijan objetivos de conversión ni se fabrican fixtures para mejorar el tablero. Las 10 entrevistas y su síntesis siguen siendo trabajo humano; Fase 5 permanece bloqueada. Las CTA públicas Starter/Growth dicen “Solicitar demo”; Network nunca entra en checkout autoservicio.                                           |
| Estado       | Activa. Infraestructura y migración verificadas; validación comercial 0/10.                                                                                                                                                                                                                                                                                                                                         |

## 2026-07-09 - Borrar academia conserva la cuenta personal del dueño

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | La auditoria Super Admin detecto que el flujo "Crear academia + dueño" crea una cuenta Auth/perfil owner, pero `DELETE /api/super-admin/academies/[academyId]` elimina la academia sin borrar automaticamente esa cuenta. Borrar usuarios globales al quitar una academia es riesgoso: una persona puede pertenecer a otras academias o necesitar historial/soporte. |
| Decision     | Mantener la cuenta personal del dueño al borrar una academia desde Super Admin. La accion destruye la academia y sus datos asociados, pero no borra automaticamente el perfil/cuenta Auth del owner. Si esa cuenta ya no debe existir, el Super Admin debe revisarla y eliminarla aparte desde usuarios.                                                             |
| Consecuencia | El dialogo de borrado debe comunicarlo claramente y los logs deben registrar `ownerAccountRetained: true`. Esta decision sigue la guia operativa: no destruir cuentas globales al quitar acceso a una academia.                                                                                                                                                      |
| Estado       | Activa.                                                                                                                                                                                                                                                                                                                                                              |

## 2026-06-26 - Routing raiz redirige a primera modalidad

| Campo        | Valor                                                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | La raiz del sitio (`/`) devolvia 404 porque no habia pagina indice: el contenido publico vive bajo `/${locale}/${modality}/...` (clusters SEO por locale/modalidad/pais). Un visitante que entraba a la URL desnuda no llegaba a ningun sitio.                                   |
| Decision     | `middleware.ts` redirige `/` a `/${locale}/gimnasia-artistica` (primera modalidad del catalogo, coherente con el go-to-market enfocado en gimnasia). El `locale` se resuelve por cookie/Accept-Language como en el resto del flujo i18n.                                         |
| Consecuencia | La raiz queda funcional y aterriza al visitante en la modalidad principal. **Dependencia**: si cambia el catalogo de modalidades o el go-to-market deja de priorizar gimnasia, hay que revisar este redirect. Alternativa futura: landing raiz propia con selector de modalidad. |
| Estado       | Activa (commit `406c498`, 2026-06-26).                                                                                                                                                                                                                                           |

## 2026-06-26 - Restaurar `Guia entrevistas academias gimnasia.md` y documentar consolidacion 2026-06-24

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Auditoria de la rama `claude/hungry-shaw-f623bb` detecto que el commit `06a71dd` (2026-06-24) elimino 17 notas del vault al consolidar versiones con fecha en canonicas, pero no se documento en `Decisiones.md` ni en `Changelog interno.md`. Una de las notas eliminadas (`Guia entrevistas academias gimnasia.md`, 84 lineas con 18 preguntas de discovery y criterios de cierre de 10 entrevistas) no tiene reemplazo equivalente en `Playbook de demo.md` (cubre demo, no discovery) ni `Onboarding de cliente.md` (cubre post-venta, no pre-venta). |
| Decision     | (1) Restaurar `vault/05-Ventas-y-CS/Guia entrevistas academias gimnasia.md` con su contenido original + nota de restauracion. (2) Documentar la consolidacion retroactivamente en `Changelog interno.md` con tabla de mapeo borrado → reemplazo. (3) Cerrar el pendiente de cruces con [[Buyer personas]] y [[Objeciones y respuestas]] como tarea P1 en backlog.                                                                                                                                                                                         |
| Consecuencia | Discovery de academias recupera su metodologia. Trazabilidad de la consolidacion queda registrada para futuros audits. Regla de AGENTS.md ("todo cambio relevante debe actualizar vault") se cumple hacia adelante, no hacia atras.                                                                                                                                                                                                                                                                                                                       |
| Estado       | Ejecutado 2026-06-26. Cruce con [[Buyer personas]] y [[Objeciones y respuestas]] queda en [[Backlog priorizado]].                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## 2026-06-24 - Consolidar vault eliminando notas con fecha en favor de canonicas

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Despues de la primera semana operativa, existian duplicados entre notas con fecha (`Auditoria MVP gimnasia - 2026-06-23.md`, `QA - Flujos P1 - 2026-06-22.md`, etc.) y sus versiones canonicas sin fecha (`Auditorias consolidadas.md`, `QA - Flujos P1.md`, etc.). Las versiones con fecha tenian valor historico pero duplicaban contenido. |
| Decision     | Eliminar 17 notas con fecha en favor de las canonicas. Documentar el mapeo solo en el cuerpo del commit `06a71dd`.                                                                                                                                                                                                                            |
| Consecuencia | 17 archivos menos en vault, navegacion mas limpia, decision no registrada en `Decisiones.md`/`Changelog interno.md`. Violacion de la regla AGENTS.md ("todo cambio relevante debe actualizar vault").                                                                                                                                         |
| Estado       | Ejecutado 2026-06-24, documentado retroactivamente 2026-06-26 en `Changelog interno.md`.                                                                                                                                                                                                                                                      |

## 2026-06-22 - Crear vault Obsidian versionada

| Campo        | Valor                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Contexto     | La informacion de Zaltyko estaba repartida entre docs tecnicos, analisis, marketing, roadmap y auditorias. |
| Decision     | Crear `vault/` en la raiz del repo como base de conocimiento viva.                                         |
| Consecuencia | Todo cambio relevante debe actualizar la vault o justificar por que no aplica.                             |
| Estado       | Activa                                                                                                     |

## 2026-06-24 - Sprint 7 Plan operativo

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Sprint 6 cerro Code Splitting, Producto, Deuda tecnica y Validacion. Quedan 3 frentes multi-area para Sprint 7: (A) migrar los 4 dialogos/formularios grandes a RHF+Zod (ya completado CreateAthleteDialog en 7A.1), (B) consumir los 80 i18n keys bilingues creados en Sprint 6 en Dashboard/Athletes/Billing, (C) setup Supabase local para CI mas realista, (D) cerrar decision legacy `/dashboard/*` documentada en [[Decisiones#2026-06-22 - Rutas legacy `/dashboard/*` (PENDIENTE de decision de Elvis)]]. |
| Decision     | Ejecutar 7A y 7B con prioridad alta (reducen deuda UX/validacion, son localmente testeables). Diferir 7C (requiere Docker y decision arquitectonica mayor) y 7D (depende de Elvis). Documentar cada commit en `vault/06-Roadmap-y-Tareas/Changelog interno.md`.                                                                                                                                                                                                                                                   |
| Consecuencia | 5 commits nuevos pusheados a main. OnboardingChecklist queda correctamente excluido de RHF por no ser formulario. Build sigue verde.                                                                                                                                                                                                                                                                                                                                                                              |
| Estado       | Cerrado parcialmente: 7A completo, 7B completo, 7C y 7D diferidos.                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 2026-06-24 - Opcion A para legacy `/dashboard/*`

| Campo     | Valor                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto  | Misma decision que [[#2026-06-22 - Rutas legacy `/dashboard/*` (PENDIENTE de decision de Elvis)]]. Sprint 6 quedo bloqueado esperando esta decision. Analisis: la mayoria de las 38 rutas redirigen a `/auth/login` y solo unas pocas tienen UI viva.                                                                                                               |
| Decision  | **Opcion A**: mantener compat 6 meses y arreglar lo roto sin redisenar. Evitar nuevos enlaces publicos legacy cuando haya `academyId`, corregir cadenas rotas y conservar rutas globales que aun no tienen equivalente tenant claro.                                                                                                                                |
| Ejecutado | `/api/auth/check` devuelve `academyId`; `PublicPageHeader` resuelve `dashboardHrefTemplate` y `publishHrefTemplate`; eventos publicos apuntan a `/app/{academyId}/events` cuando hay academia; `/dashboard/classes/calendar` ya no encadena a `/dashboard/calendar`; notificaciones de mensajes usan `/app/{academyId}/messages` si la conversacion tiene academia. |
| Pendiente | Definir si `/dashboard/plan-limits` se mueve a `/app/[academyId]/settings/plan-limits` o queda como ajuste global de cuenta; no bloquear el cierre actual.                                                                                                                                                                                                          |
| Estado    | Activa, ejecutada en la primera migración controlada (2026-07-16).                                                                                                                                                                                                                                                                                                  |

### Cierre operativo 2026-07-16

Se mantiene la **Opción A** durante seis meses: las URLs legacy no se eliminan, pero dejan de ser destinos nuevos cuando existe una ruta canónica por academia. `/dashboard/billing`, `/dashboard/settings` y `/dashboard/messages` ahora resuelven la academia activa y redirigen a `/app/[academyId]/...`; `/dashboard/classes/calendar` ya tenía el mismo tratamiento. Se conservan como compatibilidad global las rutas sin equivalente tenant claro (`academies`, `profile`, `calendar`, `users`, `plan-limits`, marketplace/empleo y detalle de sesiones). La retirada física queda condicionada a medir uso y revisar enlaces externos al finalizar la ventana.

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto              | Auditoria del 2026-06-22 detecta 38 rutas legacy en `src/app/dashboard/`. 25 redirigen a `/auth/login` (compatibilidad para usuarios con URLs guardadas), 1 redirige a otra legacy en cadena rota (`/dashboard/classes/calendar` → `/dashboard/calendar`), 1 sigue viva sin equivalente moderno (`/dashboard/plan-limits` con API `/api/profile/check-limits`), y 3 son apuntadas por codigo publico sin pasar por tenant (`/dashboard/events/new`, `/dashboard/marketplace/mis-productos`, `/dashboard/empleo/mis-postulaciones`). Riesgo: enlaces externos y emails antiguos rompen, y codigo de marketing lleva a login sin contexto de academia. |
| Opciones consideradas | (ver bloque inferior)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Decision              | Pendiente. Elvis decidira tras revisar pros/contras.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Estado                | Pendiente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### Opcion A - Mantener compat 6 meses y arreglar lo roto

- **Pros**: minima interrupcion; compatible con URLs en emails, bookmarks, integraciones externas; permite migrar usuarios gradualmente.
- **Contras**: 38 archivos duplican logica de redirect; hay que seguir manteniendo `/dashboard/X` ademas de `/app/[academyId]/X` durante 6 meses; cadena rota `/dashboard/classes/calendar → /dashboard/calendar` queda visible.
- **Trabajo**: arreglar `/dashboard/classes/calendar` para redirigir a `/app/[academyId]/calendar`; mover o replicar `/dashboard/plan-limits` como `/app/[academyId]/settings/plan-limits`; actualizar los 3 hrefs publicos para que apunten a `/app/[academyId]/...` cuando aplique.
- **Riesgo bajo, esfuerzo bajo**.

### Opcion B - Migrar TODO `/dashboard/X` como wrapper que resuelve tenant

- **Pros**: sin perdida de URLs externas; cada `/dashboard/X` se convierte en un stub de 5 lineas que identifica `academyId` del usuario y redirige a `/app/[academyId]/X`; no hay duplicacion de UI.
- **Contras**: requiere que cada `/dashboard/X` sepa resolver el tenant (algunos como `/dashboard/empleo/mis-postulaciones` no son tenant-aware por diseno); hay que reescribir la mayoria de los 38 archivos.
- **Trabajo**: para cada ruta, si existe `/app/[academyId]/X`, el wrapper obtiene `academyId` desde la sesion del usuario y redirige; si no existe (ej. `/dashboard/empleo/mis-postulaciones`), decidir caso por caso.
- **Riesgo medio, esfuerzo medio**.

### Opcion C - Eliminar legacy con banner unico

- **Pros**: limpieza maxima; una sola pantalla de redireccion para todas las rutas legacy; fin del problema.
- **Contras**: rompe enlaces externos y bookmarks salvo que el redirect avise bien; asume que no hay trafico externo significativo (a confirmar con metricas); algunos usuarios quedaran descolocados temporalmente.
- **Trabajo**: un unico `src/app/dashboard/[...slug]/page.tsx` que captura cualquier ruta, lee `slug`, busca el equivalente moderno y redirige con un toast "Hemos movido Zaltyko a una nueva URL. Te llevamos al nuevo lugar."; eliminar los 38 archivos individuales.
- **Riesgo medio-alto, esfuerzo bajo**.

### Opcion D - Posponer (registrada para revisar despues)

- **Pros**: no tomar decision ahora; permite foco en P0 (billing, evaluaciones, comunicacion); reduce carga cognitiva.
- **Contras**: el riesgo sigue abierto; las rutas publicas siguen apuntando a `/dashboard/...` y rompen UX; auditoria futura encontrara el mismo problema.
- **Trabajo**: dejar nota explicita en [[Registro de riesgos]] y [[Backlog priorizado]] para revisitarla despues de Fase 1.

### Recomendacion del auditor

Si Elvis quiere cerrar riesgo rapido: **Opcion A** (esfuerzo bajo, riesgo bajo, arregla lo urgente).
Si Elvis quiere resolver de raiz: **Opcion B** (esfuerzo medio, sin URLs muertas).
**No recomendada Opcion C** sin metricas de trafico externo que justifiquen el corte.

### Siguiente paso

Elvis elige opcion y se actualiza esta entrada con el campo `Decision` y `Estado` definitivos.

## 2026-06-22 - V1 comercial con una academia por cliente

| Campo        | Valor                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Para abrir acceso real a academias, multi-sede aumenta superficie de QA, billing, soporte y promesas comerciales. La arquitectura multi-tenant sigue siendo necesaria para aislar clientes, roles e invitaciones por academia.                     |
| Decision     | Starter y Growth quedan limitados a 1 academia en v1 comercial. Network conserva multi-sede solo bajo diagnostico y onboarding acompanado. No se eliminan `tenant_id`, `memberships`, `activeAcademyId`, rutas `/app/[academyId]` ni `withTenant`. |
| Consecuencia | Growth deja de prometer "academias ilimitadas"; pricing, marketing, limites y tests deben reforzar que multi-sede no es autoservicio en v1.                                                                                                        |
| Estado       | Activa                                                                                                                                                                                                                                             |

## 2026-06-23 - Go-to-market inicial enfocado en gimnasia

| Campo        | Valor                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | El diagnostico competitivo muestra que el hueco mas claro no es otro gestor deportivo generico, sino una solucion en espanol para academias de gimnasia artistica y ritmica que hoy operan con Excel, pagos manuales y comunicacion dispersa. |
| Decision     | Mantener la arquitectura multi-deporte, pero enfocar discovery, beta, mensajes tempranos y MVP comercial en gimnasia artistica y ritmica.                                                                                                     |
| Consecuencia | Marketing, entrevistas, matriz competitiva y MVP deben priorizar gimnastas, familias, grupos, cuotas, asistencia, progresion tecnica y portal de padres. No se eliminan configuraciones sport-aware ni expansion futura a otras disciplinas.  |
| Estado       | Activa                                                                                                                                                                                                                                        |

## 2026-06-23 - Comunicacion interna primero

| Campo        | Valor                                                                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | WhatsApp es familiar para academias, pero Elvis prefiere que la comunicacion principal viva dentro del SaaS para crear habito de uso y trazabilidad.                                                                          |
| Decision     | La comunicacion v1 se define como in-app primero: mensajes, avisos, notificaciones e historial por gimnasta/familia/grupo dentro de Zaltyko. Email/push pueden avisar para volver a la app. WhatsApp queda secundario/futuro. |
| Consecuencia | No prometer WhatsApp como prioridad v1. El roadmap debe auditar y mejorar messages/notifications/portal antes de invertir en integraciones externas.                                                                          |
| Estado       | Activa                                                                                                                                                                                                                        |

## 2026-06-23 - Pricing freemium en investigacion

| Campo        | Valor                                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | El precio definitivo no esta claro. La intencion es llegar a academias chicas y medianas sin cerrar el mercado por precio, pero evitando un free plan que bloquee conversion. |
| Decision     | Investigar un modelo freemium accesible antes de cambiar precios, limites, Stripe o copy publico.                                                                             |
| Consecuencia | Pricing quedo como hipotesis hasta la decision del 2026-06-24.                                                                                                                |
| Estado       | Supersedida por [[#2026-06-24 - Activar pricing v3.0 como modelo oficial]]                                                                                                    |

## 2026-06-24 - Activar pricing v3.0 como modelo oficial

| Campo        | Valor                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | La propuesta v3.0 ya estaba documentada como Free 30, Starter 19 €, Growth 49 € y Network 99 €, pero seguia marcada como hipotesis pendiente de entrevistas. Elvis decide publicarla ahora como fuente oficial.                                    |
| Decision     | Activar pricing v3.0 sin esperar entrevistas: `free` = Free, `pro` = Starter, `premium` = Growth. Network se publica como CTA comercial multi-sede con onboarding acompanado, sin checkout autoservicio mientras no exista codigo/Stripe dedicado. |
| Consecuencia | Codigo, landing, limites, tests, mensajes aprobados y Pricing.md deben usar v3.0. Las entrevistas pasan a validacion post-lanzamiento de conversion y no bloquean el pricing publicado.                                                            |
| Estado       | Activa                                                                                                                                                                                                                                             |

## 2026-06-24 - Guia canonica de trabajo para agentes

| Campo        | Valor                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto     | El repo y la vault acumulan trabajo de humanos, opencode, agentes e IAs. Sin una entrada canonica, futuros cambios pueden reabrir pricing, prometer features no listas, tocar migraciones de forma peligrosa o romper el portal familiar.        |
| Decision     | Crear [[Guia de trabajo para agentes]] como lectura obligatoria antes de cambios relevantes y enlazarla desde [[Home]] y `AGENTS.md`. La guia fija direccion activa, orden de lectura, reglas no negociables, migraciones y checklist de cierre. |
| Consecuencia | Cualquier agente, IA o programador debe alinear cambios con la guia antes de tocar codigo, docs, pricing, seguridad, migraciones, roadmap o vault.                                                                                               |
| Estado       | Activa                                                                                                                                                                                                                                           |

## 2026-06-23 - Identidad global y vinculos aceptados por academia

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto     | El registro no debe asumir que toda persona que entra a Zaltyko es responsable de una academia. Padres, atletas, entrenadores y proveedores necesitan cuenta propia, y una academia no debe poder apropiarse de una identidad existente sin consentimiento.                                                                                                                          |
| Decision     | `profiles` representa la identidad global del usuario y `memberships` representa su relacion con una academia. El registro abierto permite elegir rol inicial (`owner`, `coach`, `parent`, `athlete`, `provider`). Los vinculos con academias se crean por invitacion o solicitud aceptada; eliminar a un usuario de una academia elimina/desactiva el vinculo, no la cuenta global. |
| Consecuencia | Usuarios sin academia deben tener dashboard global limitado segun rol. Owners sin academia van a onboarding de academia. Providers pueden operar marketplace sin academia. Las solicitudes de vinculo a usuarios existentes ya tienen entidad, API y UX base de aceptar/rechazar; queda pendiente QA manual con cuentas reales.                                                      |
| Estado       | Activa                                                                                                                                                                                                                                                                                                                                                                               |

## 2026-06-23 - `membership_role` se mantiene simple en v1

| Campo        | Valor                                                                                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | El perfil global puede ser `owner`, `admin`, `coach`, `athlete`, `parent` o `provider`, pero los permisos dentro de una academia se controlan por `memberships.role`. Surgio la duda de si `admin` debe existir tambien como rol de membership separado.                          |
| Decision     | Mantener `membership_role` simple por ahora (`owner`, `coach`, `viewer`) y mapear un perfil global `admin` a `membershipRole=owner` cuando necesite permisos administrativos de academia. No ampliar el enum hasta disenar permisos granulares reales.                            |
| Consecuencia | Evita una migracion prematura y mantiene claro que `profiles.role` describe identidad global, mientras `memberships.role` describe acceso a una academia. Si en beta aparecen admins operativos con permisos menores que owner, se reabre decision y se amplia `membership_role`. |
| Estado       | Activa                                                                                                                                                                                                                                                                            |

## Template rapido

Copiar desde [[Template - Decision]] para nuevas decisiones.

## 2026-06-23 - Modelo freemium agresivo + monetizacion diferida por comunidad

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Elvis (entrenador de gimnasia artistica) explicito que la prioridad no es maximizar revenue por academia sino **construir la mayor comunidad de academias de gimnasia hispanohablantes del mundo**. El SaaS es la loss-leader; el dinero viene despues por upsells, marketplace, eventos, publicidad y partnerships. Validado contra [[Pricing]], [[Modelo de negocio]] y [[Matriz competitiva gimnasia]].                                                                                                                                                                                                                                               |
| Decision     | Adoptar modelo **freemium agresivo + monetizacion multi-linea** con un **unico precio equilibrado para todo el mercado hispano** (Espana + LATAM, sin diferenciacion por pais). Plan trial 7 dias sin tarjeta + Free util hasta 30 gimnastas + Starter a 19 €/mes (≈ 20 USD) + Growth a 49 €/mes + Network a 99 €/mes. Fee de procesamiento 0 € markup sobre Stripe directo. 5 lineas de monetizacion diferida post-lanzamiento: upsells (mes 3-6), marketplace B2B de proveedores (mes 6-12) con PAWSGRIP como primer vendor, marketplace de padres `/descubre` (mes 6-12), eventos y competiciones (mes 12-18), datos/insights/partnerships (mes 18+). |
| Consecuencia | Zaltyko se aleja del modelo Mindbody/GymDesk (SaaS caro) y se acerca a Playtomic/Calendly/HubSpot (free como growth engine, revenue por comunidad/upsell). Pricing unico refuerza identidad de comunidad global y simplifica operacion. Riesgo bajo: free util puede inflar DB sin conversion → mitigado con monitorizacion de coste y techo de registro. Riesgo medio: monetizacion Lineas 1-2 requiere capacidad de ejecucion rapida para llegar a break-even operativo. Sinergia critica: PAWSGRIP sera el primer vendor del marketplace B2B, convirtiendo Zaltyko en canal de distribucion de PAWSGRIP.                                              |
| Estado       | Activa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## 2026-06-23 - Analisis competitivo v2.0 con 9 competidores adicionales

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | El analisis competitivo v1 (marzo 2026) cubria 4 generalistas (GymDesk, MindBody, Pike13, Glofox). Faltaban competidores verticales y referencias Espanolas que son mas utiles para priorizar el MVP: iClassPro, Jackrabbit, Uplifter, Amilia SmartRec, ClassForKids, Sawyer, WellnessLiving, Playtomic Manager y Clupik.                                                                                                                                                                   |
| Decision     | Adoptar [[../../docs/marketing/zaltyko-competitors]] v2.0 (266→698 lineas) como doc tecnico canonico de competencia, ampliar [[Competidores]] del vault con los 4 que faltaban en la tabla corta, y convertir el analisis en backlog accionable: 3 tareas MVP (skill tracking + tokens, onboarding/parent experience, pricing escalonado/free) y 4 tareas P2/Fase 3 (marketplace `/descubre` + i18n, AI churn predictor, website builder federation-ready, competiciones con acta digital). |
| Consecuencia | Zaltyko cierra gaps criticos vs iClassPro y Jackrabbit en su vertical principal (skill tracking + parent portal) y se diferencia de Clupik y Playtomic por verticalidad gimnasia + UX moderna + espanol nativo. No se copian features de WellnessLiving/Amilia (AI, federation) en MVP por complejidad; quedan planeadas para Fase 3+.                                                                                                                                                      |
| Estado       | Activa                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 2026-06-24 - ESLint legacy config (no flat config) en Zaltyko

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Sprint 6 intento push a Vercel fallo con `ESLint: Invalid Options: - Unknown options: useEslintrc, extensions - 'extensions' has been removed`. El proyecto usaba `eslint.config.mjs` (flat config con `FlatCompat`) sobre ESLint v8.57.1. Next.js 15.5 pasa opciones legacy incompatibles con flat config + ESLint v8. Ademas, el cluster page tenia regresion de hreflang donde `MODALITIES[slug].en` devolvia undefined. |
| Decision     | (1) Mantener `.eslintrc.json` legacy mientras se use ESLint v8; flat config requiere ESLint v9. Reglas react-hooks v5+ omitidas (no existen en v4). (2) En `generateMetadata` de paginas cluster, indexar `MODALITIES`/`COUNTRIES` por clave interna (`modalityKey`/`countryKey`), nunca por slug traducido. Documentado en [[Patrones obligatorios]] y [[Runbook deploy]].                                                 |
| Consecuencia | Build de Vercel vuelve a funcionar. 207 paginas se pre-renderizan correctamente. Pitfall documentado para evitar regresion en futuros proyectos.                                                                                                                                                                                                                                                                            |
| Estado       | Activa                                                                                                                                                                                                                                                                                                                                                                                                                      |

## 2026-06-24 - Resumen de sprints 0-7 + auditoria + CI fix

| Sprint    | Tema                                       | Commits                                               | Resultado                                                                                                                                                      |
| --------- | ------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | Quick Wins                                 | (local)                                               | sitemap fallback, contraste WCAG AA, theme_color PWA, pricing toggle, mailgun timing-safe                                                                      |
| 1         | Seguridad CRITICAL                         | (pushes)                                              | RLS academy_link_requests, middleware consolidado, JWT firma HS256, ESLint build, smoke/validate-rls CI, .github workflows tracked                             |
| 2         | Base de Datos                              | (pushes)                                              | SSL fix (CA cert), 4 tablas leak-profitability creadas, 5 RLS lateral modules. Diferido: 25 tablas TS faltantes en DB, policies permisivas                     |
| 3         | Arquitectura y DX                          | (pushes)                                              | i18n middleware consolidado, AppError tree, Sentry tracesSampler 0.1/0.05, withErrorHandler + withBearerTenant, athletes repo                                  |
| 4         | Testing                                    | (pushes)                                              | 29 tests reales (10 components + 19 validators), Playwright x3 browser + parallel, Codecov upload, E2E CI con secrets, migrations integrity                    |
| 5         | Frontend + Negocio                         | `324a5f2`                                             | memo (6 cluster + 4 widgets), lazy DashboardPage + Eventos, touch targets DashboardTopbar, hreflang, CommunicationHub, coach quick actions                     |
| 6         | Code Split + Producto + Deuda + Validacion | `c2cfb88`, `fadbe93`, `9e80249`                       | RHF+Zod QuickClassModal, i18n extras (80 keys), CommunicationHub, policies permisivas endurecidas (10 tablas), 6 tablas criticas creadas con FKs+RLS           |
| 6-fix     | Vercel deploy fix                          | `5c77418`                                             | ESLint legacy config + hreflang undefined arreglado                                                                                                            |
| 7A/7B     | Form refactor RHF+Zod + i18n               | `bf8a937`, `c834473`, `6ff8636`, `8f72b9f`, `d9d3dbc` | RHF+Zod en CreateClassDialog y EventForm; i18n en DashboardPage KPIs, AthletesTableView y BillingPanel. 7C (Supabase local CI) y 7D (legacy routing) diferidos |
| 7D.1      | Vault updates                              | `2169cd0`                                             | Changelog Sprint 7 + Decision Op A recomendada + Backlog                                                                                                       |
| Auditoria | Seguridad y calidad Bloques 1-4            | `cf092ef` (**PR #8**)                                 | Secret exposure Stripe, idempotency, race conditions, error messages genericos, React.memo, loading skeletons, `any` 357→227, Stripe timeout, env warnings     |
| CI fix    | CI + root routing                          | `406c498`                                             | drizzle/ versionado, RLS sport_configs (100%/62 tablas), smoke tests path, redirect raiz `/` → `/${locale}/gimnasia-artistica`                                 |

## 2026-07-12 - Sprint 0 de producto real: contratos antes de expansion

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | La auditoria CTO detecto que la amplitud funcional ocultaba contradicciones en middleware, tenant, pricing, navegacion, PWA y readiness.                                                                                                                                                                                                                                                        |
| Decision     | Mantener monolito modular y roles de membership simples; hacer que ownership/membership sea la autoridad de academia; mantener codigos DB `free`/`pro`/`premium` para Free/Starter/Growth; modelar Network como oferta comercial sin checkout; desactivar cache/sync offline de datos privados hasta tener idempotencia y conflictos resueltos; usar `verify:production` como puerta compuesta. |
| Consecuencia | Se congela cualquier atajo que derive permisos del rol global, Network no puede comprarse por API y ningun deploy debe declararse listo solo por presencia de archivos.                                                                                                                                                                                                                         |
| Estado       | Activa                                                                                                                                                                                                                                                                                                                                                                                          |

## 2026-07-12 - Fase 1: una sola autoridad para trial, suscripciones y permisos

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto     | El trial estaba documentado pero no existía; Checkout podía ser iniciado por cualquier miembro; webhooks duplicados o fuera de orden podían reescribir la suscripción; roles personalizados tenían APIs vacías y no protegían módulos.                                                                                                                             |
| Decisión     | Persistir el trial por academia con política 7/365; limitar la administración de suscripción al owner; usar Checkout para alta y Billing Portal para cambios/cancelación; procesar eventos Stripe con idempotencia, lease y orden; hacer operativos los roles personalizados sobre una matriz explícita de capacidades sin permitirles administrar la suscripción. |
| Consecuencia | Los flujos billing legacy responden 410. La metadata explícita de academia es la autoridad Stripe. Los permisos simples de membership siguen siendo baseline si no existe rol personalizado; al asignarlo, la API aplica sus capacidades.                                                                                                                          |
| Estado       | Activa y desplegada en producción el 2026-07-13; la rotación terminó con un único endpoint Stripe productivo activo. El deployment acumulado de cierre es `dpl_2eWQbzQMtmRSNUVYrAw1MYS9bfrE`.                                                                                                                                                                      |

## 2026-07-13 - Fase 2: portal familiar limitado y avisos internos con contexto de sesión

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contexto     | El portal familiar exponía enlaces hacia superficies administrativas y el aviso rápido del entrenador no tenía una acción operativa conectada. Mensajes y preferencias existían, pero sus contratos de API y UI no estaban alineados.                                                                                                                                                                                                |
| Decisión     | Mantener el portal `parent`/`athlete` deliberadamente limitado y acotar todas sus lecturas por tenant, academia y relaciones autorizadas. Usar mensajes internos como canal principal; el aviso de grupo nace desde una sesión/clase, solo alcanza cuentas vinculadas a gimnastas inscritos y crea historial/notificación interna. WhatsApp permanece oculto. Fase 2 reutiliza el modelo existente y no introduce migración ni seed. |
| Consecuencia | Ningún CTA familiar dirige a billing, asistencia, evaluaciones o calendario administrativos. El entrenador puede enviar un aviso contextual con autorización de clase y límite 10/min; si no existen destinatarios vinculados, la operación falla de forma controlada sin conversación vacía. Email/push sirven para volver a Zaltyko, no como sistema de registro principal.                                                        |
| Estado       | Activa y desplegada en producción el 2026-07-13 (`47228ee5`, `dpl_AYKBXmfi88CK2MeqWvZMqKjo3Bee`). QA humano parent/athlete queda como validación operativa cuando haya credenciales vinculadas.                                                                                                                                                                                                                                      |

## 2026-07-13 - Fase 3: la sesión es el contexto operativo del entrenador

| Campo        | Valor                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contexto     | Las acciones rápidas del coach abrían asistencia, evaluaciones y comunicación como módulos separados. La evaluación no conservaba la sesión de origen ni derivaba de forma fiable el entrenador evaluador.                                                                                                                                                                                                                  |
| Decisión     | La ruta `/app/[academyId]/coach/today/[sessionId]` es el cockpit canónico de la clase: asistencia, progreso y aviso interno en un único flujo. La sesión se valida contra tenant, academia y clase asignada; la persona evaluada debe pertenecer a la clase. `assessedBy` se deriva de la identidad autenticada y nunca se acepta desde el cliente. Las evaluaciones independientes siguen permitidas con `sessionId=null`. |
| Consecuencia | Se añade una FK opcional `athlete_assessments.session_id` con `ON DELETE SET NULL`; no se reescribe historia ni se requiere seed. Las etiquetas y aparatos proceden de `sport-config`, incluido el trabajo federativo paralelo. El dashboard y la vista diaria enlazan al mismo cockpit y los tres pasos reflejan su estado real.                                                                                           |
| Estado       | Activa y desplegada en producción el 2026-07-13 (`0a023880`, `dpl_68XGuYVFtQnrLbjWjhv17NtMpxH8`).                                                                                                                                                                                                                                                                                                                           |

## 2026-07-16 - Las policies de comunicación privadas se asignan al rol DB autenticado

| Campo | Valor |
|---|---|
| Contexto | La prueba PostgreSQL real Día 2+Día 3 mostró que envolver helpers privados en `CASE WHEN auth.uid() IS NULL` no garantiza que el planner no los evalúe bajo `anon`, provocando `permission denied` incluso para una lectura que debía devolver cero filas. |
| Decisión | Declarar las policies SELECT de `message_templates`, `message_groups` y `scheduled_notifications` `TO authenticated`, además del scope tenant/academia y del control explícito de identidad. Los templates globales de sistema son catálogo interno autenticado, nunca público anónimo. |
| Consecuencia | `anon` no selecciona ninguna policy ni invoca helpers privados; owner/miembros/super-admin conservan el happy path probado. El contrato se valida estáticamente y en PostgreSQL efímero antes de promover la migración. |
| Estado | Activa en la migración versionada `20260716214500_day3_communication_academy_scope.sql`; no aplicada a remoto. |
