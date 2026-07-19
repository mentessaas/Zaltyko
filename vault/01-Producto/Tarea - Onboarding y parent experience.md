---
status: draft
owner: producto
last_reviewed: 2026-06-23
source:
  - ../docs/marketing/zaltyko-competitors.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../04-Marketing/Onboarding y activacion.md
  - ../05-Ventas-y-CS/Onboarding de cliente.md
---

# Tarea - Onboarding y parent experience

## Objetivo

Subir la barra del portal del padre y del flujo de registro de academia al nivel de Sawyer/ClassForKids (UX) y Jackrabbit (profundidad), manteniendo la ventaja de Zaltyko en modalidad y espanol.

## Origen

Detectado en [[Matriz competitiva gimnasia]] y detallado en [[../../docs/marketing/zaltyko-competitors]] v2.0 (secciones 9.2 Jackrabbit Parent Experience, 9.5 ClassForKids, 9.6 Sawyer). El portal del padre actual cubre mensajes y avisos pero le falta: onboarding wizard de academia, checkout en 3 pasos para padres, mobile-first, y vista consolidada de "clase de hoy".

## Estado detectado

- [[Backlog priorizado]] ya tiene "Desbloquear portal moderno de padres/atletas" en progreso y "Completar onboarding/trial con aha moments" Resuelto (P1).
- Falta wizard de setup para la academia (hoy se configura pieza a pieza).
- Falta checkout de padre en 3 pasos (clase → horario → pago).
- Falta mobile-first (portal funciona en desktop pero fricciona en movil).

## Alcance

Incluye:

1. **Onboarding wizard de academia en 3 pasos**: "crea academia → anade primera clase → recibe primer pago demo". Inspirado en Sawyer. Sin requerir demo.
2. **Checkout de padre en 3 pasos**: clase → horario → pago. Sin friccion. Mobile-first. Inspirado en Sawyer.
3. **Parent portal detallado**: dashboard del padre con proximas clases, historial de pagos, progreso de la hija, mensajes internos, tokens make-up disponibles. Inspirado en Jackrabbit Parent Experience.
4. **Vista "clase de hoy" para entrenador**: pasar asistencia, registrar progreso, enviar aviso desde una sola vista compacta. Ya esta en P1 como "Disenar flujo entrenador clase de hoy".

No incluye (fase posterior):

- App movil nativa (Fase 2, ver plan).
- Marketplace Zaltyko `/descubre` (Fase 3, ver [[Tarea - Marketplace Zaltyko y multi-idioma]]).

## Criterios de aceptacion

- Academia nueva puede llegar a "primer atleta inscrito + clase creada + cobro simulado" en menos de 15 minutos sin ayuda.
- Padre puede inscribir a su hija en una clase en 3 taps maximo desde el movil.
- Parent portal muestra en mobile: proxima clase, mensajes no leidos, pagos pendientes, progreso tecnico resumido.
- Entrenador abre "clase de hoy" y en una vista pasa lista, registra 1 evaluacion rapida y manda aviso al grupo.
- Copy 100% espanol, sin prometer features que no estan (ver [[Mensajes aprobados]]).

## Pruebas

- Test e2e: academia nueva completa wizard de 3 pasos.
- Test e2e: padre completa checkout en 3 pasos desde viewport movil.
- Test e2e: entrenador pasa asistencia y registra evaluacion desde "clase de hoy".
- QA con academia piloto durante 1 semana.
- Tests `e2e-critical-flows` y `product-roles-navigation` en verde.
- Auditoria a11y movil (Playwright + axe en viewport 375x667).

## Riesgos

- Onboarding de 3 pasos requiere simplificar UI actual; puede romper flujos existentes.
- Mobile-first implica invertir en responsive si aun hay tablas densas.
- Si la academia piloto no valida el wizard, retrasar el resto.

## Documentacion a actualizar

- [[Onboarding y activacion]] con el nuevo wizard.
- [[Onboarding de cliente]] de CS para alinearse con el wizard.
- [[MVP exacto Zaltyko gimnasia]] para confirmar inclusion.
- [[../../docs/marketing/zaltyko-competitors]] §9.11 mantiene la prioridad.

## Siguiente paso

Validar con Elvis: priorizar wizard de academia vs checkout de padre vs vista entrenador "clase de hoy". Los 3 son MVP, pero recursos limitados pueden forzar a elegir 1-2.
