# Directorio público independiente — 2026-09-30

Implementación y límites: [runbook](../../docs/directory/README.md), [importaciones](../../docs/directory/importaciones.md).

Decisión: fichas públicas separadas del espacio privado. Reclamación manual sin ownership por email. Publicación y representación tienen estados independientes. Flags apagados por defecto; migración aditiva, rollback por lectores anteriores. Producción, cobertura real y proveedor no verificados en esta entrega. No declarar el plan completo a partir de pruebas locales.

Evidencia local actualizada: 76 pruebas focalizadas y 47 comprobaciones PostgreSQL con migración/restauración reales. Registro nuevo sin perfil operativo; activación expresa y reintento comprobados en navegador, con un único espacio y URL conservada. PR de entrega: https://github.com/mentessaas/Zaltyko/pull/174 (borrador). CI inicial aprobó build, pruebas, permisos y flujos autenticados. Vercel rechazó cron horario; corregido a diario para el plan actual. Producción continúa sin migrar ni activar.

Cierre técnico adicional: 88 pruebas focalizadas en 12 archivos; listado por país conectado con las fichas externas y visible en navegador. Atribución de demos comprobada contra API local, reintento idempotente con una única conversión. Storage local real deniega descarga/firma a anónimo y otra cuenta y admite firma temporal de 60 segundos del administrador; documento ficticio retirado. Vista previa Vercel del commit 90979f5c desplegada con flags apagados.


## Onboarding de propietarios — 2026-09-30

Búsqueda de academias públicas visible antes de crear un espacio, reclamación gratis por aprobación manual y acceso separado para espacios operativos existentes. La API bloquea coincidencias exactas de nombre/país/localidad y vuelve a comprobar permisos y coincidencias en la transacción. No muestra espacios privados. Prueba local en navegador: ficha externa ficticia encontrada, intento directo de duplicación devuelve 409, solicitud enviada queda pendiente y sin permiso concedido. Permanecen 6 academias operativas y 12 memberships. Suite focalizada: 91 casos en 13 archivos; PostgreSQL aislado: 50 comprobaciones. Producción sigue sin activar este módulo.

## Control de autorización de fuentes — 2026-10-02

El alta/edición de fuentes no permite activar extracción con solo texto libre: exige URL HTTPS de condiciones, referencia de permiso escrito de al menos 20 caracteres y confirmación expresa del Super Admin. La confirmación y los datos exactos revisados se registran en `directory_audit`. Importar lotes, extraer candidatos, aceptar filas y el cron comprueban que la evidencia siga correspondiendo a la fuente vigente. Los permisos reales de RFEG, FDPG y CBG siguen sin acreditarse; esta validación de software no es revisión legal.

Verificación local: `pnpm exec vitest run tests/directory-contracts.test.ts` (24/24), `pnpm typecheck`, ESLint focal, compilación de producción y `bash scripts/directory/test-local.sh` (63 comprobaciones PostgreSQL, restauración del respaldo). No se generó ni aplicó migración y no se tocaron Supabase, flags, fuentes reales o producción. Mantener importaciones apagadas hasta permiso documentado, conciliación de historiales y backup/restauración comprobables.
