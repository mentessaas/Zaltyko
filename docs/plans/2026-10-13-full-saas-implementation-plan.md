# Zaltyko — plan maestro de implementación del SaaS

Fecha de corte: 13 de octubre de 2026
Especificación principal: PRD Owner Dashboard y Academy Health Score del 6 de octubre de 2026, más las decisiones explícitas del propietario registradas aquí.
Estado: plan ejecutable por fases; no equivale a preparación de lanzamiento.

## Resultado que se construirá

Un SaaS sencillo de aprender para academias de gimnasia artística y rítmica,
con operaciones diarias fiables y un Owner Dashboard que convierte esas
operaciones en métricas, Academy Health Score e Insights explicables. Cada
academia podrá ofrecer una o ambas disciplinas y actividades complementarias
(como telas, aro aéreo, baile o preparación física). El dominio admite contexto
por país/federación versionado; ninguna categoría, nivel, aparato, regla o
terminología local se activa sin una fuente revisada.

El dashboard será modular: la persona propietaria podrá ordenar módulos con
arrastrar y soltar cuando tenga sentido, con controles accesibles alternativos,
un orden por defecto útil y una opción de restablecer. La personalización nunca
alterará permisos, cálculos, datos compartidos ni el flujo de una tarea.

## Principios y límites

- El PRD manda sobre la arquitectura heredada. Se reutiliza una regla antigua
  solo si se valida y encaja en el modelo canónico.
- `organization_id` es el límite tenant; `location_id` limita el ámbito físico.
  RLS, grants, autorización de servidor y FKs tenant-aware son controles
  separados y obligatorios.
- `group_memberships` (M:N temporal) sigue siendo la relación canónica de una
  gimnasta con grupos. Enrollment conserva estado, precio, origen e historial.
- Clase recurrente, sesión concreta, inscripción, asistencia, cargo, pago,
  intento y devolución son conceptos diferentes.
- Datos personales y de menores no se copian a eventos, métricas o Insights.
  Los fixtures de validación son sintéticos.
- La facturación de Zaltyko a la academia y los cobros de una academia a sus
  familias son productos y ledgers distintos.
- Para cobros familiares, el modelo v1 separa una cuenta Connect de la academia
  por entorno (test/live) de la cuenta que cobra el SaaS de Zaltyko. La decisión
  local fija Accounts v2, cargos directos, dashboard completo y
  responsabilidades de tarifas/pérdidas en Stripe; disponibilidad y efecto
  contractual para la plataforma Zaltyko siguen sin verificarse. Ver ADR-0022.
- El cobro manual es una opción real para todos los planes. El cobro automático
  a familias solo se ofrece a planes de pago con procesador configurado, mandato
  y consentimiento adecuados, idempotencia, webhook verificado y recuperación
  segura. Free/trial no activa cobro automático. La web pública no debe prometer
  una automatización que no haya pasado estos gates.
- El mercado inicial de autoservicio es España. Moneda, zona horaria y reglas
  deportivas se derivan de configuración revisada. El alta falla cerrado para
  mercados sin perfil y no pide códigos ISO ni códigos técnicos de sede.
- Este documento no es una autorización general para cambiar entornos remotos.
  Cada migración, cobro real, uso de credenciales, cambio de configuración o
  despliegue requiere autorización explícita para ese entorno y sus propios
  gates técnicos. La implementación local y un Preview no cambian producción.

## Mapa funcional y autoridad del dato

| Área               | Fuente de verdad                                                   | Dependencias            |
| ------------------ | ------------------------------------------------------------------ | ----------------------- |
| Identidad/acceso   | organización, membresía, rol y alcance de sede                     | RLS y auditoría         |
| Especialidades     | perfil versionado por país/federación y relación M:N               | programas y vocabulario |
| Personas/familias  | persona, atleta, guardianes, pagadores y consentimientos separados | privacidad              |
| Operaciones        | programas, grupos, plantillas, sesiones, enrollment y asistencia   | capacidad               |
| Cobros de academia | cargos, invoices, pagos, allocations, intentos y refunds           | manual/automático       |
| Suscripción SaaS   | plan, límites y estado comercial de la academia                    | prestaciones            |
| Métricas           | definiciones versionadas, runs, cobertura y frescura               | operaciones/ledger      |
| Health Score       | perfil, pesos, snapshots y explicación reproducible                | métricas suficientes    |
| Insights           | regla, evidencia agregada, acción, resultado y caducidad           | score/permisos          |
| Experiencia        | rutas por tarea y preferencias de módulos del owner                | accesibilidad           |

## Fases y criterios de salida

### 0. Fundación y decisiones

Lenguaje canónico, ADRs, contratos, RLS/grants, idempotencia, outbox,
auditoría, esquema y política de migraciones.

Gate: migración desde cero reproducible, datos sintéticos, aislamiento
tenant/sede negativo, permisos explícitos y tipos consistentes.

### 1. Modelo deportivo y alta simple

Perfiles por país/federación con versiones y estados `identity_only`, `verified`,
`draft` y `retired`; relación M:N de disciplinas por academia; programas
separados entre gimnasia y actividad complementaria. Alta owner en una pantalla,
actividades opcionales plegadas y defaults resueltos en servidor.

Gate: no duplicar principal/adicional, no mezclar actividades, no aceptar perfil
de otro país, no inventar reglas, alta transaccional/idempotente y doble envío
sin duplicados.

Estado al corte: modelo, migración y formulario implementados en la rama de
trabajo; perfiles españoles solo identifican artística/rítmica, sin reglas
federativas. Tests de dominio, alta, permisos y stack canónico pasan en local;
sin aplicación remota.

La entrada `/auth/register?role=owner` no obliga a escoger entre roles que no
corresponden; el formulario genérico mantiene el selector. Tras crear la
cuenta, el formulario de configuración reúne en una pantalla el nombre de la
academia, el país y la disciplina principal; las actividades adicionales
quedan plegadas.

### 2. Operación mínima

Alta/pausa/reactivación/baja/transferencia de enrollment; grupos M:N; capacidad;
clases recurrentes y sesiones; staff; asistencia; trials y lista de espera.
Diseñar por tarea, con estados vacíos/error y pocos pasos sin quitar
confirmaciones necesarias.

Gate: concurrencia/cupo, doble inscripción, transferencia sin churn falso,
historial/outbox, scope por sede y E2E autenticado por owner/manager/coach/familia.

Estado local 2026-10-13: además de enrollment y asistencia, el servicio
greenfield de `group_memberships` ya permite alta M:N, pausa/reactivación/baja,
cupo serializado, historial tipado, audit log y outbox en una transacción. Una
migración aditiva añade el historial, fuerza RLS y restringe sus grants; se
probó desde cero con PostgreSQL efímero, incluidos reintentos con conflicto,
capacidad concurrente, secuencia temporal y denegación de otro tenant/sede.
Existe además un test pgTAP para CI/Supabase local; no se pudo ejecutar porque el
daemon Docker local no estaba activo. **Pendiente:** API, interfaz para
gestionar grupos y E2E autenticado; no se aplicó la migración remota.

Verificación transversal actual: TypeScript, `pnpm lint` global, build Next.js
(288 rutas), integridad de migraciones (7 Drizzle + 110 Supabase) y `validate:rls`
pasan. El build local advirtió variables runtime Stripe/Supabase ausentes, por
lo que no demuestra runtime. Vitest completa:
453 archivos PASS, 1 omitido; 2.343 tests PASS, 3 omitidos, en 439,31 s. El
timeout de billing del corte anterior no se reprodujo en esta corrida; su causa
sigue sin demostrarse. La batería pgTAP queda pendiente por Docker local inactivo.

### 3. Ledger y cobros

Separar cargo, invoice, pago, asignación, intento y devolución. Consolidar
gestión manual y conciliación; habilitar automático solo en planes pagados y
entornos autorizados. Stripe Test/sandbox precede cualquier decisión Live.

Gate: pagos parciales, fallo/reintento, devolución, conciliación por moneda,
webhook idempotente, mandato/consentimiento trazables, permisos y pruebas sin
cargos reales. El cron legacy existe, pero no se reutiliza como prestación de
la arquitectura nueva hasta exigir modo elegido, entitlement de plan pagado y
autorización trazable de cada pagador.

Estado local 2026-10-13: el Owner Dashboard ofrece un flujo sencillo para
consultar cargos abiertos, registrar pagos ya recibidos y elegir la modalidad
preferida por familia junto al cargo seleccionado. API y formulario restringen
lectura/escritura a Owner/Admin con acceso a todas las sedes; el pago, asignación,
estado derivado, auditoría y outbox se confirman atómicamente. La preferencia
familiar tiene CAS, idempotencia y actor miembro. `organization_saas_subscriptions`
es la proyección Stripe y `organization_entitlements` el plan efectivo con
revisiones append-only; cada academia nueva recibe Free y las que no tengan
entitlement fallan cerradas. Solo un plan pagado vigente permite solicitar
automático. La preferencia queda ligada a una revisión y exige reconfirmación si
cambia el plan. Al emitir cargos, solo una preferencia vigente y coincidente se
guarda como snapshot; editarla no transforma cargos previos. Autorización y
consentimiento del pagador siguen siendo un modelo server-only reservado, no
capturado ni operativo. Se añadió una proyección server-only de cuenta Connect y
la autorización futura queda ligada por FK tenant-aware a una cuenta concreta;
la evaluación fail-closed exige coincidencia de tenant, entorno, modelo, estado
y capacidad activa. La frescura de `last_synced_at` sigue como gate pendiente.
No se han creado cuentas ni confirmado que Accounts v2 esté
disponible en la cuenta de plataforma. La preferencia y los snapshots nunca inician pagos:
`effectiveMode` sigue manual. La prueba local comprueba migración desde cero,
seed Free, historial, permisos/grants, downgrade/reconfirmación, snapshots y FKs.
No hay todavía provisioning comercial/webhook verificado, flujo real de
consentimiento, worker automático, Stripe Test ni recorrido autenticado de
navegador.

### 4. Métricas

Versionar definiciones, consultas, cobertura y frescura; calcular actividad,
capacidad ponderada, asistencia, retención, churn y finanzas desde fuentes
canónicas; recomputar sin bloquear operaciones.

Gate: fixture de oro, propiedades, resultado determinista por versión,
`insufficient_data` en vez de cero y ningún dato personal en read models.

### 5. Academy Health Score e Insights

Score global/dimensional con pesos y benchmark versionados; Insights explicables
con evidencia, alcance, prioridad, caducidad, deduplicación, acción y outcome.

Gate: snapshots reproducibles, cobertura demostrada, hipótesis claramente
etiquetadas y pruebas de autorización, fatiga, resolución y resultado.

### 6. Owner Dashboard modular

Estado y próxima acción primero; módulos movibles, preferencias por usuario,
guardado seguro, restablecer y alternativas de teclado para drag-and-drop.
Preferencias no conceden permisos ni cambian el scope.

Gate: móvil/tablet/desktop, teclado/lector, persistencia y fallback, consultas
autorizadas y rendimiento medido al volumen objetivo.

Estado local 2026-10-13: implementada la ordenación persistente por usuario y
academia para indicadores, tendencias/cobros, explicación y capacidad/cohortes.
Prioridades y Health Score permanecen arriba. Arrastre, botones de subir/bajar,
restablecer y control de versión usan una tabla aislada con RLS; falta walkthrough
de navegador autenticado y VoiceOver humano. Es una sola columna reordenable:
todavía no se pueden añadir/quitar módulos ni mover tarjetas individuales o
distribuirlas en varias zonas. Esos slots se añadirán solo cuando haya una
ganancia clara de comprensión y una jerarquía validada.

### 7. Especialización y extensibilidad

Vocabulario y tareas distintos para artística y rítmica; incorporar contexto
federativo solo con fuente, versión y revisión. Actividades complementarias
conservan operación y reportes propios; módulos nuevos se conectan por contratos.

Gate: perfil local verificado por fuente/persona competente y regresión de otros
perfiles/idiomas.

### 8. Preparación de lanzamiento

Revisar claims públicos, privacidad de menores, términos/consentimientos,
seguridad, backup/restore, monitorización, soporte, onboarding, accesibilidad,
incidentes, límites de plan, correo y pagos. Validar con academias piloto antes
de escalar captación.

Revisión local y Preview 2026-10-13: el copy de cobro automático a familias se
retiró de las superficies públicas porque el runtime greenfield no inicia
cargos; el contrato focal lo protege. El CTA owner conserva su contexto, no
obliga a elegir roles irrelevantes y explica la secuencia cuenta personal →
configuración de academia. Tests focales 17/17, TypeScript y ESLint pasan. El
commit `45d28de7aef64d9f1a362a406ac9d4f0f7a8fa48` está `READY` en Preview de PR
#226; `/auth/register?role=owner` y `/academias` se inspeccionaron visualmente.
El shell común de autenticación expone ahora el landmark DOM `<main>`; el test
focal 1/1 pasa y el deployment contiene exactamente un `main` que envuelve el
formulario.
El directorio muestra una ficha `TEST active` que existe en el sandbox E2E y no
en producción; la conexión runtime del Preview sigue **NO VERIFICADA**. No se
creó cuenta ni se alteró la fila. No es un release de producción. Antes de
captar se debe superar la revisión independiente del hotfix #225, integrar el
cierre del cron legacy y verificar las rutas públicas en producción.

Gate: QA independiente, E2E autenticado, migraciones reconciliadas, restore
ensayado, producción verificada y rollback documentado. Preview/build verde no
equivale a producción lista.

Revalidación local 2026-10-13: `pnpm test -- --run` **453 archivos PASS, 1
omitido; 2.343 tests PASS, 3 omitidos**; `pnpm typecheck`, `pnpm lint` y
`pnpm check:migrations` (**7 Drizzle + 109 Supabase**) PASS. El Preview de
Vercel del HEAD `9582ede3` está `READY`; la sesión autenticada, los datos que
consume el Preview y cualquier runtime productivo siguen sin verificarse.
`pnpm audit:dependencies --prod` en esta rama informa **3 vulnerabilidades
moderadas, ninguna alta/crítica**. GitHub indicó que la rama por defecto sigue
con 4 vulnerabilidades altas; validar el merge y volver a auditar main.

## Siguiente orden ejecutable

1. **Cerrado localmente 2026-10-13:** stack canónico, migraciones, contratos
   RLS y pruebas SQL desde cero pasan; registro manual de pagos expuesto en API
   y Owner Dashboard. Nada de esto se ha promovido a un entorno remoto.
2. **Refuerzo local 2026-10-13:** la UI de pago manual ahora prueba estado
   vacío, reintento incierto con la misma clave idempotente y coma decimal
   española (3/3), además de TypeScript/ESLint/Prettier. Esto no equivale a
   sesión real ni a escritura contra Postgres; sigue pendiente el walkthrough
   autenticado owner/admin, permisos por sede, errores reales y accesibilidad
   con lector de pantalla.
3. **Implementado localmente 2026-10-13:** preferencia manual/automático por
   familia, entitlement SaaS con historial y snapshot por cargo. Free/trial,
   downgrade y revisiones desactualizadas fallan cerrados; ningún snapshot
   autoriza o inicia un pago. El hotfix del cron legacy está en PR separado y
   sigue pendiente de revisión/merge/deploy.
4. Confirmar acceso a Accounts v2, términos, responsabilidades de tarifa/riesgo
   y contrato antes de crear cuentas de prueba. Implementar provisioning y
   sincronización; después completar SetupIntent y mandato/consentimiento
   revocable, inbox/webhook firmado ligado a cuenta+entorno, worker idempotente
   fuera de la transacción de BD, SCA, recuperación y conciliación. Solo tras
   los gates de seguridad/legal evaluar Stripe Test; no ejecutar cargos reales.
5. Revalidar métricas, score, Insights y dashboard sobre el modelo operativo
   completo, incluidas las nuevas señales financieras.
6. Validar el reordenador modular con usuarios, teclado y lector; decidir
   slots, módulos configurables y límites seguros de drag-and-drop.
7. Cerrar privacidad, soporte, backup/restore y gates de preparación de
   lanzamiento. Mantener bloqueada la captación hasta que el copy corregido y
   el hotfix estén desplegados y verificados. Deployment y cualquier cambio
   remoto requieren su gate propio.

La revisión de PR #225 está solicitada a `@elvisvaldes`; GitHub confirma que
ya tiene permiso `write`, pero todavía no consta review. La aprobación debe
realizarla esa persona; no se sustituye por una aprobación del autor.

## Estado que no debe confundirse

- El núcleo greenfield contiene módulos de operación, ledger, métricas, score,
  dashboard e Insights en trabajo local; este cambio no demuestra el cierre de
  cada módulo ni su disponibilidad para usuarios.
- La migración deportiva de este corte se prueba solo en PostgreSQL efímero.
- La preferencia de layout se valida localmente con RLS/API; no se ha promovido
  su migración ni probado aún en una sesión autenticada de navegador.
- El registro manual tiene endpoint y formulario locales; los tests HTTP usan
  autorización simulada y el ledger se prueba en PostgreSQL efímero. No se hizo
  walkthrough autenticado ni se promovieron cambios de esquema.
- La relación M:N de grupos ya tiene un servicio de dominio probado desde cero,
  pero aún no está conectada a una API ni a una pantalla de gestión; la nueva
  migración solo se aplicó al PostgreSQL efímero.
- La preferencia familiar y el entitlement versionado están implementados solo
  en local. El entitlement pagado de pruebas usa fixtures/contrato sintéticos;
  no existe webhook ni provisioning comercial verificado. Un snapshot
  `automatic` nunca inicia cargos; el runtime permanece deshabilitado.
- E2E con cuentas reales, carga en plataforma objetivo, backup restaurado,
  revisión legal/privacidad, correo, Stripe Live, Vercel y deployment productivo
  son `NO VERIFICADO`.
- Medición histórica previa al read model: dashboard 275,7 ms p95, capacidad
  262,1 ms, filtros 62,5 ms y cohortes 1.709,6 ms p95 (no cumplía 800 ms).
  Queda supersedida por el writer/reader y la reejecución indicada a continuación.
- Corte completado 2026-10-13: writer transaccional/idempotente y reader basado
  exclusivamente en la proyección, con estado explícito si aún no hay datos
  calculados. Reejecución AC-12 local PASS: dashboard 293,6 ms p95, capacidad
  304,4 ms, cohortes 362,8 ms, filtros 204,7 ms y vista compuesta 654,3 ms
  p95 (presupuestos <800 ms y <2.000 ms, respectivamente). Harness funcional de
  Owner Dashboard pasa. Evidencia limitada a PostgreSQL 14.20 local (1.337 MB) y capa de
  servicio; no mide HTTP, autenticación, navegador, Supabase ni serverless.
  Próximo gate: instrumentar coste/latencia del writer y repetir en la plataforma
  objetivo antes de declarar capacidad operativa.
- El cron legacy consultado selecciona cuentas Connect listas y cobra cargos
  vencidos; el código revisado no filtra por modo automático elegido,
  entitlement de plan pagado ni evidencia de mandato. No declarar esa ruta como
  cobro automático seguro.
- No anunciar lanzamiento ni cobros automáticos hasta superar su gate.
