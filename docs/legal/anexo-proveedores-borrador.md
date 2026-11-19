# Anexo de proveedores — inventario para revisión

Fecha: 2 noviembre 2026. Inventario candidato, no autorización de nuevos servicios. La documentación pública no prueba aceptación del DPA en nuestra cuenta, entidad contractual, región configurada ni tráfico efectivo. Completar evidencias privadas con referencias seguras, nunca claves ni datos de clientes.

| Proveedor | Función y datos potenciales | Evidencia / pendiente |
|---|---|---|
| Supabase | BD/Auth; datos operativos, cuentas y tokens gestionados por Auth | Lectura previa: producción jegxfahsvugilbthbked en eu-north-1. Verificar contrato/DPA de organización, subencargados, soporte/accesos, backups y transferencias; no equivale a todo UE |
| Vercel | Hosting, funciones, CDN, IP/URLs, logs y datos procesados por solicitudes | Deployment staged confirmado; región efectiva de funciones/logs y retención pendientes. No incluir productos IA no utilizados |
| Brevo | Servicio transaccional preparado; destinatario, contenido y eventos solo si se conecta un recorrido autorizado | Cuenta Zaltyko / zaltyko@gmail.com confirmada por el titular. Documentos legales de la cuenta indica APD incluido en las condiciones e incorporado al crear cuenta o usar el servicio; lectura3nov, sin aceptar un acuerdo nuevo. Remitente hola@zaltyko.com verificado y dominio autenticado/verificado el4nov según evidencia de cuenta. La recuperación recibida desde entregas usó Supabase Auth, no Brevo; falta recepción real acreditada desde un recorrido esencial canónico; la existencia de llamadas a Brevo en el código no demuestra esa entrega. Entidad, versión contractual íntegra, retención, regiones y correspondencia de credenciales desplegadas pendientes |
| Hostinger Mail | Buzón de soporte hola@zaltyko.com; destinatarios y contenido de consultas | Sesión y recepción/respuesta manual reales comprobadas el3nov con mensajes QA. No equivale al circuito automático de aplicación. Entidad contratante, DPA, subencargados, regiones, transferencias, conservación y recuperación del buzón pendientes |
| Upstash/Redis vía integración KV | Control de solicitudes; identificadores técnicos y contadores | Código usa KV; endpoint/token nunca en este anexo. Titular, región, TTL y contrato productivos pendientes de verificar; no extrapolar Redis Free sandbox |
| Sentry | Errores y tiempos/correlación técnica; datos previamente recibidos sujetos a configuración del proveedor | Entregas a69b25ee: filtro compartido allowlist, Replay no cargado, logs SDK/breadcrumbs off. CI10regresionesPASS y bundle alojado comprobado. Producción permanece en artefacto anterior: no atribuirle la corrección. Región, plan, retención, contrato y sobres reales pendientes |
| Stripe | Suscripción SaaS: contacto, facturación, identificadores y pago | Live nuevo cerrado; test no acredita Live. Stripe distingue funciones de responsable y encargado, por tanto no se clasifica uniformemente como subencargado de datos de menores. No enviar datos operativos innecesarios |

## Fuentes oficiales consultadas
- Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- Supabase subencargados: https://supabase.com/legal/customer-resources/subprocessor-list
- Supabase residencia: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Vercel DPA: https://assets.vercel.com/image/upload/q_auto/front/legal/dpa/Vercel_Inc_-_Data_Processing_Addendum.pdf
- Vercel inventario/trust: https://vercel.com/legal/sub-processors
- Upstash DPA: https://upstash.com/trust/dpa.pdf
- Upstash términos: https://upstash.com/trust/terms
- Stripe DPA: https://stripe.com/legal/dpa (consultado: roles diferenciados)
- Brevo términos: https://www.brevo.com/legal/termsofuse/ (contenido contractual no extraíble por herramienta en esta consulta; pendiente revisión íntegra)
- Brevo cuenta: https://app.brevo.com/profile/data-processing-agreement (lectura autenticada3nov: APD incorporado por condiciones; evidencia durable brevo-account-dpa-observation.txt y brevo-account-legal.png en auditorias/2026-11-03 de la raíz de trabajo. No acredita firma separada ni versión archivada íntegra).
- Sentry DPA: https://sentry.io/legal/dpa/ (herramienta no pudo extraer contenido; pendiente revisión íntegra)

## Registro de aprobación por proveedor
Antes de cerrar: entidad legal concreta, cuenta/organización titular, servicio contratado, DPA y fecha/forma de incorporación, subencargados relevantes, países de almacenamiento/acceso/soporte, mecanismo de transferencia aplicable, retención/supresión, contacto y avisos de cambios. Guardar referencia documental y hash de versión, sin afirmar firma inexistente. Publicar luego solo información pertinente, no identificadores internos ni configuración.

## Cambio de proveedor
Comparar inventario, informar según plazo que finalmente se acuerde, gestionar oposición y registrar decisión antes de nuevo tratamiento. No se han enviado avisos ni firmado términos ni activado proveedores en esta tarea.

## Soporte asistido por IA
Elvis es el responsable humano designado. El apoyo de IA solicitado no acredita una integración desplegada ni autoriza remitir conversaciones o datos de clientes a un proveedor adicional. Antes de hacerlo, identificar proveedor, finalidad, datos mínimos, retención y condiciones de tratamiento. No se publica cobertura continua ni suplencia humana inexistente.
