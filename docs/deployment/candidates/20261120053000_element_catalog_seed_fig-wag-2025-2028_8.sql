-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 8.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 53 elementos (beam).
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
  ('bb_kneel_sit_body_wave_rise_through_releve', 'beam', '4', 'A', null, '4.101', 'Subida con onda corporal desde sentada de rodillas', 'Onda desde rodillas', 'Una onda corporal acompaña la subida desde sentada de rodillas; a mitad de camino pasa por relevé y acaba erguida, con los brazos arriba. Cuenta como elemento de danza.', 131, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_needle_scale_hand_support_hold', 'beam', '4', 'A', null, '4.102', 'Aguja y otros equilibrios mantenidos sobre una pierna', 'Aguja', 'Cuenta como elemento de danza y se aguanta 2 s en cualquiera de sus tres formas: aguja (split de 180° con manos en la barra delante del pie), pie libre sujeto por delante encima de la cabeza, o balanza adelante en split (180°) con la pierna de apoyo estirada. Solo vale la primera que se haga.', 131, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_kick_handstand_hold_lower_touch_beam', 'beam', '4', 'A', null, '4.103', 'Vertical sostenida dos segundos', 'Vertical mantenida', 'Lo que cuenta es aguantar 2 segundos en la vertical, de lado o de través. Llega impulsando una pierna desde el fondo y luego desciende hasta quedar otra vez en contacto con la barra.', 132, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_bwd_hand_support_to_feet', 'beam', '4', 'A', null, '4.105', 'Voltereta atrás con apoyo de manos', 'Voltereta atrás', 'Las manos, apoyadas encima de la barra, ayudan a rodar hacia atrás hasta caer sobre un pie o los dos.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_cartwheel', 'beam', '4', 'A', null, '4.107', 'Rueda con apoyo de manos', 'Rueda', 'Pasa de lado por las manos, las dos sobre la barra y sin vuelo. Una sola mano no cambia el valor, ni tampoco que haya fase de vuelo al entrar o al salir del apoyo.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_walkover_fwd', 'beam', '4', 'A', null, '4.108', 'Arco adelante (walkover)', 'Arco adelante', 'Desde el fondo pasa por una vertical con piernas abiertas y acaba sobre una pierna con la otra estirada. Valen igual la tinsica, con las manos una tras otra, y el tic-tac: arco adelante y arco atrás encadenados, cambiando de sentido.', 134, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_walkover_bwd', 'beam', '4', 'A', null, '4.109', 'Arco atrás (walkover)', 'Arco atrás', 'Acaba en fondo sobre una pierna después de pasar hacia atrás por una vertical con piernas abiertas. Cuenta igual con las manos una tras otra o bajando las piernas hasta sentada de través.', 135, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_clear_pike_support_hold', 'beam', '4', 'B', null, '4.202', 'Escuadra sin tocar la barra con las piernas, mantenida', 'Escuadra', 'Solo las manos tocan la barra: piernas juntas en carpado, subidas casi en vertical junto a la cara, mantenidas 2 segundos.', 131, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_kick_cross_handstand_roll_fwd', 'beam', '4', 'B', null, '4.203', 'Voltereta adelante desde vertical de través', 'Vertical a voltereta', 'Lo que la separa de otras volteretas es que nace de una vertical de través: queda sentada o en cuclillas tras rodar hacia delante, con o sin manos, después de subir a esa vertical impulsando una pierna desde el fondo.', 132, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_fwd_no_hands', 'beam', '4', 'B', null, '4.204', 'Voltereta adelante sin apoyo de manos', 'Voltereta adelante sin manos', 'Las manos no tocan la barra al rodar hacia delante y acaba sentada o en cuclillas. La otra forma, con apoyo de manos, sale de sentada de través: piernas atrás, rueda por los hombros abriendo la cadera y termina igual, sentada o en cuclillas.', 132, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_swd_through_neck_stand', 'beam', '4', 'B', null, '4.206', 'Voltereta lateral por apoyo de nuca', 'Voltereta lateral por la nuca', 'El paso por el apoyo sobre la nuca es lo que la define; la voltereta va de lado y el cuerpo puede ir agrupado, abierto o extendido. Si añade medio giro (180°) sobre el hombro, cuenta lo mismo.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_swd_piked_straddle_hands', 'beam', '4', 'B', null, '4.207', 'Voltereta lateral carpada con piernas abiertas con manos', 'Voltereta lateral carpada', 'Rueda de lado en carpado con las piernas abiertas, apoyando las manos en la barra; suele partir tumbada con las piernas abiertas y el final es libre.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_walkover_fwd_one_arm', 'beam', '4', 'B', null, '4.208', 'Arco adelante a un brazo', 'Arco adelante a una mano', 'Igual que el arco adelante, pero apoyando un solo brazo; sale del fondo y acaba sobre una pierna.', 134, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_walkover_bwd_one_arm', 'beam', '4', 'B', null, '4.209', 'Arco atrás a un brazo', 'Arco atrás a una mano', 'Un solo brazo sostiene el arco atrás, que termina sobre una pierna.', 135, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_valdez', 'beam', '4', 'B', null, '4.210', 'Valdez: arco atrás desde sentada', 'Valdez (Garrison)', 'Sentada con una pierna flexionada y la otra estirada, lleva un brazo atrás y pasa por la vertical con piernas abiertas hasta quedar sobre una pierna. Vale igual la Garrison: desde sentada pasa atrás sobre un brazo por el plano horizontal, sin llegar a la vertical.', 135, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_free_shoulder_roll_fwd_hip_extension', 'beam', '4', 'C', null, '4.304', 'Voltereta de hombros sin manos', 'Voltereta de hombros', 'Sin ayudarse de las manos, rueda hacia delante sobre los hombros abriendo la cadera y queda sentada o en cuclillas. Normalmente parte sentada y apoya el pecho en la barra antes de rodar.', 132, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_bwd_to_handstand_lower', 'beam', '4', 'C', null, '4.305', 'Vertical desde voltereta atrás', 'Voltereta atrás a vertical', 'Rodando hacia atrás con las manos en la barra sube hasta la vertical, y desde arriba baja hasta apoyarse de nuevo en la barra. Suele empezar en cuclillas y sentarse antes de rodar.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_swd_stretched_no_hands', 'beam', '4', 'C', null, '4.306', 'Voltereta lateral extendida sin manos', 'Voltereta lateral extendida', 'Cuerpo extendido y sin manos, gira de lado sobre la barra.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_roll_swd_straddle_from_cross_sit_no_hands', 'beam', '4', 'C', null, '4.307', 'Voltereta lateral con piernas abiertas sin manos desde sentada', 'Voltereta lateral abierta sin manos', 'Desde sentada de través, piernas abiertas y sin manos, gira de lado y termina como quiera. También cuenta desde split lateral, y extendida desde cualquiera de las dos.', 133, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_kick_cross_handstand_half_turn_walkover_fwd', 'beam', '4', 'C', null, '4.308', 'Vertical de través con medio giro a arco adelante', 'Vertical con giro a arco adelante', 'Gira medio giro (180°) en la vertical de través, a la que sube desde el fondo, y baja en arco adelante sobre una pierna. Cuenta igual un arco adelante de lado que acaba de pie de lado.', 134, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_walkover_bwd_half_turn_walkover_fwd', 'beam', '4', 'C', null, '4.309', 'Arco atrás, medio giro y arco adelante', 'Arco atrás con giro a arco adelante', 'Un medio giro (180°) en la vertical une un arco atrás con un arco adelante, que termina sobre una pierna. Cuentan igual el arco atrás hecho de lado, con final de pie de lado, y el que pasa una pierna entre las manos hasta sentarse en split a lo largo de la barra.', 135, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_valdez_full_turn_lower', 'beam', '4', 'C', null, '4.310', 'Valdez con giro completo en vertical', 'Valdez con giro', 'Sobre la vertical de la Valdez añade un giro completo (360°) en dos medios giros, y después baja hasta apoyarse de nuevo en la barra.', 135, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_aerial_walkover_fwd_half_twist', 'beam', '6', 'A', null, '6.101', 'Salida en paloma sin manos con media pirueta', 'Paloma sin manos con media pirueta', 'Cae de pie en el suelo tras una paloma sin manos con media pirueta (180°) en el aire. Sale desde el extremo de la barra.', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_fwd_tucked_or_piked', 'beam', '6', 'A', null, '6.102', 'Salida en mortal adelante agrupado o carpado', 'Mortal adelante', 'Un mortal adelante, agrupado o carpado, sin pirueta, desde el extremo de la barra hasta el suelo. Cuenta igual con media pirueta (180°).', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_bwd_tucked_piked_or_stretched', 'beam', '6', 'A', null, '6.104', 'Mortal atrás de salida', 'Mortal atrás', 'Sale por el extremo de la barra con un mortal atrás sin pirueta, en cualquiera de las tres formas: agrupado, carpado o extendido. Añadir media pirueta (180°), en agrupado o extendido, no cambia el número.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_side', 'beam', '6', 'A', null, '6.106', 'Salida en gainer cayendo al lado de la barra', 'Gainer al lado de la barra', 'Despega de la barra lanzando una pierna y cae de pie en el suelo, al lado de la barra, tras un mortal atrás tipo gainer agrupado, carpado o extendido, sin pirueta. Con media pirueta (180°), agrupado o extendido, cuenta igual.', 146, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_aerial_walkover_fwd_full_twist', 'beam', '6', 'B', null, '6.201', 'Salida en paloma sin manos con pirueta completa', 'Paloma sin manos con pirueta', 'Pirueta completa (360°) dentro de una paloma sin manos, desde el extremo, hasta el suelo. En la misma casilla y con el mismo valor está la rueda sin manos con media pirueta (180°).', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_fwd_stretched', 'beam', '6', 'B', null, '6.202', 'Salida en mortal adelante extendido', 'Mortal adelante extendido', 'El mortal adelante va extendido y sin pirueta; también vale con media pirueta (180°). Con el mismo valor y en la misma casilla, el mortal adelante agrupado con pirueta completa (360°).', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_arabian_salto_fwd_tucked_or_piked', 'beam', '6', 'B', null, '6.203', 'Mortal árabe de salida', 'Mortal árabe', 'Lo que lo distingue es la media pirueta (180°) al despegar: deja la barra hacia atrás, gira y hace un mortal adelante agrupado o carpado. Sale por el extremo.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_bwd_full_twist', 'beam', '6', 'B', null, '6.204', 'Salida en mortal atrás con pirueta completa', 'Mortal atrás con pirueta', 'Mortal atrás agrupado o extendido con una pirueta completa (360°), saliendo desde el extremo.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_full_twist_side', 'beam', '6', 'B', null, '6.206', 'Salida en gainer con pirueta cayendo al lado de la barra', 'Gainer al lado con pirueta', 'Gainer con pirueta completa (360°), agrupado o extendido: lanza una pierna, salta desde la barra y aterriza a su lado.', 146, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_tucked_or_piked_end', 'beam', '6', 'B', null, '6.207', 'Salida en gainer desde el extremo, agrupado o carpado', 'Gainer en el extremo', 'En el extremo de la barra, lanza una pierna y hace un gainer agrupado o carpado, sin pirueta, hasta el suelo.', 147, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_aerial_walkover_fwd_one_half_twist', 'beam', '6', 'C', null, '6.301', 'Salida en paloma sin manos con pirueta y media', 'Paloma sin manos con pirueta y media', 'Pirueta y media (540°) en una paloma sin manos; sale desde el extremo y cae de pie.', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_fwd_stretched_full_twist', 'beam', '6', 'C', null, '6.302', 'Salida en mortal adelante extendido con pirueta completa', 'Mortal adelante con pirueta', 'Cae de pie tras un mortal adelante extendido con pirueta completa (360°) desde el extremo. Cuenta igual con pirueta y media (540°).', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_stretched_jump_full_twist_salto_fwd_tucked_or_piked', 'beam', '6', 'C', null, '6.303', 'Pirueta en salto extendido y mortal adelante', 'Salto con pirueta a mortal adelante', 'El mortal adelante, agrupado o carpado, llega después de una pirueta completa (360°) hecha en un salto extendido. Sale por el extremo y cae de pie.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_bwd_one_half_twist', 'beam', '6', 'C', null, '6.304', 'Salida en mortal atrás con pirueta y media', 'Mortal atrás con pirueta y media', 'Mortal atrás agrupado o extendido con pirueta y media (540°), desde el extremo; el agrupado es el Domingues. Con el mismo valor, en la misma casilla, va la doble pirueta (720°), y su forma agrupada es la Mordenti.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_one_half_twist_side', 'beam', '6', 'C', null, '6.306', 'Gainer con pirueta y media cayendo al lado de la barra', 'Gainer al lado con pirueta y media', 'Cae al lado de la barra tras saltar de ella lanzando una pierna: mortal gainer atrás agrupado o extendido con pirueta y media (540°); el extendido es el Bohmerova. También cuenta con doble pirueta (720°), sin ese nombre.', 146, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_stretched_end', 'beam', '6', 'C', null, '6.307', 'Salida en gainer extendido desde el extremo', 'Gainer extendido (Kim con pirueta)', 'Gainer extendido con las piernas juntas, sin pirueta, saliendo por el extremo. En la misma casilla y con el mismo valor está la Kim: gainer agrupado con pirueta completa (360°).', 147, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_fwd_stretched_double_twist', 'beam', '6', 'D', null, '6.402', 'Araujo: salida en mortal adelante extendido con doble pirueta', 'Araujo', 'Doble pirueta (720°) en un mortal adelante extendido, desde el extremo hasta el suelo.', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_stretched_jump_full_twist_salto_fwd_stretched', 'beam', '6', 'D', null, '6.403', 'Salida en salto extendido con pirueta y mortal adelante extendido', 'Salto con pirueta a mortal extendido', 'Como el salto extendido con pirueta completa (360°) seguido de mortal adelante, pero con el mortal también extendido.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_bwd_stretched_two_half_twist', 'beam', '6', 'D', null, '6.404', 'Salida en mortal atrás extendido con dos piruetas y media', 'Mortal atrás con 2 piruetas y media', 'Dos piruetas y media (900°) en un mortal atrás extendido, saliendo desde el extremo.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_double_salto_bwd_tucked', 'beam', '6', 'D', null, '6.405', 'Salida en doble mortal atrás agrupado', 'Doble mortal atrás agrupado', 'Dos mortales atrás agrupados, sin pirueta, desde el extremo de la barra hasta el suelo.', 145, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_stretched_two_half_twist_side', 'beam', '6', 'D', null, '6.406', 'Khorkina: gainer extendido con dos piruetas y media, cayendo al lado de la barra', 'Khorkina', 'Gainer extendido con dos piruetas y media (900°): salta de la barra lanzando una pierna y cae de pie a un lado de ella.', 146, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_stretched_full_twist_end', 'beam', '6', 'D', null, '6.407', 'Steingruber: salida en gainer extendido desde el extremo con pirueta', 'Steingruber (Olafsdottir)', 'Gainer extendido con pirueta completa (360°) desde el extremo. Con el mismo valor, en la misma casilla, la Olafsdottir: gainer agrupado con pirueta y media (540°).', 147, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_aerial_cartwheel_into_salto_bwd_tucked', 'beam', '6', 'E', null, '6.501', 'Kim: salida en rueda sin manos a mortal atrás agrupado', 'Kim (rueda sin manos a mortal)', 'Desde el extremo, enlaza directamente una rueda sin manos con un mortal atrás agrupado, sin pirueta.', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_double_salto_bwd_piked', 'beam', '6', 'E', null, '6.505', 'Salida en doble mortal atrás carpado', 'Doble mortal atrás carpado', 'Doble mortal atrás con los dos mortales carpados y sin pirueta, saliendo desde el extremo.', 145, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_stretched_double_twist_end', 'beam', '6', 'E', null, '6.507', 'Jurkowska-Kowalska: salida en gainer extendido desde el extremo con doble pirueta', 'Jurkowska-Kowalska', 'En el extremo, gainer extendido lanzando una pierna, con doble pirueta (720°).', 147, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_double_salto_fwd_tucked', 'beam', '6', 'F', null, '6.602', 'Salida en doble mortal adelante agrupado', 'Doble mortal adelante', 'Cae de pie tras dos mortales adelante agrupados, sin pirueta, desde el extremo.', 143, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_salto_bwd_stretched_triple_twist', 'beam', '6', 'F', null, '6.604', 'Salida en mortal atrás extendido con triple pirueta', 'Mortal atrás con triple pirueta', 'Mortal atrás extendido con triple pirueta (1080°), saliendo desde el extremo de la barra.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_gainer_salto_stretched_triple_twist_side', 'beam', '6', 'F', null, '6.606', 'Gainer extendido con triple pirueta cayendo al lado de la barra', 'Gainer al lado con triple pirueta', 'Triple pirueta (1080°) en un gainer extendido; lanza una pierna, deja la barra y cae al suelo junto a ella.', 146, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_arabian_double_salto_fwd_tucked', 'beam', '6', 'G', null, '6.703', 'Patterson: salida en doble mortal árabe agrupado', 'Patterson', 'Doble árabe: salta hacia atrás, media pirueta (180°) en el salto y dos mortales adelante agrupados hasta el suelo.', 144, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_double_salto_bwd_tucked_or_piked_full_twist', 'beam', '6', 'G', null, '6.705', 'Salida en doble mortal atrás con pirueta completa', 'Doble mortal atrás con pirueta', 'Doble mortal atrás agrupado o carpado con una pirueta completa (360°).', 145, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null),
  ('bb_dismount_double_salto_bwd_tucked_double_twist', 'beam', '6', 'H', null, '6.805', 'Biles: salida en doble mortal atrás agrupado con doble pirueta', 'Biles', 'Doble pirueta (720°) en un doble mortal atrás agrupado, saliendo desde el extremo hasta el suelo.', 145, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 8, 'draft', null);

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
