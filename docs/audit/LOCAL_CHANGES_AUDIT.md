# Auditoría de cambios locales no publicados

Fecha: 2026-07-22

## Resultado

El inventario inicial tenía 239 entradas fuera de `HEAD` (177 modificadas y 62 nuevas). Se eliminaron 16 copias muertas con sufijo `page 2`, `route 2` o tests duplicados; el árbol queda con 227 entradas no publicadas (177 modificadas y 50 nuevas).

Estos cambios no deben describirse como “correctos” únicamente por estar presentes localmente. Son cambios heredados/no reconciliados y quedan clasificados así:

- **Alineados:** endurecimiento de authz, alcance tenant, RLS, Stripe, uploads, rate limiting, cron, tests de seguridad y UX responsive.
- **Pendientes de validación:** migraciones Supabase, Lemon Squeezy, cambios grandes en tests, nuevas páginas de landing y cambios de configuración.
- **Corregidos:** copias muertas con nombres `page 2`, `route 2` y tests duplicados que no representaban rutas canónicas.
- **Bloqueadores de publicación:** cualquier cambio que altere contratos de pago, migraciones o autenticación sin pruebas completas y revisión separada.

## Desalineación corregida

El workflow de CI utilizaba variables históricas de NextAuth (`NEXTAUTH_SECRET`, `NEXTAUTH_URL`) pese a que el sistema canónico usa Supabase Auth. Se sustituyeron por `INTERNAL_AUTH_SECRET`, `SUPABASE_JWT_SECRET` y un `DATABASE_URL` de placeholder para el build.

## Evidencia de validación

- El typecheck y lint locales no finalizaron con salida concluyente en el entorno actual; fueron detenidos tras quedar sin progreso observable.
- El CI remoto publicado anteriormente sí completó tests unitarios, migraciones y RLS; build y typecheck deben confirmarse en el siguiente workflow después de este ajuste.
- La suite de seguridad local ejecutó 103 archivos: 662 tests pasaron y 12 fallaron. Los fallos se concentran en contratos de cron con leases/advisory locks y mocks desactualizados de Brevo; no se publican esos cambios hasta actualizar el contrato de prueba y volver a ejecutar la suite completa.
- `pnpm audit:dependencies --prod` ya no falla por vulnerabilidades high tras actualizar `fast-uri` y `sharp`; quedan una vulnerabilidad low y una moderate para seguimiento de Dependabot.
- No se aplicaron migraciones remotas ni se modificaron datos de producción.

## Regla de publicación

Los cambios restantes deben publicarse por lotes independientes: seguridad/authz, datos/RLS, pagos, UX y documentación. No se debe crear un commit monolítico con las 227 entradas.
