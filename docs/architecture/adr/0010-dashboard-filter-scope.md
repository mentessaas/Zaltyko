# ADR-0010 — Ámbito de los filtros de programa y grupo del dashboard

- Estado: aceptado para la V1 local
- Fecha: 2026-10-06
- Contexto: el PRD requiere filtros compartibles de sede, período, programa y
  grupo. Los snapshots de Academy Health Score solo se calculan a nivel de
  organización o sede; no existen snapshots ni perfiles de scoring por programa
  o grupo.

## Decisión

`locationId`, `from` y `to` filtran los snapshots del Health Score conforme a su
ámbito y período disponibles. `programId` y `groupId` se serializan en la URL y
filtran únicamente los paneles operativos que tienen esa granularidad (aforo y
cohortes). La UI debe advertirlo junto al filtro; no debe aparentar que el score
global o de sede cambia con programa/grupo.

Las opciones y selecciones de programa/grupo se validan contra organización,
sede autorizada y relaciones canónicas de clases/grupos. El filtro de grupo
pertenece a `class_template_groups`; no sustituye la pertenencia M:N canónica
`group_athletes`/enrollment.

## Consecuencias

- La URL conserva filtros al compartirla; el servidor vuelve a resolver permisos.
- El score no se recalcula ni se presenta como score de una subpoblación sin una
  métrica, muestra y perfil de scoring definidos para ese ámbito.
- Para mostrar score por programa/grupo habrá que diseñar primero su contrato,
  tamaño mínimo de muestra, cobertura y política de benchmark como una decisión
  nueva, no inferirlo de la agregación actual.

## Evidencia requerida

Pruebas de acceso cruzado organización/sede, filtros en URL y contrato visual
que explicite el ámbito operativo de programa/grupo; pruebas visuales no
sustituyen E2E autenticado.
