# Monitorización propia de producción

## 2026-07-22

Se añadió el workflow de GitHub Actions `Production monitoring` y el endpoint público read-only `/api/health`.

- Comprueba disponibilidad, estado de PostgreSQL y latencia cada 15 minutos.
- Crea o actualiza un issue de incidente cuando la comprobación falla.
- Cierra el incidente cuando la salud vuelve a `ok`.
- No expone secretos ni modifica datos de negocio.

Es un control complementario: GitHub puede retrasar los schedules y no sustituye observabilidad detallada de Vercel, Stripe, Brevo o Supabase.
