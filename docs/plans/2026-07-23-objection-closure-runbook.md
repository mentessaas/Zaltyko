# Runbook de cierre del mapa de objeciones

Este runbook acompaña a la [matriz de cierre](./2026-07-23-objection-closure-matrix.md).
Una objeción solo se marca como `cerrada` cuando existe evidencia de producto,
copy aprobado y validación del comportamiento indicado. Las pruebas humanas o
externas no se sustituyen por fixtures, capturas antiguas o resultados locales.

| Objeción | Owner | Acción de cierre | Evidencia requerida | Aceptación |
| --- | --- | --- | --- | --- |
| WhatsApp y Excel | Producto + ventas | Ejecutar demo completa: atleta → grupo → clase → asistencia → cobro → comunicación. | Grabación/demo con los mismos datos en un único flujo. | El director identifica dónde queda cada dato y no necesita duplicarlo durante la demo. |
| Retorno de inversión | Growth | Medir horas iniciales, time-to-value, tareas pendientes y conversión de cada trial. | `growth_events` reconciliado por academia + ficha de trial. | No se publica ROI hasta tener denominador y muestra suficiente; se publica aprendizaje cualitativo antes. |
| Adopción del equipo | Customer Success | Owner, coach y staff completan sus recorridos con sus permisos. | Checklist por rol + eventos de activación server-side. | Cada rol completa sus tres tareas core sin intervención técnica. |
| Migración | Onboarding | Importar CSV/XLSX, revisar errores y confirmar resumen con el cliente. | Archivo de prueba, informe de errores, conteo antes/después y aprobación. | Los registros válidos se importan y los inválidos quedan explicados y recuperables. |
| Control y permisos | Seguridad + Producto | Ejecutar matriz owner/coach/staff/familia y cross-academy. | Pruebas positivas/negativas y `pnpm test:rls:local` cuando corresponda. | Ningún rol ve o modifica datos fuera de su alcance. |
| Complejidad | UX + Customer Success | Observar móvil y escritorio en tareas core, registrando bloqueos. | Checklist de tarea, tiempo y asistencia solicitada. | El usuario completa el flujo sin asistencia técnica; la ayuda requerida se documenta. |
| Academia diferente | Producto | Configurar dos academias con disciplinas, niveles, horarios y cobros distintos. | Configuraciones exportadas y recorrido core de ambas. | La terminología y reglas de cada academia se mantienen sin mezclar tenants. |
| Pagos | Billing + QA | Ejecutar pago correcto, fallo, reembolso, duplicado y evento fuera de orden en sandbox. | Logs idempotentes, estados Stripe y recibos correlacionados. | Cada resultado es trazable y no se realiza cargo real. |
| Datos de menores | Seguridad + Legal | Revisar scopes por relación y copy de privacidad con usuarios de prueba. | Matriz parent/athlete/coach/owner + negativa cross-academy. | Se demuestra mínimo privilegio; no se afirma seguridad absoluta ni cumplimiento no verificado. |
| Familias y otra app | Producto + Customer Success | Probar portal limitado, mensajes, avisos y fallback cuando no hay destinatario válido. | QA de familia vinculada y eventos de entrega/lectura disponibles. | La familia ve solo lo necesario y la academia conoce el estado real del aviso. |
| Salida de datos | Producto + Soporte | Descargar cada exportación del catálogo y explicar alcance, filtros y retención. | Archivos generados, permisos, checksum opcional y política comunicada. | El cliente obtiene sus datos exportables; no se promete copia completa ni formato federativo automático. |
| Soporte | Customer Success | Abrir, responder, escalar y cerrar un ticket por plan. | Ticket con timestamps, estado, responsable y respuesta visible según rol. | El canal funciona; cualquier SLA público debe basarse en histórico real. |

## Gate de cierre

Antes de cambiar una fila a `cerrada`:

1. Ejecutar `pnpm typecheck`, `pnpm lint` y la suite relevante.
2. Confirmar que la auditoría de claims no contiene promesas superiores al alcance.
3. Guardar evidencia con fecha, entorno, rol y academia de prueba.
4. Separar siempre evidencia local, sandbox, producción y validación humana.
5. Registrar el cierre o el riesgo residual en la matriz y el vault.

## Estado actual

La implementación local y los claims están alineados. Permanecen como validación
externa/humana: trials reales, QA con familias, histórico de SLA, sandbox
completo de Stripe Connect y adaptación a formatos federativos concretos.
