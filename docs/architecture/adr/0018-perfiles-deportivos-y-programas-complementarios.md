# ADR-0018 — Perfiles deportivos y actividades complementarias

- Estado: aceptada para implementación local
- Fecha: 2026-10-13
- Alcance: dominio de organizaciones, programas y onboarding

## Contexto

Una academia puede especializarse en gimnasia artística o rítmica, ofrecer
ambas y además impartir actividades distintas como telas, aro aéreo o baile.
Las reglas deportivas y federativas cambian por país y federación. El modelo
anterior guardaba una etiqueta libre de `discipline` en cada programa y no
representaba estas diferencias ni el rol principal/adicional de la academia.

## Decisión

1. `sport_profiles` identifica una disciplina dentro de país, federación y
   versión. El estado `verified` exige título, fuente HTTPS y fecha de revisión.
2. `identity_only` identifica una especialidad sin inventar reglas y exige
   configuración vacía. Los perfiles `draft` y `retired` no se ofrecen al alta.
3. `organization_sports` es una relación M:N tenant-aware. Permite como máximo
   una especialidad primaria activa; el servicio de alta crea exactamente una
   primaria y, opcionalmente, otra secundaria.
4. `programs` distingue `gymnastics_sport` (enlace obligatorio a una
   especialidad de la academia) y `complementary_activity` (clave propia, sin
   enlace a especialidad). Grupos y clases pueden depender de ambos tipos.
5. Moneda, zona horaria y código técnico de sede se resuelven en servidor. Solo
   se habilita un mercado cuando sus defaults y perfiles están revisados.
6. La migración no convierte ni elimina programas silenciosamente: aborta si la
   tabla greenfield contiene filas. Los fixtures sintéticos se añaden después.

## Consecuencias

- Gimnasia artística, rítmica y actividades complementarias pueden tener
  operación y métricas diferenciadas sin duplicar academia, familia o espacio.
- Incorporar otro país requiere perfil versionado y revisión de fuente/reglas,
  no traducir etiquetas ni usar un fallback genérico.
- Antes de aplicar la migración fuera de una base efímera, revisar el historial
  y el estado de `zaltyko.programs`; este ADR no autoriza ejecución remota.
- Los filtros de programa no alteran el Health Score global hasta tener un
  contrato de scoring y muestra válidos para ese nivel.

## Validación requerida

- migración sobre PostgreSQL limpio;
- FK tenant/país y RLS/grants negativos;
- alta idempotente con ambas gimnasias y actividades complementarias;
- rechazo de duplicados y perfiles no configurados;
- regresión de grupos, clases y enrollment ligados a programas.
