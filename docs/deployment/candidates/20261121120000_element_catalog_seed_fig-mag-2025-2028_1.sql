-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-mag-2025-2028, tanda 1.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-mag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 45 elementos (floor).
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
  ('mfx_handstand_lower_to_l_sit', 'floor', 'I', 'A', null, 'I.1', 'Bajada del pino al ángulo', 'Del pino al ángulo', 'Baja desde el pino hasta quedarse en ángulo, que mantiene 2 segundos; también vale terminar en ángulo con piernas abiertas. Cuenta como elemento de fuerza y solo entra uno así por ejercicio.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_v_sit_hold', 'floor', 'I', 'B', null, 'I.2', 'Ángulo piernas verticales', 'Ángulo piernas verticales', 'Mantiene 2 segundos la posición en V, con las piernas verticales. Es elemento de fuerza, y el ejercicio solo admite uno.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_manna_hold', 'floor', 'I', 'C', null, 'I.3', 'Manna mantenida', 'Manna', 'Cuenta como elemento de fuerza, y solo entra uno por ejercicio: la Manna, en forma de V con las piernas en horizontal, sostenida 2 segundos.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_stand_swiss_press_to_handstand', 'floor', 'I', 'A', null, 'I.7', 'Olímpico al pino partiendo de pie', 'Olímpico', 'De pie, sube al pino en olímpico y lo aguanta 2 segundos. Si toca el suelo durante la subida, esta no vale, pero el pino sí cuenta si lo mantiene el tiempo.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_piked_straight_arm_press_to_handstand', 'floor', 'I', 'B', null, 'I.8', 'Subida a fuerza carpada al pino con brazos rectos', 'A fuerza carpada', 'Las piernas van juntas en las dos formas: subida a fuerza al pino carpada con brazos rectos, o con el cuerpo extendido y brazos flexionados. Al llegar mantiene el pino 2 s; si roza el suelo al subir pierde la subida, no el pino.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_v_sit_press_to_handstand', 'floor', 'I', 'C', null, 'I.9', 'Ángulo piernas verticales y subida a fuerza al pino', 'Ángulo en V al pino', 'Son dos partes de fuerza y cada una pide su parada: primero el ángulo piernas verticales 2 s y después la subida a fuerza al pino, donde al final puede abrir las piernas. Si solo para en una parte, baja el valor.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_manna_press_to_handstand', 'floor', 'I', 'D', null, 'I.10', 'Manna y subida a fuerza al pino', 'Manna al pino', 'Llega al pino subiendo a fuerza desde la Manna, que antes ha sostenido 2 segundos; al final de la subida puede abrir las piernas. Cada parte pide su parada, y si solo se sostiene la Manna queda en C.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_prone_rock_to_handstand', 'floor', 'I', 'A', null, 'I.13', 'Desde tendido prono, balancearse hasta el pino', 'Del tendido prono al pino', 'Tumbado boca abajo, se balancea hasta el pino y lo aguanta 2 segundos. Cuenta como elemento de fuerza.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_split_press_to_handstand', 'floor', 'I', 'B', null, 'I.14', 'Subida a fuerza al pino desde spagat', 'Del spagat al pino', 'Sube a fuerza al pino desde el spagat y lo mantiene 2 s. Cuenta igual si arranca en ángulo con piernas abiertas o en apoyo facial. Un toque al suelo en la subida la anula, aunque el pino vale si se mantiene.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_manna_turn_over_to_handstand', 'floor', 'I', 'D', null, 'I.16', 'Manna y dislocación al pino', 'Manna con dislocación al pino', 'Tras mantener la Manna 2 segundos, pasa con una dislocación hasta el pino. Cada parte de fuerza necesita su parada; si solo para en una, el valor baja.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_handstand_hold', 'floor', 'I', 'A', null, 'I.19', 'Pino mantenido', 'Pino', 'El pino de siempre, normalmente con el cuerpo extendido, sostenido 2 segundos. No se cuenta entre los elementos de fuerza.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_press_to_japanese_handstand', 'floor', 'I', 'B', null, 'I.20', 'Subida a fuerza al pino japonés', 'Pino japonés', 'En el pino japonés las piernas van cerradas y la cabeza queda a no más del grosor de una mano del suelo; se mantiene 2 s. Se llega subiendo a fuerza, bajando desde el pino o balanceándose. Si la subida toca el suelo no vale, pero el pino sí.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_split_press_to_japanese_handstand', 'floor', 'I', 'C', null, 'I.21', 'Subida a fuerza al pino japonés desde spagat', 'Del spagat al pino japonés', 'Del spagat, normalmente lateral, sube a fuerza hasta el pino japonés: piernas cerradas, cabeza a no más del grosor de una mano del suelo y 2 segundos de parada. Es elemento de fuerza.', 29, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_straddle_planche_hold', 'floor', 'I', 'A', null, 'I.25', 'Plancha con piernas abiertas', 'Plancha piernas abiertas', 'Plancha con las piernas abiertas mantenida 2 segundos. Al ser elemento de fuerza, solo cuenta uno de este tipo por ejercicio.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_planche_hold', 'floor', 'I', 'C', null, 'I.27', 'Plancha con cuerpo extendido', 'Plancha', 'Cuerpo extendido y, lo habitual, piernas juntas: la plancha se aguanta 2 s. La golondrina mantenida 2 s vale igual.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_half_turn_in_handstand', 'floor', 'I', 'A', null, 'I.31', 'Giro en el pino: medio o completo, también al llegar', 'Giro en el pino', 'Ya en el pino, da medio giro (180°) o un giro completo (360°); también vale girar esos mismos grados mientras llega al pino. No suma como elemento de fuerza.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_straddle_planche_press_to_handstand', 'floor', 'I', 'B', null, 'I.32', 'Plancha con piernas abiertas y subida a fuerza al pino', 'Plancha abierta al pino', 'Dos paradas de 2 s: la plancha con piernas abiertas y el pino al que sube a fuerza. Si solo para en una de las dos, el valor es menor; si toca el suelo al subir, la subida no vale, pero el pino sí si lo mantiene.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_planche_press_to_handstand', 'floor', 'I', 'D', null, 'I.34', 'Plancha y subida a fuerza al pino', 'Plancha al pino', 'Sostiene la plancha 2 segundos y sube a fuerza al pino, con otra parada. Cuenta igual, como Alvariño, pasar de la golondrina al pino japonés (piernas cerradas, cabeza a no más de una mano del suelo). Sin parada en las dos partes, baja el valor.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_l_sit_turn_over_bwd_to_stand', 'floor', 'I', 'A', null, 'I.37', 'Dislocación atrás desde ángulo hasta quedar de pie', 'Dislocación atrás', 'Termina de pie tras una dislocación atrás que arranca en ángulo, aunque se admiten otras posiciones de salida. Cuenta como elemento de fuerza.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_endo_roll_to_handstand', 'floor', 'I', 'B', null, 'I.44', 'Voltereta Endo al pino', 'Voltereta Endo', 'Del pino al pino pasando por una voltereta Endo, que suele hacerse con piernas abiertas; al final aguanta 2 s. No hace falta empezar en el pino.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_endo_roll_piked_to_handstand', 'floor', 'I', 'C', null, 'I.45', 'Voltereta Endo carpada al pino', 'Voltereta Endo carpada', 'Versión carpada y con piernas juntas de la voltereta Endo: va del pino al pino y termina con 2 segundos de parada. Puede empezar fuera del pino; cuenta como elemento de fuerza.', 30, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_walkover_fwd', 'floor', 'I', 'A', null, 'I.49', 'Paso adelante', 'Paso adelante', 'Paso adelante que empieza y termina de pie.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_cross_split', 'floor', 'I', 'A', null, 'I.55', 'Spagat de frente o lateral', 'Spagat', 'Lo que cuenta es parar en el spagat, sea de frente o lateral.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_standing_scale', 'floor', 'I', 'A', null, 'I.61', 'Balanza sobre una pierna', 'Balanza', 'Balanza de pie, en cualquiera de sus formas, mantenida 2 segundos. Sirve como la balanza sobre una pierna exigida y puede quedar fuera de los 8 elementos que cuentan.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_standing_scale_180_straddle', 'floor', 'I', 'B', null, 'I.62', 'Balanza con piernas a 180°', 'Balanza a 180°', 'Con las piernas abiertas a 180° y sin sujetarse con la mano, mantiene la balanza 2 s. Vale cualquier forma de balanza y puede cubrir la balanza sobre una pierna exigida, aunque quede fuera de los 8 elementos que cuentan.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_jump_bwd_to_front_support', 'floor', 'I', 'A', null, 'I.67', 'Salto atrás a apoyo facial', 'Salto atrás a apoyo facial', 'De pie, salta hacia atrás y termina en apoyo facial.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_jump_bwd_pike_stretch_to_front_support', 'floor', 'I', 'B', null, 'I.68', 'Salto atrás con carpado y extensión a apoyo facial', 'Endo', 'Sale de pie con un salto atrás, carpa y se extiende antes de quedar en apoyo facial. Con un giro completo (360°) en el salto, en lugar del carpado, cuenta igual.', 31, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_butterfly', 'floor', 'I', 'A', null, 'I.73', 'Mariposa', 'Mariposa', 'Mariposa que sale de pie y termina de pie.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_butterfly_full_twist', 'floor', 'I', 'B', null, 'I.74', 'Mariposa con pirueta', 'Tong Fei', 'Sale de pie y vuelve a quedar de pie tras una mariposa con pirueta completa (360°) hacia delante; con la pirueta hacia atrás cuenta igual.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_butterfly_double_twist', 'floor', 'I', 'C', null, 'I.75', 'Mariposa con doble pirueta', 'Mariposa doble pirueta', 'Como la mariposa con pirueta, pero con doble pirueta (720°): sale de pie y acaba de pie.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_circle', 'floor', 'I', 'A', null, 'I.79', 'Molino en apoyo facial', 'Molino', 'Empieza y acaba en apoyo facial con un molino; el molino con piernas abiertas tiene el mismo número y valor. Para el valor solo cuenta un molino, molino abierto o molino ruso por ejercicio.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_circle_to_handstand', 'floor', 'I', 'B', null, 'I.80', 'Molino al pino', 'Molino al pino', 'Desde apoyo facial hace uno o varios molinos y termina en el pino. Con piernas abiertas cuenta lo mismo.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_to_handstand_continue_flair', 'floor', 'I', 'C', null, 'I.81', 'Molino con piernas abiertas al pino y seguir con molino', 'Gogoladze', 'Pasa por el pino entre molinos, saliendo de apoyo facial y volviendo a él tras seguir con molino. Antes y después del pino puede combinar libremente molino y molino con piernas abiertas, también mezclados, por el mismo valor.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_hop_360_through_handstand', 'floor', 'I', 'D', null, 'I.82', 'Molino con piernas abiertas, rebotes y giro completo atrás por el pino', 'Molino con rebotes y giro', 'Entre molinos con piernas abiertas, da dos rebotes sobre las manos y un giro completo (360°) atrás pasando por el pino, para volver a apoyo facial. Añadir elementos antes o después no sube el valor.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_handstand_lower_to_circle', 'floor', 'I', 'B', null, 'I.86', 'Bajada del pino a molino', 'Del pino a molino', 'Baja del pino a un molino, con piernas juntas o abiertas, y acaba en apoyo facial. Solo un molino de este tipo cuenta para el valor en cada ejercicio.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_half_spindle', 'floor', 'I', 'A', null, 'I.91', 'Molino con piernas abiertas con medio spindle', 'Medio spindle', 'Dentro del molino con piernas abiertas, el cuerpo da medio giro (180°) en spindle; empieza y acaba en apoyo facial.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_full_spindle', 'floor', 'I', 'B', null, 'I.92', 'Molino con piernas abiertas con spindle completo', 'Spindle completo', 'Un giro completo (360°) de spindle hecho en 2 molinos con piernas abiertas como mucho, de apoyo facial a apoyo facial.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_spindle_over_270_to_handstand', 'floor', 'I', 'C', null, 'I.93', 'Spindle de más de 270° al pino', 'Spindle 270° al pino', 'Termina en el pino, al que llega directamente tras girar más de 270° en spindle en no más de 2 molinos; parte de apoyo facial. Para el valor solo cuenta un molino de este tipo por ejercicio.', 32, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_half_spindle_to_handstand', 'floor', 'I', 'B', null, 'I.98', 'Medio spindle al pino', 'Medio spindle al pino', 'Con los molinos con piernas abiertas hace medio spindle (180°) y termina en el pino; parte de apoyo facial.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_flair_spindle_over_270_handstand_continue', 'floor', 'I', 'D', null, 'I.100', 'Spindle de más de 270° al pino y seguir con molino', 'Spindle al pino y molino', 'Acaba en apoyo facial con un molino, de piernas juntas o abiertas, que sigue al pino; a ese pino llega directamente tras más de 270° de spindle en 2 molinos como máximo.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_russian_wende_360', 'floor', 'I', 'A', null, 'I.103', 'Molino ruso con giro completo', 'Molino ruso 360°', 'Molino ruso con giro completo (360°), lo normal con piernas juntas y de apoyo facial a apoyo facial; con giro y medio (540°) tiene el mismo valor. Con piernas abiertas no se permite.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_russian_wende_720', 'floor', 'I', 'B', null, 'I.104', 'Molino ruso con dos giros', 'Molino ruso 720°', 'Dos giros (720°) en molino ruso, o dos y medio (900°), por el mismo valor. Suele ir de apoyo facial a apoyo facial, y las piernas abiertas no se permiten.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_russian_wende_1080', 'floor', 'I', 'C', null, 'I.105', 'Molino ruso con tres giros o más', 'Fedorchenko', 'Tres giros (1080°) o más en molino ruso, de apoyo facial a apoyo facial y sin abrir las piernas. Solo un molino, molino abierto o ruso por ejercicio cuenta para el valor.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_roll_bwd_through_handstand_half_turn', 'floor', 'I', 'A', null, 'I.109', 'Voltereta atrás pasando por el pino con medio giro', 'Voltereta atrás con medio giro', 'Voltereta atrás que pasa por el pino con medio giro (180°); suele empezar en cuclillas.', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null),
  ('mfx_roll_bwd_hop_full_turn_through_handstand', 'floor', 'I', 'B', null, 'I.110', 'Voltereta atrás por el pino con rebote y giro completo', 'Voltereta atrás con giro completo', 'Partiendo normalmente de cuclillas, rueda atrás hasta pasar por el pino, da un rebote sobre las manos y completa un giro (360°).', 33, '2026-11-21'::date, 'Claude', '2026-11-21'::date, 1, 'draft', null);

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
