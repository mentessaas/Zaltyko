# Insights Engine y acciones medibles

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: PR-08 del plan Owner Dashboard / Academy Health Score

## Modelo y frontera

El motor consume evidencia materializada; no consulta PII ni decide a partir de
listas de personas. Cada regla tiene clave, versión, estado, severidad,
cooldown y configuración. Cada ejecución conserva watermark y referencias
opcionales al metric run y snapshot de Health Score que la originaron.

La salida canónica es un insight por serie
`regla + sede/organización + tipo de entidad + entidad`. El ciclo soporta
`open`, `viewed`, `actioned`, `snoozed`, `dismissed` y `resolved`, con historial
append-only. La versión optimista evita que dos decisiones simultáneas
reescriban el mismo estado.

La prioridad es explícita y reproducible:

```text
prioridad = impacto*0,40 + urgencia*0,25 + confianza*0,20 + accionabilidad*0,15
```

## Reglas P0

La migración registra diez reglas versionadas. Nueve quedan activas y
`athlete_retention_risk` permanece `draft`: una recomendación individual sobre
menores requiere base jurídica, minimización y EIPD antes de activarse.

El caso de aceptación `excess_demand` exige ocupación igual o superior al 90 %,
al menos tres solicitudes elegibles y cuatro sesiones observadas. Si existe
precio, estima un rango de conversión del 50–100 % y lo etiqueta como hipótesis,
nunca como ingreso garantizado.

## Deduplicación y anti-fatiga

- La clave de idempotencia y un advisory lock hacen que tres entregas
  concurrentes de una evaluación creen un solo run y un solo efecto.
- Una condición ya abierta refresca el mismo insight.
- Si la condición desaparece, se resuelve; si vuelve dentro del cooldown, se
  reabre la misma ocurrencia.
- Un descarte con motivo suprime la reaparición dentro del cooldown.
- Un snooze mantiene la evidencia y reabre al vencer.
- La notificación in-app se deduplica por canal y día; refrescar no vuelve a
  notificar el mismo problema.

No se ha conectado email, push ni proveedor externo. El digest remoto y sus
preferencias siguen fuera de evidencia.

## Acciones y outcomes

Registrar una acción exige que CTA, tipo de entidad e id coincidan con el
insight. Se guardan actor, membership, evidencia previa, ventana de evaluación y
clave idempotente. Al completar la ventana se registra evidencia posterior y
resultado `positive`, `neutral`, `negative` o `not_measurable`; el insight queda
resuelto sin borrar el historial.

## Lectura y API

`/owner/insights` es la bandeja canónica. Ordena por prioridad y frescura,
pagina con cursor estable y muestra evidencia, supuestos, hipótesis de valor y
una siguiente acción. Las mutaciones requieren `Idempotency-Key`.

Contratos:

- `GET /api/v1/insights`
- `GET /api/v1/insights/:id`
- `POST /api/v1/insights/:id/actions`
- `POST /api/v1/insights/:id/snooze`
- `POST /api/v1/insights/:id/dismiss`
- `POST /api/v1/insights/actions/:actionId/outcome`

Todos autentican antes de validar payload, resuelven el membership en servidor y
repiten autorización, scope, versión y relación en la transacción. Un manager
de sede solo ve su sede y no puede leer o accionar un insight agregado de
organización. Las tablas tienen RLS forzada, sin grants al Data API y acceso de
escritura reservado a `service_role`.

## Evidencia local

- AC-07: 92 % de ocupación + 3 solicitudes + 60 €/mes produce hipótesis de
  90–180 €, con supuestos visibles y sin garantía.
- Tres evaluaciones concurrentes generan un run, un insight y una notificación.
- Refresh, condición resuelta, reapertura, snooze, descarte, cooldown y
  optimistic locking aprobados.
- Acción y outcome idempotentes enlazados a regla, actor, entidad y evidencia
  antes/después.
- Manager de sede no ve el insight agregado; actor cross-tenant denegado.
- Historial inmutable y payloads de evidencia sin claves de PII.
- UI sin overflow a 375/768/1280 px y Axe WCAG A/AA sin infracciones en la
  preview sintética.
- TypeScript, ESLint focal, gates estrictos de auth/lecturas y pruebas
  PostgreSQL aprobados.

Comando principal:

- `pnpm test:zaltyko-insight-engine:local`

## Límites explícitos

El único evaluador de negocio ejecutable en esta fase es `excess_demand`; las
otras reglas tienen contrato versionado pero requieren evaluadores conectados a
las métricas correspondientes. No hay scheduler, cola, digest externo,
calibración real, E2E autenticado, benchmark español, carga objetivo, runtime
remoto ni producción verificados.
