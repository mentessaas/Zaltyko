---
status: active
owner: ventas
last_reviewed: 2026-06-22
source:
  - ../docs/marketing/zaltyko-buyer-personas.md
  - ../docs/marketing/zaltyko-messaging.md
---
# Playbook de demo

## Demo para academia pequena

1. Dolor: WhatsApp, Excel, pagos y horarios dispersos.
2. Mostrar dashboard.
3. Crear o abrir atleta.
4. Mostrar clase/grupo y asistencia.
5. Mostrar cobro/recibo.
6. Cerrar con siguiente paso: configurar academia real o trial.

## Demo 15 minutos validada 2026-07-07

1. Super admin revisa academias y usuarios.
2. Dueno entra al dashboard de academia.
3. Dueno abre gimnastas y grupos/clases.
4. Entrenador registra asistencia y progreso tecnico.
5. Dueno revisa cuotas/cobros internos y comunicaciones.
6. Cierre: Zaltyko gestiona academias; no es software fiscal ni emite facturacion oficial.

### Estado operativo 2026-07-07

- Dataset dev-session disponible para demo interna: academia en Espana, 3 gimnastas, grupo, clase, entrenadores, asistencia, cobros internos y progreso.
- Rutas owner verificadas con dev-session: dashboard, gimnastas, grupos, clases, cobros, settings y my-dashboard.
- No usar e2e autenticado como evidencia hasta actualizar credenciales demo: Supabase Auth rechaza las actuales.
- Para demo real, preparar cuentas separadas super_admin, owner y coach y generar storage states limpios.

## Demo para cadena o operaciones

1. Dolor: visibilidad multi-sede y reportes tardios.
2. Mostrar estructura por academia.
3. Mostrar metricas y reportes.
4. Mostrar permisos y estandarizacion.
5. Hablar de migracion/piloto.

## Reglas

- No prometer features marcadas como parciales en [[Inventario de producto]].
- Si el prospecto pide integracion custom, registrar decision/alcance antes de comprometer.
- No mostrar metricas historicas o comparativas sin fuente real.
- No usar copy de VeriFactu, AEAT, firma fiscal, modelos tributarios ni facturacion oficial.
- Antes de demo, regenerar storage state si se usa Playwright y revisar `docs/DEMO_READY_CHECKLIST.md`.
- Si se muestra panel familiar, hacerlo solo despues de QA con usuario parent real y atleta vinculado.
