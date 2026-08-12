---
status: approved-for-handoff
owner: Product Lead
issue: ZAL-619
parent: ZAL-610
version: 1.0
last_reviewed: 2026-08-12
evidence_scope: local-repository-and-vault; no production or human validation
---

# ZAL-619 — Contrato P0 del ICP gimnasia para primer valor Web/Mobile

## 1. Decisión y relación con el piloto

Este documento define el contrato funcional P0 para una academia de gimnasia artística o rítmica de 80–150 gimnastas y 2–5 entrenadores, con operación heredada en Excel/WhatsApp/papel. Está **listo para handoff funcional** a Engineering, QA, Growth y Support.

No reemplaza ni duplica [ZAL-478](/ZAL/issues/ZAL-478): el piloto conserva su contrato canónico de trial Starter, primera atleta confirmada por magic link, confirmación humana y suscripción Stripe-backed. ZAL-619 define el loop operativo mínimo que el ICP debe poder recorrer en Web y Mobile después de entrar a la academia. Ningún fixture, seed, sandbox o test local cuenta como adopción o primer valor comercial.

La capacidad actual documentada/local es evidencia de inventario y gaps. No hay en este brief autorización para deploy, producción, datos personales reales, Stripe live, migraciones remotas, pricing, claims, campañas, publicaciones o releases de stores.

## 2. Buyer, problema y JTBD

**Buyer dueño/director.** Decide compra, configuración y continuidad. Necesita responder cada mañana qué ocurre hoy, qué requiere atención y qué debe comunicar, sin reconciliar varias hojas de Excel, chats y papel. El contrato no supone que una métrica de ahorro o adopción exista.

**Coach/entrenador.** Ejecuta la operación de clase. Necesita abrir su agenda, pasar lista y registrar un avance sin entrar en cobros ni administración.

**Familia.** Recibe información limitada y segura. Necesita consultar agenda, avisos, mensajes, progreso publicado y estado de sus cargos sin ver información de otras familias ni rutas administrativas.

### JTBD

- **Dueño:** “Cuando empieza la jornada, quiero localizar una gimnasta o grupo, ver las tareas operativas pendientes y actuar sobre asistencia, comunicación, progreso o cobros desde un punto confiable, para dirigir la academia sin cambiar de herramienta en cada paso.”
- **Coach:** “Cuando estoy por dar una clase, quiero ver quién viene, marcar asistencia y registrar el progreso de forma rápida, para que el dueño y la familia reciban información consistente.”
- **Familia:** “Cuando necesito saber qué pasa con mi hija, quiero consultar agenda, avisos, progreso y cargos propios, para no depender de mensajes sueltos ni acceder a datos administrativos.”

## 3. Alcance P0 observable

### 3.1 Búsqueda

El usuario autorizado puede buscar por nombre de gimnasta, grupo o coach dentro de su academia, ver resultados paginados con el tipo de registro y abrir únicamente recursos que su rol puede consultar. Debe existir estado vacío, loading y error recuperable. La búsqueda no promete una latencia pública concreta.

### 3.2 Dashboard operativo del dueño

El dueño ve una vista de trabajo, no un tablero de vanidad: agenda de hoy, asistencia pendiente, mensajes/avisos pendientes de lectura o envío, cargos vencidos o fallidos, y estado de una importación activa. Cada contador enlaza a la lista que lo explica; si el dato no existe, se muestra “sin datos” y no cero inventado. No se añaden sesiones, engagement, ahorro ni proyecciones que no tengan fuente.

### 3.3 Agenda y asistencia

Dueño y coach pueden consultar sesiones por día/semana. El coach puede marcar `present`, `absent`, `late` o `justified` y guardar una operación idempotente; el dueño puede corregir según permiso. Sesiones `cancelled` no aceptan asistencia. Si falla el guardado, la UI conserva el estado local no confirmado y ofrece reintentar; no lo presenta como guardado. P0 es **online-first**: no se implementa cola mutacional offline.

### 3.4 Comunicación interna

Dueño y coach autorizado pueden redactar un mensaje o aviso dirigido a una familia, gimnasta o grupo/clase, previsualizar destinatarios y enviarlo dentro de Zaltyko. El destinatario ve `sent`, `read` o `failed` cuando el sistema tenga esa evidencia. WhatsApp es secundario y no forma parte del canal contractual P0.

### 3.5 Progreso

El coach puede guardar un registro de progreso compatible con la modalidad y aparato/categoría disponible en el catálogo; puede quedar en `draft` o `published`. El dueño puede revisar. La familia solo ve progreso `published` de sus gimnastas vinculadas. No se promete una rúbrica federativa completa ni resultado competitivo automático.

### 3.6 Cobros

El dueño puede consultar cargos y estados de la academia, registrar o revisar pagos manuales autorizados y ver vencidos, parciales, fallidos, reembolsados o cancelados según el caso. La familia solo ve sus propios cargos, saldo/estado y la acción permitida. Para Stripe, cualquier QA usa Stripe test/sandbox autorizado; `checkout_started`, una pantalla de éxito o un cargo fixture no equivalen a suscripción ni cobro real. No se afirma recibo fiscal ni validez legal.

### 3.7 Importación inicial asistida

El dueño puede iniciar una importación **Web** de un archivo CSV/Excel simple de gimnastas y contactos, ver preview, mapear columnas, revisar errores por fila, detectar posibles duplicados, validar totales y confirmar. El sistema debe conservar un job auditable y permitir rollback sintético antes de declarar éxito. Mobile puede consultar el estado y los errores del job, pero no necesita cargar el archivo en P0. Quedan fuera colores, comentarios, celdas combinadas, histórico financiero completo y deduplicación semántica no confirmada.

## 4. Recorrido mínimo por rol y plataforma

| Rol | Web P0 | Mobile P0 | No puede hacer |
|---|---|---|---|
| Dueño/director | Buscar → dashboard → agenda/asistencia → comunicación → progreso → cobros → importación asistida | Buscar/consultar dashboard, agenda, asistencia/resumen, comunicación, progreso y cobros; consultar job de importación | Acceder a otra academia; ver datos sin permiso; convertir un test en cobro live |
| Coach | Agenda → sesión → asistencia → progreso → mensaje autorizado | Mismo flujo como tarea principal, con estados vacíos/error y foco táctil | Billing, checkout, importación, configuración administrativa |
| Familia | `my-dashboard` → agenda/avisos → mensajes → progreso publicado → cargos propios | Mismo recorrido limitado, con notificaciones y recuperación de errores | Rutas administrativas, datos de otras familias, edición de progreso, billing de academia |

La paridad significa mismo recurso, permisos, estados y resultado; no exige que Web y Mobile tengan el mismo layout. Ambos consumen el contrato backend compartido. Engineering Lead decide rutas concretas, persistencia y arquitectura; Product fija los comportamientos observables de esta nota.

## 5. Estados y transiciones mínimos

| Recurso | Estados válidos P0 | Reglas observables |
|---|---|---|
| Vista/búsqueda | `idle`, `loading`, `ready`, `empty`, `error` | No se muestran datos de otra academia; `error` ofrece reintento y no borra silenciosamente la consulta |
| Sesión | `scheduled`, `in_progress`, `completed`, `cancelled` | Solo sesiones no canceladas aceptan asistencia |
| Asistencia | `pending`, `present`, `absent`, `late`, `justified`, `save_failed` | `save_failed` no se presenta como confirmado; repetición idempotente no duplica registro |
| Mensaje/aviso | `draft`, `sending`, `sent`, `read`, `failed` | `read` solo cuando existe señal de lectura; `failed` expone reintento o causa segura |
| Progreso | `draft`, `published`, `superseded` | Familia ve solo `published` de la relación autorizada |
| Cargo | `draft`, `due`, `partial`, `paid`, `overdue`, `failed`, `refunded`, `cancelled` | `paid` requiere respaldo del mecanismo de pago correspondiente; no confundir intención con cobro |
| Importación | `created`, `preview_ready`, `mapping_required`, `validated`, `committed`, `rolled_back`, `failed`, `cancelled` | `committed` solo tras validación; rollback devuelve el fixture al baseline y no se anuncia como éxito si falla |

Estados desconocidos o incompatibles se degradan a error seguro y se registran para diagnóstico; no se inventa un estado de éxito.

## 6. Contrato API compartido (invariantes funcionales)

Estos son contratos de datos y comportamiento, no una decisión de arquitectura ni un mandato de nombres de ruta. Engineering debe mapearlos a las rutas existentes manteniendo la envoltura de respuesta estándar del proyecto.

### 6.1 Contexto y respuesta común

- Toda lectura/mutación recibe bearer autenticado; el servidor resuelve `tenantId`, `academyId` y membership y vuelve a comprobar rol. El `academyId` del cliente nunca sustituye esa autorización.
- Lecturas: búsqueda, dashboard, agenda, mensajes, progreso, cargos e import job devuelven `data`, `meta.requestId`, `meta.academyId` y paginación cuando aplique.
- Mutaciones: asistencia, mensaje, progreso, pago manual e importación aceptan una clave de idempotencia. Repetir la misma clave devuelve el mismo resultado lógico o un conflicto explícito; nunca duplica el recurso.
- Error común: `error.code`, `error.message` seguro para usuario, `error.fieldErrors` opcional, `error.retryable` y `error.nextAction`; nunca secretos, stack trace o datos de otra academia.

### 6.2 Operaciones mínimas

| Operación | Entrada mínima | Resultado observable |
|---|---|---|
| `search` | `query`, `resourceType`, `cursor` opcional | resultados autorizados, `empty` o error recuperable |
| `dashboard.get` | `date`, `academyId` contextual | bloques con fuente y enlaces a tareas; `partial` si una fuente falla |
| `agenda.list` | ventana `from/to`, filtros permitidos | sesiones y estado de asistencia |
| `attendance.upsert` | `sessionId`, `gymnastId`, `status`, `occurredAt`, idempotencia | registro confirmado o error clasificado |
| `communication.send` | destinatarios, canal interno, contenido, idempotencia | mensaje/aviso y estado de envío; preview antes de mutar |
| `progress.save` | gimnasta, modalidad/aparato/categoría, evaluación, estado | borrador o progreso publicado según permiso |
| `charges.list` | filtros de estado/periodo | cargos autorizados y estado; sin convertir intención en pago |
| `manualPayment.record` | cargo, importe, método, fecha, idempotencia | saldo/estado actualizado o rechazo; solo roles permitidos |
| `import.preview/validate/commit/rollback` | archivo o referencia de upload, mapping, jobId, idempotencia | preview, errores por fila, totales antes/después, commit o rollback explícito |

### 6.3 Códigos de error mínimos

`AUTH_REQUIRED`, `FORBIDDEN_ROLE`, `ACADEMY_NOT_FOUND`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_STATE_TRANSITION`, `IDEMPOTENCY_CONFLICT`, `DUPLICATE_SUSPECTED`, `IMPORT_ROW_INVALID`, `IMPORT_TOTAL_MISMATCH`, `PAYMENT_STATE_UNAVAILABLE`, `DELIVERY_FAILED`, `RATE_LIMITED`, `TEMPORARY_UNAVAILABLE`.

La UI debe traducirlos a la siguiente acción, conservar el foco/contexto y no mostrar información que permita enumerar recursos o cruzar academias.

## 7. Criterios de aceptación funcional y evidencia

Cada criterio es una tarea reproducible. La etiqueta significa: **L** repositorio/local, **T** test o sandbox sintético, **P** producción autorizada, **X** validación externa (dispositivo/red/academia fuera del repo), **H** validación humana. Un criterio no pasa por tener solo L/T si exige X/H.

| ID | Tarea observable y aceptación | Evidencia requerida y límite |
|---|---|---|
| AC-01 | Owner busca una gimnasta/grupo en Web y Mobile, abre un resultado propio y recibe `empty`/error correcto cuando corresponde. | L contrato y permisos; T Playwright/API con dos academias sintéticas y 0 cruces; X matriz de dispositivos/red; H owner confirma encontrabilidad. P no autorizado por esta issue. |
| AC-02 | Owner abre dashboard, cada bloque enlaza a una tarea y una fuente vacía dice “sin datos” sin inventar KPI. | L inventario/código; T fixture con cada combinación; X revisión responsive; H owner completa la secuencia diaria. P queda fuera. |
| AC-03 | Coach abre su sesión, marca los cuatro estados permitidos, repite la solicitud y no duplica; una sesión cancelada rechaza la operación. | L contrato; T unit/integration + E2E Web/Mobile; X iOS/Android o emuladores/red definida; H coach observa tarea. P no requerido. |
| AC-04 | Owner/coach envía aviso a grupo y familia ve `sent`/`read` o `failed` sin que aparezcan destinatarios ajenos. | L permisos; T aislamiento y estados de entrega; X notificaciones en device matrix; H familia confirma comprensión. No incluye WhatsApp. |
| AC-05 | Coach guarda progreso como draft y publica; familia ve solo el publicado de su vínculo y no el draft ajeno. | L catálogo/roles; T Web/Mobile y RLS/tenant fixture; X accesibilidad/device; H coach + familia revisan recorrido. |
| AC-06 | Owner registra un pago manual válido y consulta cargos; familia ve solo sus cargos. Casos parcial, vencido, fallido y reembolso quedan clasificados sin afirmar recibo legal. | L contrato billing; T integración/sandbox Stripe test para escenarios autorizados, sin dinero real; X prueba de red/dispositivo; H owner/familia validan lenguaje. P live requiere board. |
| AC-07 | Owner carga un archivo simple en Web, revisa preview/mapping/errores/duplicados/totales, confirma y hace rollback sintético; Mobile consulta job y fallo. | L parser/contrato; T fixture sintética con baseline, mismatch y rollback; X archivo/dispositivo fuera del repo si procede; H owner juzga recuperabilidad. No prueba Excel complejo ni migración real. |
| AC-08 | Familia inicia `my-dashboard` en Web/Mobile y solo accede a agenda, mensajes/notificaciones, progreso publicado y cargos propios. | L rutas/roles; T negativas para `/admin`, billing de academia y otra familia; X a11y/device; H familia verifica claridad. P no autorizado. |
| AC-09 | Repetir una mutación con la misma idempotency key conserva un único resultado; cambiar payload con la misma clave devuelve `IDEMPOTENCY_CONFLICT`. | L contrato; T suite de concurrencia/replay sintético; X no necesaria; H no necesaria. |
| AC-10 | Cualquier fallo de red/servicio conserva la distinción `confirmed`/`pending`/`failed`, ofrece siguiente acción y nunca enseña stack trace/secreto. | L códigos y copy; T mocks de 401/403/404/409/422/429/5xx; X red mala en device matrix; H QA/Support valida recuperación. |
| AC-11 | Web y Mobile consultan el mismo recurso, estados y permisos para los siete módulos; ninguna plataforma inventa un estado no soportado. | L contrato de paridad; T comparación de respuestas y E2E focal; X device matrix; H Product acepta por rol. |
| AC-12 | Growth/Data reportan únicamente eventos y denominadores definidos; no convierten `fixture`, `checkout_started`, `trial_started`, navegación o estado Paperclip en adopción/primer valor. | L taxonomía; T eventos sintéticos con exclusiones; X validación externa de instrumentación si se habilita; H Product/Data revisan lectura. Sin claim público. |

### Métricas de éxito del contrato

1. **Cobertura funcional:** AC-01 a AC-11 pasan en la matriz sintética Web/Mobile; ningún criterio se marca PASS por screenshot aislada.
2. **Aislamiento:** cero resultados o mutaciones cruzadas entre academias en pruebas de rol y API.
3. **Integridad:** cero duplicados por replay idempotente; import preview/commit/rollback conserva totales esperados del fixture; cobros test se reconcilian con su estado de sandbox.
4. **Honestidad de estado:** 100% de errores inducidos en la matriz usan un código conocido y una siguiente acción; ningún fallo se presenta como guardado/pagado/enviado.
5. **Rendimiento:** registrar p50/p95 por tarea, dispositivo, red y entorno; no publicar umbral ni claim de “3 segundos” hasta validación suficiente.
6. **Validación humana:** conseguir observación separada de al menos un dueño, un coach y una familia para el recorrido; la muestra no representa adopción de mercado. Para la hipótesis ICP de ZAL-610, Growth/Support deben completar 3–5 entrevistas de dueños antes de elevar gaps XL.
7. **Primer valor comercial:** continúa siendo el hito de ZAL-478, con atleta real, confirmación humana y suscripción Stripe-backed; ZAL-619 no lo redefine ni afirma que ya ocurrió.

## 8. Exclusiones y decisiones de frontera

- Offline total, cola mutacional, sincronización/conflictos y recuperación de pérdida de conexión.
- Garantías legales, certificaciones, “RGPD/GDPR compliant”, borrado garantizado, recibo jurídicamente válido o retención prometida.
- Soporte horario o SLA, incluidos fines de semana.
- Pricing nuevo, descuentos, cambios de Free/Starter/Growth/Network o checkout live.
- Claims de rendimiento, adopción, ahorro, conversión, “más fluida”, compatibilidad universal o resultados federativos.
- WhatsApp como canal contractual; campañas, testimonios y publicaciones.
- Excel semántico completo: colores, comentarios, celdas combinadas, histórico de pagos o dedupe irreversible sin confirmación.
- Exportación integral “de todo”, etiquetas arbitrarias, motor federativo y planificador avanzado.
- Rediseño general de módulos, arquitectura, schema, migraciones remotas o release de stores.

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación y owner |
|---|---|
| Falso positivo por fixtures o sandbox | QA conserva `L/T` separado de `P/X/H`; Product no acepta adopción sin evidencia humana. |
| Fuga de tenant, menor o familia | Engineering/Platform prueba roles negativos, academy membership y datos mínimos; QA exige 0 cruces. |
| Importación corrompe o duplica | Data define mapping/totales; Engineering hace preview, idempotencia y rollback; Support prepara recuperación. |
| Cobro parcial/fallido mal comunicado | Product cierra tabla de estados; QA prueba Stripe test; Platform revisa secretos/PII; no live. |
| Web/Mobile divergen | Engineering Lead mantiene un contrato backend; QA compara respuestas y estados; Product acepta por rol, no por pantalla. |
| “Dashboard” crea KPIs inventados | Data define fuentes/denominadores; `sin datos` es un estado válido; Growth no convierte uso técnico en claim. |
| Offline se cuela por presión comercial | Product mantiene online-first hasta entrevistas 3–5 y diseño aprobado de idempotencia/conflictos. |

## 10. Handoffs y disposición

- **Engineering Lead:** convertir invariantes de esta nota en contratos implementables y decidir arquitectura; no ampliar recursos, estados ni límites sin una nueva decisión de Product.
- **Product Designer/UX:** investigar con tareas AC-01/02/03/04/07/08 los estados vacíos, errores, foco, responsive, lenguaje y recuperación; devolver hallazgos y cambios recomendados sin declarar capacidad comercial. No se implementa diseño desde esta issue.
- **Data & Analytics:** definir eventos, fuentes, denominadores, p50/p95, exclusiones y corte por rol/academia; etiquetar L/T/P/X/H y mantener “sin base” cuando falte denominador. No publicar tasas.
- **QA:** derivar la matriz AC-01–AC-12 en local/worktree/sandbox/Stripe test autorizado; registrar defectos por código/estado y no cerrar por fixture como adopción.
- **Growth:** usar el brief solo para discovery 1:1 y registro privado; no pricing, campaña, claim o contacto desde esta issue.
- **Support:** preparar runbook de recuperación para `failed`, `pending`, import mismatch y cobro no confirmado; no prometer horario.

**Disposición Product Lead:** contrato v1.0 publicado y listo para derivación. No se implementa código en ZAL-619. La capacidad comercial, adopción, producción y validación humana permanecen sin demostrar hasta sus gates correspondientes.

### Evidencia revisada

- `vault/00-Inicio/Guia de trabajo para agentes.md`, `vault/00-Inicio/Estado actual de Zaltyko.md`, `vault/06-Roadmap-y-Tareas/Decisiones.md`, `vault/06-Roadmap-y-Tareas/Backlog priorizado.md`, `vault/06-Roadmap-y-Tareas/Changelog interno.md` y estado de git.
- `vault/06-Roadmap-y-Tareas/ZAL-610 veredicto CEO necesidades dueño academia y factibilidad roadmap 2026-08-12.md` y `vault/06-Roadmap-y-Tareas/ZAL-614 review productivity ZAL-610 2026-08-12.md`.
- Contrato de piloto ZAL-478 consultado en Paperclip: trial Starter, activación por atleta real, evidencia humana separada y Stripe-backed solo para conversión.
- Inventario local: `vault/01-Producto/Inventario de producto.md`, `vault/01-Producto/MVP exacto Zaltyko gimnasia.md`, `src/app/api/athletes/import/route.ts`, `src/app/api/athletes/export/route.ts`, `src/lib/offline/operations-queue.ts`, `src/hooks/useOfflineStatus.ts`, `docs/COBROS_Y_CUOTAS.md` y `mobile/`.
- **Categoría actual:** local/vault y Paperclip; no producción, no validación externa y no validación humana completada por esta issue.
