-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 6.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 57 elementos (rings).
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
  ('mrg_l_sit_or_straddled_l_sit', 'rings', 'II', 'A', null, 'II.1', 'Ángulo con piernas juntas o abiertas', 'Ángulo', 'Posición de ángulo en las anillas, con las piernas juntas o abiertas, mantenida 2 segundos desde la parada completa. Para el Código, el ángulo y el ángulo con piernas verticales son posiciones distintas.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_v_sit', 'rings', 'II', 'B', null, 'II.2', 'Ángulo con piernas verticales', 'Ángulo piernas verticales', 'Las piernas tienen que llegar a la vertical: si se quedan cortas descuenta según el ángulo, y pasados 45° deja de reconocerse. Se mantiene 2 segundos con parada visible y cuenta como posición distinta del ángulo normal.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_inverted_cross', 'rings', 'II', 'D', null, 'II.4', 'Cristo invertido', 'Cristo invertido', 'Cabeza abajo y brazos en cruz: los 2 segundos empiezan a contar cuando el cuerpo está parado del todo. Doblar los brazos mientras la mantiene descuenta y, si es mucho, la anula.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_back_lever', 'rings', 'II', 'A', null, 'II.7', 'Plancha dorsal', 'Plancha dorsal', 'Posición colgada, con el cuerpo horizontal en plancha dorsal durante 2 segundos. Cada agarre falso descuenta, y doblar los brazos mientras la aguanta, también.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_planche', 'rings', 'II', 'C', null, 'II.9', 'Plancha', 'Plancha', 'A diferencia de la plancha con piernas abiertas, aquí las piernas van juntas y el cuerpo, recto, aguanta 2 segundos en apoyo. Solo se reconoce si los hombros quedan del todo por encima de las anillas.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_swallow', 'rings', 'II', 'D', null, 'II.10', 'Golondrina (cruz de Malta, Hirondelle)', 'Golondrina', 'También llamada cruz de Malta o Hirondelle, es una plancha con el cuerpo recto y horizontal a la altura de las anillas, mantenida 2 segundos. Si los brazos abiertos rozan el cuerpo descuenta poco; si el cuerpo se apoya en ellos, más.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_inverted_swallow', 'rings', 'II', 'E', null, 'II.11', 'Golondrina invertida', 'Golondrina invertida', 'Dos segundos quieto en golondrina invertida, con los brazos extendidos. Cada agarre falso descuenta, y si la posición se desvía más de 45° no se reconoce.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_front_lever', 'rings', 'II', 'A', null, 'II.13', 'Plancha facial en suspensión', 'Plancha facial', 'Colgado de las anillas, el cuerpo queda horizontal en plancha facial durante 2 segundos. Entre 5° y 45° de desviación descuenta según el ángulo; a partir de 45°, no cuenta.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_any_or_v_cross', 'rings', 'II', 'C', null, 'II.15', 'Cristo, cristo en ángulo o cristo con piernas verticales', 'Cristo', 'Vale cualquier forma de cristo, también en ángulo o con las piernas verticales (en ese caso, verticales de verdad), mantenida 2 segundos. Llegar directamente desde la suspensión dorsal no le cambia el valor: sigue siendo una C.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_straddled_planche', 'rings', 'II', 'A', null, 'II.19', 'Plancha con piernas abiertas', 'Plancha con piernas abiertas', 'Con las piernas separadas, la plancha se aguanta 2 segundos en apoyo. Vale si los hombros quedan del todo por encima de las anillas, y unos brazos algo abiertos o unas manos giradas hacia fuera no le cambian el valor.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_tsukahara_3_v_cross_press_to_v_sit', 'rings', 'II', 'D', null, 'II.22', 'Tsukahara 3: del cristo con piernas verticales al ángulo con piernas verticales', 'Tsukahara 3', 'Termina en ángulo con piernas verticales (2 s) tras subir a fuerza desde el cristo con las piernas también verticales. Ese cristo tiene que reconocerse con parada, y si la subida no recorre más de la anchura de un cuerpo, solo cuenta la posición final.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_colak_pull_up_straight_arms_to_v_cross', 'rings', 'II', 'E', null, 'II.23', 'Colak: elevación con brazos extendidos al cristo con piernas verticales', 'Colak', 'Cristo con las piernas verticales, verticales de verdad, al que se llega con los brazos extendidos tirando desde la suspensión, que suele ser el punto de partida.', 68, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_press_bent_body_bent_arms_to_handstand', 'rings', 'II', 'A', null, 'II.25', 'Subida a fuerza al pino con cuerpo y brazos flexionados', 'Fuerza al pino flexionada', 'Pino mantenido 2 segundos al que se sube a fuerza con el cuerpo y los brazos flexionados, normalmente desde el apoyo, con piernas juntas o abiertas. Controlarlo con piernas o pies en los cables lo anula; un roce mínimo del antebrazo con las cintas no descuenta.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_press_to_handstand_mixed_body_arm_or_from_straddle_planche', 'rings', 'II', 'B', null, 'II.26', 'Subida a fuerza al pino con brazos o cuerpo flexionados, o desde la plancha abierta', 'Fuerza al pino mixta', 'Hay tres caminos al pino, que se mantiene 2 segundos: brazos flexionados con el cuerpo extendido, brazos extendidos con el cuerpo flexionado, o desde la plancha con piernas abiertas, que entonces tiene que reconocerse con parada. Piernas juntas o abiertas.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_press_straight_from_support_or_planche_to_handstand', 'rings', 'II', 'C', null, 'II.27', 'Subida a fuerza al pino con brazos y cuerpo extendidos', 'Fuerza al pino extendida', 'El pino se mantiene 2 segundos y se alcanza sin doblar nada: brazos y cuerpo extendidos en toda la subida a fuerza. Vale salir del apoyo o de una plancha; en ese caso, la plancha tiene que haberse reconocido con parada.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_press_straight_from_swallow_to_handstand', 'rings', 'II', 'D', null, 'II.28', 'Subida a fuerza de la golondrina al pino', 'Golondrina al pino', 'Acaba en pino (2 s) subiendo a fuerza con brazos y cuerpo extendidos desde la golondrina, que antes ha tenido que reconocerse con parada. Si la subida no recorre más de la anchura de un cuerpo, solo se cuenta el pino.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_slow_roll_fwd_piked_bent_arms_to_support', 'rings', 'II', 'A', null, 'II.31', 'Voltereta adelante lenta carpada con brazos flexionados al apoyo', 'Voltereta adelante lenta carpada', 'Lenta y con el cuerpo carpado: voltereta adelante con los brazos flexionados que termina en apoyo y suele empezar también en apoyo.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_slow_roll_fwd_straight_bent_arms_to_support', 'rings', 'II', 'B', null, 'II.32', 'Voltereta adelante lenta extendida con brazos flexionados al apoyo', 'Voltereta adelante lenta extendida', 'Aquí el cuerpo va extendido: voltereta adelante lenta con los brazos flexionados, de apoyo a apoyo como lo habitual.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_slow_roll_bwd_straight_to_l_sit', 'rings', 'II', 'B', null, 'II.38', 'Voltereta atrás lenta extendida al ángulo', 'Voltereta atrás lenta al ángulo', 'Termina en ángulo, mantenido 2 segundos, tras una voltereta atrás lenta con el cuerpo extendido. Tiene que ir lenta y extendida todo el tiempo; si no, descuenta y puede no reconocerse.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_slow_roll_fwd_straight_to_cross_or_l_cross', 'rings', 'II', 'C', null, 'II.39', 'Voltereta adelante lenta extendida al cristo o al cristo en ángulo', 'Voltereta adelante lenta al cristo', 'Cristo o cristo en ángulo, mantenido 2 segundos, como final de una voltereta adelante lenta con el cuerpo extendido que suele salir del apoyo. Perder la lentitud o doblar el cuerpo descuenta y puede dejarla sin reconocer.', 69, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_pull_up_bent_arms_to_back_lever', 'rings', 'II', 'B', null, 'II.50', 'Elevación con brazos flexionados a la plancha dorsal', 'Elevación flexionada a plancha dorsal', 'Aquí se puede tirar con los brazos flexionados hasta la plancha dorsal, que se mantiene 2 segundos y normalmente sale de la suspensión. Lo que no puede doblarse más de 45° es el cuerpo.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_pull_up_straight_arms_to_back_lever', 'rings', 'II', 'C', null, 'II.51', 'Elevación con brazos extendidos a la plancha dorsal', 'Elevación extendida a plancha dorsal', 'Los brazos van extendidos mientras el gimnasta tira desde la suspensión hasta la plancha dorsal, que aguanta 2 segundos. Flexionarlos más de 45° deja el elemento sin reconocer.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_azarian_slow_roll_bwd_to_cross', 'rings', 'II', 'D', null, 'II.52', 'Azarian: voltereta atrás lenta extendida al cristo', 'Azarian', 'Acaba en cristo, mantenido 2 segundos, normal, en ángulo o con piernas verticales, tras una voltereta atrás lenta con el cuerpo extendido que suele empezar en suspensión. La forma con las piernas verticales es, probablemente, la que se conoce como Tay.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_move_fwd_to_back_lever', 'rings', 'II', 'B', null, 'II.56', 'Del cristo a la plancha dorsal', 'Cristo a plancha dorsal', 'Pasa del cristo, normal o en ángulo, a la plancha dorsal llevando el cuerpo hacia delante, y la mantiene 2 segundos con parada visible.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_pull_up_to_l_sit', 'rings', 'II', 'C', null, 'II.57', 'Elevación al ángulo', 'Elevación al ángulo', 'Desde la suspensión, el gimnasta tira hasta quedar en ángulo y lo aguanta 2 segundos. Si casi todo el trabajo lo hace el impulso, no vale como este elemento.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_nakayama_back_lever_pull_to_cross', 'rings', 'II', 'D', null, 'II.58', 'Nakayama: de la plancha dorsal al cristo', 'Nakayama', 'Lo que la distingue es el paso lento por una plancha dorsal completa; sin él, descuenta y puede no reconocerse. Desde ella, o atravesándola, tira hasta cualquier forma de cristo y la mantiene 2 segundos. La forma con piernas verticales es, probablemente, la conocida como Ng Kiu Chung.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_zahran_back_lever_pull_through_cross_to_inverted_swallow', 'rings', 'II', 'F', null, 'II.60', 'Zahran: de la plancha dorsal a la golondrina invertida pasando por el cristo', 'Zahran', 'Golondrina invertida mantenida 2 segundos como final: pasando por la plancha dorsal, el gimnasta tira con el cuerpo extendido y atraviesa el cristo antes de llegar a ella.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_handstand_lower_to_back_lever', 'rings', 'II', 'B', null, 'II.62', 'Del pino a la plancha dorsal', 'Pino a plancha dorsal', 'Plancha dorsal mantenida 2 segundos, alcanzada bajando desde el pino hasta la horizontal.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_li_xiaoshuang_lower_to_hang_pull_to_cross', 'rings', 'II', 'C', null, 'II.63', 'Li Xiaoshuang: bajada lenta a la suspensión y tirón al cristo', 'Li Xiaoshuang', 'Acaba en cristo (2 s) después de bajar despacio hasta la suspensión y volver a subir tirando con los brazos extendidos. Puede salir del apoyo o de un cristo; en ese caso, el primer cristo tiene que reconocerse con parada.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_pull_up_to_cross_or_l_cross', 'rings', 'II', 'D', null, 'II.64', 'Elevación al cristo o al cristo en ángulo', 'Elevación al cristo', 'Tirando despacio desde la suspensión, el gimnasta llega al cristo o al cristo en ángulo y lo mantiene 2 segundos. Cada agarre falso descuenta.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_van_gelder_lower_to_back_lever_press', 'rings', 'II', 'E', null, 'II.65', 'Van Gelder: bajada lenta por la plancha dorsal y subida a fuerza a golondrina o plancha', 'Van Gelder', 'Pasa por la plancha dorsal entre una plancha o golondrina y otra: baja despacio en horizontal, vuelve a subir a fuerza y mantiene 2 segundos la posición final. Valen plancha a golondrina, golondrina a plancha y plancha a plancha; la de salida tiene que reconocerse con parada.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_tulloch_2_pull_up_through_cross_to_inverted_swallow', 'rings', 'II', 'G', null, 'II.66', 'Tulloch 2: elevación con brazos extendidos a la golondrina invertida pasando por el cristo', 'Tulloch 2', 'La golondrina invertida final (2 s) llega tras una elevación lenta con los brazos extendidos que sale de la suspensión y pasa por el cristo.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_handstand_lower_through_inverted_cross_to_inverted_hang', 'rings', 'II', 'B', null, 'II.68', 'Del pino a la suspensión invertida pasando por el cristo invertido', 'Pino a suspensión invertida', 'Termina en suspensión invertida: el gimnasta deja el pino y baja despacio, atravesando el cristo invertido.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_swallow_press_to_planche', 'rings', 'II', 'D', null, 'II.70', 'Subida a fuerza de la golondrina a la plancha', 'Golondrina a plancha', 'Sube a fuerza desde la golondrina hasta la plancha y la mantiene 2 segundos, con los hombros del todo por encima de las anillas. La golondrina de partida tiene que reconocerse con parada; si el recorrido no supera la anchura de un cuerpo, solo cuenta la plancha.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_swallow_lower_to_back_lever_press_to_swallow', 'rings', 'II', 'E', null, 'II.71', 'De la golondrina a la golondrina pasando por la plancha dorsal', 'Golondrina a golondrina', 'Sale de la golondrina y vuelve a ella: baja despacio, pasa por la plancha dorsal y sube a fuerza hasta mantenerla otra vez 2 segundos. La primera golondrina tiene que reconocerse con parada.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_zanetti_back_lever_press_to_swallow_or_planche', 'rings', 'II', 'F', null, 'II.72', 'Zanetti: de la plancha dorsal a la golondrina o la plancha', 'Zanetti', 'Termina en golondrina o en plancha (2 s) subiendo a fuerza desde la plancha dorsal, que antes ha tenido que reconocerse con parada visible. Si la subida no recorre más de la anchura de un cuerpo, solo cuenta la posición final.', 70, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_press_to_l_sit', 'rings', 'II', 'C', null, 'II.75', 'Subida a fuerza del cristo al ángulo', 'Cristo a ángulo', 'Del cristo, normal o en ángulo, sube a fuerza hasta el ángulo y lo mantiene 2 segundos; el cristo previo debe reconocerse con parada.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_l_cross_press_bent_body_to_inverted_cross', 'rings', 'II', 'E', null, 'II.77', 'Subida a fuerza con cuerpo flexionado del cristo en ángulo al cristo invertido', 'Cristo en ángulo a cristo invertido', 'Con el cuerpo flexionado, sube a fuerza del cristo en ángulo al cristo invertido y lo mantiene 2 segundos. Si el cristo en ángulo no se reconoce con parada, la subida no vale.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_press_straight_body_to_inverted_cross', 'rings', 'II', 'F', null, 'II.78', 'Subida a fuerza con cuerpo extendido del cristo al cristo invertido', 'Cristo a cristo invertido', 'Cuerpo extendido en la subida a fuerza del cristo al cristo invertido, que se mantiene 2 segundos. Si se hace casi entera con impulso no cuenta como este elemento, y si sube más de 45° por encima del cristo invertido tampoco, aunque esa posición final aún puede valer.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_swallow_press_to_inverted_cross', 'rings', 'II', 'F', null, 'II.84', 'Subida a fuerza de la golondrina al cristo invertido', 'Golondrina a cristo invertido', 'Llega al cristo invertido (2 s) subiendo a fuerza desde la golondrina, que tiene que reconocerse antes con parada visible.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_press_to_planche', 'rings', 'II', 'D', null, 'II.88', 'Subida a fuerza del cristo a la plancha', 'Cristo a plancha', 'Sin pasar por el apoyo, sube a fuerza del cristo a la plancha y la mantiene 2 segundos, con los hombros del todo por encima de las anillas. Doblar los brazos en la subida descuenta y puede anularla.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cross_press_to_swallow', 'rings', 'II', 'E', null, 'II.89', 'Subida a fuerza del cristo a la golondrina', 'Cristo a golondrina', 'Termina en golondrina, horizontal y a la altura de las anillas, tras subir a fuerza desde el cristo. Ese cristo debe reconocerse con parada; si el cuerpo se apoya en los brazos, descuenta.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_carmona_press_to_inverted_cross', 'rings', 'II', 'G', null, 'II.90', 'Carmona: subida a fuerza extendida al cristo invertido pasando por la suspensión dorsal', 'Carmona', 'Cristo invertido (2 s) al que se sube a fuerza con el cuerpo extendido, pasando por la suspensión dorsal.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_vorobiov_zou_inverted_cross_lower_felge_to_cross', 'rings', 'II', 'D', null, 'II.94', 'Vorobiov / Zou: del cristo invertido, bajada y felga atrás lenta al cristo', 'Vorobiov/Zou', 'Acaba en cristo, mantenido 2 segundos, y eso la separa de la versión que termina en golondrina o plancha. Antes baja despacio desde el cristo invertido, que tiene que reconocerse con parada, hasta la suspensión invertida, y sube con una felga atrás lenta.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_jotchev_inverted_cross_lower_felge_to_swallow_or_planche', 'rings', 'II', 'E', null, 'II.95', 'Del cristo invertido, bajada y felga atrás lenta a la golondrina o la plancha', 'Cristo invertido a golondrina o plancha', 'Termina en golondrina o en plancha (2 s): baja despacio desde el cristo invertido, pasa por la suspensión invertida y sube con una felga atrás lenta. Hacia la golondrina se conoce como Jotchev; hacia la plancha, como Zou 2.', 71, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_yan_mijayoung_slow_roll_bwd_to_free_planche', 'rings', 'II', 'E', null, 'II.101', 'Yan Mijayoung: voltereta atrás lenta extendida a la plancha libre', 'Yan Mijayoung', 'Acaba en plancha libre (2 s), con los hombros del todo por encima de las anillas, tras una voltereta atrás lenta con brazos y cuerpo extendidos; lo normal es arrancar en suspensión.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_slow_roll_bwd_to_swallow', 'rings', 'II', 'E', null, 'II.107', 'Voltereta atrás lenta extendida a la golondrina', 'Voltereta atrás lenta a golondrina', 'Termina en golondrina (2 s) tras una voltereta atrás lenta con el cuerpo extendido, que suele arrancar en suspensión. Si la voltereta no es lenta y extendida de principio a fin, descuenta y puede no reconocerse.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_simonov_slow_roll_bwd_through_swallow_to_inverted_cross', 'rings', 'II', 'F', null, 'II.108', 'Simonov: voltereta atrás lenta extendida al cristo invertido pasando por la golondrina', 'Simonov', 'Acaba en cristo invertido, mantenido 2 segundos, después de pasar por la golondrina en una voltereta atrás lenta con brazos y cuerpo extendidos que suele empezar en suspensión.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_ng_kiu_chung_2_roll_fwd_through_cross_press_to_planche', 'rings', 'II', 'D', null, 'II.118', 'Ng Kiu Chung 2: voltereta adelante lenta por el cristo y subida a fuerza a la plancha', 'Ng Kiu Chung 2', 'Plancha final (2 s) tras una voltereta adelante lenta con el cuerpo extendido que pasa por el cristo y sube a fuerza sin pasar por el apoyo.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_wynn_slow_roll_fwd_through_cross_to_inverted_cross', 'rings', 'II', 'E', null, 'II.119', 'Wynn: voltereta adelante lenta extendida al cristo invertido pasando por el cristo', 'Wynn', 'Cristo invertido mantenido 2 segundos como remate de una voltereta adelante lenta y extendida que pasa por el cristo.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_tulloch_azarian_to_inverted_swallow', 'rings', 'II', 'F', null, 'II.120', 'Tulloch: voltereta atrás lenta extendida a la golondrina invertida', 'Tulloch', 'La voltereta atrás lenta y extendida es la del Azarian, pero aquí termina en golondrina invertida, mantenida 2 segundos.', 72, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_davtyan_slow_roll_fwd_to_cross_or_l_cross', 'rings', 'II', 'D', null, 'II.124', 'Davtyan: voltereta adelante lenta extendida al cristo o al cristo en ángulo', 'Davtyan', 'Cristo o cristo en ángulo (2 s) al final de una voltereta adelante lenta con el cuerpo extendido, que suele salir de la suspensión; también vale empezar en suspensión invertida.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_pham_2_slow_roll_fwd_through_cross_to_swallow', 'rings', 'II', 'E', null, 'II.125', 'Pham 2: voltereta adelante lenta extendida a la golondrina pasando por el cristo', 'Pham 2', 'Golondrina (2 s) al final de una voltereta adelante lenta que pasa por el cristo con el cuerpo extendido.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_cingolani_pull_up_to_support_press_to_handstand', 'rings', 'II', 'D', null, 'II.130', 'Cingolani: elevación al apoyo y subida a fuerza al pino', 'Cingolani', 'Desde la suspensión se eleva hasta el apoyo y, sin doblar brazos ni cuerpo en la subida, sigue a fuerza hasta el pino, que mantiene 2 segundos. Controlarlo con piernas o pies en los cables lo anula, igual que caer del pino.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_balandin_1_pull_up_to_swallow', 'rings', 'II', 'F', null, 'II.132', 'Balandin 1: elevación a la golondrina', 'Balandin 1', 'Golondrina (2 s) a la que se llega elevándose desde la suspensión. Si en la subida pasa más de 45° por encima de la golondrina, no cuenta como este elemento, aunque la golondrina aún puede valer.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_balandin_3_pull_up_through_swallow_to_planche', 'rings', 'II', 'E', null, 'II.137', 'Balandin 3: elevación a la plancha pasando por la golondrina', 'Balandin 3', 'La plancha (2 s) llega al final de una elevación desde la suspensión que pasa por la golondrina. Los hombros tienen que quedar del todo por encima de las anillas.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null),
  ('mrg_balandin_2_pull_up_to_inverted_cross', 'rings', 'II', 'G', null, 'II.138', 'Balandin 2: elevación al cristo invertido', 'Balandin 2', 'El cristo invertido, mantenido 2 segundos, se alcanza con una elevación desde la suspensión. Doblar los brazos en la subida descuenta y puede anularla.', 73, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 6, 'draft', null);

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
