---
status: active
owner: producto/tech
last_reviewed: 2026-07-09
source:
  - ../../AGENTS.md
  - ./Home.md
  - ./Estado actual de Zaltyko.md
  - ../02-Tecnologia/Patrones obligatorios.md
  - ../03-Negocio/Pricing.md
  - ../04-Marketing/Mensajes aprobados.md
  - ../06-Roadmap-y-Tareas/Backlog priorizado.md
  - ../06-Roadmap-y-Tareas/Decisiones.md
---
# Guia de trabajo para agentes

Esta nota es la entrada obligatoria para cualquier agente, IA o programador que vaya a cambiar Zaltyko. Su objetivo es evitar cambios incoherentes, redisenos accidentales y decisiones tecnicas que rompan producto, pricing, seguridad, migraciones o la vault.

## Direccion activa

Zaltyko es un SaaS multi-tenant para academias deportivas. El go-to-market inicial se enfoca en academias de gimnasia artistica y ritmica en espanol. La arquitectura puede crecer a otras disciplinas, pero producto, copy, onboarding, pricing y QA comercial deben priorizar gimnastas, familias, clases, cuotas, asistencia, progreso tecnico y comunicacion interna.

La direccion vigente es:

- Portal familias/atletas limitado y seguro: `parent` y `athlete` pueden entrar a `my-dashboard`, `messages` y `notifications`; no deben acceder a rutas administrativas.
- Comunicacion interna primero: mensajes, avisos, notificaciones e historial dentro de Zaltyko; WhatsApp queda secundario/futuro salvo decision explicita.
- Pricing v3.0 activo: Free 30, Starter 19 €/mes hasta 75, Growth 49 €/mes hasta 200, Network 99 €/mes multi-sede con onboarding acompanado.
- Network no es checkout autoservicio mientras no existan codigo, DB y Stripe dedicados.
- Las entrevistas de pricing validan conversion post-lanzamiento; no bloquean que v3.0 sea el modelo oficial.

## Orden de lectura antes de tocar

1. [[Home]] para orientarte en la vault.
2. [[Estado actual de Zaltyko]] para saber que existe y que falta.
3. [[Patrones obligatorios]] antes de tocar codigo.
4. [[Pricing]] y [[Mensajes aprobados]] antes de tocar planes, landing, checkout o copy comercial.
5. [[Backlog priorizado]] y [[Decisiones]] antes de cerrar una tarea, abrir deuda o cambiar direccion.
6. [[Runbook migraciones]] antes de tocar Supabase, Drizzle o SQL manual.

Si el cambio es pequeno y puramente tecnico, aun asi revisa esta guia y los patrones obligatorios.

## Coordinacion entre agentes en paralelo

Zaltyko lo trabajan varios agentes (Claude Code, Codex, otros) sobre el mismo working directory, a veces al mismo tiempo. Sin coordinacion esto produce trabajo pisado, decisiones contradictorias sin resolver y estado de git inconsistente. Reglas concretas, no teoricas:

1. **Antes de empezar, mira quien mas anduvo ahi.**
   - `git log -10 --oneline` y `git status --short` primero siempre. Si hay cambios sin commitear que tu no hiciste, no asumas que estan rotos ni los borres: lee el `Changelog interno.md` mas reciente, puede que otro agente este a mitad de una tarea coherente.
   - Si el archivo que vas a tocar cambio en las ultimas horas (`git log -3 -- <archivo>`), lee ese diff antes de escribir encima.
   - Antes de tocar pricing, RLS, migraciones o permisos especificamente: relee las ultimas 2-3 entradas de [[Changelog interno]] y [[Decisiones]] enteras, no solo el titulo. Ahi es donde mas se pisan los agentes porque cada uno "arregla" el sintoma que ve sin ver que otro ya decidio algo distinto.

2. **Diagnostica antes de arreglar, sobre todo en seguridad.**
   - No cambies una policy de RLS, un wrapper de auth o un permiso solo porque un error aparecio cerca de ahi. Antes de tocar RLS: confirma primero **por que camino llega el request que falla** — codigo servidor (`src/lib/authz.ts`, conecta como `postgres` con `BYPASSRLS`, RLS no aplica ahi nunca) vs cliente directo a Supabase (`createClient` de `@/lib/supabase/client`, ahi si aplica). Ensanchar una policy para "arreglar" algo que en realidad fallaba en el camino servidor no arregla nada y abre una brecha real. Ver [[Decisiones]] 2026-07-09 para el caso concreto que paso.
   - Si no podes confirmar la causa raiz con logs/stack trace real, dilo explicitamente en el Changelog en vez de aplicar el primer fix plausible. "No se pudo reproducir, queda en backlog" es mejor que un fix que no ataca la causa.

3. **Marca claramente lo que no esta aplicado todavia.**
   - Si generas una migracion SQL pero no corriste `drizzle-kit push` / no la aplicaste a la DB real, decilo explicito en el Changelog ("no se ejecuto") y no la des por hecha. Otro agente que lea el changelog rapido puede asumir que ya esta viva.
   - Lo mismo para flags de "pendiente sin confirmar", tests que quedan en rojo a proposito, o decisiones de producto que un agente tomo solo (como single-vs-multi-academia en Growth) — si otro agente ya habia tomado la decision contraria y la habia commiteado, se vuelve un conflicto real de negocio, no solo de codigo. Preguntale al usuario si detectas dos decisiones contradictorias en vez de elegir una en silencio.

4. **Cuidado con archivos duplicados o resucitados.**
   - Si aparecen archivos tipo `nombre 2.ext` sin que tu los hayas creado, o un archivo que vos u otro agente borro y commiteo reaparece sin explicacion: probablemente es sincronizacion de filesystem (iCloud Drive u otro) colisionando con escritura concurrente de dos agentes. Compara contra el original (`diff`) antes de decidir: si son identicos, son basura de sync, se borran. Si difieren, investiga cual es el real antes de asumir.

5. **Cierra tu trabajo de forma que el siguiente agente lo entienda sin preguntarte.**
   - El Changelog no es opcional ni un resumen vago: debe decir que se probo, que fallo, que quedo sin resolver y por que. Un agente que llegue despues (vos mismo en otra sesion, Codex, u otro) tiene que poder decidir si confiar en tu fix leyendo una sola entrada.
   - Si tocaste algo que otro agente toco muy recientemente y no estas seguro de si van en la misma direccion, es mejor preguntarle al usuario ("Codex hizo X, yo iba a hacer Y, se contradicen, ¿cual va?") que resolverlo solo y que el usuario se entere despues.

## Reglas no negociables

- Todas las APIs de tenant usan `withTenant` desde `src/lib/authz.ts`.
- Las respuestas API usan `apiSuccess`, `apiCreated` o `apiError` desde `src/lib/api-response.ts`.
- Toda entrada externa se valida con Zod o patron equivalente ya usado en el modulo.
- Mantener aislamiento por `tenantId`, `academyId`, membership y RLS. No abrir datos entre academias.
- No documentar secretos, tokens, URLs privadas con credenciales ni valores reales de `.env`.
- No hacer migraciones destructivas ni `drizzle-kit push --force` sin revisar manualmente SQL y datos afectados.
- No escribir hashes sinteticos en `__drizzle_migrations`; cada migracion debe representarse por su archivo/version real.
- Todo cambio relevante de producto, negocio, marketing, ventas, arquitectura, deploy, seguridad, roadmap o riesgo actualiza la nota correspondiente del vault.

## Como decidir que tocar

- Toca codigo cuando el comportamiento real esta mal, falta enforcement o una prueba demuestra el fallo.
- Toca tests cuando cambia contrato, ruta, rol, limite, pricing o comportamiento observable.
- Toca docs/vault cuando cambia direccion, promesa publica, arquitectura, riesgo, decision, backlog o runbook.
- Toca copy publico solo si esta alineado con [[Mensajes aprobados]] y [[Pricing]].
- Toca migraciones solo con orden temporal claro, SQL idempotente cuando aplique y RLS revisada.

Si una inconsistencia esta en un documento historico de auditoria o competencia, no la reescribas salvo que el documento se este usando como fuente vigente. En ese caso, anade un aviso de superseded o referencia a la fuente canonica.

## Que no hacer

- No redisenar pantallas o modulos cuando la tarea pide coherencia, seguridad o bugfix.
- No cambiar pricing sin actualizar `src/lib/plans/catalog.ts`, limites, copy publico, tests, [[Pricing]], [[Mensajes aprobados]] y [[Decisiones]].
- No prometer academias ilimitadas en Starter o Growth.
- No abrir rutas administrativas a familias/atletas: `athletes`, `billing`, `settings`, `reports` y modulos staff/admin siguen bloqueados.
- No usar `/dashboard/*` legacy como destino nuevo si existe ruta moderna `/app/[academyId]/*`.
- No presentar WhatsApp como canal principal v1.
- No borrar cuentas globales al quitar acceso a una academia; desvincular membership no es destruir usuario.
- No mezclar refactors grandes con fixes P0 salvo que sean necesarios para resolver el fallo.
- No revertir cambios humanos o de otros agentes sin instruccion explicita.

## Migraciones

Para el bloque de identidad/vinculos, el orden correcto es:

1. `20260623100000_add_provider_profile_role.sql`
2. `20260623103000_create_academy_link_requests.sql`
3. `20260624000000_rls_academy_link_requests.sql`
4. Migraciones posteriores, incluyendo `20260625000000_apply_pending_migrations.sql`

La migracion `20260625000000_apply_pending_migrations.sql` existe para crear tablas pendientes de forma idempotente. No debe simular migraciones de Drizzle ni insertar hashes falsos.

## Checklist de cierre

Antes de cerrar un trabajo, reporta:

- Codigo cambiado y comportamiento que queda activo.
- Tests/checks ejecutados y resultado.
- Migraciones nuevas o modificadas y su orden.
- Vault actualizado, con nombres de notas.
- Riesgos residuales o tareas nuevas en [[Backlog priorizado]] si aplica.
- Si algo no se pudo ejecutar, decirlo claramente y explicar por que.

El cierre minimo debe incluir una linea tipo: `Vault: actualizadas X, Y, Z` o `Vault: no aplica`.
