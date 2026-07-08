---
status: draft
owner: producto
last_reviewed: 2026-06-23
source:
  - ../docs/marketing/zaltyko-competitors.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../01-Producto/Modulo - Evaluaciones.md
---

# Tarea - Skill tracking y make-up tokens MVP

## Objetivo

Llevar el modulo de progresion tecnica de Zaltyko al nivel de profundidad que iClassPro y Jackrabbit ya ofrecen para gimnasia, sin copiar su amplitud. Convertir el skill tracking actual en una herramienta que sostenga la promesa de "sistema operativo de academia de gimnasia".

## Origen

Detectado en [[Matriz competitiva gimnasia]] y detallado en [[../../docs/marketing/zaltyko-competitors]] v2.0 (secciones 9.1 iClassPro, 9.2 Jackrabbit). iClassPro tiene skill tracking + student evaluations + make-up tokens + punch passes como core, y eso es exactamente el hueco que Zaltyko necesita cerrar antes de vender agresivamente a academias de gimnasia ritmica.

## Estado detectado

- [[Modulo - Evaluaciones]] ya cubre evaluaciones end-to-end (validado 2026-06-22 con PASS Playwright).
- Skill tracking existe como tabla basica pero sin:
  - Vista de "make-up tokens" para clases perdidas.
  - Punch passes (bonos prepago de N clases) como modelo de pricing alternativo.
  - Check-in kiosk en recepcion.
- [[Backlog priorizado]] tiene la investigacion competitiva como P1 en progreso (ahora cerrada tras v2.0).

## Alcance

Incluye:

1. **Make-up tokens**: cuando una gimnasta falta a clase, recibe una ficha virtual para recuperar en otra sesion. Configurable por academia (cuantas fichas por periodo, vigencia, reglas de uso).
2. **Punch passes**: bonos prepago de N clases como alternativa a mensualidad. Para academias que no quieren comprometer cuota mensual.
3. **Skill tracking ampliado**: tabla de habilidades por gimnasta + nivel + evaluaciones del coach, con UI comparable a iClassPro pero en espanol.
4. **Check-in kiosk mode**: vista de recepcion con QR o codigo de gimnasta que registra asistencia automaticamente.

No incluye (fase posterior):

- App movil nativa para padres (Fase 2, ver [[Tarea - Onboarding y parent experience]]).
- AI churn predictor (Fase 3).
- Multi-idioma (Fase 3).

## Criterios de aceptacion

- Gimnasta con ausencia recibe automaticamente un token visible en su perfil y en el portal del padre.
- Academia puede configurar: numero de tokens por periodo, vigencia en dias, restricciones por tipo de clase.
- Punch pass de N clases se descuenta automaticamente al hacer check-in.
- Skill tracking muestra: habilidad, nivel actual, fecha de evaluacion, coach evaluador, notas.
- Check-in kiosk funciona desde `/app/[academyId]/kiosk` con codigo de gimnasta o QR, registra asistencia sin intervencion del staff.
- Portal del padre ve: tokens disponibles, proximas clases donde puede recuperar, historial de punch passes.
- Copy 100% espanol, sin promesas que el modulo no cumpla.

## Pruebas

- Test e2e: ausencia de gimnasta genera token visible para staff y padre.
- Test e2e: punch pass de 10 clases se consume al hacer check-in, queda en 9.
- Test e2e: kiosk registra asistencia sin pasar por staff.
- QA manual: una academia real usando tokens durante 2 semanas reporta friccion.
- Typecheck, lint y suite `tests/e2e-critical-flows.test.ts` en verde.

## Riesgos

- Si el modulo se queda solo en tokens sin skill tracking ampliado, sigue el gap vs iClassPro.
- Si punch pass requiere mas trabajo de billing del previsto, se puede posponer a Fase 2.
- Kiosk mode exige UI especifica; si la academia no tiene recepcion con pantalla, no aporta.

## Documentacion a actualizar

- [[Modulo - Evaluaciones]] con la nueva estructura.
- [[MVP exacto Zaltyko gimnasia]] para confirmar inclusion en alcance MVP.
- [[Mensajes aprobados]] si cambia copy publico (kiosk no se promete si no se entrega).
- [[../../docs/marketing/zaltyko-competitors]] §9.11 mantiene la prioridad.

## Siguiente paso

Disenar el flujo de tokens con la academia piloto antes de escribir codigo, para validar reglas (vigencia, transferencias entre hermanas, bloqueo en高峰期). Decidir si punch pass entra en MVP o se mueve a Fase 2 segun capacidad del equipo.
