# Query layer y Owner Dashboard

- Estado: implementado y verificado localmente
- Fecha: 2026-10-06
- Alcance: PR-07 del plan Owner Dashboard / Academy Health Score

## Contrato de lectura

`getOwnerDashboard` es la única composición de lectura del panel. Consulta
snapshots, dimensiones, contribuciones y valores inmutables de un `metric_run`;
no recorre outbox ni vuelve a ejecutar fórmulas en una request.

Expone:

- organización y sedes autorizadas;
- período y períodos materializados disponibles;
- score, banda, cobertura, benchmark, fuente y watermark;
- cuatro dimensiones y doce métricas con calidad y explicación;
- hasta tres prioridades deterministas derivadas de datos insuficientes o
  contribuciones por debajo de 70/100;
- seis cierres de tendencia como máximo.

La API canónica es `GET /api/v1/owner/dashboard`. Autentica antes de validar la
URL, acepta `organization_id`, `location_id`, `from` y `to`, y devuelve errores
`application/problem+json`. Las respuestas son privadas y `no-store`.

## Autorización

La organización nunca se acepta como prueba de acceso. El servidor resuelve el
membership activo por `auth user id`:

- owner/admin pueden solicitar agregado de organización o una sede;
- manager solo recibe sus sedes asignadas y nunca agregado de organización;
- una sede manipulada produce `LOCATION_SCOPE_DENIED`;
- un intento cross-tenant produce `FORBIDDEN` y un registro append-only
  `owner_dashboard.access_denied` sin exponer si el tenant existe.

El bundle no incluye listas, nombres ni contactos de atletas. El fixture y la
preview son completamente sintéticos.

## Interfaz

`/owner` es server-rendered, requiere sesión y conserva período, sede y
organización en la URL. `/owner/preview` solo existe fuera de producción para
QA visual sin credenciales ni datos reales.

La jerarquía mobile-first coloca primero las decisiones, después score y KPIs.
Incluye:

- una acción primaria;
- score explicable y cobertura;
- cuatro KPIs, tendencia, flujo de cobro y contribuciones auditables;
- estados `empty`, `error`, `stale` e `insufficient` sin convertir fallos en
  ceros;
- skip link, landmarks, objetivos táctiles de 44 px, estado no dependiente solo
  de color y tabla equivalente para la tendencia.

## Evidencia local

- contrato sobre PostgreSQL efímero: 12 métricas, 4 dimensiones y ausencia de
  PII en el bundle;
- AC-08: actor de otra organización denegado y auditado;
- AC-09: manager forzado a Sede Norte y Sede Sur denegada;
- 20 consultas concurrentes al fixture: p95 local sintético 54,3 ms;
- 375, 768 y 1280 px sin overflow horizontal;
- teclado: skip link visible y explicación de métrica operable con Enter;
- Axe WCAG 2 A/AA y 2.1 A/AA: cero infracciones en 375 px;
- lint, TypeScript, gates estrictos de auth/lecturas y build de Next aprobados.

Comando del contrato:

- `pnpm test:zaltyko-owner-dashboard-query:local`

## Límites y deuda explícita

El resultado de 54,3 ms no valida AC-12: no usa 5.000 atletas, 2 millones de
asistencias, cache caliente/fría ni 20 identidades autenticadas. El p95 a
volumen objetivo sigue `NO VERIFICADO`.

El motor materializa organización/sede/período, pero todavía no programa,
disciplina o grupo. Esos filtros no se muestran porque devolver un agregado de
organización etiquetado como segmentado sería incorrecto. Requieren añadir el
grano al metric run, snapshots y tests de atribución —incluido revenue— antes
de exponerlos.

No se verificaron VoiceOver humano, E2E autenticado contra Supabase, cache
remoto, runtime desplegado, producción ni datos reales.
