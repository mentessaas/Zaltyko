---
status: draft
owner: negocio
last_reviewed: 2026-06-23
source:
  - ../docs/marketing/zaltyko-competitors.md
  - ../04-Marketing/Matriz competitiva gimnasia.md
  - ../07-Auditorias-y-Riesgos/SEO y geo.md
---

# Tarea - Marketplace Zaltyko y multi-idioma

## Objetivo

Construir las bases del marketplace Zaltyko (`/descubre`) y el soporte multi-idioma (Catala, Galego, Portugues Brasil, English), siguiendo los modelos de Playtomic Manager (marketplace + red de demanda) y Clupik (multi-idioma esp/eng/ita/por/fra).

## Origen

Detectado en [[Matriz competitiva gimnasia]] §Hallazgos y detallado en [[../../docs/marketing/zaltyko-competitors]] v2.0 (secciones 9.8 Playtomic, 9.9 Clupik, 9.6 Sawyer catalogo publico). Es una tarea de Fase 3 (6-12 meses) y no debe consumir recursos del MVP, pero hay decisiones arquitectonicas que conviene cerrar ya para no reescribir despues.

## Estado detectado

- [[Backlog priorizado]] P2 incluye "Profundizar SEO localizado e i18n" como tarea abierta.
- [[SEO y geo]] ya cubre trabajo de SEO en espanol.
- No hay infraestructura i18n en Next.js aun (todo en espanol hardcoded).
- No hay seccion `/descubre` ni directorio de academias publicas.

## Alcance

Incluye (Fase 3):

1. **Marketplace `/descubre`**: directorio publico de academias Zaltyko con SEO local ("academia gimnasia Madrid", "gimnasio ritmico Barcelona"). Pagina por academia con: nombre, ubicacion, especialidad, link a su web Zaltyko. Indexable en Google.
2. **i18n arquitectura**: estructura de strings para soportar Catala, Galego, Portugues Brasil, English sin reescribir. Empezar con English (USA gyms) y Portugues (Brasil) que son los dos mercados fuera de hispanos inmediatos.
3. **URLs localizadas**: `/es/academias`, `/en/academies`, `/pt/academias`. Hreflang tags.

No incluye (fuera de alcance):

- Marketplace con reservas integradas (eso es GymnasticMeet, expansion futura).
- Red social entre familias (Fase 3+ segun [[../../docs/marketing/zaltyko-competitors]] §9.11 accion 18).

## Criterios de aceptacion (Fase 3)

- `/descubre` lista academias Zaltyko publicas con SEO local basico.
- Pagina de academia en `/descubre/[slug]` es indexable y muestra informacion aprobada por la academia.
- i18n permite cambiar idioma sin recargar y mantiene el tenant y la sesion.
- English y Portugues Brasil tienen landing traducida y onboarding traducido.
- hreflang tags correctos en paginas publicas.

## Pruebas

- Test e2e: academia publica aparece en `/descubre` cuando opta por listarse.
- Test SEO: pagina de academia genera sitemap correcto y OpenGraph para compartir.
- Test i18n: cambiar de idioma no rompe rutas tenant ni autenticacion.
- Auditoria SEO: sitemap multi-idioma con hreflang.

## Riesgos

- Construir i18n ahora es esfuerzo extra; si no se hace bien, hay que reescribir copy en cada idioma mas adelante.
- Marketplace exige moderacion: academias no listadas, contenido inapropiado, falsa informacion.
- Si Playtomic entra en gimnasia antes que Zaltyko en marketplace, la ventana se cierra.
- Multi-idioma con copy aprovado por Elvis requiere traduccion profesional (no automatica) en primera version.

## Documentacion a actualizar

- [[SEO y geo]] con estrategia `/descubre` y hreflang.
- [[Mensajes aprobados]] para copy en nuevos idiomas.
- [[Decisiones]] cuando se tome la decision de mercado prioritario fuera de hispanos (USA vs Brasil primero).
- [[../../docs/marketing/zaltyko-competitors]] §9.11 mantiene la prioridad.

## Siguiente paso

Antes de codigo, validar con Elvis: (a) mercado prioritario fuera de hispanos (English USA gyms vs Portugues Brasil), (b) si el marketplace Zaltyko es solo directorio o tambien permite reservas, (c) cuando arrancar (Fase 3 confirmada o se adelanta a Fase 2 si hay capacidad).
