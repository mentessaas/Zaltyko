-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 1.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 51 elementos (vault).
-- Semántica: crea o actualiza la edición por code sin bajar nunca una edición
-- retirada, y crea o actualiza los elementos de la tanda por (edition_id,
-- element_key). Nunca escribe withdrawn_at ni withdrawn_reason (una retirada
-- sobrevive a cualquier semilla), nunca devuelve un elemento revisado a
-- borrador y aborta sin cambiar nada si un elemento revisado cambiaría sin un
-- reviewed_on posterior al guardado. Repetirla con los mismos datos no cambia
-- ninguna fila. Requiere 20261119120000_element_library_candidate.sql.

begin;

do $element_catalog_seed_preflight$
begin
  if to_regclass('zaltyko.catalog_element_editions') is null
     or to_regclass('zaltyko.catalog_elements') is null then
    raise exception 'Element catalog seed requires zaltyko.catalog_element_editions and zaltyko.catalog_elements; apply 20261119120000_element_library_candidate.sql first';
  end if;
end;
$element_catalog_seed_preflight$;

insert into zaltyko.catalog_element_editions
  (code, discipline, cycle_start, cycle_end, title, document_url, cover_date, status)
values
  ('fig-wag-2025-2028', 'artistic_female', 2025, 2028, 'Código de Puntuación de Gimnasia Artística Femenina 2025-2028', 'https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20WAG%20COP%202025-2028.pdf', '2026-10-14'::date, 'published')
on conflict (code) do update set
  discipline = excluded.discipline,
  cycle_start = excluded.cycle_start,
  cycle_end = excluded.cycle_end,
  title = excluded.title,
  document_url = excluded.document_url,
  cover_date = excluded.cover_date,
  status = case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end,
  updated_at = now()
where (catalog_element_editions.discipline, catalog_element_editions.cycle_start,
       catalog_element_editions.cycle_end, catalog_element_editions.title,
       catalog_element_editions.document_url, catalog_element_editions.cover_date,
       catalog_element_editions.status)
  is distinct from (excluded.discipline, excluded.cycle_start, excluded.cycle_end,
       excluded.title, excluded.document_url, excluded.cover_date,
       case when catalog_element_editions.status = 'retired' then 'retired' else excluded.status end);

create temporary table element_catalog_seed_rows (
  element_key text primary key,
  apparatus text not null,
  element_group text not null,
  value_letter text,
  value_points numeric(4,2),
  fig_reference text,
  name text not null,
  short_name text not null,
  description text,
  source_page integer not null,
  source_checked_on date not null,
  drafted_by text not null,
  drafted_on date not null,
  batch integer not null,
  review_status text not null,
  reviewed_on date
) on commit drop;

insert into pg_temp.element_catalog_seed_rows
  (element_key, apparatus, element_group, value_letter, value_points, fig_reference, name, short_name, description, source_page, source_checked_on, drafted_by, drafted_on, batch, review_status, reviewed_on)
values
  ('vt_hs_repulsion', 'vault', '1', null, 1.60, '1.00', 'Paloma a la mesa con salida en extensión, sin giro ni mortal', 'Paloma', 'La gimnasta entra de frente con una paloma, apoya las dos manos y se impulsa de la mesa con el cuerpo estirado, sin girar. Cae de pie de espaldas a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_turn180', 'vault', '1', null, 2.00, '1.01', 'Paloma con medio giro (180°) en el segundo vuelo', 'Paloma, medio giro', 'Tras la paloma, en cuanto empuja la mesa, la gimnasta gira media vuelta (180°) sobre su eje con el cuerpo extendido. Aterriza mirando hacia la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_turn360', 'vault', '1', null, 2.60, '1.02', 'Paloma con giro completo (360°) en el segundo vuelo', 'Paloma, giro completo', 'Entrada en paloma y, al salir de la mesa, un giro completo (360°) sobre el eje longitudinal, sin mortal y con el cuerpo recto. La caída queda de espaldas a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_turn540', 'vault', '1', null, 3.20, '1.03', 'Paloma con giro y medio (540°) en el segundo vuelo', 'Kim (paloma, giro y medio)', 'Con el cuerpo alineado, la gimnasta encadena giro y medio (540°) en el aire después de rechazar la mesa en paloma. Termina de cara a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_turn720', 'vault', '1', null, 3.60, '1.04', 'Paloma con doble giro (720°) en el segundo vuelo', 'Paloma, doble giro', 'Después de apoyar en paloma, la gimnasta sale disparada de la mesa y completa un doble giro (720°) en extensión, sin mortal. Cae de espaldas a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_turn900', 'vault', '1', null, 4.00, '1.05', 'Paloma con dos giros y medio (900°) en el segundo vuelo', 'Paloma, dos giros y medio', 'Es la paloma sin mortal con más giro: tras el rechazo, la gimnasta gira dos vueltas y media (900°) con el cuerpo recto y aterriza mirando a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_pike', 'vault', '1', null, 2.00, '1.10', 'Paloma con carpa en el segundo vuelo, sin mortal', 'Yamashita (sin giro)', 'La gimnasta llega en paloma y, al despegar de la mesa, cierra el cuerpo en carpa con las piernas estiradas hacia el pecho, sin dar mortal. Abre antes de caer, de espaldas a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_pike_turn180', 'vault', '1', null, 2.40, '1.11', 'Paloma con carpa y medio giro (180°) en el segundo vuelo, sin mortal', 'Yamashita (medio giro)', 'Sale de la paloma con una carpa marcada y, al abrir, añade medio giro (180°) para caer mirando hacia la mesa. No hay mortal en ningún momento.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_pike_turn360', 'vault', '1', null, 2.80, '1.12', 'Paloma con carpa y giro completo (360°) en el segundo vuelo, sin mortal', 'Yamashita (giro completo)', 'En el segundo vuelo la gimnasta carpa sin rotar en mortal y, al extender el cuerpo, realiza un giro completo (360°). Aterriza de espaldas a la mesa.', 60, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs180_repulsion', 'vault', '1', null, 1.60, '1.20', 'Paloma con medio giro (180°) en el primer vuelo y salida en extensión', 'Paloma, medio giro a la mesa', 'Antes de tocar la mesa, la gimnasta gira media vuelta (180°), de modo que apoya las manos ya girada; después se impulsa sin más giros. Cae de cara a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs180_turn180', 'vault', '1', null, 2.40, '1.21', 'Paloma con medio giro (180°) en el primer vuelo y medio giro (180°) en el segundo', 'Paloma: medio giro + medio giro', 'Media vuelta en el primer vuelo para apoyar en la mesa y otra media vuelta (180°) al salir, siempre sin mortal. La gimnasta termina de espaldas a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs180_turn360', 'vault', '1', null, 2.60, '1.22', 'Paloma con medio giro (180°) en el primer vuelo y giro completo (360°) en el segundo', 'Paloma: medio giro + giro completo', 'La gimnasta entra girando media vuelta hacia la mesa, rechaza y suma un giro completo (360°) en extensión. Al caer mira hacia la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs180_turn540', 'vault', '1', null, 3.20, '1.23', 'Paloma con medio giro (180°) en el primer vuelo y giro y medio (540°) en el segundo', 'Paloma: medio giro + giro y medio', 'Con media vuelta ya hecha al apoyar las manos, la gimnasta empuja la mesa y gira vuelta y media (540°) con el cuerpo estirado, sin mortal. Aterriza de espaldas a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs180_turn720', 'vault', '1', null, 3.60, '1.24', 'Paloma con medio giro (180°) en el primer vuelo y doble giro (720°) en el segundo', 'Paloma: medio giro + doble giro', 'Primer vuelo con media vuelta hasta la mesa; en el segundo, un doble giro (720°) completo en extensión. La gimnasta cae de cara a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs360_repulsion', 'vault', '1', null, 3.20, '1.30', 'Paloma con giro completo (360°) en el primer vuelo y salida en extensión', 'Paloma, giro completo a la mesa', 'La gimnasta da una vuelta completa (360°) en el aire antes de poner las manos en la mesa y, tras apoyar, se impulsa sin girar más. Cae de espaldas a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs360_turn360', 'vault', '1', null, 3.60, '1.31', 'Paloma con giro completo (360°) en el primer vuelo y giro completo (360°) en el segundo', 'Korbut', 'Giro completo antes de apoyar las manos y otro giro completo (360°) después de rechazar la mesa, sin mortal. La gimnasta aterriza de espaldas a la mesa.', 61, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro_repulsion', 'vault', '1', null, 2.00, '1.40', 'Rondada y flic-flac a la mesa con salida en extensión, sin giro ni mortal', 'Rondada y flic-flac', 'La gimnasta apoya las manos en el suelo con una rondada y cae con los pies en el trampolín; de ahí sale en flic-flac, apoya las manos en la mesa y se impulsa con el cuerpo recto, sin girar. Cae mirando hacia la mesa.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro180_repulsion', 'vault', '1', null, 2.20, '1.50', 'Rondada y flic-flac con medio giro (180°) en el primer vuelo y salida en extensión', 'Rondada, medio giro a la mesa', 'Después de la rondada, el flic-flac lleva media vuelta (180°) antes de que las manos toquen la mesa. La gimnasta sale empujando sin más giro y queda de espaldas a la mesa al caer.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro180_turn180', 'vault', '1', null, 2.60, '1.51', 'Rondada y flic-flac con medio giro (180°) en el primer vuelo y medio giro (180°) en el segundo', 'Rondada: medio giro + medio giro', 'Tras la rondada y un flic-flac con media vuelta hacia la mesa, la gimnasta añade otra media vuelta (180°) en el segundo vuelo. Termina mirando hacia la mesa, sin haber hecho mortal.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro180_turn360', 'vault', '1', null, 3.00, '1.52', 'Rondada y flic-flac con medio giro (180°) en el primer vuelo y giro completo (360°) en el segundo', 'Rondada: medio giro + giro completo', 'Entrada de rondada con media vuelta antes del apoyo; al rechazar, la gimnasta gira una vuelta completa (360°) con el cuerpo extendido y cae de espaldas a la mesa.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro180_turn540', 'vault', '1', null, 3.40, '1.53', 'Rondada y flic-flac con medio giro (180°) en el primer vuelo y giro y medio (540°) en el segundo', 'Rondada: medio giro + giro y medio', 'La gimnasta llega a la mesa ya girada media vuelta desde el flic-flac y, al salir, encadena giro y medio (540°) sin mortal. Aterriza de cara a la mesa.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro360_repulsion', 'vault', '1', null, 2.40, '1.60', 'Rondada y flic-flac con giro completo (360°) en el primer vuelo y salida en extensión', 'Rondada, giro completo a la mesa', 'En el flic-flac hacia la mesa la gimnasta completa una vuelta entera (360°) antes de apoyar; luego empuja sin girar más. Cae mirando hacia la mesa.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro360_turn180', 'vault', '1', null, 2.80, '1.61', 'Rondada y flic-flac con giro completo (360°) en el primer vuelo y medio giro (180°) en el segundo', 'Rondada: giro completo + medio giro', 'Giro completo en el primer vuelo, apoyo de manos y, ya en el segundo vuelo, media vuelta (180°) para caer de espaldas a la mesa. No hay mortal.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_ro360_turn360', 'vault', '1', null, 3.20, '1.62', 'Rondada y flic-flac con giro completo (360°) en el primer vuelo y giro completo (360°) en el segundo', 'Rondada: giro completo + giro completo', 'La gimnasta gira una vuelta completa antes y otra (360°) después del apoyo en la mesa, siempre con el cuerpo recto y sin mortal. Al aterrizar queda de cara a la mesa.', 62, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_tuck', 'vault', '2', null, 3.60, '2.10', 'Paloma con mortal adelante agrupado', 'Paloma, mortal agrupado', 'Tras la paloma, la gimnasta se agrupa recogiendo las rodillas al pecho y da un mortal adelante antes de abrir para la caída, de espaldas a la mesa.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_tuck_tw180', 'vault', '2', null, 3.80, '2.11', 'Paloma con mortal adelante agrupado con media pirueta (180°)', 'Paloma, agrupado, media pirueta', 'La gimnasta sale de la paloma en mortal adelante agrupado y al final gira media pirueta (180°), así que cae mirando hacia la mesa. También vale hacer medio giro al despegar de la mesa y después un mortal atrás agrupado.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_tuck_tw360', 'vault', '2', null, 4.20, '2.12', 'Paloma con mortal adelante agrupado con pirueta (360°)', 'Paloma, agrupado, pirueta', 'Mortal adelante con el cuerpo agrupado y una pirueta completa (360°) dentro de la rotación, todo después de rechazar la mesa en paloma. La caída es de espaldas a la mesa.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_tuck_tw540', 'vault', '2', null, 4.60, '2.13', 'Paloma con mortal adelante agrupado con pirueta y media (540°)', 'Paloma, agrupado, pirueta y media', 'La gimnasta llega en paloma, despega en mortal adelante agrupado y gira pirueta y media (540°) mientras rota. Aterriza de cara a la mesa.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_pike', 'vault', '2', null, 3.80, '2.20', 'Paloma con mortal adelante carpado', 'Paloma, mortal carpado', 'Con las piernas estiradas y juntas, la gimnasta cierra en carpa tras salir de la paloma y completa un mortal adelante. Abre para caer de espaldas a la mesa.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_pike_tw180', 'vault', '2', null, 4.00, '2.21', 'Paloma con mortal adelante carpado con media pirueta (180°)', 'Paloma, carpado, media pirueta', 'Mortal adelante carpado al que la gimnasta añade media pirueta (180°) al final, para caer mirando a la mesa. Se reconoce igual si hace medio giro al salir de la mesa seguido de un mortal atrás carpado.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_pike_tw360', 'vault', '2', null, 4.40, '2.22', 'Paloma con mortal adelante carpado con pirueta (360°)', 'Chusovitina (carpado, pirueta)', 'Tras rechazar en paloma, la gimnasta rota adelante en carpa y combina esa posición con una pirueta completa (360°). Cae de espaldas a la mesa.', 63, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_layout', 'vault', '2', null, 4.40, '2.30', 'Paloma con mortal adelante extendido', 'Evdokimova', 'La gimnasta sale de la mesa y da el mortal adelante con el cuerpo totalmente estirado, sin flexionar caderas ni rodillas. La caída es de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_layout_tw180', 'vault', '2', null, 4.60, '2.31', 'Paloma con mortal adelante extendido con media pirueta (180°)', 'Wang', 'Mortal adelante con el cuerpo recto tras la paloma, rematado con una media pirueta (180°) que deja a la gimnasta mirando hacia la mesa al caer.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_layout_tw360', 'vault', '2', null, 5.00, '2.32', 'Paloma con mortal adelante extendido con pirueta (360°)', 'Paloma, extendido, pirueta', 'Después de la paloma, la gimnasta rota adelante en extensión y gira una pirueta completa (360°) en el mismo vuelo, para aterrizar de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_layout_tw540', 'vault', '2', null, 5.40, '2.33', 'Paloma con mortal adelante extendido con pirueta y media (540°)', 'Chusovitina (extendido, pirueta y media)', 'La gimnasta encadena la paloma con un mortal adelante extendido en el que gira pirueta y media (540°). Termina de cara a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_fwd_layout_tw720', 'vault', '2', null, 5.80, '2.34', 'Paloma con mortal adelante extendido con doble pirueta (720°)', 'Yeo', 'Salto de paloma con mortal adelante en extensión y doble pirueta (720°) durante la rotación. La gimnasta debe acabar de girar antes de caer, de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs360_fwd_tuck', 'vault', '2', null, 4.80, '2.40', 'Paloma con giro completo (360°) en el primer vuelo y mortal adelante agrupado', 'Davydova', 'La gimnasta da una vuelta completa (360°) en el aire antes de apoyar las manos en la mesa; al salir, se agrupa en un mortal adelante y cae de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs360_fwd_pike', 'vault', '2', null, 5.20, '2.41', 'Paloma con giro completo (360°) en el primer vuelo y mortal adelante carpado', 'Giro completo a la mesa, mortal carpado', 'Primer vuelo con giro completo (360°) hacia la mesa y, tras el apoyo, mortal adelante carpado con las piernas estiradas. La gimnasta aterriza de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_hs_double_fwd_tuck', 'vault', '2', null, 6.00, '2.50', 'Paloma con doble mortal adelante agrupado', 'Produnova', 'Desde la paloma, la gimnasta necesita mucha altura y velocidad de rotación para dar dos mortales adelante agrupados seguidos. Cae de espaldas a la mesa.', 64, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_tuck', 'vault', '3', null, 3.20, '3.10', 'Paloma con giro (90–180°) a la mesa y mortal atrás agrupado', 'Tourischeva', 'La gimnasta entra como en una paloma, pero gira entre un cuarto y media vuelta (90–180°) antes de apoyar las manos; desde ahí sale en mortal atrás agrupado y cae mirando hacia la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_tuck_tw180', 'vault', '3', null, 3.40, '3.11', 'Paloma con giro (90–180°) a la mesa y mortal atrás agrupado con media pirueta (180°)', 'Tsukahara agrupado, media pirueta', 'Tras girar entre un cuarto y media vuelta para apoyar en la mesa, la gimnasta hace un mortal atrás agrupado y suma media pirueta (180°). Aterriza de espaldas a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_tuck_tw360', 'vault', '3', null, 3.80, '3.12', 'Paloma con giro (90–180°) a la mesa y mortal atrás agrupado con pirueta (360°)', 'Kim (Tsukahara agrupado, pirueta)', 'Entrada a la mesa con giro de un cuarto a media vuelta; al despegar, mortal atrás agrupado con una pirueta completa (360°). La gimnasta cae de cara a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_tuck_tw540', 'vault', '3', null, 4.20, '3.13', 'Paloma con giro (90–180°) a la mesa y mortal atrás agrupado con pirueta y media (540°)', 'Tsukahara agrupado, pirueta y media', 'En el segundo vuelo, la gimnasta se agrupa en mortal atrás y gira pirueta y media (540°), después de haber llegado a la mesa con un giro de 90 a 180°. Cae de espaldas a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_tuck_tw720', 'vault', '3', null, 4.60, '3.14', 'Paloma con giro (90–180°) a la mesa y mortal atrás agrupado con doble pirueta (720°)', 'Tsukahara agrupado, doble pirueta', 'Mortal atrás agrupado con doble pirueta (720°) tras una entrada con giro de un cuarto a media vuelta hacia la mesa. Es un giro muy rápido para ir agrupada; la gimnasta cae mirando a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_pike', 'vault', '3', null, 3.40, '3.20', 'Paloma con giro (90–180°) a la mesa y mortal atrás carpado', 'Tsukahara carpado', 'La gimnasta gira entre 90 y 180° antes de apoyar las manos y sale en mortal atrás carpado, con las piernas estiradas y juntas. Termina de cara a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout', 'vault', '3', null, 3.80, '3.30', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido', 'Tsukahara extendido', 'Después del giro de entrada a la mesa, de un cuarto a media vuelta, la gimnasta rota atrás con el cuerpo totalmente estirado y aterriza mirando hacia la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout_tw180', 'vault', '3', null, 4.00, '3.31', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido con media pirueta (180°)', 'Tsukahara extendido, media pirueta', 'Mortal atrás en extensión con media pirueta (180°) al final, tras apoyar en la mesa con un giro de entrada de 90 a 180°. La gimnasta queda de espaldas a la mesa al caer.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout_tw360', 'vault', '3', null, 4.40, '3.32', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido con pirueta (360°)', 'Kim (Tsukahara extendido, pirueta)', 'Con la entrada girada de un cuarto a media vuelta, la gimnasta sale en mortal atrás extendido e integra una pirueta completa (360°). Cae de cara a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout_tw540', 'vault', '3', null, 4.80, '3.33', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido con pirueta y media (540°)', 'Tsukahara extendido, pirueta y media', 'La gimnasta llega a la mesa con giro de 90 a 180°, rechaza y gira pirueta y media (540°) dentro de un mortal atrás estirado. La caída es de espaldas a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout_tw720', 'vault', '3', null, 5.20, '3.34', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido con doble pirueta (720°)', 'Zamolodchikova', 'Entrada con giro de un cuarto a media vuelta y, en el segundo vuelo, mortal atrás extendido con doble pirueta (720°). La gimnasta aterriza mirando hacia la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null),
  ('vt_tsuk_bwd_layout_tw900', 'vault', '3', null, 5.60, '3.35', 'Paloma con giro (90–180°) a la mesa y mortal atrás extendido con doble pirueta y media (900°)', 'Tsukahara, doble pirueta y media', 'Tras el giro de entrada hacia la mesa, la gimnasta encadena un mortal atrás extendido con doble pirueta y media (900°), un giro muy rápido que obliga a empezar a girar pronto. Cae de espaldas a la mesa.', 65, '2026-11-19'::date, 'Claude', '2026-11-19'::date, 1, 'draft', null);

do $element_catalog_seed_reviewed_guard$
declare
  changed_keys text;
begin
  select string_agg(e.element_key, ', ' order by e.element_key)
    into changed_keys
  from zaltyko.catalog_elements e
  join zaltyko.catalog_element_editions ed on ed.id = e.edition_id
  join pg_temp.element_catalog_seed_rows s on s.element_key = e.element_key
  where ed.code = 'fig-wag-2025-2028'
    and e.review_status = 'reviewed'
    and (e.apparatus, e.element_group, e.value_letter, e.value_points, e.fig_reference, e.name, e.short_name, e.description)
        is distinct from (s.apparatus, s.element_group, s.value_letter, s.value_points, s.fig_reference, s.name, s.short_name, s.description)
    and (s.reviewed_on is null or e.reviewed_on is null or s.reviewed_on <= e.reviewed_on);
  if changed_keys is not null then
    raise exception 'Element catalog seed would change reviewed elements without a newer reviewed_on: %', changed_keys;
  end if;
end;
$element_catalog_seed_reviewed_guard$;

insert into zaltyko.catalog_elements
  (edition_id, element_key, discipline, apparatus, element_group, value_letter, value_points, fig_reference, name, short_name, description, source_page, source_checked_on, drafted_by, drafted_on, batch, review_status, reviewed_on)
select ed.id, s.element_key, ed.discipline, s.apparatus, s.element_group, s.value_letter, s.value_points, s.fig_reference, s.name, s.short_name, s.description, s.source_page, s.source_checked_on, s.drafted_by, s.drafted_on, s.batch, s.review_status, s.reviewed_on
from pg_temp.element_catalog_seed_rows s
cross join zaltyko.catalog_element_editions ed
where ed.code = 'fig-wag-2025-2028'
on conflict (edition_id, element_key) do update set
  discipline = excluded.discipline,
  apparatus = excluded.apparatus,
  element_group = excluded.element_group,
  value_letter = excluded.value_letter,
  value_points = excluded.value_points,
  fig_reference = excluded.fig_reference,
  name = excluded.name,
  short_name = excluded.short_name,
  description = excluded.description,
  source_page = excluded.source_page,
  source_checked_on = excluded.source_checked_on,
  drafted_by = excluded.drafted_by,
  drafted_on = excluded.drafted_on,
  batch = excluded.batch,
  review_status = case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end,
  reviewed_on = case when catalog_elements.review_status = 'reviewed' then greatest(catalog_elements.reviewed_on, excluded.reviewed_on) else excluded.reviewed_on end,
  updated_at = now()
where (catalog_elements.discipline, catalog_elements.apparatus, catalog_elements.element_group, catalog_elements.value_letter, catalog_elements.value_points, catalog_elements.fig_reference, catalog_elements.name, catalog_elements.short_name, catalog_elements.description, catalog_elements.source_page, catalog_elements.source_checked_on, catalog_elements.drafted_by, catalog_elements.drafted_on, catalog_elements.batch, catalog_elements.review_status, catalog_elements.reviewed_on)
  is distinct from (excluded.discipline, excluded.apparatus, excluded.element_group, excluded.value_letter, excluded.value_points, excluded.fig_reference, excluded.name, excluded.short_name, excluded.description, excluded.source_page, excluded.source_checked_on, excluded.drafted_by, excluded.drafted_on, excluded.batch, case when catalog_elements.review_status = 'reviewed' then 'reviewed' else excluded.review_status end, case when catalog_elements.review_status = 'reviewed' then greatest(catalog_elements.reviewed_on, excluded.reviewed_on) else excluded.reviewed_on end);

commit;
