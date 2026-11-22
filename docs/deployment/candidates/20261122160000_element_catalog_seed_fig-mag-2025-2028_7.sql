-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 7.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 54 elementos (rings).
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
  ('mrg_uprise_fwd_to_l_sit', 'rings', 'III', 'B', null, 'III.2', 'Subida adelante desde el vuelo al ángulo', 'Subida adelante al ángulo', 'Acaba quieto en ángulo, con los brazos extendidos, tras una subida adelante desde el vuelo en suspensión. Puede contar junto a la subida adelante al ángulo en V, que es otra posición final, pero no junto a la Kippe al ángulo: las dos acaban igual y solo se reconoce una.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_fwd_to_v_sit', 'rings', 'III', 'C', null, 'III.3', 'Subida adelante desde el vuelo al ángulo en V', 'Subida adelante al ángulo en V', 'Las piernas tienen que quedar verticales: la subida adelante desde el vuelo en suspensión termina en ángulo en V, mantenido 2 segundos con los brazos extendidos. Al ser una posición final distinta del ángulo, es compatible con la subida adelante al ángulo.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_fwd_to_v_cross', 'rings', 'III', 'D', null, 'III.4', 'Subida adelante desde el vuelo al cristo en V', 'Subida adelante al cristo en V', 'Termina en cristo con las piernas subidas hasta la vertical, el cristo en V, al que llega con una subida adelante desde el vuelo en suspensión y los brazos extendidos.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_kip_to_l_sit', 'rings', 'III', 'B', null, 'III.8', 'Kippe desde la suspensión al ángulo', 'Kippe al ángulo', 'Una Kippe desde la suspensión que acaba sentado en ángulo, con los brazos extendidos. El ángulo en V es otra posición final, así que la Kippe al ángulo en V es un elemento distinto.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_kip_to_v_sit', 'rings', 'III', 'C', null, 'III.9', 'Kippe desde la suspensión al ángulo en V', 'Kippe al ángulo en V', 'Piernas en vertical al final: desde la suspensión, una Kippe con los brazos extendidos sube al ángulo en V. Es otra posición final que el ángulo, así que puede reconocerse junto a la Kippe al ángulo.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_honma_to_l_sit', 'rings', 'III', 'B', null, 'III.14', 'Honma desde el vuelo al ángulo', 'Honma al ángulo', 'Llega al ángulo con un Honma desde el vuelo en suspensión, brazos extendidos y parada de 2 segundos. Pasar antes por el apoyo y subir luego las piernas al ángulo es un error de composición de 0,3.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_gracia_honma_to_v_sit', 'rings', 'III', 'C', null, 'III.15', 'Honma desde el vuelo al ángulo en V', 'Gracia', 'Un Honma desde el vuelo en suspensión que termina en ángulo en V, con las piernas verticales y los brazos extendidos durante 2 segundos.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_honma_to_cross_or_l_cross', 'rings', 'III', 'D', null, 'III.16', 'Honma desde el vuelo al cristo o al cristo en ángulo', 'Honma al cristo', 'Remata en cristo o en cristo en ángulo, a elegir, tras un Honma desde el vuelo en suspensión. Para el cómputo, cristo, cristo en ángulo y cristo en V son una misma familia de posición final.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_tanaka_honma_to_v_cross', 'rings', 'III', 'E', null, 'III.17', 'Honma desde el vuelo al cristo en V', 'Tanaka', 'Honma rematado en cristo en V: tras el vuelo en suspensión, queda en cristo con las piernas levantadas hasta la vertical y los brazos extendidos.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_swing_bwd_salto_fwd_piked_to_cross_or_l_cross', 'rings', 'III', 'D', null, 'III.22', 'Vuelo atrás y mortal adelante carpado al cristo o al cristo en ángulo', 'Mortal adelante carpado al cristo', 'Del vuelo atrás en suspensión sale un mortal adelante carpado que termina en cristo o en cristo en ángulo, a elegir.', 74, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_fwd_to_cross_or_l_cross', 'rings', 'III', 'C', null, 'III.27', 'Subida adelante desde el vuelo al cristo o al cristo en ángulo', 'Subida adelante al cristo', 'Una subida adelante con balanceo en suspensión lleva al cristo; acabar en cristo en ángulo cuenta igual.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_bwd_to_cross_or_l_cross', 'rings', 'III', 'C', null, 'III.33', 'Subida atrás desde el vuelo al cristo o al cristo en ángulo', 'Subida atrás al cristo', 'Cristo o cristo en ángulo al final de una subida atrás desde el vuelo en suspensión, con los brazos extendidos.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_kip_to_cross_or_l_cross', 'rings', 'III', 'C', null, 'III.39', 'Kippe desde la suspensión al cristo o al cristo en ángulo', 'Kippe al cristo', 'Kippe desde la suspensión hasta el cristo o el cristo en ángulo. Doblar los brazos en el impulso hacia la parada se descuenta según cuánto, y si la flexión es grande el elemento no vale.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_molinari_kip_to_v_cross', 'rings', 'III', 'D', null, 'III.40', 'Kippe desde la suspensión al cristo en V', 'Molinari', 'Kippe desde la suspensión que sube al cristo con las piernas en vertical (cristo en V), manteniéndolo 2 segundos.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_kip_to_inverted_swallow', 'rings', 'III', 'F', null, 'III.42', 'Kippe desde la suspensión a la golondrina invertida', 'Kippe a golondrina invertida', 'Desde la suspensión, una Kippe con los brazos extendidos termina en golondrina invertida.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_back_kip_to_cross_or_l_cross', 'rings', 'III', 'C', null, 'III.45', 'Kippe atrás desde la suspensión al cristo o al cristo en ángulo', 'Kippe atrás al cristo', 'Kippe atrás desde la suspensión hasta el cristo; terminarla en cristo en ángulo vale lo mismo.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_back_kip_to_support_scale', 'rings', 'III', 'D', null, 'III.46', 'Kippe atrás desde la suspensión a la plancha', 'Kippe atrás a plancha', 'Plancha como final de una Kippe atrás desde la suspensión, con los brazos extendidos.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_back_kip_to_swallow', 'rings', 'III', 'E', null, 'III.47', 'Kippe atrás desde la suspensión a la golondrina', 'Kippe atrás a golondrina', 'Acaba en golondrina tras una Kippe atrás desde la suspensión, y la aguanta 2 segundos.', 75, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_deltchev_felge_upward_to_straddled_support_legs_above_rings', 'rings', 'III', 'B', null, 'III.50', 'Felga desde el vuelo al apoyo con piernas abiertas sobre las anillas', 'Deltchev', 'Felga desde el vuelo en suspensión que acaba en apoyo con las piernas abiertas y descansando por encima de las anillas.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_back_kip_to_inverted_cross', 'rings', 'III', 'E', null, 'III.53', 'Kippe atrás desde la suspensión al cristo invertido', 'Kippe atrás al cristo invertido', 'Cristo invertido al final de una Kippe atrás que arranca de la suspensión, con los brazos extendidos.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_upward_to_straddled_support_scale', 'rings', 'III', 'B', null, 'III.56', 'Felga desde el vuelo a la plancha con piernas abiertas', 'Felga a plancha abierta', 'Felga desde el vuelo en suspensión hasta la plancha con piernas abiertas, con brazos extendidos y 2 segundos de parada. Plancha y plancha con piernas abiertas forman una misma familia de posición final.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_upward_to_cross_or_l_cross', 'rings', 'III', 'C', null, 'III.57', 'Felga desde el vuelo al cristo o al cristo en ángulo', 'Felga al cristo', 'Balanceándose en suspensión, hace una felga que termina en cristo o en cristo en ángulo.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_upward_to_support_scale', 'rings', 'III', 'D', null, 'III.58', 'Felga desde el vuelo a la plancha', 'Felga a plancha', 'Plancha con el cuerpo recto y horizontal al final de una felga con balanceo en suspensión. Hacer el vuelo con fuerza en vez de impulso se descuenta.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_upward_to_swallow', 'rings', 'III', 'E', null, 'III.59', 'Felga desde el vuelo a la golondrina', 'Felga a golondrina', 'Felga desde el vuelo en suspensión hasta quedar en golondrina, con los brazos extendidos.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_rodrigues_uprise_fwd_to_inverted_swallow', 'rings', 'III', 'F', null, 'III.60', 'Subida adelante desde el vuelo a la golondrina invertida', 'Rodrigues', 'Subida adelante desde el vuelo en suspensión que acaba en golondrina invertida, con los brazos extendidos y 2 segundos de parada. Cada vez que aparezca el agarre falso en la parada se restan 0,1.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_upward_to_inverted_cross', 'rings', 'III', 'E', null, 'III.65', 'Felga desde el vuelo al cristo invertido', 'Felga al cristo invertido', 'Cristo invertido al que se llega con una felga desde el vuelo en suspensión. Flexionar los brazos durante la parada se descuenta y, si la flexión es grande, el elemento no vale.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_bwd_to_straddled_support_scale', 'rings', 'III', 'B', null, 'III.68', 'Subida atrás desde el vuelo a la plancha con piernas abiertas', 'Subida atrás a plancha abierta', 'Subida atrás desde el vuelo en suspensión que termina en plancha con las piernas abiertas.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_bwd_to_support_scale', 'rings', 'III', 'D', null, 'III.70', 'Subida atrás desde el vuelo a la plancha', 'Subida atrás a plancha', 'Subida atrás desde el vuelo en suspensión que acaba en plancha; la misma subida a la plancha con piernas abiertas es otro elemento.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_bwd_to_swallow', 'rings', 'III', 'E', null, 'III.71', 'Subida atrás desde el vuelo a la golondrina', 'Subida atrás a golondrina', 'La subida atrás, con balanceo en suspensión, acaba en golondrina mantenida 2 segundos.', 76, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_uprise_bwd_to_inverted_cross', 'rings', 'III', 'E', null, 'III.77', 'Subida atrás desde el vuelo al cristo invertido', 'Subida atrás al cristo invertido', 'Subida atrás desde el vuelo en suspensión hasta el cristo invertido. Aunque no se reconozca o quede fuera de los 8 que cuentan, sigue sumando para el tope de tres elementos seguidos de los grupos II y III.', 77, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_felge_bwd_straight_to_free_support_scale', 'rings', 'III', 'D', null, 'III.82', 'Felga atrás extendida desde la suspensión a la plancha libre', 'Felga atrás a plancha libre', 'Felga atrás extendida desde la suspensión que termina en plancha libre.', 77, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_fwd_piked_or_stretched_opt_half_twist', 'rings', 'IV', 'A', null, 'IV.1', 'Salida en mortal adelante carpado o extendido', 'Mortal adelante', 'Mortal adelante carpado o extendido para salir, con media pirueta (180°) opcional que no cambia el valor. Suele arrancar del vuelo en suspensión y tiene que caer tocando primero con los pies.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_fwd_piked_or_stretched_full_twist', 'rings', 'IV', 'B', null, 'IV.2', 'Salida en mortal adelante con pirueta (360°)', 'Mortal adelante con pirueta', 'Una pirueta (360°) dentro de un mortal adelante de salida, carpado o extendido. Como vale menos de C, clavar la caída no da bonificación.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_fwd_piked_or_stretched_1_5_twist', 'rings', 'IV', 'C', null, 'IV.3', 'Salida en mortal adelante con pirueta y media (540°)', 'Mortal adelante con pirueta y media', 'Pirueta y media (540°) en un mortal adelante de salida; cuenta igual carpado que extendido, y desde este valor clavar la caída ya puede dar bonificación.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_fwd_piked_or_stretched_double_twist', 'rings', 'IV', 'D', null, 'IV.4', 'Salida en mortal adelante con doble pirueta (720°)', 'Mortal adelante con doble pirueta', 'Doble pirueta (720°) en un mortal adelante carpado o extendido para dejar las anillas. Si la pirueta se pasa o se queda corta más de 90°, no se reconoce.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_fwd_tucked_opt_half_twist', 'rings', 'IV', 'C', null, 'IV.9', 'Salida en doble mortal adelante agrupado', 'Doble adelante agrupado', 'Doble mortal adelante agrupado de salida; puede añadir media pirueta (180°) y vale lo mismo. Una caída en la que no tocan primero los pies anula el elemento.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_fischer_double_salto_fwd_tucked_1_5_or_full_twist', 'rings', 'IV', 'D', null, 'IV.10', 'Salida en doble mortal adelante agrupado con pirueta y media (540°) o pirueta (360°)', 'Fischer', 'Doble mortal adelante agrupado con pirueta y media (540°); con una sola pirueta (360°) también cuenta como este elemento. Si se ayuda empujando el aparato con los pies, no se reconoce ni cumple la exigencia de salida.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_balabanov_double_salto_fwd_piked_opt_half_twist', 'rings', 'IV', 'D', null, 'IV.16', 'Salida en doble mortal adelante carpado', 'Balabanov', 'Doble mortal adelante carpado de salida, con o sin media pirueta (180°), que no cambia el valor. Lo que aporta a la exigencia de salida es su propio valor de dificultad.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_fwd_piked_1_5_or_full_twist', 'rings', 'IV', 'E', null, 'IV.17', 'Salida en doble mortal adelante carpado con pirueta y media (540°) o pirueta (360°)', 'Doble adelante carpado con pirueta', 'Doble mortal adelante carpado con pirueta y media (540°) o con una pirueta (360°): las dos formas cuentan igual. Si se cae en la salida, no puede repetirla para que cuente.', 78, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_bwd_piked_or_stretched_opt_half_twist', 'rings', 'IV', 'A', null, 'IV.25', 'Salida en mortal atrás carpado o extendido', 'Mortal atrás', 'Mortal atrás de salida, carpado o extendido; el extendido puede llevar media pirueta (180°) sin cambiar de valor. Siempre acaba de pie y con las piernas juntas.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_bwd_stretched_full_twist', 'rings', 'IV', 'B', null, 'IV.26', 'Salida en mortal atrás extendido con pirueta (360°)', 'Mortal atrás con pirueta', 'Mortal atrás extendido con una pirueta (360°) para salir de las anillas, normalmente desde el vuelo en suspensión. Al ser B, clavarlo no tiene premio.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_bwd_stretched_double_or_1_5_twist', 'rings', 'IV', 'C', null, 'IV.27', 'Salida en mortal atrás extendido con doble pirueta (720°) o pirueta y media (540°)', 'Mortal atrás con doble pirueta', 'Doble pirueta (720°) en un mortal atrás extendido de salida; con pirueta y media (540°) cuenta igual. Gana 0,1 si clava la caída sin despegar los talones.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_bwd_stretched_triple_twist', 'rings', 'IV', 'E', null, 'IV.29', 'Salida en mortal atrás extendido con triple pirueta (1080°)', 'Mortal atrás con triple pirueta', 'Triple pirueta (1080°) en un solo mortal atrás extendido de salida, para caer de pie en la colchoneta.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_tucked_or_piked', 'rings', 'IV', 'B', null, 'IV.32', 'Salida en doble mortal atrás agrupado o carpado', 'Doble atrás agrupado o carpado', 'Doble mortal atrás sin pirueta, agrupado o carpado, que suele salir del vuelo en suspensión y termina de pie en la colchoneta.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_stretched', 'rings', 'IV', 'C', null, 'IV.33', 'Salida en doble mortal atrás extendido', 'Doble atrás extendido', 'Doble mortal atrás con el cuerpo extendido y sin pirueta, para dejar las anillas y caer de pie.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_triple_salto_bwd_tucked', 'rings', 'IV', 'G', null, 'IV.36', 'Salida en triple mortal atrás agrupado', 'Triple atrás agrupado', 'Triple mortal atrás agrupado de salida, sin pirueta. Una caída clavada, con los talones quietos, suma 0,1.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_whittenburg_triple_salto_bwd_piked', 'rings', 'IV', 'I', null, 'IV.42', 'Salida en triple mortal atrás carpado', 'Whittenburg', 'Triple mortal atrás carpado para dejar las anillas, sin pirueta; cae de pie en la colchoneta.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_tucked_half_full_or_1_5_twist', 'rings', 'IV', 'C', null, 'IV.45', 'Salida en doble mortal atrás agrupado con media pirueta, pirueta o pirueta y media', 'Doble atrás agrupado con pirueta', 'Doble mortal atrás agrupado con media pirueta (180°), una pirueta (360°) o pirueta y media (540°); las tres formas cuentan como el mismo elemento.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_tucked_double_twist', 'rings', 'IV', 'E', null, 'IV.47', 'Salida en doble mortal atrás agrupado con doble pirueta (720°)', 'Doble atrás agrupado con doble pirueta', 'Doble mortal atrás agrupado con doble pirueta (720°). Pasarse o quedarse corto en la pirueta más de 90° hace que no se reconozca.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_tuuha_double_salto_bwd_tucked_2_5_twist', 'rings', 'IV', 'F', null, 'IV.48', 'Salida en doble mortal atrás agrupado con doble pirueta y media (900°)', 'Tuuha', 'Doble mortal atrás agrupado con doble pirueta y media (900°). Clavar la caída da 0,1 de bonificación, que se pierde si levanta los talones.', 79, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_salto_bwd_stretched_full_twist_then_salto_tucked', 'rings', 'IV', 'C', null, 'IV.51', 'Salida en mortal atrás extendido con pirueta (360°) y mortal atrás agrupado', 'Doble atrás con pirueta en el primero', 'El primer mortal atrás va extendido y con una pirueta (360°); el segundo, agrupado. Así deja las anillas y cae de pie en la colchoneta.', 80, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_stretched_half_or_full_twist', 'rings', 'IV', 'D', null, 'IV.52', 'Salida en doble mortal atrás extendido con media pirueta o pirueta', 'Doble atrás extendido con pirueta', 'Doble mortal atrás extendido con media pirueta (180°) o con una pirueta (360°), las dos con el mismo valor.', 80, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_stretched_1_5_or_double_twist', 'rings', 'IV', 'F', null, 'IV.54', 'Salida en doble mortal atrás extendido con pirueta y media o doble pirueta', 'Doble atrás extendido con doble pirueta', 'Doble mortal atrás extendido con pirueta y media (540°) o doble pirueta (720°); cualquiera de las dos vale como F.', 80, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null),
  ('mrg_dismount_double_salto_bwd_tucked_triple_twist', 'rings', 'IV', 'G', null, 'IV.60', 'Salida en doble mortal atrás agrupado con triple pirueta (1080°)', 'Doble atrás agrupado con triple pirueta', 'Triple pirueta (1080°) dentro de un doble mortal atrás agrupado, con caída de pie y las piernas juntas.', 80, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 7, 'draft', null);

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
