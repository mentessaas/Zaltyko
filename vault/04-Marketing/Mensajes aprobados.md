---
status: active
owner: marketing
last_reviewed: 2026-07-13
source:
  - ../docs/marketing/zaltyko-messaging.md
  - ../PRODUCT-ANALYSIS.md
  - ../INCONSISTENCY-AUDIT.md
  - ./Estrategia competitiva gimnasia.md
---
# Mensajes aprobados

## Promesa principal

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
| Network | Multi-sede solo bajo diagnostico y onboarding acompanado. |
| Pricing v3.0 | Free hasta 30 gimnastas, Starter 19 €/mes hasta 75, Growth 49 €/mes hasta 200 y Network 99 €/mes multi-sede con onboarding acompanado. |
| Trial | 7 días de Starter sin tarjeta, una activación por academia cada 12 meses; al terminar vuelve a Free y no hay cargo automático. |

## CTAs y claims seguros a 2026-07-12

- Free puede dirigir al registro de owner.
- Actualización 2026-07-13: el CTA principal de la landing (hero, navbar, CTA final, sticky bar) dirige a `/auth/register?role=owner` ("Crea tu academia gratis" / "Crear cuenta gratis") en vez de a `/contact?type=demo`. Sigue siendo registro Free, ya autorizado por la regla anterior; el cambio es de prioridad visual, no de alcance. Los CTA de los planes Starter/Growth en `/pricing` siguen apuntando a demo/contacto hasta que exista el handoff registro → checkout validado (ver regla siguiente). Ver [[Auditoria producto-CRO-SEO 2026-07-13]].
- Starter y Growth usan la CTA pública **"Solicitar demo"** mientras no exista handoff registro → checkout validado end-to-end. No usar "Contratar" si el enlace abre contacto.
- Network siempre dirige a contacto/onboarding acompanado, nunca a checkout.
- Usar "aislamiento por academia" y "controles de acceso"; no usar "100% seguro" ni "cumplimiento RGPD garantizado".
- Usar “privacidad por diseño” y “atención por email”; no publicar “RGPD Compliant” ni tiempos de respuesta cerrados sin evidencia operativa.
- Usar "puesta en marcha guiada"; no prometer una duracion cerrada sin evidencia operativa.
- Describir importación CSV/Excel como base principal; migraciones históricas, familias, cobros o formatos complejos requieren revisión de alcance y pueden ser acompañadas.
- Usar resultados como beneficios esperados (menos trabajo manual, más trazabilidad); no publicar porcentajes de ahorro, recaudación o adopción sin trials y denominadores verificables.
- No publicar testimonios con nombres, academias, volúmenes o resultados concretos sin autorización y evidencia trazable. Mientras no exista esa evidencia, usar proof points de capacidad.
- Describir exportación y retención por módulo y política vigente; no prometer "toda la información en cualquier momento" si el alcance no está documentado.
- No anunciar precio o descuento anual hasta que exista el Price anual real en Stripe.
- Publicar el claim del trial únicamente cuando la promoción de Fase 1 esté verificada en producción. El CTA correcto es crear la academia y activarlo desde Facturación; no decir que se activa automáticamente al registrarse.

## Mensajes de gimnasia en validacion

Usar en entrevistas, demos manuales y documentos internos; no publicar como promesa definitiva sin revisar producto real.

| Canal | Mensaje provisional |
| --- | --- |
| Discovery gimnasia | Software para academias de gimnasia artistica y ritmica que quieren ordenar gimnastas, familias, clases, cuotas, asistencia y progreso tecnico. |
| Demo beta | Veremos como centralizar alumnos, grupos, pagos, asistencia, evaluaciones y comunicacion interna para que entrenadores y familias trabajen dentro de Zaltyko. |
| Pricing oficial | Zaltyko tiene un Free util y planes pagados simples para el mercado hispano: Starter 19 €, Growth 49 € y Network 99 € bajo acompanamiento. |
| Comunicacion | La comunicacion prioritaria vive dentro de Zaltyko: mensajes, avisos, notificaciones e historial por gimnasta/familia/grupo. |
| Cuentas por rol | Cada persona puede tener su cuenta propia en Zaltyko: academia, entrenador, familia, atleta o proveedor. Las academias se conectan con usuarios por invitacion o solicitud aceptada. |
| Publico sin cuenta | Visitantes pueden descubrir academias, eventos y marketplace sin crear cuenta; crear cuenta sirve para guardar historial, aceptar vinculos y gestionar solicitudes. |

## No prometer como listo sin validacion

- Facturacion electronica completa.
- Exportacion contable.
- Centro unificado de notificaciones si la experiencia real no esta validada end-to-end.
- IA que toma decisiones automaticas.
- Resultados federativos/listados automaticos completos.
- Soporte enterprise o integraciones custom sin alcance cerrado.
- Academias ilimitadas en Starter o Growth.
- Multi-sede autoservicio sin onboarding acompanado.
- WhatsApp como canal principal, automatizacion central o integracion prioritaria v1.
- App nativa/branded para padres como parte del MVP.
- Vincular usuarios existentes a una academia sin aceptacion explicita.

## Regla

Todo cambio de copy publico debe revisarse contra [[Inventario de producto]] y [[Pricing]].
