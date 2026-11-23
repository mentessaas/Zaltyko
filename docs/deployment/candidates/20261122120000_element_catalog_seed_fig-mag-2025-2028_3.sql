-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 3.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 47 elementos (pommel_horse).
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
  ('mph_scissor_fwd', 'pommel_horse', 'I', 'A', null, 'I.1', 'Tijera adelante', 'Tijera adelante', 'Las piernas se cruzan hacia delante en un balanceo amplio: se espera que suban por encima de la línea de los hombros y que se separen mucho.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_fwd_travel_sideways', 'pommel_horse', 'I', 'B', null, 'I.2', 'Tijera adelante con desplazamiento lateral', 'Tijera adelante desplazada', 'Mientras cruza las piernas hacia delante, el gimnasta avanza de lado por el caballo. Cuenta igual si la tijera lleva además medio giro (180°).', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_fwd_hop_sideways_end_to_end', 'pommel_horse', 'I', 'C', null, 'I.3', 'Tijera adelante con saltitos de manos de un extremo al otro (3/3)', 'Tijera adelante 3/3', 'Recorre el caballo de un extremo al otro (3/3) a base de saltitos de manos, sin dejar de hacer tijeras adelante. En apoyo lateral basta con salir de las zonas 1-2 y llegar a las 4-5.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_fwd_half_turn', 'pommel_horse', 'I', 'A', null, 'I.7', 'Tijera adelante con medio giro (180°)', 'Tijera adelante con 180°', 'Un medio giro (180°) del cuerpo acompaña a la tijera adelante, sin perder altura ni separación de piernas.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_double_scissor_fwd', 'pommel_horse', 'I', 'B', null, 'I.8', 'Doble tijera adelante', 'Doble tijera adelante', 'Un solo elemento con dos cambios de piernas hacia delante; cada cambio va acompañado de un cuarto de giro (90°), uno adelante y otro atrás.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_double_scissor_fwd_travel_sideways', 'pommel_horse', 'I', 'C', null, 'I.9', 'Doble tijera adelante con desplazamiento lateral', 'Doble tijera adelante desplazada', 'Avanza de lado por el caballo durante la doble tijera adelante, cuyos dos cambios de piernas llevan su cuarto de giro (90°) adelante y atrás. Para no perder nota, se espera que las piernas suban por encima de la línea de los hombros.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_double_scissor_fwd_sideways_end_to_end', 'pommel_horse', 'I', 'D', null, 'I.10', 'Doble tijera adelante de un extremo al otro (3/3)', 'Mikulak', 'Todo el caballo, de un extremo al otro (3/3), recorrido de lado sin salir de la doble tijera adelante. Si una pierna se apoya en el caballo antes de terminar, no cuenta.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_double_scissor_fwd_travel_through_handstand', 'pommel_horse', 'I', 'C', null, 'I.15', 'Doble tijera adelante con desplazamiento lateral pasando por el pino', 'Stepanyan', 'Pasa por el pino en plena doble tijera adelante mientras se desplaza de lado. Las piernas tienen que cerrarse arriba y ninguna puede pasar entre los arcos; girar en el pino no sube el valor.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_leg_cut_or_undercut_bwd_through_handstand', 'pommel_horse', 'I', 'B', null, 'I.20', 'Corte atrás o corte por debajo pasando por el pino', 'Corte atrás al pino', 'Un corte hacia atrás lleva al pino y desde ahí baja al apoyo con las piernas abiertas. Vale lo mismo si la entrada es un corte por debajo.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_fwd_quarter_turn_handstand_one_pommel', 'pommel_horse', 'I', 'D', null, 'I.22', 'Tijera adelante al pino en un arco', 'Li Ning', 'Solo vale si cambia de pierna y de brazo o de arco, con un pino en un solo arco de por medio: entra desde la tijera adelante con un cuarto de giro (90°) y vuelve al apoyo sobre el otro brazo, piernas abiertas. La forma con giro en el pino se conoce como Bryan.', 48, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_bwd', 'pommel_horse', 'I', 'A', null, 'I.25', 'Tijera atrás', 'Tijera atrás', 'Es la tijera hacia atrás: en cada balanceo las piernas se cruzan y se separan mucho, con el cuerpo bien alto.', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_bwd_travel_sideways', 'pommel_horse', 'I', 'B', null, 'I.26', 'Tijera atrás con desplazamiento lateral', 'Tijera atrás desplazada', 'Cruza las piernas hacia atrás a la vez que se desplaza de lado por el caballo; también vale si añade medio giro (180°).', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_bwd_hop_sideways_end_to_end', 'pommel_horse', 'I', 'C', null, 'I.27', 'Tijera atrás con saltitos de manos de un extremo al otro (3/3)', 'Tijera atrás 3/3', 'De las zonas 1-2 a las 4-5: así cruza el caballo de un extremo al otro (3/3), con saltitos de manos y tijeras atrás. En apoyo lateral esas zonas de salida y llegada son suficientes.', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_scissor_bwd_half_turn', 'pommel_horse', 'I', 'A', null, 'I.31', 'Tijera atrás con medio giro (180°)', 'Tijera atrás con 180°', 'Medio giro (180°) del cuerpo durante la tijera atrás, manteniendo las piernas altas y abiertas.', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_double_scissor_bwd', 'pommel_horse', 'I', 'B', null, 'I.32', 'Doble tijera atrás', 'Doble tijera atrás', 'Las piernas cambian dos veces hacia atrás dentro del mismo elemento, y esos cambios se acompañan de un cuarto de giro (90°) adelante y otro atrás.', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_swing_bwd_quarter_turn_handstand_one_pommel', 'pommel_horse', 'I', 'C', null, 'I.39', 'Balanceo atrás al pino en un arco', 'Balanceo atrás al pino en un arco', 'Termina en apoyo con las piernas abiertas tras un pino en un solo arco, al que entra con un balanceo atrás y un cuarto de giro (90°); puede añadir otro cuarto al salir del pino. Tiene que cambiar de pierna y de brazo o de arco.', 49, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_or_flair_side_support', 'pommel_horse', 'II', 'A', null, 'II.1', 'Molino o flair en apoyo lateral', 'Molino en apoyo lateral', 'Molino con piernas juntas en apoyo lateral; la forma con piernas abiertas, el flair, se conoce como Thomas. Puede acabar con un cuarto de giro (90°) sin que cambie el valor, y de dos iguales seguidos solo cuenta el primero.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_side_support_outside_or_between_pommels', 'pommel_horse', 'II', 'B', null, 'II.2', 'Molino en apoyo lateral fuera de los arcos o entre ellos', 'Molino lateral fuera o entre arcos', 'El apoyo queda en el cuerpo del caballo, fuera de los arcos, o entre los dos arcos mientras hace el molino en apoyo lateral. No se admite la posición oblicua y una desviación de más de 45° le quita el valor.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_cross_support_frontways_on_end', 'pommel_horse', 'II', 'A', null, 'II.7', 'Molino en apoyo transversal facial en el extremo', 'Molino transversal facial', 'En un extremo del caballo y en apoyo transversal facial, completa un molino, que puede cerrar con un cuarto de giro (90°) sin cambiar de valor.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_cross_support_one_pommel', 'pommel_horse', 'II', 'B', null, 'II.8', 'Molino en apoyo transversal en un arco', 'Molino transversal en un arco', 'Molino en un solo arco, en apoyo transversal, que puede formar parte de un flop (con 3 partes vale D y con 4, E). Admite un cuarto de giro (90°) adelante al entrar o al salir, y subir al arco, con o sin él, cuenta como este elemento y como inicio del flop.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_cross_support_rearways_on_end', 'pommel_horse', 'II', 'A', null, 'II.13', 'Molino en apoyo transversal dorsal en el extremo', 'Molino transversal dorsal', 'De espaldas a los arcos, en apoyo transversal dorsal sobre un extremo del caballo, hace el molino. Si dos iguales van seguidos, solo se cuenta el primero.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_circle_cross_support_between_pommels', 'pommel_horse', 'II', 'B', null, 'II.14', 'Molino en apoyo transversal entre los arcos', 'Molino transversal entre arcos', 'Molino en apoyo transversal entre los dos arcos. El cuerpo no puede quedar oblicuo: si se desvía más de 45°, no vale.', 50, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_quarter', 'pommel_horse', 'II', 'A', null, 'II.25', 'Spindle de cuarto de giro (90°)', 'Spindle de 90°', 'El cuerpo gira un cuarto (90°) sin dejar de molinear en el mismo sitio. Vale en cualquier forma, y el elemento termina en cuanto se detiene el giro.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_half', 'pommel_horse', 'II', 'B', null, 'II.26', 'Spindle de medio giro (180°)', 'Spindle de 180°', 'Medio giro (180°) del cuerpo mientras molinea en el sitio, en cualquier forma. La forma en flair con los dos arcos entre las manos se conoce como Keikha 2.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_side_support_pommel_between_hands_straddle', 'pommel_horse', 'II', 'D', null, 'II.28', 'Spindle completo (360°) en apoyo lateral con un arco entre las manos y piernas abiertas', 'Spindle de 360° en apoyo lateral', 'Con un arco entre las manos y las piernas abiertas, gira 360° partiendo de apoyo lateral. Tiene que completarlo en dos molinos como máximo (tres apoyos faciales después del inicio) y puede ir en el mismo ejercicio que el Magyar.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_side_support_hand_other_side_return', 'pommel_horse', 'II', 'E', null, 'II.29', 'Spindle completo (360°) en apoyo lateral con apoyo de mano al otro lado y regreso', 'Eichorn', 'En apoyo lateral, el flair se convierte en un giro completo (360°): apoya una mano al otro lado y regresa. Vale también en molino con piernas juntas, siempre en dos flairs o molinos como máximo.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_both_pommels_between_hands', 'pommel_horse', 'II', 'F', null, 'II.30', 'Spindle completo (360°) con los dos arcos entre las manos', 'Keikha 1 / Keikha 5', 'Los dos arcos quedan entre las manos mientras el cuerpo da un giro completo (360°) en spindle: en flair es el Keikha 1 y con piernas juntas, el Keikha 5. Solo puntúan dos spindles completos por ejercicio.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_on_end_max_2_circles', 'pommel_horse', 'II', 'D', null, 'II.34', 'Spindle completo (360°) en el extremo en dos molinos como máximo', 'Magyar', 'En el extremo del caballo, el cuerpo da un giro completo (360°) mientras hace molinos y tiene que cerrarlo en dos como máximo. Se puede usar en el mismo ejercicio que el spindle con un arco entre las manos (II.28).', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_on_pommels_max_2_circles', 'pommel_horse', 'II', 'E', null, 'II.35', 'Spindle completo (360°) sobre los arcos', 'Berki', 'Sobre los arcos, gira 360° en no más de dos molinos, con las piernas abiertas o juntas.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_spindle_full_cross_support_hands_between_pommels', 'pommel_horse', 'II', 'F', null, 'II.36', 'Spindle completo (360°) en apoyo transversal con las manos entre los arcos', 'Mousichidis', 'Las manos van entre los arcos y el gimnasta, partiendo de apoyo transversal, completa un giro de 360° en dos molinos como máximo.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dsa_on_pommels_or_one_pommel', 'pommel_horse', 'II', 'B', null, 'II.38', 'DSA sobre los arcos o en un arco', 'DSA', 'Puede hacerse sobre los dos arcos o en uno solo, con el arco entre las manos, y siempre entra y sale con un cuarto de giro (90°). Es el Stöckli directo A: en un flop o en una serie combinada con rusa solo puede ir al final.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dsa_outside_pommels', 'pommel_horse', 'II', 'D', null, 'II.40', 'DSA fuera de los arcos', 'Keikha 3', 'DSA en el cuerpo del caballo, fuera de los arcos, con su cuarto de giro (90°) de entrada y de salida. La versión en flair se conoce como Keikha 6.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dsb', 'pommel_horse', 'II', 'B', null, 'II.44', 'DSB (Stöckli directo B) hasta apoyo lateral facial en un arco', 'DSB', 'Termina en apoyo lateral facial sobre un arco tras el Stöckli directo B. Puede formar parte de un flop o combinarse con rusas en un arco; si se repite dos veces seguidas, solo cuenta la primera.', 51, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_wende_on_end_from_circle', 'pommel_horse', 'IV', 'A', null, 'IV.1', 'Salida wende en el extremo desde molino', 'Wende en el extremo', 'Desde un molino en el extremo, pasa las piernas por encima del caballo con una wende y cae de pie en la colchoneta. También vale tras una rusa de 180° o 270°; si empieza en apoyo transversal mirando hacia fuera, la rusa debe acabar antes de la wende.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_chaguinian_to_wende', 'pommel_horse', 'IV', 'B', null, 'IV.2', 'Salida Chaguinian a wende', 'Chaguinian a wende', 'Un Chaguinian enlaza con la wende y el gimnasta cae de pie en la colchoneta. Antes de caer, el cuerpo debería subir al menos 30° por encima de la línea de los hombros.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_side_support_end_handstand_travel_3_3_turn_450', 'pommel_horse', 'IV', 'D', null, 'IV.4', 'Salida al pino de un extremo al otro (3/3) con giro de 450° o más', 'Kolyvanov', 'Cae a lo largo del caballo, junto al último apoyo de manos, después de cruzarlo entero (3/3) por el pino y girando 450° o más. Empieza en molino o en flair, en apoyo lateral sobre un extremo, y necesita apoyar una mano en cada extremo.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_dsa_handstand_travel_3_3_turn_450', 'pommel_horse', 'IV', 'E', null, 'IV.5', 'Salida DSA al pino con desplazamiento 3/3 y giro de 450°', 'DSA al pino 3/3 con 450°', 'Giro de 450° y recorrido de un extremo al otro (3/3) en una salida que empieza con DSA y pasa por el pino. La mayor parte del giro tiene que hacerse sobre el cuerpo del caballo; girar más no sube el valor.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_russian_on_end_360_540', 'pommel_horse', 'IV', 'A', null, 'IV.7', 'Salida con rusa de 360° o 540° en el extremo', 'Rusa de 360°/540° de salida', 'Rusa de 360° o 540° con las piernas juntas en el extremo del caballo, hasta caer de pie. Entra en el máximo de dos rusas por ejercicio, contando la salida.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_russian_on_end_720_900', 'pommel_horse', 'IV', 'B', null, 'IV.8', 'Salida con rusa de 720° o 900° en el extremo', 'Rusa de 720°/900° de salida', 'En el extremo, con piernas juntas, encadena una rusa de 720° o de 900° y cae de pie. Una segunda rusa en el extremo se toma como repetición, y se cuenta primero la de salida.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_russian_on_end_1080_plus', 'pommel_horse', 'IV', 'C', null, 'IV.9', 'Salida con rusa de 1080° o más en el extremo', 'Rusa de 1080° de salida', 'La rusa de salida en el extremo llega aquí a 1080° o más, siempre con las piernas juntas y terminando de pie en la colchoneta.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_circle_quarter_turn_russian_270_handstand', 'pommel_horse', 'IV', 'D', null, 'IV.10', 'Salida con rusa de 270° en un arco al pino', 'Dolidze', 'Cae de pie después de subir al pino desde una rusa de 270° en un solo arco. A esa rusa se llega desde un molino sobre los arcos con un cuarto de giro (90°).', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_wendeswing_fwd_half_turn_then_wende', 'pommel_horse', 'IV', 'A', null, 'IV.13', 'Salida wende tras balanceo wende adelante con medio giro (180°)', 'Wende con 180° de salida', 'La wende de salida, que deja al gimnasta de pie en la colchoneta, llega después de un balanceo wende adelante con medio giro (180°) que lo devuelve al apoyo. Se hace con piernas juntas, partiendo de apoyo lateral.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_one_pommel_through_handstand', 'pommel_horse', 'IV', 'C', null, 'IV.15', 'Salida desde DSA, Stöckli inverso o molino en un arco pasando por el pino', 'Salida al pino (DSA, Stöckli o molino)', 'Sale por el pino y cae a lo largo del caballo, junto al último apoyo, desde un DSA, un Stöckli inverso o un molino en un arco. Sube a D con giro de 450° o desplazamiento 3/3, y a E con ambos; el 3/3 pide al menos 270° de giro.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_dsa_hop_bwd_handstand_other_end', 'pommel_horse', 'IV', 'D', null, 'IV.16', 'Salida DSA con saltito de manos atrás al pino en el otro extremo', 'Jessen / Loos', 'El pino llega en el otro extremo del caballo: tras el DSA, un saltito de manos hacia atrás lo lleva hasta allí, cruza por encima del cuerpo del caballo y cae de pie a lo largo, junto al último apoyo.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_circle_or_flair_through_handstand', 'pommel_horse', 'IV', 'B', null, 'IV.20', 'Salida de molino o flair pasando por el pino', 'Salida al pino', 'Desde molino o flair pasa por el pino, cruza por encima del cuerpo del caballo y cae junto al último apoyo de manos. Admite un giro de 270°, con o sin desplazamiento; sube a C con 450° o 3/3 y a D con ambos.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_circle_or_flair_hop_travel_bwd_handstand', 'pommel_horse', 'IV', 'C', null, 'IV.21', 'Salida de molino o flair con saltito de manos atrás al pino', 'Salida al pino con saltito atrás', 'Un saltito de manos hacia atrás desplaza el pino en esta salida, que empieza en molino o en flair. Con giro de 450° o recorrido 3/3 vale D, y con las dos cosas, E; una recepción atípica se descuenta como fallo de giro.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date),
  ('mph_dismount_russian_180_end_to_end_through_handstand', 'pommel_horse', 'IV', 'D', null, 'IV.22', 'Salida con rusa de 180° de un extremo al otro (3/3) pasando por el pino', 'Rusa de 180° 3/3 al pino', 'Desde un extremo, una rusa de 180° con piernas juntas lo lleva hasta el otro (3/3) y sale por el pino. La forma que parte de un Bertoncelj al pino se conoce como Targhetta.', 59, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 3, 'reviewed', '2026-11-23'::date);

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
