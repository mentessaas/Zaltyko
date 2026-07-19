---
status: active
owner: ventas
last_reviewed: 2026-07-13
source:
  - ../06-Roadmap-y-Tareas/Plan operativo gimnasia.md (consolidado en [[Roadmap maestro]])
  - ../04-Marketing/Estrategia competitiva gimnasia.md (consolidado en [[Competidores]])
  - ../03-Negocio/Pricing.md
---

# Guia entrevistas academias gimnasia

> **Restaurada 2026-06-26 y consolidada 2026-07-13** — Esta guía ya está cruzada con [[Buyer personas]] y [[Objeciones y respuestas]]. El playbook de demo cubre cómo mostrar Zaltyko; esta nota cubre discovery y evidencia comercial. No inventar respuestas, citas ni academias para completar el objetivo.

## Objetivo

Entrevistar 10 academias de gimnasia artistica y ritmica para validar dolores, MVP, comunicacion interna y pricing freemium.

La entrevista no es una demo encubierta. Primero se documenta el proceso actual, el último caso real y su impacto; el producto se presenta solo al final si la persona lo solicita. Solicitar permiso antes de guardar datos de contacto o una cita resumida.

## Perfil ideal

- Academia de 30 a 300 gimnastas.
- Usa Excel, WhatsApp, papel, transferencia/Bizum/Stripe u otro sistema parcial.
- Tiene clases/grupos recurrentes y familias que preguntan por pagos, horarios o progreso.
- Idealmente artistica femenina, artistica masculina o ritmica.

## Preguntas

### Operacion actual

- Cuantos gimnastas, entrenadores, grupos y sedes gestionais hoy?
- Como registras alumnos, familias, horarios y grupos?
- Como pasais asistencia?
- Como controlais cuotas, pagos pendientes y recibos?
- Como comunicais avisos a padres?
- Como registrais progreso tecnico por gimnasta?

### Dolor

- Que tarea administrativa te quita mas tiempo cada semana?
- Donde se pierden mas mensajes o informacion?
- Que te genera mas incomodidad con padres: pagos, horarios, ausencias, progreso u otra cosa?
- Que pasa cuando una familia pregunta "como va mi hija"?
- Que herramienta usais y que no soportais de ella?
- Cuantas horas o cuanto dinero os costo el ultimo problema de este tipo?
- Que habeis intentado cambiar ya y por que no funciono?

### Producto

- Si Zaltyko te permite alumnos, familias, clases, cuotas, asistencia, progreso y mensajes internos, que usarias primero?
- Que tendria que pasar para que padres entren a la app/portal en vez de pedirlo por WhatsApp?
- Que necesita ver un entrenador antes/durante/despues de clase?
- Que informacion no quieres que vea un padre?
- Que seria demasiado complejo para una academia pequena?
- Que datos, permisos o garantías necesitarias revisar antes de migrar?
- Cuanto esfuerzo de migracion y puesta en marcha aceptaria tu equipo?

### Pricing

- Que pagas hoy por software, web, comunicacion, pagos o gestion?
- Que precio mensual te pareceria facil de aprobar?
- A partir de que precio pedirias pensarlo?
- Preferirias pagar por academia, por gimnasta o por tramos?
- Que deberia incluir el plan gratis para que lo pruebes?
- Que feature te haria pasar de gratis a pago?
- Quien aprueba esta compra y que necesita para decidir?

## Cruce con personas y objeciones

| Bloque de preguntas | Persona principal | Hipótesis/objeción que valida | Campo de evidencia |
| --- | --- | --- | --- |
| Tamaño, sedes, grupos, herramientas y proceso actual | Emprendedor deportivo / director de operaciones | Segmento real; “Excel y WhatsApp me bastan” | Gimnastas, entrenadores, sedes, modalidad, herramientas; grupos en notas |
| Asistencia, cuotas, comunicación y progreso | Emprendedor / entrenador / influencia de familia | Dolor operativo y adopción diaria | Mayor dolor, función más valiosa, notas |
| Último incidente, horas y coste | Emprendedor / director de operaciones | ROI verificable frente a “es caro” | Mayor dolor y notas, sin estimar por la persona entrevistadora |
| Intentos previos y límites de la herramienta actual | Emprendedor / director | Razón de cambio y competencia real | Herramientas actuales, objeción principal |
| Qué necesita entrenador/familia y qué no debe ver | Entrenador / padre o tutor | Adopción, privacidad y permisos por rol | Función más valiosa, objeción, notas |
| Seguridad, migración y esfuerzo aceptable | Emprendedor / director | “Me preocupa migrar datos” y “mi equipo no es técnico” | Objeción principal, notas |
| Multi-sede, reportes y proceso de aprobación | Director de operaciones | Encaje Network, comité y venta asistida | Sedes, modelo preferido, notas |
| Precio actual, fácil, límite y modelo | Emprendedor / director | Disposición a pagar y “es caro” | Precio fácil, precio límite, modelo preferido, disposición a pagar |
| Free y disparador de upgrade | Emprendedor | Límites Free/Starter y momento de valor | Expectativa Free, disparador de upgrade |
| Interés en beta y siguiente paso concreto | Comprador entrevistado | Señal observable, no cortesía | Interés beta, disposición a pagar, notas |

El padre/tutor y el entrenador son personas usuarias e influyentes; no sustituyen una entrevista al comprador cuando se valida pricing. Para Network, incluir al director de operaciones o decisor económico.

## Datos a registrar

| Campo | Valor |
| --- | --- |
| Academia |  |
| Pais/ciudad |  |
| Modalidad | Artistica / Ritmica / Mixta |
| Gimnastas |  |
| Entrenadores |  |
| Sedes |  |
| Herramientas actuales |  |
| Mayor dolor |  |
| Feature mas valiosa |  |
| Objecion principal |  |
| Precio facil |  |
| Precio limite |  |
| Interes beta | Si / No / Tal vez |
| Dispuesta a pagar | Si / No / Tal vez |
| Notas |  |

El registro operativo vive en `/super-admin/growth`. Solo una entrevista con estado `Completada` y evidencia mínima suma al objetivo. La huella normalizada de academia + país + ciudad evita contar dos veces la misma organización. Si faltan país/ciudad, confirmar manualmente que no sea un duplicado antes de guardar.

## Criterio de cierre

- 10 entrevistas completadas con academias distintas y evidencia mínima estructurada.
- Síntesis por tamaño, modalidad y mercado con patrones de dolor, herramienta, objeción y rango de precio; distinguir hechos, citas resumidas e inferencias.
- Interés beta y disposición a pagar se reportan como resultados observados. No se exige un 5/2 prefijado sin baseline ni se reinterpretan respuestas ambiguas como “sí”.
- Pricing v3.0 solo cambia mediante decisión documentada que cite la muestra. Si no hay patrón claro, mantener v3.0 y ampliar discovery.
- Fase 5 no comienza hasta que este cierre esté registrado en [[Plan operativo gimnasia]] y [[Decisiones]].
