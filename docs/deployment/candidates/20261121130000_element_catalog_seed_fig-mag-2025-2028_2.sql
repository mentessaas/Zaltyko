-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 2.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 51 elementos (floor).
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
  ('fig-mag-2025-2028', 'artistic_male', 2025, 2028, 'Código de Puntuación de Gimnasia Artística Masculina 2025-2028', 'https://www.gymnastics.sport/publicdir/rules/files/en_1.1%20-%20MAG%20Code%20of%20Points%202025-2028.pdf', '2026-11-16'::date, 'published')
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
  ('mfx_handspring_fwd', 'floor', 'II', 'A', null, 'II.1', 'Paloma o paloma de dos piernas', 'Paloma', 'Volteo adelante con apoyo de las manos en el suelo. También cuenta la paloma de dos piernas, que despega con los dos pies a la vez y vuela hasta apoyar las manos.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_handspring_salto_fwd_tucked', 'floor', 'II', 'D', null, 'II.4', 'Paloma y mortal adelante agrupado', 'Morandi', 'Tras la paloma llega un mortal adelante agrupado; el conjunto de los dos se conoce como Morandi.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_dive_roll', 'floor', 'II', 'A', null, 'II.7', 'Voltereta lanzada', 'Voltereta lanzada', 'Se lanza adelante en vuelo y cae rodando en voltereta, sin quedar de pie. Aunque termina así, es uno de los elementos con esa caída que sí reciben valor.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_tucked_or_piked', 'floor', 'II', 'A', null, 'II.13', 'Mortal adelante agrupado o carpado', 'Mortal adelante', 'Agrupado o carpado, este mortal adelante también vale si se añade media pirueta (180°). Las cuatro formas cuentan como el mismo elemento.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched', 'floor', 'II', 'B', null, 'II.14', 'Mortal adelante planchado', 'Mortal adelante planchado', 'Con el cuerpo en plancha durante el vuelo, da una vuelta adelante. Si lleva media pirueta (180°) sigue siendo el mismo elemento.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_fwd_tucked', 'floor', 'II', 'D', null, 'II.16', 'Doble mortal adelante agrupado', 'Doble mortal adelante agrupado', 'Dos vueltas adelante seguidas con las rodillas al pecho; con media pirueta (180°) cuenta igual. Entra como mortal múltiple.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_fwd_piked', 'floor', 'II', 'E', null, 'II.17', 'Doble mortal adelante carpado', 'Doble mortal adelante carpado', 'Dos vueltas adelante con el cuerpo carpado. Una media pirueta (180°) añadida no cambia el elemento.', 34, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_fwd_tucked_full_twist', 'floor', 'II', 'F', null, 'II.36', 'Doble mortal adelante agrupado con pirueta (360°)', 'Doble adelante agrupado con pirueta', 'Una pirueta completa (360°) metida en un doble mortal adelante agrupado. Se considera mortal múltiple.', 35, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_to_front_support', 'floor', 'II', 'B', null, 'II.38', 'Mortal adelante agrupado o carpado a apoyo facial', 'Mortal adelante a apoyo facial', 'En lugar de caer de pie, termina en apoyo facial tras un mortal adelante agrupado o carpado. Está entre las caídas en apoyo facial que sí puntúan.', 35, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_fwd_tucked_1_5_twist', 'floor', 'II', 'F', null, 'II.42', 'Doble mortal adelante agrupado con pirueta y media (540°)', 'Zapata', 'Al doble mortal adelante agrupado se le suma una pirueta y media (540°). Es el Zapata, y como todo doble cuenta como mortal múltiple.', 35, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_jump_fwd_half_turn_double_salto_bwd_tucked', 'floor', 'II', 'D', null, 'II.46', 'Salto adelante con medio giro (180°) y doble mortal atrás agrupado', 'Deferr', 'Bate hacia adelante, da medio giro (180°) antes de empezar a voltear y encadena un doble mortal atrás agrupado. Ese cambio de sentido es lo que lo distingue; cuenta como mortal múltiple.', 35, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_fwd_piked_or_stretched_1_5_twist', 'floor', 'II', 'G', null, 'II.48', 'Doble mortal adelante carpado o planchado con pirueta y media (540°)', 'Zapata 2', 'Pirueta y media (540°) dentro de un doble mortal adelante, carpado o en plancha. Las dos posiciones valen lo mismo.', 35, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_tucked_or_piked', 'floor', 'III', 'A', null, 'III.1', 'Mortal atrás agrupado o carpado', 'Mortal atrás', 'Una vuelta atrás en el aire, agrupado o carpado; las dos formas cuentan igual.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_or_tempo', 'floor', 'III', 'B', null, 'III.2', 'Mortal atrás planchado o mortal tempo', 'Mortal atrás planchado', 'Con el cuerpo en plancha, una vuelta atrás. El mortal tempo atrás también entra en esta casilla.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_tucked', 'floor', 'III', 'C', null, 'III.3', 'Doble mortal atrás agrupado', 'Doble mortal atrás agrupado', 'Rodillas al pecho durante dos vueltas atrás seguidas. Cuenta como mortal múltiple.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_full_twist_and_salto_bwd', 'floor', 'III', 'D', null, 'III.4', 'Mortal atrás agrupado con pirueta (360°) y mortal atrás agrupado', 'Tsukahara', 'La pirueta completa (360°) va en el primero de dos mortales atrás, los dos agrupados. Vale lo mismo la forma árabe: salida de espaldas con medio giro (180°) y doble mortal adelante agrupado, con o sin media pirueta (180°).', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_tucked_double_twist', 'floor', 'III', 'E', null, 'III.5', 'Doble mortal atrás agrupado con doble pirueta (720°)', 'Doble agrupado con doble pirueta', 'Doble pirueta (720°) o pirueta y media (540°) en un doble mortal atrás agrupado. Cuenta igual la forma conocida como Korosteljev: primer mortal atrás planchado con la pirueta y media (540°) y segundo mortal adelante agrupado.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_tucked_triple_twist', 'floor', 'III', 'G', null, 'III.6', 'Doble mortal atrás agrupado con triple pirueta (1080°)', 'Ri Jong Song', 'Triple pirueta (1080°) dentro de un doble mortal atrás agrupado: tres giros completos en dos vueltas de mortal. Es el Ri Jong Song.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_half_twist_or_arabian_salto', 'floor', 'III', 'A', null, 'III.7', 'Mortal atrás con media pirueta (180°) o mortal árabe', 'Mortal atrás con media pirueta', 'Media pirueta (180°) en un mortal atrás agrupado o carpado. El mortal árabe, en esas mismas dos posiciones, se cuenta como este elemento.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_half_twist', 'floor', 'III', 'B', null, 'III.8', 'Mortal atrás planchado con media pirueta (180°)', 'Mortal atrás planchado media pirueta', 'Mientras vuela en plancha hacia atrás, completa media pirueta (180°).', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_arabian_double_salto_fwd_piked', 'floor', 'III', 'E', null, 'III.11', 'Salto atrás con medio giro (180°) y doble mortal adelante carpado', 'Doble mortal árabe carpado', 'Despega de espaldas, completa medio giro (180°) y voltea dos veces adelante con el cuerpo carpado. Con media pirueta (180°) añadida sigue siendo este elemento; vale como mortal múltiple.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_tucked_2_5_twist', 'floor', 'III', 'F', null, 'III.12', 'Doble mortal atrás agrupado con dos piruetas y media (900°)', 'Doble agrupado dos piruetas y media', 'Un doble mortal atrás agrupado que acumula dos piruetas y media (900°). Entra como mortal múltiple.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_back_handspring', 'floor', 'III', 'A', null, 'III.13', 'Flic-flac', 'Flic-flac', 'Volteo atrás pasando por el apoyo de las manos en el suelo.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_piked', 'floor', 'III', 'D', null, 'III.16', 'Doble mortal atrás carpado', 'Doble mortal atrás carpado', 'Cadera cerrada y piernas estiradas durante dos mortales atrás seguidos. A efectos de puntuación es mortal múltiple.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_triple_salto_bwd_tucked', 'floor', 'III', 'I', null, 'III.18', 'Triple mortal atrás agrupado', 'Liukin', 'Tres vueltas atrás completas en posición agrupada antes de tomar suelo. Conocido como Liukin, cuenta como mortal múltiple.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_triple_salto_bwd_piked', 'floor', 'III', 'J', null, 'III.24', 'Triple mortal atrás carpado', 'Nagornyy', 'El triple atrás, pero carpado: tres vueltas con las piernas estiradas y la cadera cerrada. Recibe el nombre de Nagornyy.', 36, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_straddled_full_twist', 'floor', 'III', 'E', null, 'III.29', 'Doble mortal atrás con piernas abiertas y pirueta (360°)', 'Lou Yun', 'Piernas abiertas y una pirueta completa (360°) en un doble mortal atrás: así es el Lou Yun.', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_2_5_twist', 'floor', 'III', 'H', null, 'III.30', 'Doble mortal atrás planchado con dos piruetas y media (900°)', 'Doble planchado dos piruetas y media', 'En plancha durante las dos vueltas atrás, suma dos piruetas y media (900°).', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_jump_bwd_half_turn_to_roll_fwd', 'floor', 'III', 'A', null, 'III.31', 'Salto atrás con medio giro (180°) y voltereta adelante', 'Salto con medio giro a voltereta', 'Salta hacia atrás, da medio giro (180°) y rueda en voltereta adelante, sin acabar de pie. Está admitido para valor pese a terminar rodando.', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_full_twist_and_salto_bwd_piked', 'floor', 'III', 'E', null, 'III.35', 'Mortal atrás planchado con pirueta (360°) y mortal atrás carpado', 'Planchado con pirueta y carpado', 'Primer mortal atrás en plancha con la pirueta completa (360°) y segundo mortal atrás carpado. Cada mortal tiene su forma fija y el conjunto cuenta como mortal múltiple.', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_double_twist_and_salto_bwd_piked', 'floor', 'III', 'F', null, 'III.36', 'Mortal atrás planchado con doble pirueta (720°) y mortal atrás carpado', 'Kolyvanov', 'La doble pirueta (720°) va en el primer mortal atrás, en plancha; el segundo se hace carpado. Se le conoce como Kolyvanov.', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched', 'floor', 'III', 'E', null, 'III.41', 'Doble mortal atrás planchado', 'Doble mortal atrás planchado', 'Se conoce como Tamayo la forma árabe de esta casilla: salida de espaldas con medio giro (180°) y doble mortal adelante planchado. La principal es el doble mortal atrás en plancha, que también vale con media pirueta (180°).', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_1_5_twist', 'floor', 'III', 'G', null, 'III.42', 'Doble mortal atrás planchado con pirueta y media (540°)', 'Doble planchado pirueta y media', 'Pirueta y media (540°) en un doble mortal atrás planchado. Cuenta igual la forma árabe conocida como Hypolito: salida de espaldas con medio giro (180°) y doble mortal adelante planchado con pirueta (360°).', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_full_twist', 'floor', 'III', 'F', null, 'III.48', 'Doble mortal atrás planchado con pirueta (360°)', 'Penev', 'Penev es el nombre de toda la casilla: el doble mortal atrás planchado con pirueta (360°) y su forma árabe, que sale de espaldas con medio giro (180°) y hace un doble mortal adelante planchado con media pirueta (180°).', 37, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_double_twist', 'floor', 'III', 'G', null, 'III.54', 'Doble mortal atrás planchado con doble pirueta (720°)', 'Doble planchado con doble pirueta', 'Doble pirueta (720°) mientras el cuerpo, en plancha, da dos vueltas atrás. Cuenta como mortal múltiple.', 38, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_tucked_3_5_twist', 'floor', 'III', 'H', null, 'III.60', 'Doble mortal atrás agrupado con tres piruetas y media (1260°)', 'Minami', 'Tres piruetas y media (1260°) metidas en un doble mortal atrás agrupado. Se llama Minami.', 38, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_triple_twist', 'floor', 'III', 'I', null, 'III.66', 'Doble mortal atrás planchado con triple pirueta (1080°)', 'Shirai 3', 'El cuerpo va en plancha durante dos mortales atrás mientras completa una triple pirueta (1080°). Es el Shirai 3.', 38, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_double_salto_bwd_stretched_3_5_twist', 'floor', 'III', 'J', null, 'III.72', 'Doble mortal atrás planchado con tres piruetas y media (1260°)', 'Jarman', 'Jarman es el nombre de este doble mortal atrás en plancha con tres piruetas y media (1260°). Cuenta como mortal múltiple.', 38, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_tucked_full_twist', 'floor', 'IV', 'B', null, 'IV.2', 'Mortal adelante agrupado con pirueta (360°)', 'Mortal adelante agrupado con pirueta', 'Agrupado y hacia adelante, gira una pirueta (360°); con pirueta y media (540°) sigue siendo el mismo elemento.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched_full_twist', 'floor', 'IV', 'C', null, 'IV.3', 'Mortal adelante planchado con pirueta (360°)', 'Mortal adelante planchado con pirueta', 'Pirueta (360°) en un mortal adelante en plancha. Si llega a pirueta y media (540°), cuenta igual.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched_double_twist', 'floor', 'IV', 'D', null, 'IV.4', 'Mortal adelante planchado con doble pirueta (720°)', 'Mortal adelante doble pirueta', 'Doble pirueta (720°) en un mortal adelante planchado. Si dobla el cuerpo en la segunda pirueta, el giro vale igual pero resta en ejecución.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched_2_5_twist', 'floor', 'IV', 'E', null, 'IV.5', 'Mortal adelante planchado con dos piruetas y media (900°)', 'Mortal adelante dos piruetas y media', 'En plancha y hacia adelante, encadena dos piruetas y media (900°) en un solo mortal.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched_triple_twist', 'floor', 'IV', 'F', null, 'IV.6', 'Mortal adelante planchado con triple pirueta (1080°)', 'Shirai 2', 'Triple pirueta (1080°) en un único mortal adelante planchado, conocido como Shirai 2.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_full_twist', 'floor', 'IV', 'B', null, 'IV.8', 'Mortal atrás planchado con pirueta (360°)', 'Mortal atrás planchado con pirueta', 'Gira una pirueta entera (360°) en un mortal atrás planchado.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_1_5_or_double_twist', 'floor', 'IV', 'C', null, 'IV.9', 'Mortal atrás planchado con pirueta y media (540°) o doble pirueta (720°)', 'Mortal atrás pirueta y media', 'Pirueta y media (540°) o doble pirueta (720°) en un mortal atrás en plancha; las dos cuentan como el mismo elemento.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_2_5_twist', 'floor', 'IV', 'D', null, 'IV.10', 'Mortal atrás planchado con dos piruetas y media (900°)', 'Mortal atrás dos piruetas y media', 'Dos piruetas y media (900°) dentro de un solo mortal atrás, con el cuerpo planchado.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_3_5_twist', 'floor', 'IV', 'E', null, 'IV.11', 'Mortal atrás planchado con tres piruetas y media (1260°)', 'González', 'Con el nombre de González, este mortal atrás planchado lleva tres piruetas y media (1260°).', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_fwd_stretched_3_5_twist', 'floor', 'IV', 'G', null, 'IV.12', 'Mortal adelante planchado con tres piruetas y media (1260°)', 'Goshima', 'Hacia adelante y en plancha, tres piruetas y media (1260°) en un solo mortal: el Goshima.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_tucked_1_5_twist', 'floor', 'IV', 'B', null, 'IV.14', 'Mortal atrás agrupado con pirueta y media (540°)', 'Mortal atrás agrupado pirueta y media', 'Rodillas al pecho y pirueta y media (540°) en un mortal atrás.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_triple_twist', 'floor', 'IV', 'D', null, 'IV.22', 'Mortal atrás planchado con triple pirueta (1080°)', 'Mortal atrás triple pirueta', 'Tres giros completos, una triple pirueta (1080°), en un único mortal atrás planchado.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null),
  ('mfx_salto_bwd_stretched_quadruple_twist', 'floor', 'IV', 'F', null, 'IV.24', 'Mortal atrás planchado con cuádruple pirueta (1440°)', 'Shirai / Nguyen', 'Cuádruple pirueta (1440°) en un mortal atrás planchado. Lleva el doble nombre Shirai / Nguyen.', 39, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 2, 'draft', null);

do $element_catalog_seed_reviewed_guard$
declare
  changed_keys text;
begin
  select string_agg(e.element_key, ', ' order by e.element_key)
    into changed_keys
  from zaltyko.catalog_elements e
  join zaltyko.catalog_element_editions ed on ed.id = e.edition_id
  join pg_temp.element_catalog_seed_rows s on s.element_key = e.element_key
  where ed.code = 'fig-mag-2025-2028'
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
where ed.code = 'fig-mag-2025-2028'
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
