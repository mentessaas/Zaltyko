# Plan de validación a 30 días

Periodo propuesto: del 11 de noviembre al 10 de diciembre de 2026. Responsable: Elvis (entrevistas, pilotos y ventas) con apoyo de Claude (preparación, análisis y producto). Fuentes de la evidencia: [fichas-competidores.md](./fichas-competidores.md) y [matriz-competitiva.md](./matriz-competitiva.md).

Lo que **sabemos** (comprobado): los competidores españoles con precio público cobran entre 0 € y 150 € al mes por la suscripción; tres de ellos ya hablan a clubes de rítmica en su web; ninguno muestra evidencia de detectar choques de entrenadoras o pistas; Zaltyko tiene grupos, clases, sesiones, asistencia, inscripciones y cuotas manuales en el flujo canónico, pero no asigna entrenadoras a sesiones ni deja entrar a entrenadoras por invitación.

Lo que **suponemos** (hipótesis): que el cuadrante de grupos, entrenadoras y horarios es un dolor semanal; que un club M necesita más de 5 grupos; que la dirección técnica decide o influye mucho en la compra; que una puesta en marcha asistida reduce el miedo al cambio. Akros se usa solo como ejemplo de cómo trabaja una academia, no como prueba.

## 1. Entrevistas (semanas 1 y 2)

Objetivo: 10 entrevistas de 30 minutos, al menos 6 de clubes de rítmica o artística en España entre 30 y 150 gimnastas. Fuentes de contactos: red de Akros, clubes que coinciden en competiciones, clubes listados en federaciones autonómicas (contacto manual uno a uno, sin envíos masivos). Registrar cada entrevista en la tabla `commercial_interviews` del super-admin (`/super-admin/growth`) y en el vault.

Guion (basado en `vault/05-Ventas-y-CS/Guia entrevistas academias gimnasia.md`):

**Contexto e ICP**
1. ¿Cuántas gimnastas, grupos, entrenadoras e instalaciones tenéis? ¿Qué disciplinas?
2. ¿Quién decide qué herramientas usa el club? ¿Quién paga? ¿Hay junta?

**Problema (sin mencionar Zaltyko)**
3. Cuéntame cómo montasteis los grupos y horarios de esta temporada. ¿Con qué herramienta?
4. La última vez que una entrenadora faltó, ¿qué pasó paso a paso?
5. En el último mes, ¿cuántas veces cambió un horario o una pista? ¿Cómo se enteraron las familias?
6. ¿Alguna vez dos grupos o una entrenadora coincidieron por error? ¿Cuándo fue la última?
7. ¿Quién pasa lista y dónde queda apuntado?

**Alternativas y coste**
8. ¿Habéis probado RG Manager, ScoreGym, Clybo, Clupik, GimnasiaTotal u otro? ¿Por qué lo dejasteis o no lo probasteis?
9. ¿Cuántas horas a la semana dedica la dirección a cuadrantes, avisos y listas?

**Precio y objeciones**
10. ¿Cuánto pagáis hoy por software (todo incluido)? ¿Quién lo aprobó?
11. Si algo os resolviera el cuadrante y la asistencia, ¿qué os impediría usarlo mañana?
12. ¿Qué tendría que pasar para pagar 19 € / 49 € al mes más IVA? ¿Y si os limitara a 5 grupos?

Criterios de éxito de la ronda:
- ≥ 6 de 10 describen sin ayuda un problema de cuadrante, sustituciones o cambios en el último mes → mantener la puerta de entrada.
- ≥ 4 de 10 tienen más de 5 grupos con menos de 75 gimnastas → revisar límites de grupos con decisión explícita (sin tocar pricing antes).
- Si ≥ 6 de 10 ponen el cobro de cuotas como su primer dolor → reconsiderar la puerta de entrada (evidencia que cambiaría la decisión 1).

## 2. Pilotos con academias (semanas 2 a 4)

- **Número:** 3 academias (incluida, si se quiere, la de Akros como piloto cero).
- **Condiciones:** gratis durante el piloto y 3 meses después; puesta en marcha asistida en 48 h con su cuadrante real; llamada semanal de 15 min; datos de menores mínimos (nombre y grupo) y aviso de privacidad del club firmado; posibilidad de exportar y salir.
- **Qué usan:** grupos, clases, sesiones, asistencia, inscripciones; cuando O1 esté en beta, asignación de entrenadoras.
- **Éxito del piloto (por academia):**
  - Primera asistencia registrada en ≤ 2 días desde el alta.
  - Asistencia registrada en ≥ 70 % de las sesiones programadas durante 3 semanas seguidas.
  - ≥ 1 persona distinta de la dirección usa Zaltyko cada semana (requiere O3).
  - La dirección acepta hablar de precio en la semana 4.
- **Fracaso a vigilar:** vuelven al Excel tras la primera semana; nadie salvo la dirección entra.

## 3. Hipótesis de precio para España

| Tema | Sabido | A probar |
|---|---|---|
| Rango de mercado | Suscripción publicada entre 0 € (GimnasiaTotal) y 150 € IVA incl. (RG Manager L); Clybo 29 € plano; OneClub 99 € + IVA + 3 % | Qué compara de verdad el club: precio total, límites o comisiones |
| Precio Zaltyko | Starter 19 €/mes y Growth 49 €/mes sin IVA, Free hasta 30 gimnastas. **No se cambia** (decisión vigente) | Disposición a pagar con el producto actual (pregunta 12) |
| Límites | Zaltyko limita grupos y clases además de gimnastas | Si 5 grupos en Starter bloquea a clubes M |
| Comisiones | Zaltyko no cobra a familias | Si «sin comisiones sobre tus cuotas» es un argumento o irrelevante porque Zaltyko no cobra |

## 4. Experimentos orgánicos de captación

### E1 — Plantilla «Cuadrante de temporada sin choques»
- **Inspiración:** FlipBiz capta con contenido técnico útil para la dirección técnica antes de vender gestión.
- **Público:** directoras técnicas y coordinadoras de clubes de rítmica y artística en España.
- **Mensaje:** «Monta los grupos, entrenadoras y pistas de tu temporada en una hoja y detecta choques antes de que pasen.»
- **Canal:** Instagram y TikTok de Zaltyko (un carrusel y un vídeo corto) + 20 mensajes directos manuales a clubes que publican sus horarios; descarga a cambio de correo con consentimiento explícito.
- **Coste:** 0 € en medios; ≈ 8 horas de preparación.
- **Plazo:** publicar en la semana 1, medir a los 14 días.
- **Umbral de éxito:** ≥ 25 descargas con correo de club y ≥ 5 llamadas agendadas. Por debajo de 10 descargas, descartar el ángulo.

### E2 — Puesta en marcha asistida en 48 horas
- **Inspiración:** FlipBiz «migra tu gimnasio en un fin de semana» y el acompañamiento de Clupik y GimnasiaTotal.
- **Público:** clubes que respondieron a E1 o a las entrevistas.
- **Mensaje:** «Envíanos tu Excel de grupos y horarios. En 48 horas tienes tu club montado en Zaltyko y una llamada para enseñárselo a tu equipo.»
- **Canal:** respuesta directa a entrevistados y a descargas de E1; publicación en redes con un caso (anonimizado si no hay permiso).
- **Coste:** 0 € en medios; ≈ 2 horas de trabajo manual por club.
- **Plazo:** semanas 2 a 4.
- **Umbral de éxito:** ≥ 5 solicitudes; ≥ 3 clubes con asistencia registrada en la primera semana.

## 5. Backlog priorizado

Puntuación: impacto (1–5), confianza (1–5), esfuerzo (S=1, M=2, L=3). Prioridad ≈ impacto × confianza / esfuerzo.

| # | Elemento | Impacto | Confianza | Esfuerzo | Prioridad | Dependencias |
|---|---|---|---|---|---|---|
| 1 | Entrevistas y pilotos (este plan) | 5 | 5 | S | 25 | Ninguna |
| 2 | O5: aplicar candidato SQL de admisiones (con autorización) y cerrar prueba → inscripción | 3 | 4 | S | 12 | Autorización explícita de SQL |
| 3 | O3: invitaciones de entrenadoras | 5 | 4 | M | 10 | Correo transaccional aislado (hoy OFF) |
| 4 | O1: entrenadora titular por clase + sustitución por sesión | 4 | 3 | M | 6 | `session_staff`, `OwnerClassesManager` |
| 5 | O4: importador Excel con vista previa | 4 | 3 | M | 6 | Intake canónico |
| 6 | O2: aviso de choques de entrenadora y pista | 4 | 2 | S–M | 5,3 | O1, `spaces` |
| 7 | O6: revisión de límites de grupos | 3 | 2 | S | 6 (solo si las entrevistas lo piden) | Decisión de pricing |
| — | Pospuesto: SEPA y cobros, app nativa, competiciones, campus, tienda, control horario, IA | — | — | — | — | Evidencia de que decide la compra del ICP |

## 6. Métricas

| Métrica | Definición | Objetivo de los 30 días |
|---|---|---|
| Activación | Academia con ≥ 1 grupo, ≥ 1 clase y ≥ 1 asistencia registrada | 3 de 3 pilotos |
| Tiempo hasta el primer resultado útil | Horas desde el alta hasta la primera asistencia guardada | ≤ 48 h |
| Uso semanal | Semanas con ≥ 1 asistencia registrada / semanas del piloto | ≥ 70 % |
| Usuarios activos por academia | Personas distintas con acción semanal | ≥ 2 (tras O3) |
| Retención de pilotos | Pilotos activos en la semana 4 | ≥ 2 de 3 |
| Disposición a pagar | Pilotos que aceptan un precio concreto o una carta de intención | ≥ 1 |
| Referidos | Clubes presentados por un piloto | ≥ 1 |

Las métricas se miden con los datos del propio producto (asistencia, sesiones, miembros) y con notas de las llamadas; no se añade medición nueva de comportamiento ni se graban sesiones.

## 7. Qué podría cambiar las decisiones

- Si las entrevistas muestran que el cobro de cuotas (SEPA) es el motivo de compra dominante, la puerta de entrada «operación diaria» pierde fuerza frente a RG Manager, OneClub y Clybo.
- Si los clubes no viven choques ni sustituciones con frecuencia, O1 y O2 bajan a «posponer» y la prioridad pasa a importación y acceso de entrenadoras.
- Si aparece una federación autonómica interesada en contenidos o competiciones, se reevalúa el canal (modelo ScoreGym/FlipBiz).
