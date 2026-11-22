-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 4.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 52 elementos (pommel_horse).
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
  ('mph_flair_or_circle_handstand_lower_to_flair_or_circle', 'pommel_horse', 'II', 'C', null, 'II.51', 'Flair o molino al pino y bajada a flair o molino', 'Tippelt', 'Sube al pino desde flair o molino y baja a flair o molino, en la combinación que quiera; con medio giro (180°) arriba vale lo mismo. Sube a D si gira 360° o más, casi todo sobre el cuerpo del caballo, o si recorre 3/3 con al menos 180° y una mano en cada extremo; con ambas cosas, E.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_flair_hop_travel_bwd_handstand_lower', 'pommel_horse', 'II', 'D', null, 'II.52', 'Saltito atrás al pino desde flair', 'Saltito atrás al pino desde flair', 'Termina bajando del pino a molino o de nuevo a flair; para llegar arriba, sale del flair con un saltito de manos hacia atrás. No vale si se nota mucha fuerza o una parada clara en el pino, ni si las piernas bajan más de 45° al subir.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_busnari_handstand_travel_3_3_turn_360_to_flair', 'pommel_horse', 'II', 'F', null, 'II.54', 'Pino girando 360° de un extremo al otro y bajada a flair', 'Busnari', 'Baja a flair tras girar 360° en el pino mientras recorre el caballo de un extremo al otro (3/3), adelante o atrás. Sube al pino con piernas abiertas desde Stöckli inverso, DSA o molino en un arco; de las variantes tipo Busnari solo cuenta una, la de más valor.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_double_rear_kehr', 'pommel_horse', 'II', 'A', null, 'II.55', 'Doble kehre (double rear)', 'Double rear', 'Dos kehres seguidas forman un único elemento, el double rear. Para que tenga valor, tiene que seguirle otro elemento de la tabla.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_kehr_270_one_pommel_cross_to_side', 'pommel_horse', 'II', 'B', null, 'II.56', 'Kehre con giro de 270° en un arco, de apoyo transversal a apoyo lateral', 'Kehre 270° de transversal a lateral', 'En un arco y con técnica Sohn, gira 270° con una kehre: entra en apoyo transversal y termina en apoyo lateral. Si arranca de pie y no desde molino, vale dos letras menos; como mucho cuentan dos elementos de tipo Sohn o Bezugo por ejercicio.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_kehr_270_one_pommel_side_to_cross', 'pommel_horse', 'II', 'C', null, 'II.57', 'Kehre de 270° en un arco hasta el apoyo transversal', 'Bertoncelj', 'Vale C por sí solo: con técnica Sohn, una kehre de 270° en un arco lleva del apoyo lateral al transversal. Si abre un flop o una combinación con rusa, va primero y seguido de un molino en el arco; con ese molino, el flop vale E (tres partes) o F (cuatro), y la combinación, de E a H.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_kehr_full_turn_one_pommel', 'pommel_horse', 'II', 'D', null, 'II.58', 'Kehre con giro completo (360°) en un arco', 'Sohn', 'Con las manos en los dos arcos, hace una kehre girando 360° sobre un solo arco y vuelve a apoyo facial con una mano en cada arco; si no acaba así, no vale. Empezando de pie y no desde molino, baja dos letras.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_bertoncelj_to_busnari', 'pommel_horse', 'II', 'F', null, 'II.60', 'Bertoncelj enlazado con Busnari', 'Moore', 'Encadena un Bertoncelj con un Busnari: tras la kehre de 270° en un arco sube al pino, recorre el caballo de un extremo al otro (3/3) girando 360° y baja a flair. Cuenta para el límite de elementos tipo Sohn o Bezugo, y de las variantes tipo Busnari solo vale la de más valor.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_direct_tramlot', 'pommel_horse', 'II', 'B', null, 'II.62', 'Tramlot directo', 'Tramlot directo', 'Es el Tramlot hecho de forma directa. Para que tenga valor, tiene que seguirle otro elemento de la tabla.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_bertoncelj_to_davtyan_one_pommel', 'pommel_horse', 'II', 'F', null, 'II.66', 'Bertoncelj enlazado con Davtyan en un arco', 'Mamukyan', 'Todo sobre un arco: enlaza un Bertoncelj (kehre de 270°) con un Davtyan (Stöckli inverso de 270°). Entra en el máximo de dos elementos de tipo Sohn o Bezugo por ejercicio.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_reverse_stockli_180_or_270', 'pommel_horse', 'II', 'B', null, 'II.68', 'Medio giro (180°) o 270° con Stöckli inverso', 'Stöckli inverso 180°/270°', 'Todo el giro cabe en un solo molino: medio giro (180°) con Stöckli inverso o, saliendo de un arco, 270°.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_reverse_stockli_270_two_pommels_to_cross_one_pommel', 'pommel_horse', 'II', 'C', null, 'II.69', 'Stöckli inverso de 270° de los dos arcos a apoyo transversal en un arco', 'Davtyan', 'Con técnica Bezugo, un Stöckli inverso de 270° lleva del apoyo en los dos arcos al transversal sobre uno; vale C por sí solo. Dentro de un flop o de una combinación con rusa va primero y seguido de un molino en el arco, que cuenta para el valor (flop E o F, combinación de E a H).', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_reverse_stockli_full_turn_one_pommel', 'pommel_horse', 'II', 'E', null, 'II.71', 'Stöckli inverso con giro completo (360°) en un arco', 'Bezugo', 'Giro completo (360°) sobre un solo arco con Stöckli inverso, saliendo con las manos en los dos arcos y volviendo a apoyo facial en ambos. Si no termina con las dos manos en los arcos no vale; empezando de pie, baja dos letras.', 52, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_schwabenflank', 'pommel_horse', 'II', 'A', null, 'II.73', 'Schwabenflank', 'Schwabenflank', 'Schwabenflank, elemento del grupo de molinos y flairs. Para que tenga valor, tiene que seguirle otro elemento de la tabla.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_czechkehre_on_pommels_or_one_pommel', 'pommel_horse', 'II', 'B', null, 'II.74', 'Kehre checa sobre los arcos o con un arco entre las manos', 'Kehre checa', 'Kehre checa hecha sobre los arcos; también vale con un solo arco entre las manos. Fuera de los arcos es otro elemento, el Pinheiro.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_czechkehre_outside_pommels', 'pommel_horse', 'II', 'D', null, 'II.76', 'Kehre checa fuera de los arcos', 'Pinheiro', 'Kehre checa con las manos fuera de los arcos, en el cuerpo del caballo. Sobre los arcos sería la kehre checa normal.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_wendeswing_fwd_half_turn_to_support_on_end', 'pommel_horse', 'II', 'A', null, 'II.79', 'Wende adelante con medio giro (180°) a apoyo facial en el extremo', 'Wende adelante con 180° al extremo', 'Acaba en apoyo facial en el extremo del caballo tras una wende adelante con medio giro (180°) desde apoyo lateral, piernas juntas. Puede usar un arco o los dos; el elemento termina cuando se detiene la acción de la wende.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_180_or_270', 'pommel_horse', 'II', 'A', null, 'II.85', 'Rusa de 180° o 270°', 'Rusa de 180°/270°', 'Molino ruso de 180° o de 270°, con las piernas juntas. Entra en el límite de dos rusas por ejercicio, salida incluida, y una segunda rusa en el mismo sitio (en el extremo o entre los arcos) cuenta como repetición.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_360_or_540', 'pommel_horse', 'II', 'A', null, 'II.91', 'Rusa de 360° o 540°', 'Rusa de 360°/540°', 'Rusa de una vuelta completa (360°) o de 540°, con piernas juntas: abrirlas se descuenta en cada vuelta completa. Para el límite de dos rusas por ejercicio, la salida se cuenta primero.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_720_or_900', 'pommel_horse', 'II', 'B', null, 'II.92', 'Rusa de 720° o 900°', 'Rusa de 720°/900°', 'Dos vueltas (720°) o dos y media (900°) de molino ruso. El elemento termina cuando para la acción de la wende; las combinaciones de flop y rusa en un arco no cuentan para el límite de rusas.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_1080_or_more', 'pommel_horse', 'II', 'C', null, 'II.93', 'Rusa de 1080° o más', 'Rusa de 1080° o más', 'Molino ruso de tres vueltas (1080°) o más, con piernas juntas; cada vuelta completa con las piernas abiertas se descuenta. Como todas las rusas, solo valen dos por ejercicio contando la salida.', 53, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_on_leather_180_or_270', 'pommel_horse', 'II', 'A', null, 'II.97', 'Rusa en el cuerpo del caballo, de 180° o 270°', 'Rusa de 180°/270° en el cuerpo', 'La de 270° también puede ir desplazándose; las dos se hacen con las manos en el cuerpo del caballo y piernas juntas, girando 180° o 270° de molino ruso.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_on_leather_360_or_540', 'pommel_horse', 'II', 'A', null, 'II.103', 'Rusa de 360° o 540° en el cuerpo del caballo', 'Rusa de 360°/540° en el cuerpo', 'Rusa de 360° o de 540° apoyando las manos en el cuerpo del caballo, piernas juntas. Una segunda rusa en el extremo o entre los arcos cuenta como repetición.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_on_leather_720_or_900', 'pommel_horse', 'II', 'B', null, 'II.104', 'Rusa de 720° o 900° en el cuerpo del caballo', 'Rusa de 720°/900° en el cuerpo', 'Sobre el cuerpo del caballo, dos vueltas de rusa (720°) o dos y media (900°). Acaba cuando para la wende y entra en el límite de dos rusas por ejercicio, salida incluida.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_on_leather_1080_or_more', 'pommel_horse', 'II', 'C', null, 'II.105', 'Rusa de 1080° o más en el cuerpo del caballo', 'Rusa de 1080° o más en el cuerpo', 'Tres vueltas de rusa (1080°) o más con las manos en el cuerpo del caballo. Las piernas van juntas: abrirlas resta en cada vuelta completa.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_one_pommel_or_between_180_or_270', 'pommel_horse', 'II', 'B', null, 'II.110', 'Rusa sobre un arco o entre los arcos, de 180° o 270°', 'Rusa 180°/270° en arco o entre arcos', 'Combinada sobre un arco sube de valor: con dos partes de flop vale D, y con un Bertoncelj o un Davtyan al principio, seguido de un molino en el arco, E; el DSA solo puede cerrar la serie. También se hace entre los arcos, siempre 180° o 270° con piernas juntas.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_one_pommel_or_between_360_or_540', 'pommel_horse', 'II', 'C', null, 'II.111', 'Rusa de 360° o 540° en un arco o entre los arcos', 'Rusa 360°/540° en arco o entre arcos', 'Entre los arcos o sobre uno solo, rusa de 360° o 540°. En un arco puede combinarse con el flop: con una parte vale D, con dos E, y tras Bertoncelj o Davtyan y un molino en el arco, F; para contar dos partes tienen que ser dos molinos seguidos.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_one_pommel_or_between_720_or_900', 'pommel_horse', 'II', 'D', null, 'II.112', 'Rusa de 720° o 900° en un arco o entre los arcos', 'Rusa 720°/900° en arco o entre arcos', 'Dos vueltas (720°) o dos y media (900°) de rusa sobre un arco o entre los arcos. Combinada en un arco sube a E con una parte de flop, a F con dos y a G tras Bertoncelj o Davtyan y un molino en el arco; solo vale una combinación así por ejercicio.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_russian_one_pommel_or_between_1080_or_more', 'pommel_horse', 'II', 'E', null, 'II.113', 'Rusa de 1080° o más en un arco o entre los arcos', 'Rusa 1080° o más en arco o entre arcos', 'Rusa de tres vueltas (1080°) o más, en un arco o entre los arcos. En un arco puede combinarse con partes de flop (F con una, G con dos, H si abre un Bertoncelj o Davtyan seguido de un molino en el arco); después de la combinación, en un arco solo cabe ya un elemento al pino.', 54, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_circles_travel_side_support_1_3', 'pommel_horse', 'III', 'A', null, 'III.1', 'Molinos con desplazamiento lateral de un tercio (1/3)', 'Desplazamiento lateral 1/3', 'En apoyo lateral, avanza de lado un tercio (1/3) del caballo mientras hace molinos, de cualquier forma. Puede acabar con un cuarto de giro (90°) sin que cambie el valor; cuenta como hecho en cuanto completa el desplazamiento.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_circles_travel_side_support_3_3', 'pommel_horse', 'III', 'B', null, 'III.2', 'Molinos con desplazamiento lateral de un extremo al otro (3/3)', 'Desplazamiento lateral 3/3', 'Recorre el caballo de un extremo al otro (3/3) en apoyo lateral haciendo molinos, con cualquier forma de desplazamiento. Basta con empezar en las zonas 1-2 y terminar en las 4-5.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_side_support_3_3_hands_between_pommels', 'pommel_horse', 'III', 'C', null, 'III.3', 'Desplazamiento lateral de un extremo al otro (3/3) apoyando entre los arcos', 'Desplazamiento lateral 3/3 entre arcos', 'De un extremo al otro (3/3) en apoyo lateral, apoyando las manos entre los arcos durante el recorrido; suele hacerse con molinos. Vale cualquier forma de desplazamiento.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_side_support_3_3_over_both_pommels', 'pommel_horse', 'III', 'D', null, 'III.4', 'Desplazamiento lateral de un extremo al otro (3/3) por encima de los dos arcos', 'Desplazamiento lateral 3/3 sobre arcos', 'Pasa por encima de los dos arcos en apoyo lateral, de un extremo al otro (3/3), y suele hacerse con molinos. Puede hacerse con saltitos de manos o sin ellos.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_circles_hop_travel_side_support_1_3', 'pommel_horse', 'III', 'B', null, 'III.8', 'Molinos con saltito de manos lateral de un tercio (1/3)', 'Saltito lateral 1/3', 'Con saltitos de manos, se desplaza de lado un tercio (1/3) en apoyo lateral mientras hace molinos. Vale cualquier forma de desplazamiento con saltito.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_circles_double_hop_travel_side_support_3_3', 'pommel_horse', 'III', 'C', null, 'III.9', 'Molinos con dos saltitos de manos de un extremo al otro (3/3)', 'Doble saltito lateral 3/3', 'Dos saltitos de manos le llevan de un extremo al otro (3/3) en apoyo lateral, haciendo molinos. Basta con empezar en las zonas 1-2 y llegar a las 4-5.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_yamawaki_hop_over_both_pommels_end_to_end', 'pommel_horse', 'III', 'E', null, 'III.11', 'Saltito de manos por encima de los dos arcos de un extremo al otro (3/3)', 'Yamawaki', 'Un único saltito de manos pasa por encima de los dos arcos: sale en apoyo lateral junto a un arco, con las dos manos en la zona 1, y llega con las dos a la zona 5, apoyado en el otro extremo.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_quarter_spindle_to_side_support_two_pommels', 'pommel_horse', 'III', 'B', null, 'III.14', 'Spindle de 90° desplazándose hasta los dos arcos', 'Desplazamiento con spindle de 90°', 'Acaba en apoyo lateral con una mano en cada arco después de desplazarse, adelante o atrás, con un cuarto de spindle (90°). Como todo desplazamiento con spindle, empieza en apoyo facial, ya sea en posición lateral o transversal.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_any_travel_half_spindle_side_support', 'pommel_horse', 'III', 'C', null, 'III.15', 'Cualquier desplazamiento con spindle de 180° en apoyo lateral', 'Desplazamiento con spindle de 180°', 'Medio spindle (180°) mientras se desplaza, de apoyo lateral a apoyo lateral. Vale cualquier forma de desplazamiento.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_double_half_spindle_end_to_end', 'pommel_horse', 'III', 'E', null, 'III.17', 'Desplazamiento de un extremo al otro (3/3) con dos spindles de 180°', 'Doble spindle de 180° 3/3', 'De un extremo al otro (3/3), de lado, encadena dos spindles de 180° hasta sumar 360°. Solo cuentan dos desplazamientos 3/3 con spindle por ejercicio.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_fwd_3_3_half_spindle_one_pommel_over_other', 'pommel_horse', 'III', 'D', null, 'III.22', 'Desplazamiento adelante 3/3 con spindle de 180° de un arco por encima del otro', 'Nin Reyes / Titov', 'Desde un arco, se desplaza adelante de un extremo al otro (3/3) pasando por encima del otro arco con medio spindle (180°). Nin Reyes y Titov suelen hacerse en molinos con piernas juntas; del estilo Nin Reyes solo cuenta una variante, la de más valor, y el Titov queda fuera de ese límite.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_3_3_over_both_pommels_half_spindle', 'pommel_horse', 'III', 'E', null, 'III.23', 'Desplazamiento 3/3 por encima de los dos arcos con spindle de 180°', 'Nin Reyes 2 / Keikha 4', 'Cruza por encima de los dos arcos de un extremo al otro (3/3) con medio spindle (180°). El Nin Reyes 2 suele ir en molinos con piernas juntas y entra en el límite de su estilo; el Keikha 4, en flair y con el cuerpo casi vertical, queda fuera de ese límite.', 55, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_flair_travel_3_3_full_spindle_within_2_circles', 'pommel_horse', 'III', 'E', null, 'III.29', 'Flair con desplazamiento 3/3 y spindle de 360° en dos molinos como máximo', 'Urzica 2 / Burkhart', 'En flair, recorre de un extremo al otro (3/3) y gira un spindle completo (360°) en dos molinos como mucho; vale cualquier forma de desplazamiento. Las formas Urzica 2 y Burkhart suelen llevar el cuerpo casi vertical.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_fwd_cross_support_half_or_2_3', 'pommel_horse', 'III', 'B', null, 'III.32', 'Desplazamiento adelante en apoyo transversal de 1/2 o 2/3', 'Transversal adelante 1/2 o 2/3', 'En apoyo transversal, avanza medio caballo (1/2) o dos tercios (2/3), y suele hacerse con molinos. Termina en cuanto se corta el desplazamiento o deja el apoyo transversal.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_fwd_cross_support_leather_pommel_pommel_leather', 'pommel_horse', 'III', 'C', null, 'III.33', 'Desplazamiento adelante 3/3 en apoyo transversal: cuerpo, arco, arco, cuerpo', 'Transversal adelante 1-2-4-5', 'Cruza hacia delante en apoyo transversal del cuerpo del caballo a un arco, al otro y al cuerpo del otro lado (zonas 1, 2, 4 y 5); suele ir con molinos. Solo cuentan dos desplazamientos transversales 3/3 por ejercicio.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_magyar_travel_fwd_cross_support_other_end', 'pommel_horse', 'III', 'D', null, 'III.34', 'Desplazamiento adelante en apoyo transversal de un extremo al otro', 'Desplazamiento Magyar', 'Del apoyo transversal en un extremo hasta el otro (3/3), hacia delante, con cualquier otro desplazamiento que no tenga nombre propio en la lista; suele ir en molinos. Puede compartir con el Sivado el molino de enlace (ambos valen D), que solo vale A si va completo de apoyo facial a apoyo facial.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_driggs_travel_fwd_cross_support_over_both_pommels', 'pommel_horse', 'III', 'E', null, 'III.35', 'Cruce adelante por encima de los dos arcos en apoyo transversal', 'Driggs', 'Pasar por encima de los dos arcos, con o sin saltito de manos, es lo que lo distingue: en apoyo transversal y hacia delante, va de un extremo al otro (3/3). Suele hacerse con molinos.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_bwd_cross_support_1_3', 'pommel_horse', 'III', 'A', null, 'III.37', 'Desplazamiento atrás en apoyo transversal de un tercio (1/3)', 'Transversal atrás 1/3', 'Un tercio (1/3) hacia atrás en apoyo transversal, de una parte del caballo o un arco a otra. Puede salir de apoyo dorsal en el extremo, mirando hacia fuera y con las dos manos en el cuerpo del caballo.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_bwd_cross_support_half_or_2_3', 'pommel_horse', 'III', 'B', null, 'III.38', 'Desplazamiento atrás en apoyo transversal de 1/2 o 2/3', 'Transversal atrás 1/2 o 2/3', 'Hacia atrás en apoyo transversal recorre medio caballo (1/2) o dos tercios (2/3), y suele hacerse con molinos. Vale salir en apoyo dorsal desde el extremo, mirando hacia fuera; termina si se interrumpe el recorrido.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_bwd_cross_support_leather_pommel_pommel_leather', 'pommel_horse', 'III', 'C', null, 'III.39', 'Desplazamiento atrás 3/3 en apoyo transversal: cuerpo, arco, arco, cuerpo', 'Transversal atrás 5-4-2-1', 'Recorrido completo (3/3) hacia atrás en apoyo transversal con las manos en las zonas 5, 4, 2 y 1: del cuerpo del caballo a los dos arcos y al cuerpo del otro lado. Puede empezar en apoyo dorsal en el extremo, mirando hacia fuera.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_sivado_travel_bwd_cross_support_other_end', 'pommel_horse', 'III', 'D', null, 'III.40', 'Desplazamiento atrás en apoyo transversal de un extremo al otro', 'Sivado', 'Hacia atrás, del apoyo transversal en un extremo al otro (3/3), con cualquier otro desplazamiento que no tenga nombre propio en la lista; suele hacerse con molinos. Puede compartir el molino de enlace con el Magyar y los dos valen D.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_travel_bwd_cross_support_over_both_pommels', 'pommel_horse', 'III', 'E', null, 'III.41', 'Desplazamiento atrás en apoyo transversal por encima de los dos arcos', 'Kurbanov / Reid', 'Pasa por encima de los dos arcos hacia atrás en apoyo transversal, de un extremo al otro (3/3), con o sin saltito. El Kurbanov suele hacerse en molinos, y el Reid, en flair con el cuerpo casi vertical.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null),
  ('mph_moguilny_kehre_fwd_reverse_stockli_kehre_fwd', 'pommel_horse', 'III', 'D', null, 'III.46', 'Kehre adelante, Stöckli inverso y kehre adelante', 'Moguilny', 'Kehre adelante, Stöckli inverso y otra kehre adelante, que suele ir de extremo a extremo con piernas juntas; no se le pueden añadir elementos para subir su valor. Desde apoyo transversal, también mirando hacia fuera, va de un extremo al otro (3/3) y el primer y el último giro son 90° más cortos.', 56, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 4, 'draft', null);

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
