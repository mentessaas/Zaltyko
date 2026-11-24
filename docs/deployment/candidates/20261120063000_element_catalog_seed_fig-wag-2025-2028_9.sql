-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 9.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 36 elementos (beam).
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
  ('bb_handspring_fwd_flight_one_or_two_feet', 'beam', '5', 'B', null, '5.201', 'Paloma con vuelo tras el apoyo', 'Paloma adelante', 'Despegar las manos y volar antes de caer: esa fase de vuelo define esta paloma adelante. Con uno o dos brazos de apoyo, y cayendo en uno o en dos pies, el valor es el mismo.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_two_feet', 'beam', '5', 'B', null, '5.202', 'Flik-flak con caída en dos pies', 'Flik-flak', 'El flik-flak de siempre: hacia atrás, pasando por las manos, y cayendo en los dos pies sobre la barra.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_step_out', 'beam', '5', 'B', null, '5.204', 'Flik-flak con caída pierna a pierna', 'Flik-flak pierna a pierna', 'Las piernas llegan a la barra una detrás de otra, no a la vez. Es un flik-flak atrás que también puede hacerse con apoyo de un solo brazo, con el mismo valor.', 137, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_gainer_flic_flac', 'beam', '5', 'B', null, '5.206', 'Flik-flak gainer', 'Flik-flak gainer', 'Flik-flak que sale de un pie, lanzando la otra pierna adelante para iniciar la rotación atrás: eso es lo que lo hace gainer. Con apoyo de un solo brazo cuenta lo mismo.', 138, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_high_flight_swing_down_straddle_sit', 'beam', '5', 'B', null, '5.207', 'Flik-flak alto a sentada con piernas abiertas de través', 'Flik-flak a sentada', 'Termina sentada de través con las piernas abiertas: tras un flik-flak de vuelo alto, baja balanceando las piernas a la barra. Con flik-flak gainer vale lo mismo.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_round_off', 'beam', '5', 'B', null, '5.208', 'Rondada', 'Rondada', 'Rondada en la barra: avanza hacia delante, pasa por el apoyo de manos y cae con los dos pies.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_handspring_fwd_leg_change_flight', 'beam', '5', 'C', null, '5.301', 'Paloma adelante con cambio de piernas en el vuelo', 'Paloma con cambio de piernas', 'Las piernas se cambian en el aire, durante la fase de vuelo de una paloma adelante.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_half_twist_handstand_hold', 'beam', '5', 'C', null, '5.302', 'Flik-flak con media pirueta a vertical mantenida', 'Flik-flak media pirueta a vertical', 'Acaba en una vertical que se mantiene 2 segundos: el flik-flak lleva media pirueta (180°) y la gimnasta llega con las manos a la barra. Desde ahí baja a la posición que quiera.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_quarter_twist_handstand_hold', 'beam', '5', 'C', null, '5.303', 'Vertical mantenida desde flik-flak con cuarto de pirueta', 'Flik-flak cuarto de pirueta a vertical', 'Baja a la posición que prefiera después de sostener 2 segundos la vertical; antes, un flik-flak con un cuarto de pirueta (90°) la ha llevado hasta las manos.', 137, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_half_twist_after_hand_support', 'beam', '5', 'C', null, '5.304', 'Flik-flak con media pirueta tras el apoyo de manos', 'Flik-flak media pirueta tras apoyo', 'La media pirueta (180°) llega tarde: se hace después de apoyar las manos, en la segunda fase de vuelo del flik-flak.', 137, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_gainer_flic_flac_quarter_twist_handstand_hold', 'beam', '5', 'C', null, '5.306', 'Vertical desde flik-flak gainer con cuarto de pirueta', 'Kitti', 'La salida de la vertical es libre, pero antes hay que aguantarla 2 segundos. En el Kitti se llega a ella con un flik-flak gainer y un cuarto de pirueta (90°).', 138, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_pike_open_swing_down_straddle_sit', 'beam', '5', 'C', null, '5.307', 'Flik-flak carpado y extendido a sentada de través', 'Rueda (flik-flak a sentada)', 'En el vuelo la cadera se carpa y luego se abre hasta extenderse; el flik-flak acaba bajando las piernas a una sentada de través con piernas abiertas. Con flik-flak gainer también es un Rueda.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_liukin_salto_fwd_tucked_one_leg_takeoff', 'beam', '5', 'C', null, '5.310', 'Mortal adelante agrupado con batida de un pie', 'Liukin', 'Cae de pie, en uno o en los dos pies con el mismo valor, tras un mortal adelante agrupado que sale de un solo pie.', 140, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_salto_bwd_step_out_tucked', 'beam', '5', 'C', null, '5.312', 'Mortal atrás con caída pierna a pierna', 'Mortal atrás pierna a pierna', 'Se cae primero con un pie y luego con el otro. El mortal atrás sale de los dos pies y vale lo mismo agrupado, carpado o extendido; en extendido las piernas van separadas en el aire.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_gainer_salto_bwd_step_out_tucked', 'beam', '5', 'C', null, '5.313', 'Mortal atrás gainer con caída pierna a pierna', 'Mortal gainer pierna a pierna', 'Bate con un pie mientras la otra pierna lanza hacia delante y gira hacia atrás; cae un pie y luego el otro. Agrupado, carpado o extendido (con las piernas separadas) vale lo mismo.', 142, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_jump_bwd_half_twist_walkover_fwd', 'beam', '5', 'D', null, '5.401', 'Arco adelante tras salto atrás con media pirueta', 'Onodi', 'Acaba de frente, sobre una pierna, después de un arco adelante por la vertical. Para llegar ahí sale hacia atrás como en un flik-flak y hace media pirueta (180°) antes de poner las manos. Con un brazo o rematado con tic-tac vale lo mismo.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_side_half_twist_side_handstand', 'beam', '5', 'D', null, '5.402', 'Vertical de lado desde flik-flak con media pirueta', 'Kolesnikova', 'Empieza y acaba de lado: la vertical final queda paralela a la barra, igual que la posición de partida. Entre ambas, un flik-flak con media pirueta (180°); después baja a donde quiera.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_three_quarter_twist_side_handstand_hold', 'beam', '5', 'D', null, '5.403', 'Vertical de lado mantenida tras flik-flak con tres cuartos de pirueta', 'Omelianchik', 'Una vertical de lado aguantada 2 segundos es el punto clave del Omelianchik, que llega a ella girando tres cuartos de pirueta (270°) en el flik-flak. Después baja como quiera.', 137, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_three_quarter_twist_before_hand_support', 'beam', '5', 'D', null, '5.404', 'Flik-flak con tres cuartos de pirueta antes del apoyo', 'Kochetkova', 'Gira en el primer vuelo, antes de que las manos toquen la barra: al menos tres cuartos de pirueta (270°) dentro del flik-flak, para salir hacia delante.', 137, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_side_step_out', 'beam', '5', 'D', null, '5.405', 'Flik-flak de lado con caída pierna a pierna', 'Tousek', 'Tousek es el flik-flak hecho de lado que cae primero con un pie y luego con el otro. Con el mismo número, sin ese nombre, van el flik-flak de lado a apoyo facial y el que acaba en vuelta atrás al apoyo.', 138, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_gainer_flic_flac_three_quarter_twist_before_hand_support', 'beam', '5', 'D', null, '5.406', 'Flik-flak gainer girado en el primer vuelo', 'Khorkina (flik-flak)', 'Cuando las manos llegan a la barra, el giro ya está hecho: al menos tres cuartos de pirueta (270°) en el primer vuelo de un flik-flak gainer.', 138, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_full_twist_swing_down_straddle_sit', 'beam', '5', 'D', null, '5.407', 'Pirueta completa en flik-flak a sentada abierta', 'Rulfova', 'Sentada de través, piernas abiertas: así acaba un flik-flak que lleva pirueta completa (360°) y baja balanceando las piernas a la barra.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_aerial_cartwheel', 'beam', '5', 'D', null, '5.408', 'Rueda lateral sin manos', 'Rueda sin manos', 'Una rueda lateral en el aire, sin tocar la barra con las manos. El valor no cambia por cómo aterrice (uno o dos pies, de través o de lado) ni por añadir un cambio de piernas.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_aerial_walkover_fwd_free_landing_one_foot', 'beam', '5', 'D', null, '5.409', 'Paloma sin manos', 'Paloma sin manos', 'Paloma sin manos, sin tocar la barra: bate con un pie y cae en una pierna, con la otra estirada atrás. Caer en los dos pies, juntos, vale lo mismo.', 140, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_salto_fwd_tucked_to_cross_stand', 'beam', '5', 'D', null, '5.410', 'Mortal adelante agrupado de través', 'Mortal adelante agrupado de través', 'Bate con los dos pies, hace un mortal adelante agrupado y cae con los dos pies de través sobre la barra.', 140, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_salto_sideways_tucked_one_leg_takeoff_side_stand', 'beam', '5', 'D', null, '5.411', 'Mortal lateral agrupado batiendo con un pie', 'Mortal lateral agrupado', 'Cae de lado, con los dos pies, después de un mortal lateral agrupado batido con un solo pie.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_jump_bwd_half_twist_handspring_fwd', 'beam', '5', 'E', null, '5.501', 'Paloma adelante desde salto atrás con media pirueta', 'Worley', 'Cae con los dos pies después de una paloma adelante con vuelo, a la que llega girando: sale hacia atrás como en un flik-flak y la media pirueta (180°) la pone de frente.', 136, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_flic_flac_side_full_twist_hip_circle_bwd', 'beam', '5', 'E', null, '5.505', 'Flik-flak de lado con pirueta completa y vuelta atrás al apoyo', 'Teza', 'Remata con una vuelta atrás al apoyo: desde una posición de lado, flik-flak con pirueta completa (360°) que agarra la barra en apoyo facial para cerrar el círculo.', 138, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_aerial_round_off_tucked_piked', 'beam', '5', 'E', null, '5.508', 'Rondada sin manos agrupada o carpada', 'Rondada sin manos', 'Rondada sin manos que bate con los dos pies, agrupada o carpada. Con el mismo valor cuenta la rueda sin manos hecha de lado, que es la que lleva el nombre de Colussi.', 139, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_salto_fwd_piked_to_cross_stand', 'beam', '5', 'E', null, '5.510', 'Mortal adelante carpado de través', 'Mortal adelante carpado de través', 'Carpado en el aire: mortal adelante que sale de los dos pies y llega de través, también con los dos pies.', 140, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_schaefer_salto_sideways_tucked_half_twist', 'beam', '5', 'E', null, '5.511', 'Media pirueta en mortal lateral agrupado', 'Schaefer', 'Media pirueta (180°) es lo que añade el Schaefer al mortal lateral agrupado: bate con un pie y llega a la barra de lado, con los dos.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_salto_bwd_stretched_legs_together', 'beam', '5', 'E', null, '5.512', 'Mortal atrás extendido con piernas juntas', 'Mortal atrás extendido', 'Las piernas no se separan en ningún momento: mortal atrás extendido que sale y cae con los dos pies.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_lobaznyuk_arabian_salto_tucked', 'beam', '5', 'F', null, '5.611', 'Mortal árabe agrupado de dos pies', 'Lobaznyuk', 'El mortal gira hacia delante aunque el despegue sea hacia atrás: la media pirueta (180°) al batir con los dos pies le da la vuelta. Es un mortal árabe agrupado.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_shishova_salto_bwd_tucked_full_twist', 'beam', '5', 'F', null, '5.612', 'Mortal atrás agrupado con pirueta completa', 'Shishova (agrupado)', 'Pirueta completa (360°) dentro de un mortal atrás agrupado, batido con los dos pies. La versión extendida lleva el mismo nombre y vale más.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_jump_fwd_half_twist_salto_bwd_tucked', 'beam', '5', 'F', null, '5.613', 'Salto adelante con media pirueta a mortal atrás agrupado', 'Media pirueta a mortal atrás agrupado', 'Avanza, bate con los dos pies y con media pirueta (180°) convierte el impulso hacia delante en un mortal atrás agrupado. Con el mismo número va la forma carpada, la que se conoce como Produnova.', 142, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date),
  ('bb_shishova_salto_bwd_stretched_full_twist', 'beam', '5', 'G', null, '5.712', 'Mortal atrás extendido con pirueta completa', 'Shishova (extendido)', 'Es el Shishova con el cuerpo estirado: mortal atrás extendido con pirueta completa (360°), saliendo de los dos pies.', 141, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 9, 'reviewed', '2026-11-23'::date);

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
