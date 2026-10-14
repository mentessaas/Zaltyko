# QA — Esquema y contrato para cuota mensual por gimnasta

- **Fecha:** 2026-10-14
- **Rama:** `codex/monthly-athlete-tariff-schema-contract-20261014`
- **Base aprobada:** `5a6eb09268d1ddc7eb85e587726e7e7044cd04fb`
- **Alcance:** migración aditiva, esquema Drizzle, contratos/validaciones puras y pruebas locales. Sin servicio de emisión, rutas API, UI, ADR ni vault.

## Contrato aprobado que prepara este bloque

Una línea `monthly_fee` representa exactamente una tarifa mensual de una gimnasta en una factura familiar de sede y periodo. Su `amountCents` es el snapshot mensual común de `enrollment_price_assignments.unit_amount_cents`, aplicado una vez; **no es la suma por inscripción**. Todas las inscripciones activas de esa gimnasta deben resolver al mismo plan, importe y moneda, y cada plantilla debe tener cobertura efectiva durante el mes completo. Los conflictos bloquean la línea completa.

Contrato Zod/TypeScript preparado para el siguiente servicio/API y para Front:

```ts
type MonthlyAthleteTariffOptions = {
  lines: Array<{
    athleteId: string;
    athleteName: string;
    pricePlanId: string;
    pricePlanName: string;
    amountCents: number; // importe mensual común, una vez
    currency: string;
    coveredEnrollments: Array<{
      enrollmentId: string;
      classTemplateId: string;
      className: string; // snapshot visible; 2–120 caracteres
      assignmentId: string;
    }>;
  }>;
  conflicts: Array<{
    athleteId: string;
    code: "ATHLETE_TARIFF_CONFLICT" | "TARIFF_COVERAGE_INCOMPLETE";
    enrollmentIds: string[];
  }>;
};
```

La validación rechaza importe fuera del rango entero seguro, cobertura vacía o IDs repetidos, líneas duplicadas para una gimnasta y cualquier atleta que aparezca a la vez como línea y conflicto. No realiza agregación ni decide qué tarifa gana.

## Cambio de datos

- `price_plan_class_template_coverage` declara `organization + location + pricePlan + classTemplate + startsOn/endsOn`. Las fechas son inclusivas; `endsOn` puede ser nulo. FK compuestas fijan organización/sede/tarifa/plantilla; el `CHECK` valida el rango y un `EXCLUDE USING gist` impide coberturas temporales solapadas para el mismo alcance. Coberturas adyacentes pueden empezar al día siguiente.
- `invoice_lines` recibe `location_id` y `athlete_id` nullable. Las filas históricas no se actualizan. Para las nuevas líneas con atleta, un `CHECK` limita la forma a `monthly_fee`, plan y sede presentes, `enrollment_id` nulo, `quantity=1` y mes calendario completo. FK compuesta obliga a que la sede de línea coincida con la sede de factura. Un índice parcial impide duplicar gimnasta/periodo dentro de la factura; las filas antiguas con `athlete_id IS NULL` quedan fuera.
- `invoice_line_enrollments` conserva por línea las inscripciones, plantillas, IDs de asignación y nombre de clase leído al emitir. FK tenant-aware enlazan línea, atleta, sede, enrollment, plantilla, tarifa y asignación; constraints impiden repetir inscripción o plantilla en la línea. Triggers bloquean `UPDATE`, `DELETE` y `TRUNCATE`; `service_role` solo obtiene `SELECT` e `INSERT` en esta tabla.
- Ambas tablas tienen RLS activado y forzado, policy de denegación para `anon` y `authenticated`, y revocación explícita de privilegios de cliente. Coberturas concede a `service_role` solo `SELECT`, `INSERT` y `UPDATE`, sin `DELETE` ni `TRUNCATE`.
- La migración añade FK/índices necesarios a tablas existentes, pero no reescribe importes, líneas, pagos ni snapshots históricos. Factura conserva familia, pagador, moneda y vencimiento existentes. La emisión/replay transaccional y un cargo por nueva línea quedan para el siguiente bloque de servicio.

## Verificación local

- `pnpm test:zaltyko-monthly-athlete-tariff:local` — PASS contra PostgreSQL efímero recién inicializado, **14.20**. El servidor y la comprobación de puerto se limitan a `127.0.0.1`; no usa configuración remota.
- SQL adversarial: cobertura solapada e intervalo inválido, FK entre tenants y sedes, línea en sede distinta a su factura, mes parcial y fechas de periodo nulas, clase/asignación/atleta cruzados, línea duplicada, snapshot de clase mayor de 120 caracteres, SELECT/INSERT autenticado con grants temporales en transacción reversible, y `UPDATE`/`DELETE`/`TRUNCATE` del historial.
- La fixture inserta una línea legacy antes de la migración y comprueba después que retiene `enrollment_id` y no recibe `location_id` ni `athlete_id` por backfill.
- `pnpm exec vitest run tests/monthly-athlete-tariff-domain.test.ts` — 7/7 PASS.
- `pnpm typecheck`, ESLint focal, Prettier focal, `pnpm check:migrations` — PASS (7 Drizzle + 112 Supabase), `pnpm validate:rls` — PASS (79/79 tablas legacy declaradas).

## Límites y siguientes pasos

La versión del PostgreSQL local probada es 14.20; no se consultó una base remota ni se afirma equivalencia con la versión de cualquier proyecto Supabase. La migración no se aplicó a remoto. La validación global `validate:rls` reporta las 79 tablas del esquema legado; la comprobación de las tablas greenfield nuevas se hizo con SQL directo en el harness PostgreSQL.

Pendiente de bloques posteriores: writer/quote debe agrupar por gimnasta sin sumar enrollments, comprobar todos los snapshots y cobertura efectiva para el mes, devolver conflictos sin línea parcial, incluir atleta/tarifa/coberturas en el hash y registrar un solo charge por línea; después conectar la ruta Owner y el UI con este DTO y ejecutar E2E autenticado/replay. Ninguno de esos comportamientos queda activo por este cambio de esquema.
