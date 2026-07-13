---
status: active
owner: producto/tech
last_reviewed: 2026-07-13
---

# Patrón repetible para agregar un país federativo nuevo

Checklist derivado de la experiencia real cerrando España (Fase 0-2 de "Nomenclatura federativa por país/disciplina", ver `Backlog priorizado.md` fila 3.9 y las entradas de `Changelog interno.md` del 2026-07-12/13). Seguir este orden para cada país nuevo (candidato siguiente: México, sin ranking definitivo aún — el usuario decidió ir "de mayor a menor fuerza en gimnasia" sin fijar el orden completo de antemano).

## 1. Research — fuente primaria, no secundaria

- Buscar la federación nacional oficial (ej. para México: Federación Mexicana de Gimnasia, `fmgimnasia.org`). **Cuidado con acrónimos ambiguos — CONFIRMADO EN LA PRÁCTICA 2026-07-13**: `fmgimnasia.com` = Federación **Madrileña** de Gimnasia (España, regional; verificado navegando el sitio, título real "FMG - Federación Madrileña de Gimnasia"), `fmgimnasia.org` = Federación **Mexicana** de Gimnasia (nacional; verificado: menciona clasificación de México a París 2024, estados como Guanajuato/Jalisco, contacto `info@fmgimnasia.org.mx`). Una búsqueda web genérica ("Federación Mexicana de Gimnasia normativa 2026") devolvió PDFs de `fmgimnasia.com` presentados como si fueran mexicanos — eran españoles. Verificar el dominio exacto SIEMPRE antes de citar cualquier fuente como oficial, no confiar en el título del resultado de búsqueda.
- **Barrera nueva encontrada con México**: a diferencia de la RFEG (normativa pública en el sitio, solo bloqueada por CAPTCHA para descarga automatizada), la FMG no publica sus documentos de normativa técnica en el sitio público — están detrás de un intranet de afiliados (`intranet.fmgimnasia.org`, requiere login). No intentar acceder sin credenciales legítimas. Si esto se repite con otro país, es motivo para pedirle al usuario contactos/documentos directos en vez de seguir buscando.
- **El fetch automatizado puede fallar por protección anti-bot** (confirmado con `rfegimnasia.es`: CAPTCHA `/.well-known/sgcaptcha/` bloqueaba tanto `WebFetch` como `node fetch`, funcionaba solo un navegador real). No intentar sortear un CAPTCHA. Si falla:
  1. Navegar la página normal (no el PDF directo) con las herramientas de browser para encontrar los enlaces reales a los documentos vigentes.
  2. Si el PDF en sí no se puede leer por automatización, pedirle al usuario que lo descargue desde su propio navegador (a él no le bloqueaba el mismo CAPTCHA) y lo comparta directamente — funcionó bien en la práctica.
- **Las búsquedas web genéricas mezclan fuentes de países distintos** (confirmado: buscar normativa mexicana devolvió resultados de federaciones españolas). Nunca tratar un resultado de búsqueda como confiable sin verificar el dominio.
- Recopilar, por rama (GAF/GAM/GR o las que aplique en ese país): niveles/programa, categorías de edad con años de nacimiento exactos, aparatos, tipos de competición.
- Documentar todo en `vault/07-Auditorias-y-Riesgos/Normativa <País> <año> - borrador.md` (mismo formato que el de España), marcando explícitamente qué está CONFIRMADO (fuente primaria leída) vs qué sigue sin confirmar. Nunca inventar un dato para "completar" el catálogo.
- Cruzar contra 2+ documentos oficiales independientes cuando sea posible (se hizo con España: 2 documentos distintos de la RFEG confirmaron la misma tabla de Vía Olímpica — máxima confianza).

## 2. Código — `src/lib/sport-config/catalog.ts`

- Crear constantes propias por rama, nunca compartir con las de otro país o con las de otra disciplina del mismo país (España confirmó que GAF y GAM tienen estructuras de niveles genuinamente distintas — no asumir simetría).
- Añadir entradas nuevas a `SPORT_CONFIG_SEEDS` con `country.code` del país nuevo (código ISO de 2 letras, mayúsculas). **No tocar las entradas de países ya cerrados.**
- `federation`: nombre real de la federación. Nunca un valor inventado.
- Comentar inline la fuente exacta (documento + fecha) de cada bloque de datos, igual que en las entradas de España.
- Si algo queda sin confirmar (ej. pasó con el programa Base de GR), dejarlo con el dato anterior o un placeholder explícitamente marcado en el comentario — no rellenar con una suposición.

## 3. Verificación de colisiones

- Los `code` de `programs`/`levels`/`categories`/`competitionTypes` son únicos por `sportLocaleConfigId` (índice compuesto) — pueden repetirse entre países sin problema (ej. `"nivel_1"` en México y en España son filas distintas).
- Verificar que el `sportLocaleConfigs.code` global (ej. `"MX:artistic_female"`) no coincida con uno existente — el patrón `<PAIS>:<variante>` ya lo garantiza si el código de país es correcto.

## 4. Sincronización a Supabase

- **No usar `pnpm db:seed` / `scripts/seed.ts`** — ese es el sistema legacy `templates` (deuda conocida, no confundir). Usar `pnpm db:sync-sport-configs` (creado 2026-07-12, dry-run por defecto, bloquea si una academia existente conserva una selección que el nuevo catálogo retiraría, requiere `--apply` explícito para escribir).
- Correr primero sin `--apply` (dry-run) y revisar el diff antes de aplicar.
- `seedSportConfigurations()` ya desactiva (no borra) programas/niveles/categorías retirados que ya no estén en el catálogo vigente — seguro para re-ejecutar.

## 5. Wiring de país (ya resuelto, verificar que sigue funcionando)

- `COUNTRY_NAME_BY_CODE`/`COUNTRY_CODE_BY_NAME` (`src/lib/specialization/registry.ts`) se derivan automáticamente de `countryRegions.ts` desde 2026-07-13 — si el país ya está en `countryRegions.ts` (México, Argentina, Colombia, Chile, Perú, Venezuela, Ecuador, Guatemala, Cuba, República Dominicana, Honduras, El Salvador, Nicaragua, Costa Rica, Panamá, Paraguay, Uruguay, Bolivia, Puerto Rico, EEUU ya están), **no hace falta tocar nada aquí**.
- Si el país NO está en `countryRegions.ts` (fuera de los ~20 ya listados), hay que añadirlo ahí primero (con sus regiones/provincias) — eso alimenta automáticamente `specialization/registry.ts`.
- Verificar `getTimezoneForCountry` (`src/lib/date-utils.ts`) tiene el país — si no, añadir su timezone principal.

## 6. QA manual

- Simular onboarding de una academia con `countryCode` del país nuevo — confirmar que ya NO cae en el fallback genérico (`isGenericFallback: true` / `specializationStatus: "generic_fallback"`) y que el sidebar/dashboard muestran la terminología real del país.

## 7. Cierre

- `pnpm typecheck` + `pnpm lint` + tests relevantes (`sport-config-catalog.test.ts`, `academy-specialization.test.ts`) en verde.
- Actualizar `Changelog interno.md` con qué se confirmó, qué quedó sin confirmar, y si se aplicó a Supabase o no.
- Actualizar `Backlog priorizado.md` fila 3.9 (o la que corresponda) con el país cerrado.
- Si es el primer país después de España, considerar mover este documento de "patrón" a `status: active` permanente en la vault (ya lo está) para que el siguiente país lo siga sin tener que releer todo el historial de Changelog.
