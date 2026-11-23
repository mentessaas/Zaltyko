-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 14.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 72 elementos (high_bar).
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
  ('mhb_fl_back_uprise_straddle_over_rearways_hang', 'high_bar', 'II', 'B', null, 'II.2', 'Subida atrás, suelta y paso con piernas abiertas a suspensión en dislocación', 'Subida atrás con paso abierto', 'Recoge la barra en suspensión en dislocación: tras soltarla en la subida atrás, abre las piernas y pasa por encima de ella.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_markelov_straddle_hecht_half_twist', 'high_bar', 'II', 'C', null, 'II.3', 'Markelov: Hecht con piernas abiertas y media pirueta (180°) desde subida atrás', 'Markelov', 'Con piernas abiertas y media pirueta (180°), vuela en Hecht por encima de la barra tras soltar en la subida atrás y vuelve a la suspensión. Con otra media pirueta (180°) más es el Principi, que tras la recogida suele seguir hacia arriba.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_back_uprise_hecht_straight_one_and_half_twist', 'high_bar', 'II', 'G', null, 'II.6', 'Walstrom: Hecht extendido con pirueta y media (540°) desde subida atrás', 'Walstrom', 'Pirueta y media (540°) en un Hecht con el cuerpo extendido que sale de la subida atrás y cruza por encima de la barra antes de volver a la suspensión.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_yamawaki_markelov_straight_legs_together', 'high_bar', 'II', 'C', null, 'II.9', 'Yamawaki: Markelov con el cuerpo extendido y piernas juntas', 'Yamawaki', 'Un Markelov con el cuerpo extendido y las piernas juntas: tras la subida atrás suelta, pasa por encima de la barra en Hecht con media pirueta (180°) y la recoge. Con otra media pirueta (180°) más es el Muñoz - Pozzo, que suele seguir hacia arriba tras la recogida.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_tkatchev_straddle', 'high_bar', 'II', 'C', null, 'II.15', 'Tkatchev con piernas abiertas', 'Tkatchev', 'Desde el vuelo adelante suelta y se lanza hacia atrás con piernas abiertas por encima de la barra, para volver a cogerla en suspensión. Con media pirueta (180°) es el Lynch, que suele continuar hacia arriba tras la recogida.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_tkatchev_straight', 'high_bar', 'II', 'D', null, 'II.16', 'Tkatchev con el cuerpo extendido', 'Tkatchev extendido', 'Tkatchev con el cuerpo extendido: desde el vuelo adelante suelta, pasa hacia atrás por encima de la barra y la vuelve a coger en suspensión. El Moznik añade media pirueta (180°), recoge en presa cubital mixta y termina con una subida atrás al pino.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_tkatchev_straight_full_twist', 'high_bar', 'II', 'G', null, 'II.18', 'Liukin: Tkatchev extendido con pirueta (360°)', 'Liukin', 'Tkatchev extendido con una pirueta completa (360°): lanzado hacia atrás desde el vuelo adelante, pasa por encima de la barra y vuelve a la suspensión.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_tkatchev_piked', 'high_bar', 'II', 'C', null, 'II.21', 'Tkatchev con el cuerpo carpado', 'Tkatchev carpado', 'Con el cuerpo carpado, se lanza hacia atrás desde el vuelo adelante, cruza por encima de la barra y la vuelve a coger. Con media pirueta (180°) es el Samiloglu, que tras la recogida suele seguir hacia arriba.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_tkatchev_straddle_half_twist_double_el_grip', 'high_bar', 'II', 'E', null, 'II.23', 'Kulesza: Tkatchev con piernas abiertas y media pirueta (180°) a doble presa cubital', 'Kulesza', 'Acaba en suspensión con las dos manos en presa cubital: un Tkatchev con piernas abiertas y media pirueta (180°) que pasa por encima de la barra.', 124, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_back_uprise_piked_vault_half_twist', 'high_bar', 'II', 'B', null, 'II.26', 'Voronin: subida atrás y salto carpado con media pirueta (180°)', 'Voronin', 'Sale de la subida atrás, suelta y salta carpado con media pirueta (180°) por encima de la barra hasta volver a cogerla en suspensión.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_piatti_straddle', 'high_bar', 'II', 'D', null, 'II.28', 'Piatti: Tkatchev con piernas abiertas desde Stalder o vuelta libre de cadera atrás', 'Piatti', 'Un Tkatchev con piernas abiertas que se prepara con un Stalder o con una vuelta libre de cadera atrás y pasa por encima de la barra antes de recogerla. Desde cualquiera de las dos entradas cuenta también con media pirueta (180°), y entonces suele seguir hacia arriba.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_piatti_straight', 'high_bar', 'II', 'E', null, 'II.29', 'Piatti con el cuerpo extendido', 'Piatti extendido', 'Mismas entradas que el Piatti, Stalder o vuelta libre de cadera atrás, pero con el cuerpo extendido en el vuelo hacia atrás por encima de la barra. Con media pirueta (180°), recogida en presa cubital mixta y subida atrás al pino es el Kierzkowski.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_back_uprise_rear_vault_quarter_twist', 'high_bar', 'II', 'B', null, 'II.32', 'Subida atrás, suelta con pasada de espaldas y cuarto de pirueta (90°)', 'Pasada con cuarto de pirueta', 'Un cuarto de pirueta (90°) acompaña la pasada de espaldas por encima de la barra que hace tras soltar en la subida atrás, y vuelve a la suspensión.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_piatti_piked', 'high_bar', 'II', 'D', null, 'II.34', 'Piatti con el cuerpo carpado', 'Piatti carpado', 'Piatti con el cuerpo carpado: entra por Stalder o por vuelta libre de cadera atrás, se lanza hacia atrás por encima de la barra y la recoge. Vale también con media pirueta (180°).', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_piatti_straight_full_twist', 'high_bar', 'II', 'H', null, 'II.36', 'Suarez: Piatti extendido con pirueta (360°)', 'Suarez', 'La pirueta completa (360°) sobre el Piatti extendido da el Suarez: tras el Stalder o la vuelta libre de cadera atrás, vuelo hacia atrás por encima de la barra y recogida en suspensión.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_jaeger_tuck_or_straddle', 'high_bar', 'II', 'C', null, 'II.39', 'Jäger: mortal adelante agrupado o con piernas abiertas', 'Jäger', 'Mortal adelante agrupado o con piernas abiertas que se hace sin pasar la barra: sale del vuelo atrás, suelta y la vuelve a coger. Las dos formas cuentan igual si va en presa cubital antes de soltar.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_jaeger_piked', 'high_bar', 'II', 'D', null, 'II.40', 'Jäger con el cuerpo carpado', 'Jäger carpado', 'El Jäger hecho carpado: desde el vuelo atrás suelta, da el mortal adelante sin cruzar la barra y la recoge en suspensión. Vale igual saliendo desde presa cubital.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_jaeger_straight', 'high_bar', 'II', 'E', null, 'II.41', 'Balabanov: Jäger con el cuerpo extendido', 'Balabanov', 'Jäger con el cuerpo extendido: suelta, mortal adelante sin pasar la barra y recogida en suspensión; cuenta igual soltando desde presa cubital. Suele entrar desde un vuelo atrás.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_jaeger_straight_full_twist', 'high_bar', 'II', 'G', null, 'II.42', 'Winkler - Pogorelev: Jäger extendido con pirueta (360°)', 'Winkler - Pogorelev', 'Una pirueta (360°) dentro del mortal adelante extendido del Jäger, que no pasa la barra antes de recogerla; suele venir del vuelo atrás. Cuenta igual si suelta desde presa cubital.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_jaeger_straight_double_twist', 'high_bar', 'II', 'H', null, 'II.48', 'Jäger extendido con doble pirueta (720°)', 'Jäger extendido con doble pirueta', 'Doble pirueta (720°) en un Jäger extendido: suelta, mortal adelante sin cruzar la barra y recogida en suspensión. Normalmente parte del vuelo atrás, y vale igual soltando desde presa cubital.', 125, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_czech_giant_vault_bwd_straddle', 'high_bar', 'II', 'C', null, 'II.51', 'Tkatchev con piernas abiertas desde molino checo', 'Tkatchev desde molino checo', 'Lo prepara un molino checo: suelta y se lanza hacia atrás con piernas abiertas por encima de la barra para volver a la suspensión.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_counter_salto_fwd_straddled', 'high_bar', 'II', 'D', null, 'II.52', 'Xiao Ruizhi: contramortal adelante con piernas abiertas', 'Xiao Ruizhi', 'Es un vuelo tipo Tkatchev, hacia atrás por encima de la barra, pero girando en mortal adelante con piernas abiertas: suelta tras el vuelo adelante y vuelve a la suspensión.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_half_twist_salto_fwd_straddled', 'high_bar', 'II', 'C', null, 'II.57', 'Deltchev: media pirueta (180°) y mortal adelante con piernas abiertas', 'Deltchev', 'La media pirueta (180°) llega en el aire, antes del mortal: tras soltar en el vuelo adelante, gira y hace un mortal adelante con piernas abiertas sin cruzar la barra, y vuelve a cogerla.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_gienger_piked_half_twist', 'high_bar', 'II', 'D', null, 'II.58', 'Gienger: mortal atrás carpado con media pirueta (180°)', 'Gienger', 'Mortal atrás carpado con media pirueta (180°) lanzado desde el vuelo adelante, sin pasar la barra, que termina en suspensión. Si entra desde un molino checo es el Sapronenko.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_salto_bwd_one_and_half_twist', 'high_bar', 'II', 'G', null, 'II.60', 'Deff: mortal atrás con pirueta y media (540°)', 'Deff', 'Pirueta y media (540°) en un mortal atrás tras el vuelo adelante, que no cruza la barra antes de la recogida; el cuerpo suele ir extendido.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_gaylord_salto_fwd_tuck_over_bar', 'high_bar', 'II', 'E', null, 'II.65', 'Gaylord: mortal adelante agrupado por encima de la barra', 'Gaylord', 'Suelta la barra y la sobrevuela en mortal adelante agrupado antes de recogerla en suspensión; cuenta igual si lleva presa cubital antes de soltar.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_gaylord_half_twist', 'high_bar', 'II', 'G', null, 'II.66', 'Pegan: Gaylord con media pirueta (180°)', 'Pegan', 'Gaylord con media pirueta (180°): mortal adelante agrupado por encima de la barra y recogida en suspensión.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_gaylord_full_twist', 'high_bar', 'II', 'H', null, 'II.72', 'Koudinov: Gaylord con pirueta (360°)', 'Koudinov', 'Lleva una pirueta completa (360°) sobre el Gaylord: vuela por encima de la barra en mortal adelante agrupado y vuelve a cogerla.', 126, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_gaylord_piked', 'high_bar', 'II', 'F', null, 'II.78', 'Gaylord con el cuerpo carpado', 'Gaylord carpado', 'Es el Gaylord con el cuerpo carpado: suelta, cruza por encima de la barra en mortal adelante y la recoge.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_salto_bwd_half_twist_tucked_over_bar', 'high_bar', 'II', 'D', null, 'II.82', 'Mortal atrás agrupado con media pirueta (180°) por encima de la barra', 'Mortal atrás agrupado por encima', 'Por encima de la barra, mortal atrás agrupado con media pirueta (180°) entre la suelta y la recogida.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_salto_bwd_half_twist_piked_over_bar', 'high_bar', 'II', 'E', null, 'II.83', 'Gaylord 2: mortal atrás carpado con media pirueta (180°) por encima de la barra', 'Gaylord 2', 'Suelta y pasa por encima de la barra en mortal atrás carpado con media pirueta (180°) antes de volver a cogerla.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_pegan_piked', 'high_bar', 'II', 'H', null, 'II.84', 'Maras: Pegan con el cuerpo carpado', 'Maras', 'Un Pegan carpado: mortal adelante con media pirueta (180°) por encima de la barra hasta la recogida.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_double_salto_bwd_tucked', 'high_bar', 'II', 'D', null, 'II.88', 'Kovacs: doble mortal atrás agrupado por encima de la barra', 'Kovacs', 'Doble mortal atrás agrupado que cruza por encima de la barra entre la suelta y la recogida; suele salir de un vuelo adelante.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_full_twist', 'high_bar', 'II', 'E', null, 'II.89', 'Kolman: Kovacs con pirueta (360°)', 'Kolman', 'Kovacs agrupado con una pirueta (360°): doble mortal atrás por encima de la barra, normalmente desde el vuelo adelante, y vuelta a la suspensión.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_double_twist', 'high_bar', 'II', 'H', null, 'II.90', 'Bretschneider: Kovacs con doble pirueta (720°)', 'Bretschneider', 'Doble pirueta (720°) metida en el Kovacs agrupado, que pasa por encima de la barra; suele lanzarse desde el vuelo adelante y acaba recogiendo la barra.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_piked_or_straight', 'high_bar', 'II', 'E', null, 'II.95', 'Kovacs carpado o extendido', 'Kovacs carpado o extendido', 'Carpado o extendido, el doble mortal atrás del Kovacs pasa por encima de la barra y termina en suspensión; la entrada suele ser un vuelo adelante.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_straight_or_piked_full_twist', 'high_bar', 'II', 'G', null, 'II.96', 'Cassina: Kovacs extendido con pirueta (360°)', 'Cassina', 'Kovacs extendido con una pirueta (360°), normalmente desde el vuelo adelante y por encima de la barra hasta recogerla. La misma pirueta con el cuerpo carpado es el Pineda.', 127, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_straight_double_twist', 'high_bar', 'II', 'I', null, 'II.102', 'Miyachi: Kovacs extendido con doble pirueta (720°)', 'Miyachi', 'Con el cuerpo extendido y doble pirueta (720°): suele salir del vuelo adelante, cruza la barra en doble mortal atrás y la vuelve a coger.', 128, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_fl_kovacs_one_and_half_twist_mixed_grip', 'high_bar', 'II', 'G', null, 'II.108', 'Shaham: Kovacs agrupado con pirueta y media (540°) a presa mixta', 'Shaham', 'Recoge la barra en presa mixta después de un Kovacs agrupado con pirueta y media (540°): doble mortal atrás por encima de la barra.', 128, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_fwd_pike_or_straight_opt_half', 'high_bar', 'IV', 'A', null, 'IV.1', 'Salida en mortal adelante carpado o extendido, con o sin media pirueta (180°)', 'Mortal adelante', 'Salida en mortal adelante, carpado o extendido; cualquiera de las dos formas puede llevar media pirueta (180°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_fwd_straight_full_or_1half', 'high_bar', 'IV', 'B', null, 'IV.2', 'Salida en mortal adelante extendido con pirueta (360°) o pirueta y media (540°)', 'Mortal adelante con pirueta', 'Una pirueta (360°) o pirueta y media (540°) en un mortal adelante extendido para salir de la barra.', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_fwd_straight_double_or_2half_twist', 'high_bar', 'IV', 'C', null, 'IV.3', 'Salida en mortal adelante extendido con doble pirueta (720°) o dos piruetas y media (900°)', 'Mortal adelante con doble pirueta', 'Doble pirueta (720°) o dos piruetas y media (900°) en el mortal adelante extendido de salida.', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_triple_salto_fwd_tuck_opt_half', 'high_bar', 'IV', 'G', null, 'IV.6', 'Rumbutis: triple mortal adelante agrupado, con o sin media pirueta (180°)', 'Rumbutis', 'Salida en triple mortal adelante agrupado; vale también con media pirueta (180°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_tuck_or_pike_opt_half', 'high_bar', 'IV', 'C', null, 'IV.9', 'Salida en doble mortal adelante agrupado o carpado, con o sin media pirueta (180°)', 'Doble mortal adelante', 'Doble mortal adelante para salir, agrupado o carpado, con o sin media pirueta (180°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_tuck_or_pike_full_or_1half', 'high_bar', 'IV', 'D', null, 'IV.10', 'Salida en doble mortal adelante agrupado o carpado con pirueta (360°) o pirueta y media (540°)', 'Doble adelante con pirueta', 'Agrupado o carpado, el doble mortal adelante de salida lleva una pirueta (360°) o pirueta y media (540°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_tuck_or_pike_double_or_2half_twist', 'high_bar', 'IV', 'E', null, 'IV.11', 'Salida en doble mortal adelante agrupado o carpado con doble pirueta (720°) o dos y media (900°)', 'Doble adelante con doble pirueta', 'Doble pirueta (720°) o dos piruetas y media (900°) en un doble mortal adelante agrupado o carpado.', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_straight_opt_half_opt_over_bar', 'high_bar', 'IV', 'D', null, 'IV.16', 'Roethlisberger 2: doble mortal adelante extendido, con o sin media pirueta (180°)', 'Roethlisberger 2', 'Doble mortal adelante extendido de salida, con o sin media pirueta (180°); las dos formas cuentan también hechas por encima de la barra.', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_straight_full_or_1half', 'high_bar', 'IV', 'E', null, 'IV.17', 'Alvarez: doble mortal adelante extendido con pirueta (360°) o pirueta y media (540°)', 'Alvarez', 'Salida en doble mortal adelante extendido con una pirueta (360°) o con pirueta y media (540°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_tuck_or_pike_opt_half_over_bar', 'high_bar', 'IV', 'C', null, 'IV.21', 'Doble mortal adelante agrupado o carpado por encima de la barra, con o sin media pirueta (180°)', 'Doble adelante por encima', 'Pasa por encima de la barra con un doble mortal adelante agrupado o carpado, con o sin media pirueta (180°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_fwd_tuck_or_pike_full_or_1half_over_bar', 'high_bar', 'IV', 'D', null, 'IV.22', 'Roethlisberger 1: doble mortal adelante con pirueta (360° o 540°) por encima de la barra', 'Roethlisberger 1', 'Por encima de la barra, doble mortal adelante agrupado o carpado con una pirueta (360°) o pirueta y media (540°).', 134, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_bwd_pike_or_straight_opt_half_or_full', 'high_bar', 'IV', 'A', null, 'IV.25', 'Salida en mortal atrás carpado o extendido, con o sin pirueta (180° o 360°)', 'Mortal atrás', 'Mortal atrás carpado o extendido para salir; cada forma vale sin pirueta, con media pirueta (180°) o con una pirueta completa (360°).', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_bwd_straight_1half_or_double_twist', 'high_bar', 'IV', 'B', null, 'IV.26', 'Salida en mortal atrás extendido con pirueta y media (540°) o doble pirueta (720°)', 'Mortal atrás con pirueta y media', 'Pirueta y media (540°) o doble pirueta (720°) en un mortal atrás extendido.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_salto_bwd_straight_2half_or_triple_twist', 'high_bar', 'IV', 'C', null, 'IV.27', 'Salida en mortal atrás extendido con dos piruetas y media (900°) o triple pirueta (1080°)', 'Mortal atrás con dos piruetas y media', 'Mortal atrás extendido de salida con dos piruetas y media (900°) o con triple pirueta (1080°).', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_or_pike', 'high_bar', 'IV', 'B', null, 'IV.32', 'Salida en doble mortal atrás agrupado o carpado', 'Doble mortal atrás', 'Salida en doble mortal atrás, agrupado o carpado.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_full', 'high_bar', 'IV', 'C', null, 'IV.33', 'Tsukahara: doble mortal atrás agrupado con pirueta (360°)', 'Tsukahara', 'Doble mortal atrás agrupado con una pirueta (360°) para salir de la barra.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_double_twist', 'high_bar', 'IV', 'D', null, 'IV.34', 'Salida en doble mortal atrás agrupado con doble pirueta (720°)', 'Doble agrupado con doble pirueta', 'Doble pirueta (720°) dentro de un doble mortal atrás agrupado.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight', 'high_bar', 'IV', 'C', null, 'IV.39', 'Salida en doble mortal atrás extendido', 'Doble mortal atrás extendido', 'Salida en doble mortal atrás con el cuerpo extendido.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_full', 'high_bar', 'IV', 'D', null, 'IV.40', 'Salida en doble mortal atrás extendido con pirueta (360°)', 'Doble extendido con pirueta', 'Una pirueta (360°) en el doble mortal atrás extendido de salida.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_double_twist', 'high_bar', 'IV', 'E', null, 'IV.41', 'Watanabe: doble mortal atrás extendido con doble pirueta (720°)', 'Watanabe', 'Con doble pirueta (720°), doble mortal atrás extendido para salir.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_triple_twist', 'high_bar', 'IV', 'F', null, 'IV.42', 'Fedorchenko: doble mortal atrás extendido con triple pirueta (1080°)', 'Fedorchenko', 'Triple pirueta (1080°) en una salida de doble mortal atrás extendido.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_triple_salto_bwd_tuck_opt_over_bar', 'high_bar', 'IV', 'F', null, 'IV.48', 'Andrianov: triple mortal atrás agrupado', 'Andrianov', 'Triple mortal atrás agrupado de salida. Hecho por encima de la barra cuenta igual, pero esa forma se llama Hoffmann y el nombre Andrianov es solo de la primera.', 135, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_over_bar', 'high_bar', 'IV', 'B', null, 'IV.50', 'Salida en doble mortal atrás agrupado por encima de la barra', 'Doble agrupado por encima', 'Por encima de la barra, doble mortal atrás agrupado para salir.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_full_over_bar', 'high_bar', 'IV', 'C', null, 'IV.51', 'Salida en doble mortal atrás agrupado con pirueta (360°) por encima de la barra', 'Doble agrupado por encima con pirueta', 'Una pirueta (360°) en el doble mortal atrás agrupado que sale pasando por encima de la barra.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_tuck_double_twist_over_bar', 'high_bar', 'IV', 'D', null, 'IV.52', 'Salida en doble mortal atrás agrupado con doble pirueta (720°) por encima de la barra', 'Doble agrupado por encima, doble pirueta', 'Pasa por encima de la barra en doble mortal atrás agrupado con doble pirueta (720°).', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_triple_salto_bwd_pike', 'high_bar', 'IV', 'G', null, 'IV.54', 'Fardan: triple mortal atrás carpado', 'Fardan', 'Salida en triple mortal atrás con el cuerpo carpado.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_over_bar', 'high_bar', 'IV', 'C', null, 'IV.57', 'Salida en doble mortal atrás extendido por encima de la barra', 'Doble extendido por encima', 'Doble mortal atrás extendido que sale por encima de la barra.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_full_over_bar', 'high_bar', 'IV', 'D', null, 'IV.58', 'Hayden: doble mortal atrás extendido con pirueta (360°) por encima de la barra', 'Hayden', 'Por encima de la barra, doble mortal atrás extendido con una pirueta (360°).', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_double_salto_bwd_straight_1half_or_double_twist_over_bar', 'high_bar', 'IV', 'E', null, 'IV.59', 'Faulk: doble mortal atrás extendido con pirueta y media (540°) por encima de la barra', 'Faulk', 'Por encima de la barra, doble mortal atrás extendido con pirueta y media (540°), que es el Faulk; con doble pirueta (720°) es el Valverde.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_triple_salto_bwd_tuck_full', 'high_bar', 'IV', 'G', null, 'IV.60', 'Belle: triple mortal atrás agrupado con pirueta (360°)', 'Belle', 'Triple mortal atrás agrupado con una pirueta (360°) para salir.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_hecht_straddle_or_plain_or_half', 'high_bar', 'IV', 'A', null, 'IV.61', 'Salida: Hecht con piernas abiertas, Hecht o Hecht con media pirueta (180°)', 'Salida en Hecht', 'Tres formas de salir en Hecht que cuentan igual: con piernas abiertas, el Hecht a secas y el Hecht con media pirueta (180°).', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_hecht_full_or_1half', 'high_bar', 'IV', 'B', null, 'IV.62', 'Salida en Hecht con pirueta (360°) o pirueta y media (540°)', 'Hecht con pirueta', 'Hecht de salida con una pirueta (360°) o con pirueta y media (540°).', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date),
  ('mhb_dm_hecht_double_twist', 'high_bar', 'IV', 'D', null, 'IV.64', 'Salida en Hecht con doble pirueta (720°)', 'Hecht con doble pirueta', 'Doble pirueta (720°) en la salida en Hecht.', 136, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 14, 'reviewed', '2026-11-23'::date);

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
