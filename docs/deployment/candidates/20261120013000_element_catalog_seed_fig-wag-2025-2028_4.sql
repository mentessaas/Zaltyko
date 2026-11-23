-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 4.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 58 elementos (uneven_bars).
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
  ('ub_giant_circle_bwd', 'uneven_bars', '3', 'B', null, '3.201', 'Molino atrás en presa dorsal', 'Molino atrás (Liu)', 'Vuelta completa alrededor de la misma barra, de vertical a vertical, girando hacia atrás con presa dorsal. Cuenta igual con una sola mano en la barra (Liu) o con medio giro (180°) al subir a la vertical.', 83, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_giant_circle_fwd', 'uneven_bars', '3', 'B', null, '3.206', 'Molino adelante', 'Molino adelante', 'Gira hacia delante alrededor de la barra, de vertical a vertical, y puede rematar con medio giro (180°). Ni subir con piernas abiertas o cadera doblada ni agarrar en mixta o dorsal en vez de palmar lo cambian; en cubital ya es otro elemento.', 87, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_giant_circle_bwd_full_turn_handstand', 'uneven_bars', '3', 'C', null, '3.301', 'Molino atrás con giro completo a la vertical', 'Molino atrás con giro', 'El giro completo (360°) llega al final: tras el molino atrás, gira mientras sube a la vertical y termina en ella sobre la misma barra.', 83, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_swing_fwd_roll_bwd_straddled_to_lb_clear_support', 'uneven_bars', '3', 'C', null, '3.304', 'Voltereta atrás abierta en vuelo de barra alta a barra baja', 'Voltereta atrás a barra baja', 'Acaba en apoyo libre sobre la barra baja tras una voltereta atrás en el aire con las piernas abiertas. Arranca colgada de la barra alta, mirando hacia la baja, y suelta después de balancear adelante.', 85, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_giant_circle_fwd_full_turn_handstand', 'uneven_bars', '3', 'C', null, '3.306', 'Molino adelante con giro completo a la vertical', 'Molino adelante con giro', 'Molino adelante sobre la misma barra que acaba en vertical tras un giro completo (360°) hecho al subir.', 87, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_straddle_flight_bwd_over_lb_handstand_lb', 'uneven_bars', '3', 'C', null, '3.307', 'Vuelo abierto atrás a vertical en barra baja', 'Vuelo atrás a vertical en barra baja', 'La vertical sobre la barra baja cierra un vuelo hacia atrás con las piernas abiertas que pasa por encima de esa misma barra. La gimnasta suelta la alta tras un balanceo atrás.', 87, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_jaeger_tucked', 'uneven_bars', '3', 'C', null, '3.308', 'Jaeger agrupado: mortal adelante con suelta en la barra alta', 'Jaeger agrupado', 'Mortal adelante agrupado en vuelo que sale de la vertical en la barra alta: balancea atrás, suelta, gira y vuelve a agarrar la misma barra en suspensión.', 88, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stoop_or_straddle_vault_half_turn_over_hb', 'uneven_bars', '3', 'C', null, '3.309', 'Salto carpado por encima de la barra alta con medio giro', 'Zhang/Volpi', 'Por encima de la barra alta y sin apoyar los pies en ella, pasa carpada con las piernas juntas y hace medio giro (180°) en el aire antes de volver a agarrarla. Arranca en vertical con balanceo atrás; también vale con piernas abiertas.', 89, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_l_grip_giant', 'uneven_bars', '3', 'C', null, '3.310', 'Molino adelante en presa cubital', 'Zaytseva', 'En presa cubital, la gimnasta da un molino adelante completo de vertical a vertical en la misma barra, con el cuerpo carpado o extendido. También cuenta si termina con medio giro (180°) al llegar a la vertical.', 89, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_giant_circle_bwd_one_and_half_turn_handstand', 'uneven_bars', '3', 'D', null, '3.401', 'Molino atrás con giro y medio a la vertical', 'Molino atrás giro y medio (Chusovitina)', 'Giro y medio (540°) mientras sube a la vertical al final de un molino atrás, en la misma barra. Valen igual el doble giro (720°) y el giro completo (360°) con salto en la vertical, soltando las dos manos (Chusovitina).', 83, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_swing_fwd_half_turn_flight_handstand_lb', 'uneven_bars', '3', 'D', null, '3.402', 'Vuelo con medio giro a la vertical en barra baja', 'Medio giro a barra baja', 'Llega a la barra baja directamente en vertical. El medio giro (180°) empieza al final del balanceo adelante, colgada de la barra alta, y enlaza con la suelta y el vuelo.', 83, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_tkatchev_straddled', 'uneven_bars', '3', 'D', null, '3.403', 'Tkatchev abierto', 'Davydova (Kononenko, Monckton)', 'En hecht atrás, en sentido contrario al balanceo largo adelante con que sale de la vertical, cruza la barra alta por encima con las piernas abiertas antes de agarrarla otra vez. Equivalen con medio giro (180°) tras pasar la barra (Kononenko) y carpado con medio giro antes de soltar (Monckton).', 84, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_pak_salto', 'uneven_bars', '3', 'D', null, '3.404', 'Mortal atrás extendido a la barra baja', 'Pak', 'Entre las dos barras hace un mortal atrás con el cuerpo extendido. Colgada de la barra alta y mirando hacia la baja, balancea adelante y suelta; termina en apoyo libre sobre la barra baja.', 85, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_deltchev_straddled', 'uneven_bars', '3', 'D', null, '3.405', 'Deltchev con piernas abiertas', 'Deltchev abierto (Moreno/Nakamura)', 'Con medio giro (180°) al final del balanceo adelante, suelta la barra alta, hace un mortal adelante con las piernas abiertas y vuelve a agarrarla. Cuentan igual la versión carpada (Moreno/Nakamura) y el Gienger: mortal atrás carpado con medio giro.', 86, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_swing_bwd_half_turn_flight_lb_clear_support', 'uneven_bars', '3', 'D', null, '3.407', 'Balanceo atrás con medio giro en vuelo a apoyo libre en barra baja', 'Ejova', 'Llega a apoyo libre en la barra baja tras volar entre las barras: desde la barra alta balancea atrás, suelta y da medio giro (180°) en el aire.', 87, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_jaeger_straddled', 'uneven_bars', '3', 'D', null, '3.408', 'Jaeger con piernas abiertas', 'Jaeger abierto (Li Ya)', 'Vuelve a agarrar la barra alta después de un mortal adelante con piernas abiertas, iniciado desde la vertical con balanceo atrás y suelta. Cuenta igual en carpado, o abierto con medio giro (180°) al final del mortal (Li Ya).', 88, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_half_turn_straddle_flight_bwd_over_hb', 'uneven_bars', '3', 'D', null, '3.409', 'Vuelo atrás abierto sobre la barra alta con medio giro previo', 'Khorkina', 'Pasa hacia atrás por encima de la barra alta con las piernas abiertas y la vuelve a agarrar en suspensión. El medio giro (180°) va antes de soltar, durante el balanceo atrás desde la vertical.', 89, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_l_grip_giant_full_turn_handstand', 'uneven_bars', '3', 'D', null, '3.410', 'Molino adelante en presa cubital con giro completo a la vertical', 'Molino cubital con giro', 'La presa cubital se mantiene durante todo el molino adelante, y al subir a la vertical añade un giro completo (360°) en la misma barra.', 89, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_swing_fwd_one_and_half_turn_flight_over_lb_hang', 'uneven_bars', '3', 'E', null, '3.502', 'Balanceo adelante con giro y medio en vuelo a suspensión en barra baja', 'Strong', 'Agarra la barra baja en suspensión después de pasar por encima de ella con un giro y medio (540°) en el aire, que llega tras balancear adelante colgada de la barra alta.', 83, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_tkatchev_piked', 'uneven_bars', '3', 'E', null, '3.503', 'Hecht atrás carpado sobre la barra alta (Tkatchev)', 'Tkatchev en carpado (Shushunova)', 'La barra alta queda por debajo mientras la gimnasta, carpada, la cruza en hecht atrás, en sentido contrario al balanceo largo adelante; luego la vuelve a agarrar. Cuenta igual abierto con dos medios giros (180° cada uno), uno en el balanceo y otro en el vuelo (Shushunova).', 84, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_pak_salto_full_turn', 'uneven_bars', '3', 'E', null, '3.504', 'Pak con giro completo', 'Bhardwaj', 'Un giro completo (360°) dentro del mortal atrás extendido convierte el Pak en este elemento. Sale colgada de la barra alta, mirando hacia la baja, y tras balancear adelante vuela hasta apoyo libre en la barra baja.', 85, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_salto_bwd_stretched_half_turn_hang_hb', 'uneven_bars', '3', 'E', null, '3.505', 'Mortal atrás extendido con medio giro y nueva presa en la barra alta', 'Mortal atrás extendido con medio giro', 'Medio giro (180°) dentro de un mortal atrás extendido: desde la vertical en la barra alta balancea adelante, suelta, gira y vuelve a agarrar la misma barra.', 86, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_giant_circle_fwd_reverse_grip_one_arm_full_turn_handstand', 'uneven_bars', '3', 'E', null, '3.506', 'Molino adelante en presa palmar con giro completo sobre un brazo', 'Molino adelante giro sobre un brazo', 'El giro completo (360°) empieza sobre un brazo antes de llegar a la vertical, al final de un molino adelante en presa palmar sobre la misma barra. También vale un giro y medio (540°) al subir a la vertical.', 87, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_l_grip_giant_one_arm_full_turn_handstand', 'uneven_bars', '3', 'E', null, '3.510', 'Molino cubital con giro a un brazo', 'Cubital con giro a un brazo', 'Termina en vertical sobre la misma barra con el giro completo (360°) ya cerrado; ese giro arranca antes, apoyada en un solo brazo, durante un molino adelante en presa cubital. Con giro y medio (540°), y cualquier técnica, cuenta igual.', 89, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_counter_salto_fwd_straddled_reverse_grip_hb', 'uneven_bars', '3', 'F', null, '3.604', 'Mortal adelante abierto y nueva presa en la barra alta', 'Kim (con balanceo)', 'Termina colgada de la barra alta en presa palmar tras un mortal adelante con piernas abiertas que va en sentido contrario al balanceo. Parte de espaldas a la barra baja, balancea adelante y suelta.', 85, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_jaeger_stretched', 'uneven_bars', '3', 'F', null, '3.608', 'Jaeger extendido', 'Capuccitti (Minamino)', 'Jaeger con el cuerpo extendido: desde la vertical en la barra alta balancea atrás, suelta, hace el mortal adelante y vuelve a agarrar la barra. Cuenta igual el Jaeger carpado con giro completo (360°) en el mortal (Minamino).', 88, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_salto_bwd_stretched_one_and_half_turn_hang_hb', 'uneven_bars', '3', 'G', null, '3.705', 'Mortal atrás extendido con giro y medio y nueva presa en la barra alta', 'Hristakieva', 'Vuelve a agarrar la barra alta tras un mortal atrás extendido con giro y medio (540°). Sale de la vertical, balancea adelante y suelta.', 86, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_salto_fwd_tucked_over_hb', 'uneven_bars', '3', 'G', null, '3.708', 'Mortal adelante agrupado por encima de la barra alta', 'Mo (Yang)', 'Por encima de la barra alta pasa un mortal adelante agrupado, tras soltar al final del balanceo atrás desde la vertical; después vuelve a agarrarla. Cuenta igual el Jaeger extendido con giro completo (360°), llamado Yang.', 88, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_straddle_circle_fwd_clear_support', 'uneven_bars', '4', 'A', null, '4.101', 'Vuelta libre adelante con piernas abiertas a apoyo libre', 'Vuelta abierta adelante', 'Solo las manos tocan la barra: desde apoyo libre con piernas abiertas, da una vuelta completa adelante sin que las piernas la rocen y termina en apoyo libre.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_straddle_circle_fwd_l_grip_clear_support', 'uneven_bars', '4', 'A', null, '4.103', 'Vuelta libre adelante con piernas abiertas en presa cubital', 'Vuelta abierta adelante cubital', 'En presa cubital, gira adelante alrededor de la barra con las piernas abiertas y sin tocarla con ellas, desde apoyo libre con piernas abiertas hasta apoyo libre.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_straddle_circle_bwd_clear_support', 'uneven_bars', '4', 'A', null, '4.104', 'Vuelta libre atrás con piernas abiertas a apoyo libre', 'Vuelta abierta atrás', 'Vuelta completa hacia atrás en la misma barra, con las piernas abiertas y solo las manos en contacto. Empieza en apoyo libre con piernas abiertas y acaba en apoyo libre.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_seat_circle_fwd_rear_support', 'uneven_bars', '4', 'A', null, '4.106', 'Vuelta sentada adelante en apoyo dorsal', 'Vuelta sentada adelante', 'Desde apoyo dorsal y con el cuerpo carpado, gira una vuelta completa adelante alrededor de la barra y vuelve al apoyo dorsal.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_seat_circle_bwd_rear_support', 'uneven_bars', '4', 'A', null, '4.107', 'Vuelta sentada atrás en apoyo dorsal', 'Vuelta sentada atrás', 'Termina en apoyo dorsal, igual que empieza, tras una vuelta completa atrás con el cuerpo carpado alrededor de la misma barra.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_kip_hb_clear_straddle_handstand_half_turn', 'uneven_bars', '4', 'B', null, '4.201', 'Kippe en barra alta, paso por apoyo libre con piernas abiertas y vertical con medio giro', 'Kippe a vertical con medio giro', 'Medio giro (180°) en la vertical cierra este elemento de la barra alta: desde suspensión hace kippe, pasa sin detenerse por apoyo libre con piernas abiertas y sube a la vertical con impulso o a fuerza.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_lb_counter_flight_hb', 'uneven_bars', '4', 'B', null, '4.205', 'Stalder atrás en barra baja con vuelo a la barra alta', 'Ray (Stalder a barra alta)', 'Es el Ray: termina colgada de la barra alta. Parte de la vertical en la baja, mirando hacia la alta, hace un Stalder atrás y, al soltar, invierte el sentido de rotación para volar hacia delante.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_lb_counter_flight_hb', 'uneven_bars', '4', 'B', null, '4.208', 'Vuelta carpada libre atrás en barra baja con vuelo a la barra alta', 'Vuelta carpada a barra alta', 'Llega en suspensión a la barra alta tras una vuelta carpada libre atrás en la baja, empezada en vertical; al soltar invierte el sentido de rotación y vuela hacia delante.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_straddle_circle_bwd_hb_flight_lb_clear_support', 'uneven_bars', '4', 'C', null, '4.302', 'Vuelta libre abierta atrás y vuelo a la barra baja', 'Vuelta libre abierta a barra baja', 'La barra baja recibe a la gimnasta en apoyo libre. Sale de la alta, donde empieza en apoyo libre con piernas abiertas, da una vuelta libre atrás y suelta.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_handstand', 'uneven_bars', '4', 'C', null, '4.304', 'Stalder atrás a la vertical', 'Stalder atrás', 'Vuelta completa alrededor de la barra, de vertical a vertical: un Stalder atrás en la misma barra. Cuenta igual con cambio de presa saltado al llegar a la vertical o con medio giro (180°) al subir.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_lb_hecht_flight_hb', 'uneven_bars', '4', 'C', null, '4.305', 'Stalder atrás en barra baja con vuelo en hecht a la barra alta', 'Stalder con hecht a barra alta', 'Con un vuelo en hecht pasa de la barra baja a la alta: hace Stalder atrás desde la vertical mirando hacia la barra alta, suelta y la agarra en suspensión.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_lb_hecht_flight_hb', 'uneven_bars', '4', 'C', null, '4.308', 'Hecht a la barra alta desde vuelta carpada libre atrás', 'Zgoba (Sayer)', 'Termina colgada de la barra alta tras un vuelo en hecht. Lo prepara en la barra baja con una vuelta carpada libre atrás desde la vertical. Sayer cuenta igual: misma vuelta, pero en la barra alta, y llega a apoyo libre en la baja.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_fwd_handstand', 'uneven_bars', '4', 'D', null, '4.401', 'Stalder adelante a la vertical', 'Stalder adelante', 'En la misma barra, Stalder adelante con vuelta completa que sale de la vertical y vuelve a ella. También vale con medio giro (180°) al subir.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_straddle_circle_bwd_hb_flight_handstand_lb', 'uneven_bars', '4', 'D', null, '4.402', 'Vuelta libre atrás con piernas abiertas en barra alta y vuelo a la vertical en barra baja', 'Vuelta abierta a vertical en barra baja', 'Termina en vertical sobre la barra baja: desde la vertical en la alta hace una vuelta libre atrás con piernas abiertas, suelta y vuela adelante hasta la otra barra.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_fwd_l_grip_handstand', 'uneven_bars', '4', 'D', null, '4.403', 'Stalder adelante en presa cubital a la vertical', 'White', 'Presa cubital y Stalder adelante, de vertical a vertical sobre la misma barra. Cuenta igual si añade medio giro (180°) al subir a la vertical.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_full_turn_handstand', 'uneven_bars', '4', 'D', null, '4.404', 'Stalder atrás con giro completo a la vertical', 'Frederick', 'Al subir a la vertical después de un Stalder atrás, gira completo (360°) y termina en vertical en la misma barra.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_through_handstand_lb_flight_hb', 'uneven_bars', '4', 'D', null, '4.405', 'Stalder atrás de barra baja a barra alta por la vertical', 'Stalder de espaldas a barra alta', 'Colgada de la barra alta acaba este Stalder atrás que se hace en la baja, de espaldas a la alta. La vertical se pasa sin quedarse en ella, y de ahí salen la suelta y el vuelo.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_fwd_handstand', 'uneven_bars', '4', 'D', null, '4.406', 'Vuelta carpada libre adelante a la vertical', 'Vuelta carpada adelante', 'Con solo las manos en la barra, da una vuelta carpada libre adelante completa, de vertical a vertical. También vale con medio giro (180°) al subir a la vertical.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_handstand', 'uneven_bars', '4', 'D', null, '4.407', 'Vuelta carpada libre atrás a la vertical', 'Vuelta carpada atrás', 'Sale de la vertical y vuelve a ella tras una vuelta carpada libre atrás alrededor de la misma barra, tocándola solo con las manos. Puede acabar con medio giro (180°).', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_fwd_full_turn_handstand', 'uneven_bars', '4', 'E', null, '4.501', 'Stalder adelante con giro completo a la vertical', 'Stalder adelante con giro', 'Giro completo (360°) al subir a la vertical, al final de un Stalder adelante en la misma barra.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_counter_straddle_reverse_hecht', 'uneven_bars', '4', 'E', null, '4.502', 'Stalder atrás y hecht atrás con piernas abiertas por encima de la barra alta', 'Ricna (Derwael/Fenton)', 'Tras un Stalder atrás en la barra alta, suelta y la cruza por encima en hecht atrás, en sentido contrario al balanceo y con piernas abiertas, para volver a agarrarla. Cuenta igual con medio giro (180°) en el vuelo y agarre en presa mixta cubital (Derwael/Fenton).', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_fwd_l_grip_full_turn_handstand', 'uneven_bars', '4', 'E', null, '4.503', 'Stalder adelante en presa cubital con giro completo a la vertical', 'Stalder cubital con giro', 'En presa cubital, la gimnasta hace un Stalder adelante y termina en vertical con un giro completo (360°); vale cualquier forma de girar.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_one_and_half_turn_handstand', 'uneven_bars', '4', 'E', null, '4.504', 'Stalder atrás con giro y medio a la vertical', 'Stalder atrás giro y medio', 'Un Stalder atrás que termina en vertical, en la misma barra, con giro y medio (540°) mientras sube.', 91, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_through_handstand_half_turn_flight_hb', 'uneven_bars', '4', 'E', null, '4.505', 'Stalder atrás en barra baja pasando por la vertical, medio giro y vuelo a la barra alta', 'Stalder con medio giro a barra alta', 'Medio giro (180°) en el aire camino de la barra alta: en la baja hace un Stalder atrás, pasa por la vertical sin pararse y suelta. Llega en suspensión.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_fwd_full_turn_handstand', 'uneven_bars', '4', 'E', null, '4.506', 'Vuelta carpada libre adelante con giro completo a la vertical', 'Vuelta carpada adelante con giro', 'Solo con las manos en la barra, da una vuelta carpada libre adelante y gira completo (360°) al subir a la vertical.', 92, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_full_turn_handstand', 'uneven_bars', '4', 'E', null, '4.507', 'Vuelta carpada libre atrás con giro completo a la vertical', 'Vuelta carpada atrás con giro', 'La vertical final llega con giro completo (360°), después de una vuelta carpada libre atrás en la que solo las manos tocan la barra.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_through_handstand_flight_hb', 'uneven_bars', '4', 'E', null, '4.508', 'Vuelta carpada libre atrás de barra baja a barra alta', 'Komova (Galante)', 'Suelta la baja al pasar por la vertical, sin pararse, y vuela a colgarse de la alta tras una vuelta carpada libre atrás. Cuentan igual el medio giro (180°) en el vuelo y el Galante: misma vuelta en la alta y hecht atrás abierto por encima, en sentido contrario al balanceo, hasta volver a agarrarla.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_stalder_bwd_counter_pike_reverse_hecht', 'uneven_bars', '4', 'F', null, '4.602', 'Stalder atrás y hecht atrás carpado por encima de la barra alta', 'Downie', 'Carpada, cruza la barra alta por encima en hecht atrás y la vuelve a agarrar, después de un Stalder atrás y de soltar en sentido contrario al balanceo.', 90, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_counter_pike_reverse_hecht', 'uneven_bars', '4', 'F', null, '4.608', 'Vuelta carpada libre atrás y hecht atrás carpado por encima de la barra alta', 'Vuelta carpada y hecht atrás carpado', 'Cruza por encima de la barra alta en hecht atrás carpado, en sentido contrario al balanceo, y vuelve a agarrarla; antes hace una vuelta carpada libre atrás desde la vertical.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date),
  ('ub_clear_pike_circle_bwd_counter_stretched_reverse_hecht', 'uneven_bars', '4', 'G', null, '4.708', 'Vuelta carpada libre atrás y hecht atrás extendido por encima de la barra alta', 'Nemour', 'Extendida en el vuelo, cruza la barra alta por encima en hecht atrás y la vuelve a agarrar. Antes ha hecho una vuelta carpada libre atrás desde la vertical y ha soltado en sentido contrario al balanceo.', 93, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 4, 'reviewed', '2026-11-23'::date);

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
