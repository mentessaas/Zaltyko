-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 3.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 51 elementos (uneven_bars).
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
  ('ub_glide_kip_lb', 'uneven_bars', '1', 'A', null, '1.101', 'Kippe con deslizamiento a la barra baja', 'Kippe con deslizamiento', 'Desde el suelo, de frente a la barra baja, la gimnasta hace un deslizamiento y una kippe hasta el apoyo facial. También cuenta con medio giro (180°) durante el deslizamiento.', 72, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_half_turn_kip_lb', 'uneven_bars', '1', 'A', null, '1.102', 'Entrada con salto y medio giro a kippe en barra baja', 'Salto con ½ giro a kippe', 'Con medio giro (180°) en el vuelo del salto desde el suelo, llega a la barra baja y hace una kippe hasta el apoyo facial. También vale pasando las piernas juntas entre las manos y subiendo a apoyo dorsal.', 72, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_glide_stoop_through_rear_support', 'uneven_bars', '1', 'A', null, '1.103', 'Deslizamiento con paso de piernas juntas a apoyo dorsal', 'Deslizamiento a apoyo dorsal', 'Tras el deslizamiento en la barra baja, pasa las piernas juntas entre las manos y sube a apoyo dorsal. También vale desde la suspensión en barra alta, o con un corte atrás de piernas abiertas que acaba en suspensión.', 73, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_hang_kip_hb', 'uneven_bars', '1', 'A', null, '1.104', 'Entrada con salto a suspensión y kippe en barra alta', 'Kippe a barra alta', 'Salta desde el trampolín a la suspensión en la barra alta con presa dorsal y hace una kippe hasta el apoyo facial. Con presa palmar cuenta igual.', 73, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_full_turn_hang_hb', 'uneven_bars', '1', 'A', null, '1.105', 'Salto con giro completo a suspensión en barra alta', 'Salto con giro a barra alta', 'De frente a la barra alta, salta desde el trampolín haciendo un giro completo (360°) en el vuelo y llega a la suspensión.', 74, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_straddle_vault_over_lb_hang_hb', 'uneven_bars', '1', 'A', null, '1.106', 'Salto con piernas abiertas sobre la barra baja a suspensión en barra alta', 'Piernas abiertas sobre barra baja', 'Desde el trampolín, de frente a la barra baja, salta y pasa por encima con las piernas abiertas, se empuja con las manos y vuela hasta agarrar la barra alta en suspensión.', 74, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_full_turn_glide_kip_lb', 'uneven_bars', '1', 'B', null, '1.202', 'Salto con giro completo a kippe con deslizamiento en barra baja', 'Giro completo a kippe', 'Un giro completo (360°) en el vuelo del salto desde el suelo precede al deslizamiento y la kippe, que terminan en apoyo facial en la barra baja.', 72, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_reverse_kip_rear_support', 'uneven_bars', '1', 'B', null, '1.203', 'Kippe invertida a apoyo dorsal', 'Kippe invertida', 'Tras el deslizamiento en la barra baja, pasa las piernas entre las manos con el cuerpo carpado y, con un balanceo y una vuelta atrás sentada, sube a apoyo dorsal. También vale desde la suspensión en barra alta.', 73, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_half_turn_kip_hb', 'uneven_bars', '1', 'B', null, '1.204', 'Salto con medio giro a kippe en barra alta', '½ giro a kippe en barra alta', 'De frente a la barra alta, salta desde el suelo con medio giro (180°) en el vuelo y hace una kippe hasta el apoyo facial. También cuenta saltar desde el trampolín por encima de la barra baja con medio giro hasta la suspensión en la alta.', 73, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_free_straddle_jump_over_lb_hang_hb', 'uneven_bars', '1', 'B', null, '1.206', 'Salto libre con piernas abiertas sobre la barra baja a suspensión en barra alta', 'Salto libre piernas abiertas', 'Desde el trampolín salta libre por encima de la barra baja con las piernas abiertas y vuela hasta la suspensión en la barra alta. También vale en hecht, con piernas juntas y empuje de manos.', 74, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_salto_fwd_over_lb_l_hang_lb', 'uneven_bars', '1', 'B', null, '1.207', 'Mortal adelante agrupado sobre la barra baja a suspensión en L', 'Mortal adelante a barra baja', 'Desde el trampolín, de frente a la barra baja, hace un mortal adelante agrupado por encima de ella y termina en suspensión en L en la misma barra. También vale carpado o con piernas abiertas.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_flight_bwd_straddle_support_lb', 'uneven_bars', '1', 'B', null, '1.208', 'Rondada al trampolín y vuelo atrás pasando por apoyo abierto en barra baja', 'Rondada y apoyo abierto de paso', 'Pasa por la barra baja en apoyo con piernas abiertas y sin tocar con la cadera, sin quedarse en esa posición, después de una rondada al trampolín colocado delante de ella y un vuelo hacia atrás.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_handstand_hips_bent_lb', 'uneven_bars', '1', 'B', null, '1.210', 'Salto del trampolín a vertical extendida en barra baja, subiendo con cadera flexionada', 'Salto a vertical (subida flexionada)', 'Acaba en una vertical extendida en la barra baja, aunque la subida desde el trampolín se hace con la cadera flexionada y las piernas juntas. Vale también con piernas abiertas y con medio giro (180°) ya en la vertical.', 77, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_half_turn_over_lb_kip_hb', 'uneven_bars', '1', 'C', null, '1.304', 'Salto con medio giro sobre la barra baja a kippe en barra alta', '½ giro sobre barra baja a kippe', 'Desde el trampolín, salta por encima de la barra baja con medio giro (180°) en el vuelo y hace una kippe hasta el apoyo facial en la barra alta.', 73, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_free_stretch_jump_over_lb_hang_hb', 'uneven_bars', '1', 'C', null, '1.306', 'Salto libre extendido sobre la barra baja a suspensión en barra alta', 'Makhautsova', 'Con el cuerpo extendido y las piernas juntas, salta desde el trampolín por encima de la barra baja y vuela hasta la suspensión en la barra alta.', 74, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_salto_fwd_hang_hb', 'uneven_bars', '1', 'C', null, '1.307', 'Mortal adelante desde fuera de las barras a suspensión en barra alta', 'Mortal a la alta desde fuera', 'Termina colgada de la barra alta tras un mortal adelante saltado del trampolín, puesto por fuera de las barras y de cara a la alta, sin pasar sobre la baja. También vale entrar de frente a la baja y cruzarla con voltereta adelante carpada y empuje de manos.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_flight_bwd_over_lb_hang_hb', 'uneven_bars', '1', 'C', null, '1.308', 'Rondada con vuelo atrás sobre la barra baja a suspensión en barra alta', 'Rondada a barra alta', 'Tras la rondada, vuela hacia atrás por encima de la barra baja con las piernas juntas y agarra la barra alta en suspensión. Con las piernas abiertas cuenta igual.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_handstand_hips_bent_full_turn_lb', 'uneven_bars', '1', 'C', null, '1.310', 'Salto a vertical en barra baja con giro completo, subiendo con cadera flexionada', 'Subida flexionada con giro completo', 'El giro completo (360°) se hace ya en la vertical extendida de la barra baja, a la que sube desde el trampolín con la cadera flexionada y piernas juntas o abiertas. También vale subir con el cuerpo extendido, sin giro o con medio giro (180°); sin giro es el Maaranen.', 77, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_hecht_jump_full_turn_over_lb_hang_hb', 'uneven_bars', '1', 'D', null, '1.406', 'Hecht con giro completo sobre la barra baja a suspensión en barra alta', 'Gebeshian (Petrova)', 'Es el Gebeshian: desde el trampolín hace un hecht con empuje de manos y piernas juntas, con giro completo (360°) en el vuelo hasta la suspensión en la barra alta. La Petrova, otra forma de la casilla, pasa por encima de la barra baja con salto extendido y el mismo giro.', 74, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_salto_fwd_tucked_over_lb_hang_hb', 'uneven_bars', '1', 'D', null, '1.407', 'Mortal adelante agrupado del trampolín por encima de la barra baja a la alta', 'Mortal agrupado a la alta', 'Sin tocar la barra baja, la sobrevuela con un mortal adelante agrupado que sale del trampolín, de cara a ella, y se cuelga de la barra alta.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_flight_bwd_full_turn_hang_hb', 'uneven_bars', '1', 'D', null, '1.408', 'Entrada con rondada y pirueta en vuelo atrás hasta la barra alta', 'Rondada y pirueta a la alta', 'Llega colgada de la barra alta después de volar de espaldas por encima de la barra baja con un giro completo (360°). Todo empieza con una rondada en el suelo.', 75, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_salto_bwd_tucked_hang_lb', 'uneven_bars', '1', 'D', null, '1.409', 'Rondada y mortal atrás agrupado a suspensión en barra baja', 'Jentsch (González)', 'Tras la rondada, hace un mortal atrás agrupado por encima de la barra baja y acaba en suspensión en ella: es el Jentsch. La González, otra forma de la casilla, es rondada y flik-flak a la barra baja pasando por la vertical.', 76, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_stretched_handstand_full_turn_lb', 'uneven_bars', '1', 'D', null, '1.410', 'Salto a la vertical con cuerpo extendido y giro completo en barra baja', 'Maaranen', 'Desde el trampolín sube a la vertical en la barra baja con el cuerpo extendido y, ya en ella, hace un giro completo (360°).', 77, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_jump_clear_hip_circle_handstand_hb', 'uneven_bars', '1', 'D', null, '1.411', 'Vertical en barra alta tras salto del trampolín y vuelta libre atrás', 'McNamara', 'La vertical en la barra alta llega con una vuelta libre atrás, que la gimnasta enlaza al caer del salto del trampolín en apoyo con la cadera separada de la barra. Vale también con medio giro (180°) ya en la vertical.', 77, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_flic_flac_full_turn_lb', 'uneven_bars', '1', 'E', null, '1.509', 'Rondada y flik-flak con giro completo hasta el apoyo en barra baja', 'Gurova', 'El giro completo (360°) va dentro del vuelo del flik-flak que sigue a la rondada, y las manos llegan a la barra baja en apoyo sin tocar con la cadera. Si en lugar de quedarse en apoyo pasa por la vertical, cuenta igual.', 76, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_arabian_tucked_over_lb_hang_hb', 'uneven_bars', '1', 'F', null, '1.609', 'Mortal árabe agrupado tras rondada, sobrevolando la barra baja hasta la alta', 'Árabe agrupado a la alta', 'Se cuelga de la barra alta después de cruzar por encima de la baja, sin tocarla, con un mortal árabe agrupado que lleva medio giro (180°) y sale de una rondada en el suelo.', 76, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_round_off_arabian_piked_over_lb_hang_hb', 'uneven_bars', '1', 'G', null, '1.709', 'Mortal árabe carpado tras rondada, sobrevolando la barra baja hasta la alta', 'Árabe carpado a la alta', 'Es la versión carpada: tras la rondada, el mortal árabe con medio giro (180°) se hace con el cuerpo carpado, cruza por encima de la barra baja sin tocarla y acaba colgado de la alta.', 76, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_handstand_straddled_or_bent', 'uneven_bars', '2', 'A', null, '2.101', 'Impulso a la vertical abierta o con cadera flexionada', 'Impulso a vertical abierta', 'Llega a la vertical con las piernas abiertas gracias a un impulso desde el apoyo facial. Cuenta igual con la cadera flexionada en lugar de abierta, y también si lleva un cambio de presa saltado.', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_hip_circle_fwd', 'uneven_bars', '2', 'A', null, '2.104', 'Vuelta adelante de cadera', 'Vuelta adelante de cadera', 'Desde el apoyo facial, gira hacia adelante con la cadera en contacto con la barra y vuelve al apoyo facial. Sirve en cualquiera de las barras.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_hip_circle_bwd', 'uneven_bars', '2', 'A', null, '2.105', 'Vuelta atrás al apoyo', 'Vuelta atrás al apoyo', 'Del apoyo facial al apoyo facial, con una vuelta atrás en la que la cadera toca la barra, en cualquiera de ellas. En la barra baja también cuenta con un empuje de cadera que suelta y vuelve a agarrar, en vuelta normal o libre.', 80, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_handstand_legs_together', 'uneven_bars', '2', 'B', null, '2.201', 'Impulso a la vertical con piernas juntas', 'Impulso a vertical', 'En cualquiera de las barras, del apoyo facial sube con un impulso a la vertical con el cuerpo extendido y las piernas juntas. También vale con cambio de presa saltado, o con medio giro (180°) en la vertical, con piernas juntas o abiertas.', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_stoop_over_hb_half_turn_hang_hb', 'uneven_bars', '2', 'B', null, '2.202', 'Paso de piernas juntas sobre la barra alta con medio giro a suspensión', 'Paso sobre barra alta con ½ giro', 'Desde el apoyo facial en la barra alta, pasa las piernas juntas por encima, suelta y vuelve a agarrar con medio giro (180°) en el vuelo hasta la suspensión. Con las piernas abiertas cuenta igual.', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_underswing_lb_counter_flight_hang_hb', 'uneven_bars', '2', 'B', null, '2.206', 'Desde vertical en barra baja, balanceo por debajo y vuelo adelante a la barra alta', 'Balanceo y vuelo a la alta', 'Se cuelga de la barra alta tras salir de la vertical en la baja con un balanceo por debajo de la barra. Al soltar, el cuerpo cambia de sentido y vuela hacia adelante hasta la alta.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_full_turn_handstand', 'uneven_bars', '2', 'C', null, '2.301', 'Impulso a la vertical con giro completo', 'Impulso a vertical con giro', 'Un impulso desde el apoyo facial lleva a la vertical, donde hace un giro completo (360°). Vale en cualquiera de las barras.', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_hip_circle_bwd_hecht_half_turn_hang', 'uneven_bars', '2', 'C', null, '2.302', 'Vuelta atrás al apoyo y hecht con medio giro sobre la misma barra alta', 'Hecht con ½ giro (misma barra)', 'Todo pasa en la barra alta: tras una vuelta atrás al apoyo desde el apoyo facial, sale en hecht por encima de la barra, suelta, hace medio giro (180°) y vuelve a agarrar la misma barra en suspensión. Con vuelta libre cuenta igual.', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_release_full_turn_hang_hb', 'uneven_bars', '2', 'C', null, '2.303', 'Impulso con suelta y giro completo a suspensión en barra alta', 'Caslavska', 'Desde el apoyo facial en la barra alta, hace un impulso, suelta y gira completo (360°) en el vuelo antes de volver a agarrar en suspensión.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_handstand', 'uneven_bars', '2', 'C', null, '2.305', 'Vuelta libre atrás a la vertical', 'Vuelta libre a vertical', 'Desde el apoyo facial, en cualquiera de las barras, hace una vuelta libre atrás hasta la vertical. También cuenta con un cambio de presa saltado o con medio giro (180°) al llegar a la vertical.', 80, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_hb_hecht_support_lb', 'uneven_bars', '2', 'C', null, '2.306', 'Vuelta libre en barra alta con hecht a apoyo libre en barra baja', 'Pedrick', 'Desde la vertical en la barra alta, hace una vuelta libre atrás, sale en hecht y vuela hasta un apoyo libre en la barra baja.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_outer_front_support_clear_hip_circle_hecht_hb', 'uneven_bars', '2', 'C', null, '2.307', 'Hecht a barra alta desde vuelta libre atrás en apoyo por fuera', 'Yarotska', 'Llega a la suspensión en la barra alta con un hecht que sale de una vuelta libre atrás en la barra baja. Empieza en apoyo facial por fuera, de espaldas a la barra alta.', 82, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_one_and_half_turn_handstand', 'uneven_bars', '2', 'D', null, '2.401', 'Impulso a la vertical con giro y medio', 'Reeder', 'En cualquiera de las barras, sube con un impulso desde el apoyo facial a la vertical y hace en ella un giro y medio (540°).', 78, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_salto_roll_fwd_lb_to_hb', 'uneven_bars', '2', 'D', null, '2.403', 'Impulso desde la barra baja y voltereta adelante en el aire hasta la barra alta', 'Brause / Radochla', 'Acaba colgada de la barra alta tras soltar la baja y rodar hacia adelante en el aire, como una voltereta con vuelo. Todo arranca con un impulso desde el apoyo facial por dentro en la barra baja.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_fwd_handstand', 'uneven_bars', '2', 'D', null, '2.404', 'Vuelta libre adelante a la vertical', 'Vuelta libre adelante', 'De vertical a vertical, con una vuelta libre adelante, en cualquiera de las barras. También vale con medio giro (180°) al terminar en la vertical.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_full_turn_handstand', 'uneven_bars', '2', 'D', null, '2.405', 'Vuelta libre atrás a la vertical con giro completo', 'Vuelta libre con giro', 'Desde el apoyo facial hace una vuelta libre atrás y, al llegar a la vertical, un giro completo (360°). Sirve en cualquiera de las barras.', 80, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_inner_front_support_clear_hip_circle_flight_hb', 'uneven_bars', '2', 'D', null, '2.406', 'Vuelo de barra baja a barra alta desde vuelta libre atrás en apoyo por dentro', 'Shaposhnikova', 'El vuelo a la barra alta nace de una vuelta libre atrás en la barra baja, empezando en apoyo facial por dentro. La gimnasta pasa por la vertical sin quedarse, suelta y se cuelga de la alta.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_outer_front_support_clear_hip_circle_hecht_half_turn_hb', 'uneven_bars', '2', 'D', null, '2.407', 'Hecht con medio giro a barra alta desde vuelta libre atrás por fuera', 'Hecht con medio giro a la alta', 'El medio giro (180°) se hace en el vuelo del hecht, con piernas juntas o abiertas, camino de la suspensión en la barra alta. Antes hay una vuelta libre atrás en la barra baja desde apoyo facial por fuera.', 82, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_cast_salto_fwd_straddled_hang_hb', 'uneven_bars', '2', 'E', null, '2.503', 'Impulso con mortal adelante con piernas abiertas a suspensión en barra alta', 'Comaneci', 'Desde el apoyo facial en la barra alta, hace un impulso, suelta y da un mortal adelante con las piernas abiertas para volver a agarrar la barra en suspensión.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_fwd_full_turn_handstand', 'uneven_bars', '2', 'E', null, '2.504', 'Vuelta libre adelante a la vertical con giro completo', 'Godwin (Adalsteinsdottir)', 'De la vertical, una vuelta libre adelante y de nuevo a la vertical con giro completo (360°), en cualquiera de las barras: es el Godwin. La Adalsteinsdottir, otra forma de la casilla, enlaza la vuelta con un mortal adelante abierto y vuelve a agarrar la barra alta.', 79, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_one_and_half_turn_handstand', 'uneven_bars', '2', 'E', null, '2.505', 'Vuelta libre atrás a la vertical con giro y medio', 'Vuelta libre con giro y medio', 'Termina en la vertical con un giro y medio (540°) tras una vuelta libre atrás desde el apoyo facial. Vale en cualquiera de las barras.', 80, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_hb_counter_straddle_hang_hb', 'uneven_bars', '2', 'E', null, '2.506', 'Vuelta libre atrás en barra alta y cruce con piernas abiertas por encima de la barra', 'Hindorff (Martins, Khorkina)', 'Suelta la barra alta al acabar una vuelta libre atrás desde la vertical, la cruza por encima con las piernas abiertas y la vuelve a agarrar. Martins añade medio giro (180°) y presa mixta cubital; Khorkina hace la vuelta libre en la baja y, desde la vertical, vuela con medio giro a la alta.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_hb_counter_pike_hang_hb', 'uneven_bars', '2', 'F', null, '2.606', 'Vuelta libre en barra alta con contravuelo carpado sobre la barra', 'Shang (Black)', 'Desde la vertical en la barra alta, vuelta libre atrás, suelta y contravuelo carpado por encima de la barra hasta volver a agarrarla en suspensión: es el Shang. La Black, otra forma de la casilla, añade medio giro (180°) con presa mixta cubital.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null),
  ('ub_clear_hip_circle_hb_counter_reverse_hecht_layout', 'uneven_bars', '2', 'G', null, '2.706', 'Vuelta libre en barra alta con hecht invertido extendido a suspensión', 'Zhang', 'Desde la vertical en la barra alta, hace una vuelta libre atrás, suelta y realiza un hecht invertido en contravuelo con el cuerpo extendido antes de volver a agarrar la barra.', 81, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 3, 'draft', null);

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
