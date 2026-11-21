-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 11.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 63 elementos (floor).
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
  ('fx_turn_1_one_foot_low_leg', 'floor', '2', 'A', null, '2.101', 'Giro sobre un pie (360°) con la pierna libre baja a elección', 'Giro simple', 'A la pierna libre solo se le pide que no llegue a la horizontal; su posición es libre. Con ella baja, la gimnasta completa una vuelta (360°) sobre un pie.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_one_foot_low_leg', 'floor', '2', 'B', null, '2.201', 'Doble giro (720°) sobre un pie con la pierna libre por debajo de la horizontal', 'Doble giro', 'Dos vueltas sobre un pie: doble giro (720°) con la pierna libre en la posición que prefiera la gimnasta, pero sin llegar a la horizontal.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_heel_fwd_horizontal', 'floor', '2', 'B', null, '2.202', 'Giro (360°) con el talón adelante a la horizontal', 'Giro pierna adelante', 'El talón de la pierna libre, estirada hacia delante, marca la horizontal y no baja en toda la vuelta (360°). Para la pierna de apoyo hay libertad: estirada o flexionada.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_split_leg_held', 'floor', '2', 'B', null, '2.203', 'Giro (360°) con la pierna libre arriba en split', 'Giro con pierna en split', 'Split arriba (180°) con la pierna libre mantenida en lo alto durante una vuelta completa (360°) sobre un pie.', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_back_attitude', 'floor', '2', 'B', null, '2.204', 'Giro (360°) en attitude atrás', 'Giro attitude', 'En attitude atrás, con el muslo de la pierna libre a la horizontal y sin deshacer la posición, la gimnasta da un giro completo (360°) sobre un pie.', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_scale_fwd', 'floor', '2', 'B', null, '2.205', 'Giro (360°) en balanza', 'Giro en balanza', 'Tronco inclinado adelante y pierna libre atrás, por encima de la horizontal de principio a fin: así se hace este giro completo (360°) sobre un pie.', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_illusion_standing_split', 'floor', '2', 'B', null, '2.206', 'Ilusión (360°) con split de pie', 'Ilusión', 'Las manos no pueden tocar el suelo. Con apoyo en un pie y pasando por split de pie, la gimnasta completa una ilusión (360°).', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_1_wolf', 'floor', '2', 'B', null, '2.207', 'Giro lobo (360°) en cuclillas sobre una pierna', 'Giro lobo', 'Agachada en cuclillas sobre una pierna y con la otra estirada, la gimnasta da un giro (360°) sin deshacer la posición en ningún momento.', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_plus_on_back_kip', 'floor', '2', 'B', null, '2.208', 'Doble giro (720°) o más sobre la espalda con la cadera cerrada', 'Giro sobre la espalda', 'Sobre la espalda y con la cadera muy cerrada, en posición de báscula, la gimnasta gira al menos dos vueltas (720°). Si da más vueltas, el valor no cambia.', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_3_one_foot_low_leg', 'floor', '2', 'C', null, '2.301', 'Tres vueltas (1080°) sobre un pie con la pierna libre baja', 'Triple giro', 'Con la pierna libre en cualquier posición por debajo de la horizontal, triple giro (1080°) apoyada en un solo pie.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_horizontal_to_wolf', 'floor', '2', 'C', null, '2.307', 'Doble giro (720°) que acaba en lobo', 'Nguyen', 'Termina en posición de lobo, en cuclillas sobre una pierna, después de empezar el doble giro (720°) de pie sobre un pie con la pierna libre a la horizontal.', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_heel_fwd_horizontal', 'floor', '2', 'D', null, '2.402', 'Doble giro (720°) con la pierna libre estirada adelante a la horizontal', 'Doble giro pierna adelante', 'Con el talón de la pierna libre a la horizontal y la pierna estirada al frente todo el tiempo, la gimnasta encadena un doble giro (720°). La pierna de apoyo puede flexionarse.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_split_leg_held', 'floor', '2', 'D', null, '2.403', 'Doble giro (720°) con la pierna libre arriba en split', 'Memmel', 'Dos vueltas (720°) sobre un pie sin que la pierna libre baje del split arriba (180°).', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_back_attitude', 'floor', '2', 'D', null, '2.404', 'Doble giro (720°) en attitude atrás o con la pierna atrás sujeta con las dos manos', 'Semenova (Berar)', 'Doble giro (720°) en dos versiones con nombre propio, cada una con su posición fija todo el giro: el Semenova, en attitude atrás con el muslo a la horizontal; el Berar, con la pierna atrás y arriba sujeta con las dos manos. Casilla con asterisco: se reconocen una sola vez y por orden de ejecución.', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_2_wolf', 'floor', '2', 'D', null, '2.407', 'Giro lobo doble (720°)', 'Doble giro lobo', 'Sin impulso de las manos en el suelo para arrancar, dos vueltas (720°) en cuclillas sobre una pierna, con la otra estirada de principio a fin.', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_4_one_foot_low_leg', 'floor', '2', 'E', null, '2.501', 'Cuádruple giro (1440°) sobre un pie con la pierna libre por debajo de la horizontal', 'Gomez', 'Cuatro vueltas seguidas sobre un pie, cuádruple giro (1440°), con la pierna libre a su gusto mientras quede por debajo de la horizontal.', 159, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_3_split_leg_held', 'floor', '2', 'E', null, '2.503', 'Triple giro (1080°) con la pierna libre arriba en split', 'Mustafina', 'Tres vueltas (1080°) sobre un pie con la pierna libre arriba en split (180°), sin perder la posición en ningún momento.', 160, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_turn_3_wolf', 'floor', '2', 'E', null, '2.507', 'Giro lobo triple (1080°)', 'Mitchell', 'Es el lobo a tres vueltas (1080°). Las cuclillas sobre la pierna de apoyo y la otra pierna estirada se mantienen todo el giro, que arranca sin empujar con las manos en el suelo.', 161, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_kick_or_press_to_handstand_turn_upto_360', 'floor', '3', 'A', null, '3.101', 'Vertical de impulso o a fuerza, con o sin giro de hasta 360°', 'Vertical con o sin giro', 'Cuenta la vertical sola o con medio giro (180°) o giro completo (360°) hecho ya en la vertical. Se sube con impulso de piernas o a fuerza, y volver a la posición de partida es opcional.', 162, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_hecht_roll_fwd', 'floor', '3', 'A', null, '3.102', 'Salto de pez', 'Salto de pez', 'Voltereta adelante a la que se llega con un vuelo antes de poner las manos.', 163, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_roll_bwd_to_handstand_turn_180_360', 'floor', '3', 'A', null, '3.103', 'Voltereta atrás hasta la vertical con medio giro (180°) o giro completo (360°)', 'Voltereta atrás a vertical con giro', 'En la vertical llega el giro: medio (180°) o completo (360°). Se sube a ella rodando en voltereta atrás.', 163, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_walkover_bwd_to_handstand_turn_360', 'floor', '3', 'A', null, '3.104', 'Paso atrás a la vertical con giro (360°)', 'Paso atrás a vertical con giro', 'Una vez en la vertical, giro completo (360°). Para llegar, paso atrás partiendo de pie o de sentada agrupada extendida; volver a la posición de partida es opcional.', 163, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_handspring_fwd_or_flyspring', 'floor', '3', 'A', null, '3.105', 'Paloma adelante de una pierna o de dos (flyspring)', 'Paloma adelante', 'Batiendo con una pierna es la paloma adelante; con las dos, la paloma de dos pies. En ambas el vuelo antes de las manos es opcional. La misma casilla incluye el salto atrás con medio giro (180°) a paloma adelante. En todas, la caída es libre.', 164, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_round_off', 'floor', '3', 'A', null, '3.106', 'Rondada', 'Rondada', 'Es la rondada, tal cual se conoce en la sala.', 164, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_flic_flac_all_variations', 'floor', '3', 'A', null, '3.107', 'Flic-flac, gainer y sus variantes, con el Tsavdaridou en la misma casilla', 'Flic-flac (Tsavdaridou)', 'Cualquier flic-flac vale, y también el gainer, ambos admitidos con apoyo de un solo brazo. En la casilla está además el Tsavdaridou, otro elemento: salida atrás tipo árabe, rueda sin manos entre dos cuartos de giro (90°) y llegada a apoyo facial tendido.', 165, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_kick_or_press_to_handstand_turn_540_720', 'floor', '3', 'B', null, '3.201', 'Vertical con giro y medio (540°) o doble giro (720°)', 'Vertical con 1½ o 2 giros', 'Vuelta y media (540°) o dos vueltas (720°) en la vertical: eso la distingue. La subida puede ser con impulso de piernas o a fuerza, y volver a la posición de partida es opcional.', 162, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_roll_bwd_to_handstand_turn_540_720', 'floor', '3', 'B', null, '3.203', 'Voltereta atrás hasta la vertical con giro y medio (540°) o doble giro (720°)', 'Voltereta atrás a vertical, 1½-2 giros', 'Tras una voltereta atrás que termina en vertical, la gimnasta gira en ella una vuelta y media (540°) o dos (720°).', 163, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_flic_flac_full_twist_before_support', 'floor', '3', 'B', null, '3.207', 'Flic-flac con pirueta (360°) previa al apoyo', 'Flic-flac con pirueta', 'Antes de que las manos toquen el suelo ya hay una pirueta completa (360°); el elemento acaba como un flic-flac.', 165, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_handspring_fwd_full_twist_mostepanova', 'floor', '3', 'C', null, '3.305', 'Paloma adelante con pirueta completa (360°) antes o después de las manos', 'Mostepanova', 'El momento de la pirueta (360°) lo elige la gimnasta: antes de apoyar las manos o después, en la paloma adelante. Cualquiera de las dos versiones es un Mostepanova.', 164, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_tucked_or_piked', 'floor', '4', 'A', null, '4.101', 'Mortal adelante agrupado o carpado', 'Mortal adelante', 'Sin pirueta, un mortal adelante agrupado o carpado: las dos formas tienen el mismo valor.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_aerial_walkover_fwd', 'floor', '4', 'A', null, '4.103', 'Paso adelante sin manos (aéreo)', 'Paso sin manos', 'Es el paso adelante hecho sin apoyar las manos en el suelo, lo que en la sala se llama aéreo o paso sin manos.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_aerial_cartwheel_or_aerial_roundoff', 'floor', '4', 'A', null, '4.104', 'Rueda lateral sin manos o rondada sin manos', 'Rueda sin manos', 'Rueda lateral sin apoyar las manos. En la misma casilla, con el mismo valor, está la rondada sin manos.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_swd_tucked_or_piked', 'floor', '4', 'A', null, '4.105', 'Mortal lateral agrupado o carpado', 'Mortal lateral', 'Lateral y sin pirueta, este mortal se hace agrupado o carpado, con el mismo valor. La batida, de uno o dos pies, va hacia delante.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_tucked_or_piked_half_or_full_twist', 'floor', '4', 'B', null, '4.201', 'Mortal adelante agrupado o carpado con media pirueta (180°), o agrupado con pirueta (360°)', 'Mortal adelante con ½ o 1 pirueta', 'La pirueta depende de la forma: agrupado admite media pirueta (180°) o pirueta completa (360°); carpado, solo media (180°). Todas son un mortal adelante y tienen el mismo valor.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_stretched_or_half_twist', 'floor', '4', 'B', null, '4.202', 'Mortal adelante extendido, sin pirueta o con media pirueta (180°)', 'Mortal adelante extendido', 'Extendido y sin pirueta, o con media pirueta (180°): las dos versiones de este mortal adelante tienen el mismo valor.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_arabian_salto_tucked_or_piked', 'floor', '4', 'B', null, '4.205', 'Mortal árabe agrupado o carpado', 'Mortal árabe', 'De espaldas y con media pirueta (180°) en la batida: así sale el mortal árabe, que gira adelante agrupado o carpado, con el mismo valor. La caída es libre.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_stretched_full_or_one_half_twist', 'floor', '4', 'C', null, '4.302', 'Mortal adelante extendido con pirueta (360°) o pirueta y media (540°)', 'Mortal adelante con 1 o 1½ piruetas', 'Pirueta completa (360°) o pirueta y media (540°) en un mortal adelante con el cuerpo extendido, con el mismo valor.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_stretched_double_twist', 'floor', '4', 'D', null, '4.402', 'Mortal adelante extendido con doble pirueta (720°)', 'Tarasevich', 'Doble pirueta (720°) dentro de un mortal adelante con el cuerpo extendido.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_fwd_tucked', 'floor', '4', 'E', null, '4.501', 'Doble mortal adelante agrupado', 'Podkopayeva (doble agrupado)', 'Dos mortales adelante en posición agrupada y sin pirueta. El otro Podkopayeva de suelo añade media pirueta (180°).', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_stretched_two_and_half_twist', 'floor', '4', 'E', null, '4.502', 'Mortal adelante extendido con dos piruetas y media (900°)', 'Cojocar', 'Un solo mortal adelante, extendido, que lleva dos piruetas y media (900°).', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_arabian_double_salto_tucked', 'floor', '4', 'E', null, '4.505', 'Doble mortal árabe agrupado', 'Andreasen/Jentsch', 'Es el doble árabe en posición agrupada: media pirueta (180°) y dos mortales adelante. Se conoce con los dos apellidos juntos.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_fwd_tucked_half_twist_or_piked', 'floor', '4', 'F', null, '4.601', 'Doble mortal adelante agrupado con media pirueta (180°) o carpado sin pirueta', 'Podkopayeva con ½ pirueta (Dowell)', 'Media pirueta (180°) en un doble mortal adelante agrupado. Comparte casilla y valor con el Dowell, doble mortal adelante carpado sin pirueta, que es otro elemento.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_fwd_stretched_triple_twist', 'floor', '4', 'F', null, '4.602', 'Mortal adelante extendido con triple pirueta (1080°)', 'Maldonado', 'Triple pirueta (1080°) metida en un único mortal adelante, con el cuerpo extendido.', 166, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_arabian_double_salto_piked', 'floor', '4', 'F', null, '4.605', 'Doble mortal árabe carpado', 'Dos Santos (carpado)', 'En posición carpada, el doble árabe: media pirueta (180°) con dos mortales adelante. El Dos Santos extendido es otro elemento, de más valor.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_arabian_double_salto_stretched', 'floor', '4', 'H', null, '4.805', 'Doble mortal árabe extendido', 'Dos Santos (extendido)', 'Con el cuerpo extendido, media pirueta (180°) y dos mortales adelante: es el doble árabe en su versión extendida, distinta del Dos Santos carpado.', 167, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_tuck_pike_or_stretched', 'floor', '5', 'A', null, '5.101', 'Mortal atrás agrupado, carpado o extendido', 'Mortal atrás', 'Agrupado, carpado o extendido, la forma la elige la gimnasta: un mortal atrás sin pirueta.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_whip_salto_bwd', 'floor', '5', 'A', null, '5.104', 'Latigazo', 'Latigazo', 'El latigazo, un mortal atrás, aquí sin ninguna pirueta.', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_stretched_half_twist', 'floor', '5', 'B', null, '5.201', 'Mortal atrás con media pirueta (180°) extendido, o con pirueta (360°) agrupado o extendido', 'Mortal atrás con ½ o 1 pirueta', 'Con la pirueta completa (360°), la forma puede ser agrupada o extendida; con media pirueta (180°), el mortal atrás va extendido.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_whip_salto_bwd_half_twist', 'floor', '5', 'B', null, '5.204', 'Latigazo con media pirueta (180°)', 'Latigazo con ½ pirueta', 'Un latigazo, mortal atrás, que añade media pirueta (180°).', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_stretched_1_5_twist', 'floor', '5', 'C', null, '5.301', 'Mortal atrás extendido con pirueta y media (540°) o doble pirueta (720°)', 'Mortal atrás con 1½ o 2 piruetas', 'Extendido, el mortal atrás lleva pirueta y media (540°) o doble pirueta (720°); las dos valen lo mismo.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_whip_salto_bwd_full_twist', 'floor', '5', 'C', null, '5.304', 'Latigazo con pirueta (360°)', 'Latigazo con pirueta', 'Pirueta completa (360°) en un latigazo.', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_stretched_2_5_twist', 'floor', '5', 'D', null, '5.401', 'Mortal atrás extendido con dos piruetas y media (900°)', 'Mortal atrás con 2½ piruetas', 'Dos piruetas y media (900°) en un mortal atrás extendido.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_tucked', 'floor', '5', 'D', null, '5.402', 'Doble mortal atrás agrupado o carpado', 'Kim', 'Agrupado o carpado, los dos son el Kim: un doble mortal atrás sin pirueta.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_stretched_triple_twist', 'floor', '5', 'E', null, '5.501', 'Mortal atrás extendido con triple pirueta (1080°)', 'Mortal atrás con triple pirueta', 'Triple pirueta (1080°) en un solo mortal atrás, con el cuerpo extendido.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_tucked_full_twist', 'floor', '5', 'E', null, '5.502', 'Doble mortal atrás agrupado o carpado con pirueta (360°)', 'Doble mortal atrás con pirueta', 'Pirueta completa (360°) en un doble mortal atrás, agrupado o carpado, con la técnica que prefiera la gimnasta. La forma agrupada es la Mukhina y la carpada, la Oliveira.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_salto_bwd_stretched_3_5_twist', 'floor', '5', 'F', null, '5.601', 'Mortal atrás extendido con tres piruetas y media (1260°)', 'Mortal atrás con 3½ piruetas', 'Tres piruetas y media (1260°) caben en este mortal atrás extendido.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_tucked_1_5_twist', 'floor', '5', 'F', null, '5.602', 'Doble mortal atrás agrupado con pirueta y media (540°)', 'Heron', 'Pirueta y media (540°) sobre un doble mortal atrás agrupado.', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_stretched', 'floor', '5', 'F', null, '5.603', 'Doble mortal atrás extendido', 'Doble mortal atrás extendido', 'Sin pirueta y con el cuerpo extendido de principio a fin: un doble mortal atrás.', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_stretched_half_twist', 'floor', '5', 'G', null, '5.703', 'Doble mortal atrás extendido con media pirueta (180°)', 'Biles (extendido, ½ pirueta)', 'Media pirueta (180°) en un doble mortal atrás extendido. No es el otro Biles de suelo, que es agrupado con triple pirueta (1080°).', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_tucked_double_twist', 'floor', '5', 'H', null, '5.802', 'Doble mortal atrás agrupado con doble pirueta (720°)', 'Silivas', 'En agrupado, un doble mortal atrás con doble pirueta (720°).', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_stretched_full_twist', 'floor', '5', 'H', null, '5.803', 'Doble mortal atrás extendido con pirueta (360°)', 'Chusovitina/Touzhikova', 'Extendido, el doble mortal atrás lleva aquí una pirueta completa (360°).', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_stretched_double_twist', 'floor', '5', 'I', null, '5.903', 'Doble mortal atrás extendido con doble pirueta (720°)', 'Moors', 'Doble pirueta (720°) en un doble mortal atrás extendido.', 169, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null),
  ('fx_double_salto_bwd_tucked_triple_twist', 'floor', '5', 'J', null, '5.1002', 'Doble mortal atrás agrupado con triple pirueta (1080°)', 'Biles (agrupado, triple pirueta)', 'Triple pirueta (1080°) en un doble mortal atrás agrupado. El otro Biles de suelo es el doble extendido con media pirueta (180°).', 168, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 11, 'draft', null);

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
