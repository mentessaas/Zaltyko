# Auditoría de Supabase — 15/09/2026

## Hechos verificados

- `supabase db advisors --linked --type all --level warn -o json` terminó con código `0` contra el proyecto enlazado.
- El reporte contiene 422 hallazgos WARN.
- Supabase Auth reporta `auth_leaked_password_protection`: la protección contra contraseñas comprometidas está desactivada.
- El linter también reporta avisos de rendimiento `auth_rls_initplan` y avisos de diseño `multiple_permissive_policies`, además de dos `duplicate_index` (`coaches` y `user_preferences`). Son advertencias del estado remoto enlazado, no pruebas de fallo funcional.
- La base local no está levantada en `127.0.0.1:54322`, por lo que el advisor local no pudo ejecutarse.

## Recomendación priorizada

1. **P0 seguridad:** activar en Supabase Dashboard → Authentication → Password Security → Leaked Password Protection. Después volver a ejecutar el advisor y verificar que `auth_leaked_password_protection` desaparece.
2. **P1 rendimiento:** agrupar y corregir los RLS `auth_rls_initplan` sustituyendo llamadas por fila como `auth.uid()`/`current_setting()` por la forma estable `(select auth.uid())`/`(select current_setting(...))`, empezando por tablas calientes (`notifications`, `profiles`, `athletes`, `charges`). Requiere revisar cada política y medir antes/después.
3. **P1 mantenibilidad:** revisar políticas permisivas duplicadas por tabla y consolidarlas solo cuando se demuestre equivalencia de autorización; no eliminar políticas basándose únicamente en el linter.
4. **P2 limpieza:** confirmar si los índices duplicados tienen dependencias reales y eliminar únicamente el índice redundante mediante una migración reversible.

## Estado y límites

- **No aplicado:** no se modificó el ajuste remoto de Auth ni se ejecutaron migraciones de producción.
- El cambio de Auth requiere acceso autorizado al Dashboard o a una API de gestión con credenciales válidas; no se guardaron secretos en el repositorio.
- La corrección masiva de RLS queda pendiente de una migración específica y pruebas de regresión por rol/tenant.

