-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 6.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 51 elementos (beam).
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
  ('bb_mount_leap_to_arabesque', 'beam', '1', 'A', null, '1.101', 'Entrada con zancada a arabesca', 'Zancada a arabesca', 'Termina en arabesca sobre un pie, bien marcada al caer y con la pierna libre al menos a la horizontal. Llega corriendo al trampolín y entra con una zancada adelante; cuenta también como elemento de danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_thief_vault_to_rear_support', 'beam', '1', 'A', null, '1.102', 'Entrada con salto ladrón sobre la barra a apoyo dorsal', 'Salto ladrón a apoyo dorsal', 'Las piernas cruzan la barra una tras otra, sin manos, y queda de lado en apoyo dorsal. Bate con un pie tras correr perpendicular a la barra (90°). En diagonal vale una tijera que pasa por encima de la barra hasta sentada de través sobre un muslo. Es danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_flank_to_rear_support', 'beam', '1', 'A', null, '1.103', 'Entrada con flanco a apoyo dorsal', 'Flanco a apoyo dorsal', 'Con las manos en la barra, pasa las piernas por un lado y queda en apoyo dorsal; empieza de pie en el suelo, al lado de la barra. Admite medio giro (180°) en el flanco, o llegar corriendo, saltar y girar tres cuartos (270°) en apoyo hasta sentada de través sobre un muslo.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_side_split_sit', 'beam', '1', 'A', null, '1.105', 'Entrada a sentada en split lateral con manos en el salto', 'Salto a sentada en split lateral', 'Split lateral sentada, de lado y ya sin manos: así acaba. En el salto sí apoya las manos en la barra. Valen igual un salto abierto que deja el tronco en la barra y, en diagonal, un salto de dos pies o una zancada a sentada en split de través con apoyo. Es danza.', 109, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_squat_through_rear_support', 'beam', '1', 'A', null, '1.106', 'Entrada pasando las piernas agrupadas a apoyo dorsal', 'Pasada agrupada a apoyo dorsal', 'Apoya las manos en la barra y pasa las piernas agrupadas entre los brazos hasta quedar en apoyo dorsal. Sale de pie en el suelo, al lado de la barra; pasarlas carpadas cuenta igual.', 110, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_cartwheel_chest_stand', 'beam', '1', 'A', null, '1.108', 'Entrada con rueda lateral a apoyo de pecho', 'Rueda a apoyo de pecho', 'El paso por un apoyo de pecho con los dos brazos flexionados es lo que la define: llega a él con una rueda lateral y después baja las piernas. También vale saltar desde el suelo, de lado a la barra, al apoyo de pecho con los brazos flexionados.', 110, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_planche_bent_arms', 'beam', '1', 'A', null, '1.111', 'Plancha sobre brazos flexionados como entrada', 'Plancha con brazos flexionados', 'Dos segundos quieta en plancha, con el cuerpo estirado y uno o los dos brazos doblados. Si abre las piernas en split de través, cuenta igual.', 113, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_to_handstand', 'beam', '1', 'A', null, '1.114', 'Entrada pasando por la vertical desde el trampolín', 'Paso por la vertical desde trampolín', 'Lo que cuenta es pasar por la vertical, con piernas dobladas o estiradas. Llega corriendo y saltando del trampolín a la barra; cómo termina lo decide ella.', 115, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_split_leap', 'beam', '1', 'B', null, '1.201', 'Entrada con salto split', 'Salto split de entrada', 'Un salto split con las piernas abiertas del todo (180°) la lleva del trampolín a la barra, donde cae sobre un pie. Corre de frente y cuenta también como elemento de danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_half_turn_straddle_support', 'beam', '1', 'B', null, '1.204', 'Entrada con salto y medio giro a apoyo libre con piernas abiertas', 'Medio giro a apoyo abierto', 'Con medio giro (180°) en el aire, llega a apoyo de manos con las piernas abiertas sin que toquen la barra; corre perpendicular a ella (90°). De espaldas en el trampolín, vale saltar atrás pasando las piernas abiertas por encima a apoyo facial, o a sentada en split lateral. Es danza.', 109, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_forward_roll', 'beam', '1', 'B', null, '1.207', 'Entrada con salto a voltereta adelante', 'Salto a voltereta adelante', 'Acaba sentada o de pie agrupada después de una voltereta adelante, a la que llega saltando desde el suelo en el extremo o en el centro de la barra. En el extremo también puede saltar a apoyo libre con piernas abiertas, balancear atrás y rodar.', 110, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_neck_stand_to_chest_stand', 'beam', '1', 'B', null, '1.208', 'Entrada a apoyo de nuca y apoyo de pecho con dos medios giros', 'Nuca a pecho con dos medios giros', 'Dos medios giros (180°) separados: con el primero, por encima del hombro tras el salto, llega al apoyo de nuca; con el segundo pasa al apoyo de pecho, donde termina.', 110, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_handstand_hold_lower', 'beam', '1', 'B', null, '1.210', 'Entrada a la vertical mantenida', 'Vertical mantenida 2 s', 'Baja a una posición que toca la barra después de aguantar la vertical 2 segundos, con medio giro (180°) dentro de ella o sin él. Da igual cómo llegue arriba: con balanceo, a fuerza o saltando.', 112, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_piked_to_planche', 'beam', '1', 'B', null, '1.211', 'Apoyo facial libre a 45° con salto carpado', 'Salto carpado a apoyo facial libre', 'Cuerpo al menos 45° por encima de la horizontal, en apoyo facial libre, y 2 segundos sin moverse. Sale del suelo con la cadera doblada. Para acabar, cualquier posición.', 113, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_press_side_handstand_hop_quarter', 'beam', '1', 'B', null, '1.213', 'Saltito de vertical de lado a vertical de través', 'Saltito a vertical de través', 'Un saltito sobre las manos con cuarto de giro (90°) la pasa de vertical de lado a vertical de través. Antes dobla y estira las piernas. A la primera vertical sube a fuerza, y el final es suyo.', 114, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_cartwheel', 'beam', '1', 'B', null, '1.214', 'Entrada con rueda lateral', 'Rueda lateral de entrada', 'Rueda lateral del trampolín a la barra, tras la carrera, con apoyo de uno o los dos brazos; termina de pie sobre ella.', 115, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_handspring_from_board_rear_support', 'beam', '1', 'B', null, '1.215', 'Entrada con paloma en el trampolín a apoyo dorsal', 'Paloma en trampolín a apoyo dorsal', 'Las manos rechazan en el trampolín: una paloma adelante, entrando perpendicular a la barra (90°), la deja de lado en apoyo dorsal. Con cuarto de giro (90°) puede acabar sentada de través sobre un muslo; también cuenta una rueda lateral agarrando la barra a apoyo facial.', 116, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_straight_jump_half_turn', 'beam', '1', 'C', null, '1.302', 'Entrada con salto extendido y medio giro', 'Salto extendido con medio giro', 'Medio giro (180°) en el aire con el cuerpo extendido, del trampolín a la barra, donde cae con los dos pies. Cuenta también como elemento de danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_two_flying_flairs', 'beam', '1', 'C', null, '1.303', 'Entrada con dos flairs en vuelo', 'Dos flairs', 'Dos flairs con piernas abiertas y fase de vuelo, con las manos en la barra. Empieza de pie en el suelo, al lado de la barra.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_straddle_jump_hip_circle', 'beam', '1', 'C', null, '1.304', 'Entrada con rondada, salto carpado abierto atrás y vuelta de cadera atrás', 'Rondada a vuelta de cadera', 'Una vuelta de cadera atrás, inmediata, cierra la entrada en apoyo facial. Antes, rondada en el trampolín, perpendicular a la barra (90°), y salto atrás carpado con piernas abiertas que las pasa por encima de ella. Cuenta también como danza.', 109, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_free_jump_cross_split_sit', 'beam', '1', 'C', null, '1.305', 'Entrada con salto libre a sentada en split de través', 'Salto a sentada split (Dick sin giro)', 'Bate con los dos pies y, sin manos, llega a sentada en split de través entrando en diagonal a la barra. La zancada con cambio de piernas a la misma sentada (Dick) cuenta igual. Es elemento de danza.', 109, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_neck_stand_full_turn', 'beam', '1', 'C', null, '1.308', 'Entrada a apoyo de nuca con giro completo', 'Apoyo de nuca con giro completo', 'En apoyo de nuca hace un giro completo (360°), o uno y medio (540°). Llega a esa posición saltando con medio giro (180°) por encima del hombro.', 110, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_head_kip_from_end', 'beam', '1', 'C', null, '1.309', 'Entrada con kip de cabeza desde el extremo', 'Kip de cabeza desde el extremo', 'Con manos y cabeza en la barra, un kip de cabeza adelante la deja de pie. Parte del trampolín, de través frente al extremo. Valen igual el salto carpado a la vertical con paso adelante, o con paloma adelante cayendo en paso o con los dos pies.', 111, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_handstand_turn_lower', 'beam', '1', 'C', null, '1.310', 'Entrada a la vertical con giro completo', 'Vertical con giro completo', 'Gira completo (360°) en la vertical, de través o de lado, y baja a una posición en contacto con la barra. Llega a la vertical saltando, a fuerza o con balanceo; con giro y medio (540°) cuenta igual.', 112, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_stretched_to_planche', 'beam', '1', 'C', null, '1.311', 'Entrada con salto extendido a plancha (Shushunova)', 'Shushunova (Li Yifang)', 'Salta del suelo, cadera extendida, a plancha de 2 s. Mismo valor, con o sin medio giro (180°) en la vertical: subir a ella saltando, a fuerza o con balanceo y bajar a plancha o a apoyo carpado con piernas juntas; o el Li Yifang, vertical de 2 s y bajada de lado a apoyo dorsal soltando una mano.', 113, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_handstand_arch_span', 'beam', '1', 'C', null, '1.312', 'Entrada a vertical en gran arco', 'Vertical en gran arco', 'La vertical, de través, se mantiene 2 segundos en gran arco con las piernas en split, y luego baja a una posición libre. Cuentan igual mantener 2 s la vertical carpada con una pierna vertical y la otra flexionada, o en plancha invertida con piernas horizontales y sus variantes.', 114, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_one_arm_handstand', 'beam', '1', 'C', null, '1.313', 'Vertical de lado sobre un brazo', 'Vertical a un brazo', 'Un solo brazo sostiene la vertical de lado durante 2 segundos. Antes apoya los dos, entrando con salto, a fuerza o con balanceo, y luego carga el peso en uno. La salida queda a su gusto.', 114, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_quarter_turn_one_arm_side_handstand', 'beam', '1', 'C', null, '1.314', 'Entrada con dos cuartos de giro pasando por vertical a un brazo', 'Dos cuartos de giro (Beukes, Soares)', 'Corre perpendicular a la barra (90°) y, entre dos cuartos de giro (90°), pasa sin parar por la vertical a un brazo hasta la de lado; baja libre. Mismo valor: Beukes, de espaldas, flic-flac sobre la barra y por vela a apoyo facial; Soares, con medio giro (180°) y agarre por debajo a dos manos.', 115, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_aerial_walkover_rear_support', 'beam', '1', 'C', null, '1.315', 'Entrada con paso adelante sin manos a apoyo dorsal', 'Paso sin manos a apoyo dorsal', 'Sin tocar con las manos, un paso adelante en el aire desde el trampolín la deja de lado en apoyo dorsal. Entra perpendicular a la barra (90°); con cuarto de giro (90°) puede acabar sentada de través sobre un muslo.', 116, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_flicflac_straddle_sit', 'beam', '1', 'C', null, '1.317', 'Entrada con rondada y flic-flac a sentada con piernas abiertas', 'Rondada flic-flac a sentada abierta', 'Tras un flic-flac que pasa por la vertical, baja las piernas a sentada de través con piernas abiertas. La rondada se hace en el trampolín, en el extremo de la barra.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_switch_leap_cross_split', 'beam', '1', 'D', null, '1.401', 'Entrada con salto con cambio de piernas', 'Cambio de piernas de entrada', 'La pierna libre sube a 45° antes del cambio y, ya cambiada, se ve el split en el aire. Corre al trampolín, sale de frente y cae sobre un pie en la barra. Cuenta también como danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_full_turn', 'beam', '1', 'D', null, '1.402', 'Entrada con salto extendido y giro completo', 'Salto extendido con giro completo', 'Giro completo (360°) en el aire con el cuerpo extendido, entrando por el extremo o en diagonal; cae con los dos pies en la barra. Cuenta también como elemento de danza.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_three_flying_flairs', 'beam', '1', 'D', null, '1.403', 'Entrada con tres flairs en vuelo (Homma)', 'Homma (Baitova)', 'Tres flairs seguidos, con piernas abiertas y fase de vuelo, empezando de pie en el suelo al lado de la barra. El Baitova cuenta igual: dos círculos de piernas por el lado y un flair.', 108, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_switch_leap_half_turn_cross_split_sit', 'beam', '1', 'D', null, '1.405', 'Entrada con zancada con cambio de piernas y medio giro a sentada en split (Dick)', 'Dick (con medio giro)', 'Con el medio giro (180°) hacia fuera de la barra, la zancada con cambio de piernas termina sin manos en sentada en split de través. Entra en diagonal y cuenta también como danza.', 109, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_handstand_full_turn_to_planche', 'beam', '1', 'D', null, '1.411', 'Entrada a la vertical con giro completo bajando a plancha', 'Vertical con giro completo a plancha', 'Termina en plancha, mantenida 2 segundos, tras un giro completo (360°) en la vertical. Cuentan igual bajar a apoyo carpado con piernas juntas (2 s) o soltar una mano y bajar lateral a apoyo dorsal. Se entra saltando, a fuerza o con balanceo.', 113, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_side_handstand_walkover', 'beam', '1', 'D', null, '1.412', 'Entrada con vertical de lado y paso adelante (Phillips)', 'Phillips', 'De la vertical de lado, a la que llega saltando o a fuerza, sigue con un paso adelante y cae con los dos pies, de pie y de lado en la barra.', 114, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_one_arm_jump_to_handstand', 'beam', '1', 'D', null, '1.413', 'Vertical a un brazo (Rankin)', 'Rankin', 'Acaba en apoyo libre con piernas abiertas sobre un brazo la forma que aguanta 2 s en vertical de lado a un brazo, con o sin cuarto de giro (90°); a esa vertical pasa el peso desde la de dos (salto, fuerza o balanceo). La directa entra saltando o a fuerza en la vertical a un brazo y acaba libre.', 114, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_half_twist_side_handstand', 'beam', '1', 'D', null, '1.414', 'Entrada con rondada y salto con media pirueta a vertical (Gurova)', 'Gurova', 'En el vuelo, entre la rondada hecha delante de la barra y una vertical aproximadamente de lado, hace media pirueta (180°). La vertical no es el final: desde ella baja libre.', 115, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_salto_fwd_tucked', 'beam', '1', 'D', null, '1.416', 'Entrada con mortal adelante agrupado', 'Mortal adelante agrupado', 'Entra por el extremo de la barra con un mortal adelante agrupado desde el trampolín y cae de pie sobre ella.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_flicflac_to_stand', 'beam', '1', 'D', null, '1.417', 'Rondada y flic-flac hasta quedar de pie en la barra', 'Rondada flic-flac (Tsavdaridou)', 'De pie en la barra al terminar el flic-flac, que pasa por la vertical con una o las dos manos. La rondada, en el trampolín frente al extremo. El Tsavdaridou tiene el mismo valor: pirueta completa (360°) en el flic-flac y bajada a sentada de través con piernas abiertas.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_flicflac_full_twist_hip_circle', 'beam', '1', 'E', null, '1.514', 'Entrada con rondada, flic-flac con pirueta y vuelta de cadera (Zamolodchikova)', 'Zamolodchikova', 'Una pirueta completa (360°) dentro del flic-flac la lleva a enlazar una vuelta de cadera atrás. Todo empieza con rondada en el trampolín, delante de la barra.', 115, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_salto_fwd_piked', 'beam', '1', 'E', null, '1.516', 'Entrada con mortal adelante carpado', 'Mortal adelante carpado', 'Mortal adelante carpado desde el trampolín: entra por el extremo de la barra y cae de pie en ella.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_flicflac_three_quarter_twist', 'beam', '1', 'E', null, '1.517', 'Entrada con rondada y flic-flac con tres cuartos de pirueta', 'Flic-flac con 3/4 de pirueta', 'Tres cuartos de pirueta (270°) dentro del flic-flac, tras la rondada en el extremo, y termina de pie en la barra.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_salto_bwd_step_out', 'beam', '1', 'E', null, '1.518', 'Entrada con rondada y mortal atrás cayendo en paso', 'Rondada mortal atrás en paso', 'Cae en paso después de un mortal atrás agrupado; la rondada se hace en el trampolín, en el extremo de la barra. Carpado o extendido vale igual.', 118, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_flicflac_half_turn_walkover', 'beam', '1', 'F', null, '1.609', 'Entrada con rondada, flic-flac con medio giro y paso adelante (Dunn)', 'Dunn', 'Atrás y luego adelante: tras la rondada en el extremo, un flic-flac con medio giro (180°) se convierte en paso adelante hasta quedar de pie en la barra.', 111, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_aerial_walkover_from_end', 'beam', '1', 'F', null, '1.615', 'Entrada con paso adelante sin manos desde el extremo', 'Paso sin manos desde el extremo', 'Bate con los dos pies en el trampolín, en el extremo de la barra, y hace un paso adelante sin manos hasta quedar de pie de través sobre ella.', 116, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_salto_fwd_tucked_half_twist', 'beam', '1', 'F', null, '1.616', 'Entrada con mortal adelante agrupado y media pirueta (Wong Hiu Ying Angel)', 'Wong Hiu Ying Angel', 'Media pirueta (180°) durante un mortal adelante agrupado, desde el trampolín en el extremo, para caer de pie en la barra.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_salto_bwd_tucked_full_twist', 'beam', '1', 'F', null, '1.618', 'Entrada con rondada y mortal atrás agrupado con pirueta (Garrison)', 'Garrison', 'Después de la rondada en el extremo, un mortal atrás agrupado con pirueta completa (360°) termina de pie en la barra. El mortal atrás extendido sin pirueta cuenta igual.', 118, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_jump_half_twist_salto_bwd_piked', 'beam', '1', 'F', null, '1.619', 'Entrada con salto, media pirueta y mortal atrás carpado', 'Media pirueta a mortal atrás carpado', 'Sale mirando adelante, hace media pirueta (180°) y, ya de espaldas, un mortal atrás carpado; entra por el extremo y cae de pie.', 119, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_half_turn_salto_fwd_tucked', 'beam', '1', 'G', null, '1.716', 'Entrada con rondada, medio giro y mortal adelante agrupado (Erceg)', 'Erceg', 'El despegue tras la rondada es hacia atrás, pero un medio giro (180°) al salir la pone de cara para un mortal adelante agrupado que acaba de pie. La rondada, en el extremo.', 117, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null),
  ('bb_mount_roundoff_salto_bwd_stretched_full_twist', 'beam', '1', 'G', null, '1.718', 'Entrada con rondada y mortal atrás extendido con pirueta', 'Mortal extendido con pirueta', 'Mortal atrás extendido con pirueta completa (360°), tras la rondada en el trampolín frente al extremo, y cae de pie en la barra.', 118, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 6, 'draft', null);

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
