-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 13.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 59 elementos (high_bar).
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
  ('mhb_lh_back_uprise_to_handstand', 'high_bar', 'I', 'A', null, 'I.1', 'Subida atrás al pino', 'Subida atrás al pino', 'Subida atrás en pleno vuelo atrás, desde la suspensión, hasta el pino; suele hacerse con el cuerpo extendido.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_back_uprise_to_handstand_full_turn', 'high_bar', 'I', 'B', null, 'I.2', 'Subida atrás al pino con giro (360°)', 'Subida atrás con giro (360°)', 'Un giro completo (360°) culmina la subida atrás, hecha en el vuelo atrás desde la suspensión, y deja al gimnasta en el pino. Otra forma del elemento acaba en presa mixta.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_back_uprise_to_handstand_half_turn', 'high_bar', 'I', 'A', null, 'I.7', 'Subida atrás al pino con medio giro (180°)', 'Subida atrás con medio giro', 'Medio giro (180°) encadenado a la subida atrás para llegar al pino; la subida se hace en el vuelo atrás, desde la suspensión.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_back_swing_pirouette_to_hang', 'high_bar', 'I', 'B', null, 'I.8', 'Vuelo atrás con pirueta (360°) a suspensión', 'Vuelo atrás con pirueta a suspensión', 'Vuelve a quedar en suspensión después de una pirueta completa (360°) en el vuelo atrás, que suele venir de un balanceo en suspensión.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_back_swing_pirouette_to_support', 'high_bar', 'I', 'C', null, 'I.9', 'Vuelo atrás con pirueta (360°) al apoyo', 'Vuelo atrás con pirueta al apoyo', 'Termina en apoyo sobre la barra: en el vuelo atrás gira una pirueta completa (360°) y sube. Suele salir de un balanceo atrás en suspensión.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_giant_swing_forward', 'high_bar', 'I', 'A', null, 'I.13', 'Molino adelante', 'Molino adelante', 'Vuelta completa hacia adelante alrededor de la barra fija, en suspensión. Suele hacerse con el cuerpo extendido de principio a fin.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_full_turn_through_handstand_mixed_grip', 'high_bar', 'I', 'B', null, 'I.14', 'Giro (360°) por el pino a presa mixta', 'Giro (360°) a presa mixta', 'Al pasar por el pino gira una vuelta completa (360°) y la termina en presa mixta. Suele acabar en el pino.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_full_turn_through_handstand_double_el_grip', 'high_bar', 'I', 'C', null, 'I.15', 'Giro (360°) por el pino a doble presa cubital', 'Giro (360°) a doble cubital', 'Gira una vuelta completa (360°) mientras pasa por el pino y queda con las dos manos en presa cubital, normalmente en el pino.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_half_turn_through_handstand', 'high_bar', 'I', 'A', null, 'I.19', 'Medio giro (180°) por el pino', 'Medio giro por el pino', 'Medio giro (180°) hecho justo al pasar por el pino.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_flying_giant_swing_forward', 'high_bar', 'I', 'B', null, 'I.20', 'Molino adelante con suelta y recogida', 'Molino adelante con suelta', 'En pleno molino adelante suelta la barra y la vuelve a coger. Otra forma del elemento añade medio giro (180°) antes de recoger.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_flying_giant_swing_forward_full_turn', 'high_bar', 'I', 'C', null, 'I.21', 'Molino adelante con suelta y giro (360°)', 'Molino adelante con suelta y giro', 'Un giro completo (360°) en el aire separa la suelta de la recogida: el gimnasta suelta la barra en el molino adelante, gira y vuelve a cogerla.', 120, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_one_arm_giant_swing_forward_undergrip', 'high_bar', 'I', 'B', null, 'I.26', 'Molino adelante a un brazo en presa palmar', 'Molino adelante a un brazo', 'Agarrado con una sola mano, en presa palmar, da el molino adelante entero. Suele hacerse con el cuerpo extendido.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_zou_li_min', 'high_bar', 'I', 'C', null, 'I.27', 'Molino adelante a un brazo con dos giros (720°)', 'Zou Li Min', 'Es un molino adelante a una mano con dos giros seguidos (720°): el primero (360°) pasa por presa cubital y el segundo (360°) termina en presa palmar, colgado de un brazo.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_giant_swing_backward', 'high_bar', 'I', 'A', null, 'I.31', 'Molino atrás', 'Molino atrás', 'La vuelta completa hacia atrás alrededor de la barra, en suspensión; suele hacerse con el cuerpo extendido.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_one_arm_giant_swing_backward', 'high_bar', 'I', 'B', null, 'I.32', 'Molino atrás a un brazo', 'Molino atrás a un brazo', 'Molino atrás entero agarrado con una sola mano.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_half_turn_backward_through_handstand', 'high_bar', 'I', 'A', null, 'I.37', 'Medio giro (180°) atrás por el pino', 'Medio giro atrás por el pino', 'Pasando por el pino en sentido atrás, el gimnasta da medio giro (180°).', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_giant_swing_backward_hop_to_undergrip', 'high_bar', 'I', 'A', null, 'I.43', 'Molino atrás con salto de manos a presa palmar', 'Molino atrás con cambio a palmar', 'Cambia a presa palmar con un salto de manos durante el molino atrás. Suele acabar en el pino.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_flying_giant_swing_backward', 'high_bar', 'I', 'B', null, 'I.44', 'Molino atrás con suelta y recogida', 'Molino atrás con suelta', 'Suelta la barra en pleno molino atrás y la vuelve a coger.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_quast', 'high_bar', 'I', 'C', null, 'I.45', 'Molino atrás con suelta y giro (360°)', 'Quast', 'Molino atrás en el que suelta la barra, da un giro completo (360°) en el aire y vuelve a cogerla.', 121, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_giant_swing_backward_hop_half_turn_el_grip', 'high_bar', 'I', 'B', null, 'I.50', 'Molino atrás con salto de manos y medio giro (180°) a presa cubital', 'Molino atrás con medio giro a cubital', 'Termina en presa cubital: en el molino atrás salta de manos y da medio giro (180°).', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_giant_swing_backward_hop_one_and_half_turn', 'high_bar', 'I', 'C', null, 'I.51', 'Molino atrás con salto de manos y giro (540°)', 'Rybalko', 'Giro y medio (540°) que arranca ya en el salto de manos del molino atrás y termina en presa palmar. Son el mismo elemento las formas que acaban en presa cubital mixta o que siguen en molino a un brazo.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_rybalko_double_el_grip', 'high_bar', 'I', 'D', null, 'I.52', 'Molino atrás con salto de manos y giro (540°) a doble cubital', 'Rybalko a doble cubital', 'Rybalko que termina con las dos manos en presa cubital: molino atrás, salto de manos y giro y medio (540°).', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_half_turn_backward_through_handstand_to_el_grip', 'high_bar', 'I', 'B', null, 'I.56', 'Medio giro (180°) atrás por el pino a presa cubital', 'Medio giro atrás a cubital', 'Sin salto de manos: desde un molino atrás da medio giro (180°) al pasar por el pino y queda en presa cubital.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_long_swing_forward_hop_to_el_grip', 'high_bar', 'I', 'B', null, 'I.62', 'Cambio a presa cubital con salto de manos en el balanceo largo adelante', 'Cambio a cubital en balanceo adelante', 'Recoge la barra en presa cubital después de un salto de manos en pleno balanceo largo adelante.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_el_grip_giant_swing', 'high_bar', 'I', 'B', null, 'I.68', 'Molino en presa cubital', 'Molino en cubital', 'Molino completo con las dos manos en presa cubital.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_russian_giant', 'high_bar', 'I', 'C', null, 'I.69', 'Molino ruso', 'Molino ruso', 'Conocido como molino ruso: molino adelante en dislocación, en presa cubital. Cerca de lo alto suele carparse un momento.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_czech_giant', 'high_bar', 'I', 'D', null, 'I.70', 'Molino checo', 'Molino checo', 'Molino atrás en dislocación, el que se conoce como molino checo. Suele pasar por fases carpadas.', 122, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_ono', 'high_bar', 'I', 'B', null, 'I.74', 'Subida Steineman con medio giro (180°) al apoyo desde molino checo', 'Ono', 'Sale de un molino checo con una subida Steineman, da medio giro (180°) y acaba en apoyo. La subida suele empezar carpada.', 123, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_el_grip_giant_full_turn_handstand_mixed_grip', 'high_bar', 'I', 'C', null, 'I.75', 'Molino en presa cubital con giro (360°) por el pino a presa mixta', 'Molino cubital con giro (360°)', 'Molino en presa cubital en el que, al pasar por el pino, gira una vuelta completa (360°) hasta quedar en presa mixta.', 123, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_lh_czech_giant_half_turn_to_forward_giant', 'high_bar', 'I', 'D', null, 'I.76', 'Molino checo con medio giro (180°) a molino adelante', 'Molino checo con medio giro', 'Enlaza con un molino adelante gracias a medio giro (180°) hecho desde el molino checo, que suele llevar fases carpadas.', 123, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_kip_to_handstand', 'high_bar', 'III', 'A', null, 'III.1', 'Kippe al pino', 'Kippe al pino', 'Kippe que acaba en el pino. Otra forma del elemento empieza en presa mixta.', 129, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_weiler_free_hip_forward_handstand', 'high_bar', 'III', 'B', null, 'III.8', 'Vuelta libre de cadera adelante de pino a pino', 'Weiler', 'Sale del pino con una vuelta libre de cadera hacia adelante, vuelve a pasar por el pino y sigue por encima de la barra.', 129, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_free_hip_circle_handstand', 'high_bar', 'III', 'A', null, 'III.13', 'Vuelta libre de cadera por el pino', 'Vuelta libre al pino', 'Vuelta libre de cadera que pasa por el pino y sigue por encima de la barra; puede empezar en suspensión o en apoyo.', 129, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_free_hip_circle_hop_handstand', 'high_bar', 'III', 'A', null, 'III.25', 'Vuelta libre de cadera con salto de manos al pino', 'Vuelta libre con salto de manos', 'Llega al pino con un salto de manos tras la vuelta libre de cadera, empezando desde suspensión o desde apoyo.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_endo_straddle_handstand', 'high_bar', 'III', 'B', null, 'III.32', 'Endo con piernas abiertas por el pino', 'Endo', 'Con las piernas abiertas, vuelta libre adelante que pasa por el pino y continúa por encima de la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_endo_legs_together_handstand', 'high_bar', 'III', 'C', null, 'III.33', 'Endo con piernas juntas por el pino', 'Endo piernas juntas', 'Endo con las piernas juntas: la vuelta libre adelante pasa por el pino y sigue sobre la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_straddle_handstand', 'high_bar', 'III', 'B', null, 'III.38', 'Stalder con piernas abiertas por el pino', 'Stalder', 'Vuelta libre atrás con las piernas abiertas por fuera de los brazos; pasa por el pino y sigue por encima de la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_hop_540_mixed_el_grip', 'high_bar', 'III', 'D', null, 'III.40', 'Stalder con salto de manos y giro (540°) a presa cubital mixta', 'Stalder Rybalko a cubital mixta', 'La presa cubital mixta final es su seña: Stalder Rybalko con piernas abiertas, salto de manos y giro y medio (540°) al pasar por el pino, sin pararse sobre la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_hop_540_el_grip', 'high_bar', 'III', 'E', null, 'III.41', 'Stalder con salto de manos y giro (540°) a presa cubital', 'Stalder Rybalko a cubital', 'Las dos manos acaban en presa cubital en este Stalder Rybalko. Piernas abiertas, salto de manos, giro y medio (540°) por el pino y continúa por encima de la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_legs_together_handstand', 'high_bar', 'III', 'C', null, 'III.45', 'Stalder con piernas juntas por el pino', 'Stalder piernas juntas', 'Con las piernas juntas, vuelta libre atrás (Stalder) que pasa por el pino y sigue por encima de la barra.', 130, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_hop_handstand', 'high_bar', 'III', 'B', null, 'III.56', 'Stalder con salto de manos por el pino', 'Stalder con salto de manos', 'Stalder con piernas abiertas y salto de manos; pasa por el pino y sigue por encima de la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stalder_legs_together_hop_handstand', 'high_bar', 'III', 'C', null, 'III.57', 'Stalder con piernas juntas y salto de manos por el pino', 'Stalder piernas juntas con salto', 'Piernas juntas durante el Stalder y salto de manos; el gimnasta pasa por el pino y sigue sobre la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_adler_handstand', 'high_bar', 'III', 'C', null, 'III.63', 'Adler por el pino', 'Adler', 'El Adler sin giro ni salto de manos: vuelta carpada en dislocación hacia adelante, con las piernas entre los brazos, que pasa por el pino y sigue por encima de la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_adler_half_turn_overgrip', 'high_bar', 'III', 'D', null, 'III.64', 'Adler con medio giro (180°) a presa dorsal', 'Adler con medio giro', 'Medio giro (180°) en el Adler para pasar por el pino en presa dorsal y seguir por encima de la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_adler_full_turn_undergrip', 'high_bar', 'III', 'E', null, 'III.65', 'Adler con giro (360°) a presa palmar', 'Fuentes', 'Lo distingue el giro completo (360°): tras el Adler pasa por el pino en presa palmar y continúa sobre la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_adler_hop_handstand', 'high_bar', 'III', 'D', null, 'III.70', 'Adler con salto de manos por el pino', 'Adler con salto de manos', 'Vale lo mismo acabar en presa mixta, dorsal o palmar en este Adler con salto de manos, que pasa por el pino y sigue por encima de la barra.', 131, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_adler_full_turn_mixed_grip', 'high_bar', 'III', 'D', null, 'III.76', 'Adler con giro (360°) a presa mixta', 'Baldauf', 'En presa mixta remata un giro completo (360°) del Adler, al pasar por el pino y sin detenerse sobre la barra. Hay otra forma del elemento con salto de manos.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_back_toss_dorsal_hang', 'high_bar', 'III', 'A', null, 'III.79', 'Lanzamiento atrás a suspensión dorsal', 'Lanzamiento atrás', 'Queda colgado de espaldas a la barra, en suspensión dorsal, tras un lanzamiento atrás.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_steineman_uprise_support_rearways', 'high_bar', 'III', 'B', null, 'III.80', 'Subida adelante desde suspensión dorsal al apoyo dorsal', 'Steineman', 'Termina en apoyo dorsal, de espaldas a la barra, tras subir hacia adelante desde la suspensión dorsal.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stoop_in_free_back_toss_dorsal_hang', 'high_bar', 'III', 'C', null, 'III.81', 'Entrada carpada y lanzamiento atrás libre a suspensión dorsal', 'Lanzamiento atrás libre', 'Termina en suspensión dorsal: entra carpado, con las piernas por dentro, y hace un lanzamiento atrás libre.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_steineman_uprise_stoop', 'high_bar', 'III', 'C', null, 'III.87', 'Subida Steineman con paso carpado al pino', 'Köste', 'Subida Steineman con paso carpado por dentro hasta el pino; la forma sin paso carpado, también al pino, es el mismo elemento.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_steineman_uprise_flank_backward', 'high_bar', 'III', 'B', null, 'III.92', 'Subida Steineman con pasada de flanco atrás', 'Steineman con flanco atrás', 'Tras la subida Steineman pasa las piernas de flanco hacia atrás y acaba en apoyo; acabar en suspensión es otra forma del mismo elemento.', 132, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_endo_el_grip_handstand', 'high_bar', 'III', 'C', null, 'III.99', 'Endo en presa cubital de pino a pino', 'Endo en cubital', 'Arranca del pino en presa cubital: Endo con piernas abiertas que pasa de nuevo por el pino y sigue por encima de la barra.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_endo_legs_together_el_grip_handstand', 'high_bar', 'III', 'D', null, 'III.100', 'Endo con piernas juntas en presa cubital', 'Endo piernas juntas en cubital', 'En presa cubital y con las piernas juntas, Endo que pasa por el pino y sigue por encima de la barra.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stoop_circle_forward_straddle_cut_hang', 'high_bar', 'III', 'A', null, 'III.103', 'Vuelta carpada adelante con corte de piernas abiertas', 'Corte de piernas abiertas', 'Con los pies sobre la barra y las piernas entre los brazos da la vuelta carpada adelante; luego corta con las piernas abiertas y queda en suspensión. Si acaba en apoyo es el mismo elemento.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_stoop_circle_forward_straddle_cut_handstand', 'high_bar', 'III', 'B', null, 'III.104', 'Vuelta carpada adelante con corte de piernas abiertas por el pino', 'Corte de piernas abiertas al pino', 'Vuelta carpada adelante (pies sobre la barra, piernas entre los brazos) con corte de piernas abiertas que pasa por el pino y sigue por encima de la barra.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_carballo', 'high_bar', 'III', 'C', null, 'III.105', 'Vuelta carpada adelante con corte de piernas abiertas y medio giro (180°)', 'Carballo', 'Medio giro (180°) añadido al corte de piernas abiertas tras la vuelta carpada adelante, con los pies sobre la barra y las piernas entre los brazos. Acaba en el pino.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_quintero', 'high_bar', 'III', 'D', null, 'III.106', 'Carballo con medio giro (180°) añadido', 'Quintero', 'Se construye sobre el Carballo: a su medio giro suma otro hasta un giro total (360°) y acaba en presa cubital mixta, normalmente en el pino.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null),
  ('mhb_ib_quintero_el_grip', 'high_bar', 'III', 'E', null, 'III.107', 'Quintero a presa cubital', 'Quintero en cubital', 'Quintero con un giro total (360°) que termina con las dos manos en presa cubital, normalmente en el pino.', 133, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 13, 'draft', null);

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
