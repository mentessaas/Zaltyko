---
status: active
owner: marketing
last_reviewed: 2026-10-13
source:
  - ../docs/marketing/zaltyko-messaging.md
  - ../PRODUCT-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
  - ./Estrategia competitiva gimnasia.md
---
# Mensajes aprobados

## Alcance vigente — decisión de Elvis del 24-11-2026

Esta sección reemplaza los importes y nombres antiguos que aparecen en notas históricas de este archivo. Oferta pública: **Gratis** por 0 € (30 gimnastas, equipo de dos incluida la dueña, grupos y clases sin límite) y **Club** por 29 €/mes o 290 €/año. En España peninsular y Baleares, los precios publicados incluyen IVA del 21 %. México no muestra precio y no se publica ningún importe en MXN.

Club incluye una sede; cada sede adicional cuesta 20 €/mes o 200 €/año con IVA incluido y se contrata como cantidad adicional en la suscripción. Dos sedes cuestan 49 €/mes. El alta de otra sede es autoservicio. La prueba de Club dura 30 días sin tarjeta. Los diez primeros clubes de Málaga pueden usar el precio fundador de 24,90 €/mes durante 12 meses; después pagan 29 €/mes. El código de Stripe requiere cupón neto de 3,39 € para que, al aplicar IVA, el precio final baje 4,10 € hasta 24,90 €.

Las suscripciones anteriores `pro`/Starter y `premium`/Growth se respetan al precio y con el Price que ya tenían hasta que la dueña cambie de plan; se ocultan de la oferta nueva y reciben los derechos de Club. Network se retira de la oferta y no debe aparecer como destino de una subida de plan. El cobro automático de cuotas se describe solo como incluido en Club cuando se active, sin afirmar que ya está disponible. La factura SaaS sigue emitiéndose por FacturaDirecta; Stripe aplica el Tax Rate exclusivo del 21 %.


## Promesa principal

La entrada pública `/auth/register`, con o sin parámetros de rol, presenta únicamente la cuenta de dirección y creación de academia. La oferta de Club incluye el portal familiar según el alcance aprobado; no atribuirle funciones que no existan. No anuncia alta de proveedores ni marketplace. Se conserva el acceso de cuentas existentes y los contratos internos por rol; no se reclasifican usuarios.

Gestiona tu academia deportiva sin perder el foco en lo que importa: formar atletas.

## Enfoque comercial inicial

Para discovery, beta y mensajes de venta tempranos, enfocar Zaltyko en academias de gimnasia artistica y ritmica en espanol. El posicionamiento general de "academias deportivas" se mantiene como arquitectura de expansion, pero el go-to-market inicial debe hablar de gimnastas, familias, clases, cuotas, asistencia y progreso tecnico.

## Taglines permitidos

- Tu academia ordenada, tu mente libre.
- Adios al caos administrativo. Hola al crecimiento.
- Gestiona tu academia deportiva desde un solo lugar.
- Enfocate en entrenar. Nosotros te ayudamos con la administracion.

## Mensajes por canal

| Canal | Mensaje seguro |
| --- | --- |
| Landing | Plataforma todo-en-uno para ordenar atletas, clases, pagos, eventos y comunicacion. |
| Google Ads | Software de gestion para academias deportivas. |
| Demo ventas | Veremos como centralizar operaciones y reducir trabajo manual. |
| Email onboarding | Empieza configurando academia, clases, atletas y primer cobro. |
| Plan heredado | Solo se muestra a quien ya tiene una suscripción anterior; no se ofrece para nuevas altas. |
| Pricing vigente | Gratis 0 €; Club 29 €/mes o 290 €/año con IVA incluido; sedes extra 20 €/mes o 200 €/año. |
| Trial | 30 días de Club sin tarjeta, una activación por academia cada 12 meses; al terminar vuelve a Gratis. |

### Cobros a familias — estado y mensaje vigente

- Copy aprobado para la experiencia de lanzamiento: «Organiza las cuotas,
  registra manualmente los pagos recibidos y consulta qué importes siguen
  pendientes. En este lanzamiento no se realizan cargos automáticos a las
  familias».
- Este copy quedó aplicado en la rama de trabajo y se verificó en el preview
  actual. No equivale a producción: PR #225 sigue pendiente de aprobación
  independiente, merge y despliegue. No activar captación con una promesa de
  automatización ni tratar el preview como comportamiento productivo.
- Gratis y la prueba usan registro manual. Club incluye el cobro automático de
  cuotas sin coste adicional cuando se active; hoy no está disponible y no se
  debe presentar como una función ya operativa.
- Solo revisar y aprobar un claim de automatización cuando estén activos y
  probados el entitlement de pago, consentimiento/mandato por pagador, Connect,
  worker idempotente, webhook verificado, recuperación, permisos y QA de release.
- Portal familiar, tarjeta: «Guardar una tarjeta no realiza un cargo en ese
  paso; la academia gestiona cómo se cobran las cuotas». No describir el alta
  de tarjeta como activación de cobros automáticos.

## CTAs y claims seguros a 2026-07-12

- Free puede dirigir al registro de owner.
- Actualización 2026-09-13: el CTA principal de la landing (hero, navbar, CTA final, sticky bar) dirige a `/auth/register?role=owner` ("Crear cuenta gratis") y las CTAs de home, módulos y features explican que primero se crea la cuenta y después se configura la academia.
- Gratis y Club usan la CTA pública **"Crear academia gratis"** y dirigen a `/auth/register?role=owner`. Desde Facturación, la persona propietaria puede activar la prueba de Club y elegir pago mensual o anual.
- La oferta ya no incluye Network ni una llamada de contacto obligatoria para añadir una sede.
- Usar "aislamiento por academia" y "controles de acceso"; no usar "100% seguro" ni "cumplimiento RGPD garantizado".
- Usar “privacidad por diseño” y “atención por email”; no publicar “RGPD Compliant” ni tiempos de respuesta cerrados sin evidencia operativa.
- Usar "puesta en marcha guiada"; no prometer una duracion cerrada sin evidencia operativa.
- Describir el portal familiar como limitado y seguro (horarios, avisos, progreso publicado y cuotas); no usar "portal completo" mientras las capacidades administrativas sigan fuera del alcance familiar.
- Describir importación CSV/Excel como base principal; migraciones históricas, familias, cobros o formatos complejos requieren revisión de alcance y pueden ser acompañadas.
- Usar resultados como beneficios esperados (menos trabajo manual, más trazabilidad); no publicar porcentajes de ahorro, recaudación o adopción sin trials y denominadores verificables.
- No publicar testimonios con nombres, academias, volúmenes o resultados concretos sin autorización y evidencia trazable. Mientras no exista esa evidencia, usar proof points de capacidad.
- Describir exportación y retención por módulo y política vigente; no prometer "toda la información en cualquier momento" si el alcance no está documentado.
- Los precios actuales son los fijados en la decisión del 24-11-2026; los bloques Starter/Growth/Network y sus importes son históricos. La creación y verificación de los Price IDs nuevos queda pendiente y no se presume hecha.
- La prueba publicada es Club durante 30 días, sin tarjeta. No decir que se activa automáticamente al registrarse.

## Mensajes de gimnasia en validacion — ejemplos históricos, no oferta vigente

Usar en entrevistas, demos manuales y documentos internos; no publicar como promesa definitiva sin revisar producto real.

| Canal | Mensaje provisional |
| --- | --- |
| Discovery gimnasia | Software para academias de gimnasia artistica y ritmica que quieren ordenar gimnastas, familias, clases, cuotas, asistencia y progreso tecnico. |
| Demo beta | Veremos como centralizar alumnos, grupos, pagos, asistencia, evaluaciones y comunicacion interna para que entrenadores y familias trabajen dentro de Zaltyko. |
| Pricing oficial histórico | Sustituido por Gratis y Club según la decisión del 24-11-2026; no reutilizar importes Starter/Growth/Network. |
| Comunicacion | La comunicación interna incluye avisos y notificaciones según los permisos de cada perfil. |
| Cuentas por rol | Cada persona puede tener su cuenta propia en Zaltyko: academia, entrenador, familia, atleta o proveedor. Las academias se conectan con usuarios por invitacion o solicitud aceptada. |
| Publico sin cuenta | Visitantes pueden descubrir academias, eventos y marketplace sin crear cuenta; crear cuenta sirve para guardar historial, aceptar vinculos y gestionar solicitudes. |

## No prometer como listo sin validacion

- Facturacion electronica completa.
- Exportacion contable.
- Centro unificado de notificaciones si la experiencia real no esta validada end-to-end.
- IA que toma decisiones automaticas.
- Resultados federativos/listados automaticos completos.
- Soporte enterprise o integraciones custom sin alcance cerrado.
- Academias ilimitadas en los planes individuales.
- WhatsApp como canal principal, automatizacion central o integracion prioritaria v1.
- App nativa/branded para padres como parte del MVP.
- Vincular usuarios existentes a una academia sin aceptacion explicita.

## Regla

Todo cambio de copy publico debe revisarse contra [[Inventario de producto]] y [[Pricing]].


### Vendedor y precios — declaración humana26oct2026

Promotor y futuro titular: Elvis Valdes Inerarte, España; no afirmar alta de autónomo hasta que sea efectiva. Correo oficial hola@zaltyko.com (recepción/respuesta pendiente de comprobación). Precios base sin IVA. Información legal aún en preparación y contratación Live cerrada; nunca publicar NIF/domicilio ficticios ni totales fiscales no confirmados.
