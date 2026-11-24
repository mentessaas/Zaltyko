-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 5.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 37 elementos (pommel_horse, rings).
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
  ('mph_belenki_kehre_bwd_kehre_fwd_kehre_bwd', 'pommel_horse', 'III', 'D', null, 'III.52', 'Belenki: kehre atrás, kehre adelante y kehre atrás', 'Belenki', 'Tres kehres, atrás, adelante y atrás, que recorren el caballo de un extremo al otro (3/3) de apoyo facial a apoyo facial; añadirle elementos no sube su valor. Si arranca en apoyo transversal, mirando al caballo o hacia fuera, debe recorrerlo entero y la primera y la última kehre giran 90° menos.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_russian_wendeswing_fwd_one_pommel_to_other_end', 'pommel_horse', 'III', 'C', null, 'III.57', 'Rusa adelante desplazada desde un arco hasta el extremo opuesto', 'Rusa de un arco al extremo', 'Termina en el extremo opuesto al arco del que sale, sin que las manos toquen los arcos ni apoyen entre ellos por el camino. Es una rusa adelante con piernas juntas; puede arrancar en apoyo lateral y llegar en lateral o transversal. Entra en el límite de dos desplazamientos en rusa por ejercicio.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_tong_fei_russian_wendeswing_fwd_end_to_end', 'pommel_horse', 'III', 'D', null, 'III.58', 'Tong Fei: rusa adelante desplazada de un extremo al otro', 'Tong Fei', 'Lo que lo define es el recorrido limpio: de un extremo al otro (3/3) en rusa adelante, con piernas juntas y sin poner una mano en los arcos ni entre ellos. Entrada y llegada, en apoyo lateral o transversal, se combinan como se quiera; si un apoyo de más corta la rusa, el elemento acaba ahí.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_vammen_russian_360_on_leather_over_both_pommels', 'pommel_horse', 'III', 'E', null, 'III.59', 'Vammen: rusa de 360° o más desde el cuerpo del caballo por encima de los dos arcos', 'Vammen', 'Arranca en apoyo transversal sobre el cuerpo del caballo y avanza por encima de los dos arcos mientras gira en rusa de 360° o más. Piernas juntas: abrirlas descuenta. Si un apoyo de más corta la rusa o el recorrido, el elemento termina ahí.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_russian_travel_3_3_from_1_2_turn_630', 'pommel_horse', 'III', 'D', null, 'III.64', 'Rusa de 630° o más desplazada de un extremo al otro desde las zonas 1-2', 'Rusa de 630° o más 3/3', 'Con una rusa de 630° o más, el gimnasta recorre el caballo de un extremo al otro (3/3) saliendo de las zonas 1-2, con piernas juntas y por norma de apoyo facial a apoyo facial. Entre esta, el Wu Guonian y el Roth solo cuenta una por ejercicio, la de más valor.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_wu_guonian_russian_travel_3_3_turn_720_hands_between', 'pommel_horse', 'III', 'E', null, 'III.65', 'Wu Guonian: rusa de 720° o más desplazada de un extremo al otro', 'Wu Guonian', 'Rusa de 720° o más mientras recorre el caballo de un extremo al otro (3/3), con cualquier forma de desplazamiento y un apoyo de las dos manos entre los arcos. Piernas juntas. Detrás se le pueden enlazar elementos de la lista, como una rusa de 180° o de 360°.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_roth_russian_360_travel_3_3', 'pommel_horse', 'III', 'D', null, 'III.70', 'Roth: rusa de 360° desplazada de un extremo al otro', 'Roth', 'Desplazamiento de un extremo al otro (3/3) girando en rusa de 360°, con cualquier forma de rusa. Va con piernas juntas y, por norma, de apoyo facial a apoyo facial. Cuenta en el máximo de dos desplazamientos 3/3 con rusa por ejercicio.', 57, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_romero_reverse_stockli_end_to_far_pommel', 'pommel_horse', 'III', 'C', null, 'III.75', 'Romero: Stöckli inverso desde el extremo hasta el arco más lejano', 'Romero', 'Acaba sobre el arco más lejano: desde el apoyo transversal en un extremo, el gimnasta llega hasta allí con un Stöckli inverso. El elemento termina al completar ese desplazamiento y, para que valga, tiene que venir detrás un elemento de la lista oficial del Código.', 58, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mph_abu_alsoud_reverse_stockli_end_to_end', 'pommel_horse', 'III', 'D', null, 'III.76', 'Abu Alsoud: Stöckli inverso de un extremo al otro', 'Abu Alsoud', 'Cruza el caballo entero con un Stöckli inverso: sale del apoyo transversal en un extremo y llega al extremo opuesto (3/3). A diferencia del Romero, no se queda en el arco más lejano.', 58, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_uprise_fwd_to_support', 'rings', 'I', 'A', null, 'I.1', 'Subida adelante al apoyo', 'Subida adelante', 'Aprovecha el vuelo adelante para subir y quedar en apoyo sobre las anillas.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_roll_fwd_to_swing_bwd_in_hang', 'rings', 'I', 'A', null, 'I.7', 'Voltereta adelante al vuelo atrás en suspensión', 'Voltereta adelante', 'Termina con el gimnasta en vuelo atrás en suspensión, tras una voltereta adelante. Se entra desde una plancha en apoyo de cualquier forma, desde la golondrina o desde un vuelo atrás en apoyo.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_chechi_uprise_fwd_counter_salto_fwd', 'rings', 'I', 'B', null, 'I.8', 'Chechi: subida adelante y contramortal adelante a la suspensión', 'Chechi', 'Su sello es el contramortal: un mortal adelante que el gimnasta saca de la subida adelante para volver a la suspensión con vuelo atrás.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_felge_upward_from_hang_to_support', 'rings', 'I', 'A', null, 'I.19', 'Felga desde la suspensión hasta el apoyo', 'Felga al apoyo', 'Pasa de la suspensión al apoyo mediante una felga.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_swing_fwd_through_handstand', 'rings', 'I', 'B', null, 'I.20', 'Vuelo adelante pasando por el pino', 'Vuelo adelante por el pino', 'Pasa por el pino en un vuelo adelante, sin pararse en él. Lo habitual es llegar desde un pino o desde el balanceo.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_double_salto_bwd_tucked_to_hang', 'rings', 'I', 'C', null, 'I.21', 'Guczoghy: doble mortal atrás agrupado a la suspensión', 'Guczoghy', 'Doble mortal atrás agrupado que termina en suspensión en las anillas. Está prohibido para júniors.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_double_salto_bwd_piked_or_stretched_to_hang', 'rings', 'I', 'D', null, 'I.22', 'Doble mortal atrás carpado o extendido a la suspensión', 'Doble mortal atrás carpado o extendido', 'A diferencia del Guczoghy, agrupado, aquí el doble mortal atrás va carpado o extendido, y las dos formas valen lo mismo. Termina en suspensión y está prohibido para júniors.', 64, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_dislocate_bwd', 'rings', 'I', 'A', null, 'I.25', 'Dislocación atrás', 'Dislocación atrás', 'Dislocación atrás en las anillas, con el cuerpo carpado o extendido; cualquiera de las dos formas cuenta igual.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_uprise_bwd_to_support', 'rings', 'I', 'A', null, 'I.31', 'Subida atrás al apoyo', 'Subida atrás', 'Con el vuelo atrás, el gimnasta sube hasta quedar en apoyo sobre las anillas.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_uprise_bwd_stretched_through_handstand', 'rings', 'I', 'B', null, 'I.32', 'Subida atrás extendida pasando por el pino', 'Subida atrás por el pino', 'Subida atrás con el cuerpo extendido que pasa por el pino sin detenerse. Suele empezar desde un pino o desde el balanceo.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_inlocate', 'rings', 'I', 'A', null, 'I.37', 'Dislocación adelante', 'Dislocación adelante', 'Dislocación adelante con el cuerpo carpado o extendido; las dos formas cuentan como el mismo elemento.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_honma_piked_to_support', 'rings', 'I', 'B', null, 'I.38', 'Honma: vuelo atrás y mortal adelante carpado al apoyo', 'Honma', 'Mortal adelante carpado que, tras el vuelo atrás, deja al gimnasta en apoyo sobre las anillas. Suele arrancar desde la suspensión.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_honma_stretched_to_support', 'rings', 'I', 'C', null, 'I.39', 'Honma extendido al apoyo', 'Honma extendido', 'La forma extendida del Honma: después del vuelo atrás, mortal adelante con el cuerpo extendido hasta el apoyo. Lo normal es empezar en suspensión.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_slow_inlocate_from_hang', 'rings', 'I', 'A', null, 'I.43', 'Dislocación adelante lenta desde la suspensión', 'Dislocación adelante lenta', 'Lo que la distingue es la lentitud: el gimnasta, desde la suspensión, completa así la dislocación adelante.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_yamawaki_double_salto_fwd_tucked_to_hang', 'rings', 'I', 'B', null, 'I.44', 'Yamawaki: doble mortal adelante agrupado a la suspensión', 'Yamawaki', 'Doble mortal adelante agrupado que acaba en suspensión. Va de un tirón y con los hombros por encima de las anillas: si se ve un apoyo a mitad, no se reconoce.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_jonasson_double_salto_fwd_piked_or_stretched_to_hang', 'rings', 'I', 'C', null, 'I.45', 'Jonasson: doble mortal adelante carpado o extendido a la suspensión', 'Jonasson', 'Es el doble mortal adelante a la suspensión del Yamawaki, pero carpado o extendido en vez de agrupado; las dos formas valen igual. Seguido directamente de un vuelo al pino mantenido que cuente entre los 8, sube una letra.', 65, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_kip_to_support', 'rings', 'I', 'A', null, 'I.49', 'Kippe al apoyo', 'Kippe', 'Kippe desde la suspensión invertida carpada hasta el apoyo. No sirve como elemento del grupo I para cortar una serie de elementos de fuerza.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_back_kip_bent_arms_to_support', 'rings', 'I', 'A', null, 'I.55', 'Kippe atrás con brazos flexionados al apoyo', 'Kippe atrás con brazos flexionados', 'Kippe atrás con los brazos flexionados hasta el apoyo, normalmente desde la suspensión invertida; los brazos doblados la separan de la Kippe atrás normal.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_back_kip_to_support', 'rings', 'I', 'B', null, 'I.56', 'Kippe atrás al apoyo', 'Kippe atrás', 'Es la Kippe atrás que acaba en apoyo, la forma básica frente a la versión con brazos flexionados; suele partir de la suspensión invertida.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_swing_fwd_to_swing_bwd_in_hang', 'rings', 'I', 'A', null, 'I.61', 'Vuelo adelante y vuelo atrás a la suspensión', 'Vuelo adelante y atrás a la suspensión', 'Suele empezar en apoyo: el gimnasta hace un vuelo adelante y luego uno atrás, y acaba en vuelo atrás en suspensión.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_swing_bwd_salto_piked_to_support', 'rings', 'I', 'C', null, 'I.63', 'Vuelo atrás y mortal carpado al apoyo', 'Mortal carpado al apoyo', 'Mortal carpado tras un vuelo atrás que termina en apoyo en las anillas; lo habitual es hacerlo desde el apoyo.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_felge_bwd_bent_arms_to_support', 'rings', 'I', 'A', null, 'I.67', 'Felga atrás con brazos flexionados al apoyo', 'Felga atrás con brazos flexionados', 'Felga atrás con los brazos flexionados que termina en apoyo. Puede salir del apoyo o del cristo, con el cuerpo carpado o extendido, en cualquier combinación.', 66, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_back_kip_or_roll_bwd_bent_arms_to_handstand', 'rings', 'I', 'B', null, 'I.74', 'Kippe atrás o voltereta atrás al pino mantenido', 'Kippe atrás o voltereta atrás al pino', 'Llega al pino y lo mantiene 2 segundos con parada visible, por Kippe atrás, que suele salir de la suspensión invertida, o por voltereta atrás extendida, que suele salir del apoyo. En las dos formas se permiten los brazos flexionados. Sin parada no cuenta, y si cae del pino tampoco.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_swing_fwd_or_giant_bwd_to_handstand', 'rings', 'I', 'C', null, 'I.75', 'Vuelo adelante o molino atrás al pino mantenido', 'Vuelo adelante o molino atrás al pino', 'Pino mantenido 2 segundos con parada clara, al que llega directamente y con brazos extendidos desde un vuelo adelante o un molino atrás. Flexionar los brazos para fijarlo descuenta y puede anularlo; si las piernas bajan más de 45° desde la posición de entrada o cae del pino, no cuenta.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_uprise_bwd_or_giant_fwd_to_handstand', 'rings', 'I', 'C', null, 'I.81', 'Subida atrás o molino adelante al pino mantenido', 'Subida atrás o molino adelante al pino', 'Con una subida atrás o un molino adelante, el gimnasta llega directo al pino con los brazos extendidos y lo mantiene 2 segundos parado. Doblar los brazos para fijarlo descuenta, hasta no reconocerse, y bajar las piernas más de 45° desde la posición de entrada lo anula.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_swing_bwd_from_support_to_handstand', 'rings', 'I', 'B', null, 'I.86', 'Vuelo atrás desde el apoyo al pino mantenido', 'Vuelo atrás al pino', 'Desde el apoyo, vuelo atrás directo al pino con los brazos extendidos, mantenido 2 segundos con parada visible. Si está entre los 8 elementos que cuentan, sirve como el vuelo al pino que exige el ejercicio.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_honma_swing_bwd_to_handstand', 'rings', 'I', 'C', null, 'I.87', 'Honma y vuelo atrás al pino mantenido', 'Honma al pino', 'Tras un Honma carpado, el gimnasta sigue con un vuelo atrás hasta el pino, al que llega directo y con brazos extendidos, y lo mantiene 2 segundos con parada visible. Suele empezar desde la suspensión.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date),
  ('mrg_honma_stretched_swing_bwd_to_handstand', 'rings', 'I', 'D', null, 'I.88', 'Honma extendido y vuelo atrás al pino mantenido', 'Honma extendido al pino', 'La forma extendida del Honma enlazada con un vuelo atrás hasta el pino, que se mantiene 2 segundos parado y con brazos extendidos. Si hay que doblar los brazos para fijarlo descuenta, y caer del pino lo anula.', 67, '2026-11-22'::date, 'Claude', '2026-11-22'::date, 5, 'reviewed', '2026-11-23'::date);

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
