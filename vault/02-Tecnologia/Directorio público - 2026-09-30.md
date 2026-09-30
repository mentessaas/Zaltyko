# Directorio público independiente — 2026-09-30

Implementación y límites: [runbook](../../docs/directory/README.md), [importaciones](../../docs/directory/importaciones.md).

Decisión: fichas públicas separadas del espacio privado. Reclamación manual sin ownership por email. Publicación y representación tienen estados independientes. Flags apagados por defecto; migración aditiva, rollback por lectores anteriores. Producción, cobertura real y proveedor no verificados en esta entrega. No declarar el plan completo a partir de pruebas locales.

Evidencia local actualizada: 76 pruebas focalizadas y 47 comprobaciones PostgreSQL con migración/restauración reales. Registro nuevo sin perfil operativo; activación expresa y reintento comprobados en navegador, con un único espacio y URL conservada. PR de entrega: https://github.com/mentessaas/Zaltyko/pull/174 (borrador). CI inicial aprobó build, pruebas, permisos y flujos autenticados. Vercel rechazó cron horario; corregido a diario para el plan actual. Producción continúa sin migrar ni activar.
