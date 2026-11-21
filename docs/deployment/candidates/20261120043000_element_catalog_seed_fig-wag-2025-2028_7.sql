-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 7.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 58 elementos (beam).
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
  ('bb_split_leap_fwd', 'beam', '2', 'A', null, '2.101', 'Zancada split adelante', 'Zancada split', 'Piernas abiertas por completo (180°), una adelante y otra atrás, en una zancada que sale de un pie y avanza por la barra. Es el salto split básico y termina de pie sobre la barra.', 120, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_stride_leap_fwd_leg_change_wolf', 'beam', '2', 'A', null, '2.105', 'Zancada con cambio a posición lobo', 'Zancada con cambio a lobo', 'Acaba el vuelo en posición lobo, con la cadera a 45°, después de cambiar de piernas en el aire. Arranca como una zancada adelante desde un pie y termina de pie en la barra.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_pike_jump_cross', 'beam', '2', 'A', null, '2.107', 'Salto carpado con dos pies de través', 'Salto carpado', 'En el aire, piernas juntas y estiradas por encima de la horizontal con el cuerpo carpado. Se salta con los dos pies, de través. Si pasa de lado a de través, o al revés, ese cuarto de giro (90°) no lo convierte en otro elemento.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_sissone', 'beam', '2', 'A', null, '2.108', 'Sissone o salto ciervo', 'Sissone', 'Sale con los dos pies, abre un split (180°) inclinado unos 45° respecto al suelo y cae sobre un pie. El salto ciervo, con la pierna de atrás estirada o flexionada, cuenta en la misma casilla; solo se reconoce una vez, la primera que se haga.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_cat_leap', 'beam', '2', 'A', null, '2.110', 'Salto gato o salto tijera', 'Salto gato', 'Rodillas arriba, una tras otra, por encima de la horizontal: así se ve este salto que sale de un pie. Vale igual la tijera, con las piernas estiradas lanzadas por turnos adelante por encima de la horizontal. Se cuenta solo la primera vez.', 125, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_wolf_jump_cross', 'beam', '2', 'A', null, '2.112', 'Salto lobo de través', 'Salto lobo', 'Rodillas juntas y cadera a 45° en posición lobo, de través. Vale con dos pies o a un pie, y en ese caso cae en el mismo pie o en los dos. Girar de lado a de través no lo cambia de elemento, y la casilla se cuenta una sola vez.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_split_jump_cross', 'beam', '2', 'B', null, '2.202', 'Salto split con dos pies de través', 'Salto split', 'Los dos pies despegan a la vez, de través, y las piernas se abren en split (180°) una adelante y otra atrás. Un cuarto de giro (90°) para pasar de lado a de través, o al revés, no da un elemento distinto.', 120, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_straddle_pike_jump_cross', 'beam', '2', 'B', null, '2.203', 'Salto carpado con piernas abiertas de través o split lateral', 'Carpa abierta', 'Las dos piernas suben abiertas por encima de la horizontal, con el cuerpo carpado, en un salto de dos pies de través. El split lateral cuenta igual y, de los dos, solo se reconoce el primero. Pasar de lado a de través no lo convierte en otro elemento.', 121, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_fouette_hop_half_turn_arabesque', 'beam', '2', 'B', null, '2.204', 'Fouetté saltado con medio giro a arabesque', 'Fouetté saltado a arabesque', 'Termina en arabesque sobre el mismo pie con el que salió, con la pierna libre por encima de la horizontal. Para llegar ahí lanza la pierna adelante y hace un fouetté con medio giro (180°) en el aire.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_leap_quarter_turn_straddle_pike', 'beam', '2', 'B', null, '2.206', 'Zancada en carpa abierta con cuarto de giro', 'Zancada carpada con ¼ giro', 'Cae en un pie o en los dos: valen ambas. Antes, saliendo de un pie, gira un cuarto (90°) y abre en carpado, con las dos piernas por encima de la horizontal.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_pike_jump_cross_half_turn', 'beam', '2', 'B', null, '2.207', 'Salto carpado de través con medio giro', 'Carpado con medio giro', 'Medio giro (180°) unido a un salto carpado de dos pies, colocada de través. Si además pasa de lado a de través, o al revés, ese cuarto de giro (90°) de más no cuenta como elemento nuevo.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_sissone_ring', 'beam', '2', 'B', null, '2.208', 'Sissone anillo', 'Sissone anillo', 'Junto al ciervo anillo, con la pierna de delante flexionada, forma una casilla que se cuenta una sola vez. La sissone anillo sale con los dos pies, abre en split (180°) con el pie de atrás a la altura de la cabeza, espalda arqueada y cabeza atrás, y cae en un pie.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_hop_half_turn_leg_fwd', 'beam', '2', 'B', null, '2.209', 'Medio giro saltado con la pierna adelante', 'Salto con medio giro pierna adelante', 'Pierna libre fija adelante, estirada a la horizontal: no se mueve en todo el medio giro (180°). Sale de un pie y cae en el mismo o en los dos. Comparte casilla, y se cuenta una vez, con el salto extendido de través con giro completo (360°), de uno o dos pies.', 124, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_cat_leap_half_turn', 'beam', '2', 'B', null, '2.210', 'Salto gato con medio giro', 'Gato con medio giro', 'Con medio giro (180°) en el aire, sube las rodillas una tras otra como en el salto gato. Sale de un pie y termina de pie en la barra.', 125, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_tuck_jump_cross_half_turn', 'beam', '2', 'B', null, '2.211', 'Salto agrupado de través con medio giro', 'Agrupado con medio giro', 'Agrupada, con cadera y rodillas a 45°, gira medio giro (180°) en el aire. Se hace de través y vale con dos pies o a un pie, cayendo en el mismo pie o en los dos; pasar de lado a de través no la convierte en otro elemento.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_wolf_jump_cross_half_turn', 'beam', '2', 'B', null, '2.212', 'Salto lobo de través con medio giro', 'Lobo con medio giro', 'Medio giro (180°) en posición lobo, de través. Puede despegar con los dos pies o hacerse a un pie y caer en el mismo o en los dos. El cuarto de giro (90°) extra de pasar de lado a de través no suma un elemento nuevo.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_split_leap_fwd_half_turn', 'beam', '2', 'C', null, '2.301', 'Zancada split adelante con medio giro', 'Zancada split con medio giro', 'Primero se ve la zancada split adelante y después llega el medio giro (180°), en ese orden. Sale de un pie y termina de pie sobre la barra.', 120, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_split_jump_cross_half_turn', 'beam', '2', 'C', null, '2.302', 'Salto split de través con medio giro', 'Salto split con medio giro', 'Salto de dos pies de través: abre primero en split y después da medio giro (180°). Pasar de lado a de través, o al revés, no lo cambia de elemento.', 120, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_straddle_pike_jump_cross_half_turn', 'beam', '2', 'C', null, '2.303', 'Salto carpado con piernas abiertas de través y medio giro', 'Carpa abierta con medio giro', 'Piernas abiertas y cuerpo carpado, con medio giro (180°), en un salto de dos pies de través. El cuarto de giro (90°) para pasar de lado a de través no da otro elemento.', 121, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_switch_leap', 'beam', '2', 'C', null, '2.305', 'Zancada con cambio', 'Zancada con cambio', 'Lo que la define es el cambio de piernas en el aire: el split (180°) llega solo después de cambiar. Antes, la pierna libre se balancea adelante al menos 45°. Sale de un pie y avanza por la barra.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_johnson_leap', 'beam', '2', 'C', null, '2.306', 'Zancada con cambio y cuarto de giro a split lateral', 'Johnson', 'Termina en split lateral (180°) tras un cuarto de giro (90°): lanza la pierna adelante desde un pie, cambia de piernas en el aire y gira. También vale si acaba en carpado con las piernas abiertas en lugar del split lateral.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_sheep_jump', 'beam', '2', 'C', null, '2.308', 'Salto oveja', 'Salto oveja', 'Con las dos rodillas flexionadas, los pies suben hasta la altura de la cabeza y cierran un anillo, con la parte alta de la espalda arqueada y la cabeza suelta atrás. Sale con los dos pies.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_cat_leap_full_turn', 'beam', '2', 'C', null, '2.310', 'Salto gato con giro completo', 'Gato con giro completo', 'Mientras las rodillas suben una después de la otra, da un giro completo (360°) en el aire. Se impulsa desde un pie y acaba de pie en la barra.', 125, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_tuck_jump_cross_full_turn', 'beam', '2', 'C', null, '2.311', 'Salto agrupado de través con giro completo', 'Agrupado con giro completo', 'Agrupada y de través, da un giro completo (360°) en el aire. Vale tanto con dos pies como a un pie; en ese caso cae en el mismo pie o en los dos. Si pasa de lado a de través, ese cuarto de giro (90°) no lo convierte en otro elemento.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_split_jump_cross_full_turn', 'beam', '2', 'D', null, '2.402', 'Salto split de través con giro completo', 'Salto split con giro completo', 'Un salto split de dos pies, de través, al que se suma un giro completo (360°). El cuarto de giro (90°) de pasar de lado a de través, o al revés, no lo hace distinto.', 120, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_straddle_pike_jump_cross_full_turn', 'beam', '2', 'D', null, '2.403', 'Salto carpado con piernas abiertas de través y giro completo', 'Carpa abierta con giro completo', 'Sale con los dos pies de través y da un giro completo (360°) con las piernas abiertas y el cuerpo carpado. Pasar de lado a de través no cuenta como elemento nuevo.', 121, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_tour_jete', 'beam', '2', 'D', null, '2.404', 'Tour jeté', 'Tour jeté', 'Lanza la pierna adelante desde un pie, hace un fouetté con medio giro (180°) y cambia de piernas en el aire hasta abrir un split (180°).', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_switch_leap_half_turn', 'beam', '2', 'D', null, '2.405', 'Zancada con cambio y medio giro', 'Zancada con cambio y medio giro', 'Parte de la zancada con cambio: cambia de piernas en el aire, muestra primero el split y a continuación añade medio giro (180°).', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_pike_jump_cross_full_turn', 'beam', '2', 'D', null, '2.407', 'Salto carpado de través con giro completo', 'Carpado con giro completo', 'Carpado y con giro completo (360°), este salto de dos pies se hace de través. Un cuarto de giro (90°) para pasar de lado a de través, o al revés, no da otro elemento.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_split_jump_ring', 'beam', '2', 'D', null, '2.408', 'Anillo en split con dos pies', 'Salto split anillo (Yang Bo)', 'Tres formas valen aquí y la casilla se cuenta una vez: el anillo en split (180°) saliendo y cayendo con dos pies, la misma forma en zancada desde un pie y el Yang Bo. Este, de dos pies, abre más allá del split (180°) con el cuerpo arqueado y la cabeza atrás.', 123, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_stretched_jump_cross_one_and_half_turn', 'beam', '2', 'D', null, '2.409', 'Salto extendido de través con giro y medio', 'Extendido con giro y medio', 'Con el cuerpo extendido y colocada de través, encadena giro y medio (540°) en el aire. Vale despegando con los dos pies o a un pie, y en ese caso cae en el mismo pie o en los dos.', 124, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_tuck_jump_cross_one_and_half_turn', 'beam', '2', 'D', null, '2.411', 'Salto agrupado de través con giro y medio', 'Agrupado con giro y medio', 'Agrupada, de través, completa giro y medio (540°) en el aire. Puede salir de dos pies o de uno, y entonces cae en el mismo o en los dos; pasar de lado a de través no cambia el elemento.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_wolf_jump_cross_full_turn', 'beam', '2', 'D', null, '2.412', 'Salto lobo de través con giro completo', 'Lobo con giro completo', 'Posición lobo con giro completo (360°), de través. Sirve con dos pies o a un pie, cayendo en el mismo o en los dos. El cuarto de giro (90°) que añade pasar de lado a de través no suma otro elemento.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_tour_jete_extra_half_turn', 'beam', '2', 'E', null, '2.504', 'Tour jeté con medio giro más', 'Tour jeté con medio giro', 'Un tour jeté que suma medio giro (180°) más, hasta completar un giro (360°). Sale de un pie, hace el fouetté y cambia de piernas en el aire.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_switch_leap_ring', 'beam', '2', 'E', null, '2.505', 'Zancada con cambio en anillo', 'Zancada con cambio en anillo', 'La zancada con cambio termina en anillo: tras cambiar de piernas en el aire, el pie de atrás sube cerca de la cabeza y la cabeza se va atrás, sobre un split (180°). Sale de un pie lanzando la pierna adelante.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_johnson_extra_half_turn', 'beam', '2', 'E', null, '2.506', 'Johnson con medio giro tras el split lateral', 'Johnson con medio giro', 'Después del split lateral llega medio giro (180°) más, y cae erguida. La base es el Johnson: sale de un pie, lanza la pierna adelante, cambia de piernas en el aire y gira hasta el split lateral.', 122, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_wolf_jump_cross_one_and_half_turn', 'beam', '2', 'E', null, '2.512', 'Salto lobo de través con giro y medio', 'Lobo con giro y medio', 'Lo que pide este salto de través es giro y medio (540°) en posición lobo. Vale con dos pies o a un pie, cayendo en el mismo o en los dos; pasar de lado a de través no lo convierte en otro elemento.', 126, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_one_foot_360', 'beam', '3', 'A', null, '3.101', 'Giro completo sobre un pie', 'Giro completo', 'La pierna libre va donde la gimnasta quiera, siempre por debajo de la horizontal, mientras da un giro completo (360°) sobre un pie.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_one_foot_540', 'beam', '3', 'B', null, '3.201', 'Giro y medio sobre un pie', 'Giro y medio', 'Sobre un pie, giro y medio (540°) con la pierna libre donde quiera, pero siempre por debajo de la horizontal.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_illusion_turn_180', 'beam', '3', 'B', null, '3.206', 'Giro ilusión con medio giro', 'Ilusión con medio giro', 'Sobre un pie, la pierna libre pasa por un split de pie (180°) mientras gira medio giro (180°). Puede apoyar un momento una mano en la barra, pero no es obligatorio.', 129, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_tuck_stand_one_leg_360', 'beam', '3', 'B', null, '3.207', 'Giro completo en cuclillas sobre una pierna', 'Giro en cuclillas', 'En cuclillas sobre una pierna, con la otra estirada todo el tiempo casi a la horizontal y los brazos a los lados, gira un giro completo (360°).', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_prone_360', 'beam', '3', 'B', null, '3.208', 'Giro tumbada boca abajo', 'Giro boca abajo', 'Tumbada boca abajo sobre la barra, gira un giro completo (360°) y puede apoyarse alternando las manos. El giro y medio (540°) en la misma posición entra en esta casilla; se cuenta una sola vez.', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_back_attitude_360', 'beam', '3', 'C', null, '3.302', 'Giro completo en attitude atrás', 'Giro en attitude', 'Pierna libre atrás en attitude, flexionada y con el muslo a la horizontal, sin perder la posición en ningún momento del giro completo (360°) sobre un pie.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_heel_fwd_horizontal_360', 'beam', '3', 'C', null, '3.304', 'Giro con la pierna libre al frente', 'Giro con pierna al frente', 'Puede apoyar con la pierna estirada o flexionada; lo que no cambia es la libre, extendida al frente con el talón a la horizontal de principio a fin del giro completo (360°).', 128, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_held_split_360', 'beam', '3', 'C', null, '3.305', 'Giro completo con la pierna en split sujeta con la mano', 'Giro en split sujeta', 'Con la mano, sujeta arriba la pierna libre en split (180°), adelante o al lado, y la mantiene así durante todo el giro completo (360°) sobre un pie.', 129, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_tuck_stand_one_leg_540', 'beam', '3', 'C', null, '3.307', 'Giro y medio en cuclillas sobre una pierna', 'Giro y medio en cuclillas', 'Medio giro más que el giro en cuclillas: giro y medio (540°) sobre una pierna flexionada. La otra no se dobla en ningún momento y va casi a la horizontal, con los brazos a los lados.', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_one_foot_720', 'beam', '3', 'D', null, '3.401', 'Doble giro sobre un pie', 'Doble giro', 'Dos giros (720°) sobre un pie. La pierna libre, en la posición que elija, se queda siempre por debajo de la horizontal.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_back_attitude_540', 'beam', '3', 'D', null, '3.402', 'Giro y medio en attitude atrás', 'Giro y medio en attitude', 'Mantiene la attitude atrás, con el muslo de la pierna libre a la horizontal, a lo largo de giro y medio (540°) sobre un pie.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_free_leg_held_bwd_both_hands_360', 'beam', '3', 'D', null, '3.403', 'Giro completo con la pierna libre sujeta atrás con las dos manos', 'Preziosa', 'Las dos manos sujetan atrás la pierna libre, alta por detrás de la cabeza, durante todo el giro completo (360°). La pierna de apoyo va estirada.', 128, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_heel_fwd_horizontal_540', 'beam', '3', 'D', null, '3.404', 'Giro y medio con pierna al frente', 'Giro y medio con pierna al frente', 'Durante giro y medio (540°) el talón de la pierna libre se mantiene a la horizontal, con la pierna estirada al frente. La de apoyo, como en el giro completo, puede ir estirada o flexionada.', 128, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_held_split_540', 'beam', '3', 'D', null, '3.405', 'Giro y medio con la pierna en split sujeta con la mano', 'Galante', 'Sin soltar la pierna libre, que sujeta con la mano arriba en split (180°), adelante o al lado, completa giro y medio (540°) sobre un pie.', 129, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_illusion_turn_360', 'beam', '3', 'D', null, '3.406', 'Giro completo en ilusión', 'Ilusión con giro completo', 'Una mano puede rozar la barra un momento, si hace falta. Sobre un pie, la pierna libre barre hasta un split de pie (180°) mientras la gimnasta completa un giro (360°).', 129, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_tuck_stand_one_leg_720', 'beam', '3', 'D', null, '3.407', 'Doble giro o dos giros y medio en cuclillas', 'Doble giro en cuclillas', 'Dos formas en cuclillas sobre una pierna: doble giro (720°) y dos giros y medio (900°), que es el Humphrey; de la casilla se cuenta la primera que se haga. La otra pierna, recta y casi horizontal; los brazos, a los lados.', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_on_back_kip_450', 'beam', '3', 'D', null, '3.408', 'Giro tumbada boca arriba en carpado (450°)', 'Li Li', 'Tumbada boca arriba y carpada, con la cadera cerrada y las piernas pasando por encima de la cabeza, gira un giro y cuarto (450°).', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_one_foot_1080', 'beam', '3', 'E', null, '3.501', 'Okino: tres giros con la pierna libre baja', 'Okino', 'Con la pierna libre baja, en la posición que prefiera pero siempre por debajo de la horizontal, encadena tres giros (1080°) sobre un pie.', 127, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_heel_fwd_horizontal_720', 'beam', '3', 'E', null, '3.504', 'Doble giro con pierna al frente', 'Wevers', 'Pide mantener la pierna libre al frente, estirada y con el talón a la horizontal, durante dos giros (720°), con la pierna de apoyo estirada o flexionada a elección.', 128, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_held_split_720', 'beam', '3', 'E', null, '3.505', 'Doble giro con split sujeto', 'Sugihara', 'La mano no suelta la pierna libre, arriba en split (180°) por delante o por el lado, en ningún momento de los dos giros (720°) sobre un pie.', 129, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null),
  ('bb_turn_tuck_stand_one_leg_1080', 'beam', '3', 'E', null, '3.507', 'Mitchell: tres giros en cuclillas', 'Mitchell', 'Tres giros (1080°) sin levantarse de la cuclilla, apoyada en una sola pierna. Brazos abiertos a los lados y la otra pierna recta, casi horizontal, de principio a fin.', 130, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 7, 'draft', null);

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
