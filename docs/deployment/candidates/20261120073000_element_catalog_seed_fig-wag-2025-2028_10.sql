-- CANDIDATE ONLY. Semilla de la biblioteca de elementos: edición fig-wag-2025-2028, tanda 10.
-- No aplicado en ningún entorno. Requiere autorización de Elvis para cada entorno
-- (sandbox, staging o producción) antes de aplicarse.
-- Generado por scripts/element-library/build-seed.ts desde
-- src/modules/element-library/data/editions.json y data/fig-wag-2025-2028/*.json.
-- No editar a mano: tests/element-library-data-files.test.ts exige que coincida
-- con lo que genera el script.
-- Contenido: la edición y 42 elementos (floor).
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
  ('fx_split_leap_fwd_180', 'floor', '1', 'A', null, '1.101', 'Salto split adelante con apertura completa', 'Salto split', 'Zancada hacia adelante que sale de un pie y muestra en lo más alto un split completo (180°), una pierna delante y otra detrás.', 149, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_tuck_jump_to_cross_split', 'floor', '1', 'A', null, '1.103', 'Salto agrupado que se abre a split', 'Agrupado a split', 'Dos formas en un mismo vuelo: tras salir con los dos pies, la gimnasta se agrupa y enseguida separa las piernas en split (180°).', 151, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_leap_quarter_turn_straddle_pike', 'floor', '1', 'A', null, '1.104', 'Zancada adelante con cuarto de giro y piernas abiertas', 'Zancada con ¼ de giro abierta', 'Cae con uno o con los dos pies después de abrir las piernas de lado, en carpado abierto con ambas sobre la horizontal o en split lateral. Antes de abrirlas, la zancada adelante desde un pie ya ha girado un cuarto (90°); cuenta una sola vez.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_stride_leap_change_to_wolf', 'floor', '1', 'A', null, '1.105', 'Zancada adelante con cambio de piernas en lobo', 'Zancada cambio a lobo', 'Cambio de piernas en el aire y posición de lobo dentro de una misma zancada hacia adelante, impulsada desde un pie.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_pike_jump', 'floor', '1', 'A', null, '1.106', 'Salto carpado', 'Salto carpado', 'Con las piernas juntas por encima de la horizontal, el cuerpo se cierra en carpado en pleno vuelo, tras una salida con los dos pies.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_pike_or_side_split_jump', 'floor', '1', 'A', null, '1.107', 'Salto a piernas abiertas, carpado o en split lateral', 'Salto abierto', 'Solo puntúa una vez, tanto si la gimnasta abre en split lateral (180°) como si lo hace en carpado abierto con las dos piernas sobre la horizontal. Las dos formas valen igual con salida de uno o de dos pies.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_pike_jump_to_front_lying_support', 'floor', '1', 'A', null, '1.108', 'Salto carpado abierto con caída en apoyo facial', 'Abierto a apoyo facial', 'Acaba en apoyo facial: sale con los dos pies y abre en carpado abierto, piernas sobre la horizontal, o en split lateral, con o sin medio giro (180°). También vale saliendo de un pie con giro completo (360°) antes de abrir; se cuenta una vez.', 154, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_split_jump_two_feet', 'floor', '1', 'A', null, '1.109', 'Salto split de dos pies, ciervo o sissone', 'Salto split a dos pies', 'Comparten número el ciervo, con o sin medio giro (180°), la sissone, que abre en diagonal a unos 45° del suelo y cae en un pie, y el salto split de dos pies con la pierna de atrás estirada o flexionada. Todas llevan split de 180°; cuenta una vez.', 155, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_stretched_jump_full_turn', 'floor', '1', 'A', null, '1.110', 'Salto extendido con giro completo', 'Salto extendido con giro completo', 'Un giro completo (360°) con el cuerpo bien estirado. Lo normal es salir con los dos pies, aunque también vale como salto a un pie.', 156, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_cat_leap', 'floor', '1', 'A', null, '1.111', 'Salto gato con elevación alterna de rodillas', 'Salto gato', 'Las rodillas suben una tras otra, flexionadas y por encima de la horizontal, en una zancada que sale de un pie. La tijera adelante con piernas estiradas sobre la horizontal es el mismo elemento y se cuenta una sola vez.', 156, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_fouette_hop_half_turn_arabesque', 'floor', '1', 'A', null, '1.112', 'Salto a un pie con medio giro hasta arabesque (fouetté)', 'Fouetté saltado', 'Un lanzamiento de pierna adelante abre este medio giro (180°) saltado sobre un pie, que acaba en arabesque con la pierna libre por encima de la horizontal. Cuenta igual, una sola vez, el medio giro con la libre adelante a la horizontal todo el rato, cayendo en el mismo pie o en los dos.', 157, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_wolf_jump', 'floor', '1', 'A', null, '1.114', 'Salto lobo con salida de dos pies o de uno', 'Salto lobo', 'Rodillas juntas: así se reconoce el lobo, con una pierna recogida y la otra estirada adelante por encima de la horizontal. Lo normal es saltar con los dos pies, aunque también se admite como salto a un pie.', 158, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_split_leap_half_turn', 'floor', '1', 'B', null, '1.201', 'Salto split con medio giro', 'Salto split con medio giro', 'Zancada split que incorpora medio giro (180°) en el aire; sale de un pie y las piernas se abren una delante y otra detrás.', 149, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_fouette_hop_tour_jete', 'floor', '1', 'B', null, '1.202', 'Tour jeté', 'Tour jeté', 'Split de frente (180°) tras un fouetté y un cambio de piernas en el aire, con el cuerpo dando media vuelta (180°); cae en el mismo pie de salida o en los dos. Con la pierna de atrás en anillo cuenta igual, y se reconoce una sola vez.', 150, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_butterfly_fwd_bwd', 'floor', '1', 'B', null, '1.203', 'Mariposa con piernas abiertas, adelante o atrás', 'Mariposa', 'Hacia atrás, los pies pasan a la altura de la cadera o algo por debajo y la mariposa puede rematarse en apoyo facial; hacia adelante suben por encima de la cadera. En ambas el tronco vuela paralelo al suelo, un poco arqueado, con las piernas abiertas; cuenta una vez.', 151, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_quarter_turn_johnson', 'floor', '1', 'B', null, '1.204', 'Salto con cambio de piernas y cuarto de giro a split lateral', 'Johnson', 'Un cuarto de giro (90°) tras el cambio de piernas deja a la gimnasta en split lateral; el mismo nombre vale si abre en carpado abierto con las dos piernas sobre la horizontal. Sale de un pie.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_cross_split', 'floor', '1', 'B', null, '1.205', 'Zancada adelante con cambio de piernas a split', 'Cambio de piernas (switch)', 'Lo que lo define es el cambio de piernas en el aire, y el split de frente (180°) se mide ya con las piernas cambiadas. Para llegar ahí, la gimnasta sale de un pie hacia adelante lanzando la pierna libre al menos a 45°.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_sheep_jump', 'floor', '1', 'B', null, '1.206', 'Salto oveja', 'Salto oveja', 'Los pies llegan casi a tocar la cabeza, que se suelta hacia atrás mientras se arquea la parte alta de la espalda. Sale con los dos pies.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_side_split_jump_half_turn', 'floor', '1', 'B', null, '1.207', 'Salto carpado abierto o split lateral con medio giro', 'Salto abierto con medio giro', 'Salto de dos pies con medio giro (180°) en el que la forma, carpado abierto, split lateral o split de frente, puede verse al principio o al final del giro. Cualquiera de las tres se cuenta una sola vez.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_pike_jump_full_turn_to_front_lying_support', 'floor', '1', 'B', null, '1.208', 'Salto carpado abierto con giro completo a apoyo facial', 'Abierto con giro a apoyo facial', 'Giro completo (360°) en un salto de dos pies, con las piernas en carpado abierto sobre la horizontal o en split lateral, hasta caer en apoyo facial. A la misma caída llega la forma desde un pie, que gira una vuelta y media (540°) en el plano horizontal con el cuerpo estirado; una vez.', 154, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_sissone_ring_one_foot_landing', 'floor', '1', 'B', null, '1.209', 'Sissone a anillo con caída en un pie', 'Sissone anillo', 'Es la forma que cae en un solo pie; el ciervo en anillo y el split en anillo cuentan igual pero caen a dos, y también el split en anillo con medio giro (180°), que es el Vulcan. La sissone abre en split (180°) con el cuerpo arqueado, la cabeza atrás y el pie trasero a la altura de la cabeza.', 155, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_cat_leap_full_turn', 'floor', '1', 'B', null, '1.211', 'Salto gato con giro completo', 'Salto gato con giro', 'Al salto gato, con las rodillas flexionadas que suben por turnos, se le suma un giro completo (360°). Sale de un pie.', 156, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_hop_full_turn_free_leg_fwd_horizontal', 'floor', '1', 'B', null, '1.212', 'Giro completo saltado sobre un pie con pierna adelante', 'Salto a un pie con giro completo', 'La pierna libre se queda estirada adelante a la horizontal durante todo el vuelo, mientras la gimnasta salta desde un pie y da un giro completo (360°). Cae en el mismo pie o en los dos.', 157, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_tuck_jump_full_turn', 'floor', '1', 'B', null, '1.213', 'Salto agrupado con giro completo', 'Agrupado con giro completo', 'En agrupado, la gimnasta da un giro completo (360°) en el aire. Sale con los dos pies o, si lo prefiere, como salto a un pie.', 157, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_wolf_jump_full_turn', 'floor', '1', 'B', null, '1.214', 'Salto lobo con giro completo', 'Lobo con giro completo', 'Un giro completo (360°) en posición de lobo, con salida de dos pies o como salto a un pie. Puede terminar también en apoyo facial, y solo se reconoce una vez.', 158, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_split_leap_full_turn', 'floor', '1', 'C', null, '1.301', 'Salto split con giro completo', 'Salto split con giro completo', 'El split de frente puede verse al principio, a mitad o al final del giro completo (360°) de esta zancada, que sale de un pie.', 149, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_tour_jete_half_turn_produnova', 'floor', '1', 'C', null, '1.302', 'Tour jeté con medio giro más, de pie o en sentada en split', 'Produnova (Csillag)', 'Produnova vale tanto si acaba en uno o dos pies como si termina sentada en split; en ambos casos es un tour jeté con medio giro (180°) añadido. El Csillag cuenta igual: zancada adelante con técnica de tour jeté que gira tres cuartos (270°) a carpado abierto y suma otro cuarto (90°).', 150, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_half_turn_frolova', 'floor', '1', 'C', null, '1.304', 'Salto con cambio de piernas y medio giro', 'Frolova', 'Medio giro (180°) en el vuelo de un salto con cambio de piernas que sale de un pie y abre en split de frente. Cuenta como el mismo, sin ese nombre, el Johnson con medio giro (180°) más; se cuenta una sola vez.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_ring', 'floor', '1', 'C', null, '1.305', 'Salto con cambio de piernas a anillo', 'Switch anillo', 'Sale de un pie, cambia las piernas en el aire y cierra el vuelo en anillo, con una apertura de 180°.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_pike_jump_full_turn_moerz', 'floor', '1', 'C', null, '1.306', 'Salto carpado con giro completo', 'Salto carpado con giro completo', 'Un giro completo (360°) con las piernas juntas en carpado por encima de la horizontal, saliendo con los dos pies. También puede acabar en apoyo facial, y esa forma es el Moerz; se cuenta una vez.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_side_split_jump_full_turn_popa', 'floor', '1', 'C', null, '1.307', 'Salto carpado abierto o split lateral con giro completo', 'Salto abierto con giro completo (Popa)', 'El Popa es el salto de dos pies con giro completo (360°) y piernas en carpado abierto, una forma que puede aparecer al principio, a mitad o al final del giro. Con split lateral o split de frente cuenta igual, sin ese nombre; solo puntúa una vez.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_split_ring_leap', 'floor', '1', 'C', null, '1.309', 'Salto split en anillo', 'Split anillo', 'Zancada split con la pierna de atrás en anillo y apertura de 180°, saliendo de un pie. Cuenta igual, una sola vez, el Jurkowska-Kowalska: split en anillo desde dos pies con giro completo (360°), con la forma al principio, a mitad o al final del giro.', 155, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_stretched_jump_double_turn', 'floor', '1', 'C', null, '1.310', 'Salto extendido con doble giro', 'Salto extendido doble giro', 'Dos giros completos (720°) con el cuerpo estirado; puede salir de los dos pies o hacerse como salto a un pie.', 156, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_cat_leap_double_turn', 'floor', '1', 'C', null, '1.311', 'Salto gato con doble giro', 'Salto gato doble giro', 'Con las rodillas flexionadas subiendo por turnos, la gimnasta completa dos giros (720°) en una zancada que sale de un pie.', 156, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_tuck_jump_double_turn', 'floor', '1', 'C', null, '1.313', 'Salto agrupado con doble giro', 'Agrupado doble giro', 'Dos vueltas completas (720°) en agrupado, saliendo de dos pies o como salto a un pie. También vale terminando en apoyo facial, y se cuenta una sola vez.', 157, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_tour_jete_full_turn_gogean', 'floor', '1', 'D', null, '1.402', 'Tour jeté con giro completo adicional', 'Gogean', 'Sobre la base del tour jeté, con su split de frente, la gimnasta añade un giro completo (360°) y cae sobre uno o dos pies.', 150, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_full_turn', 'floor', '1', 'D', null, '1.404', 'Salto con cambio de piernas y giro completo', 'Switch con giro completo', 'Salto con cambio de piernas y split de frente que añade un giro completo (360°) en el vuelo. Equivale el Bulimar, la posición del Johnson (cuarto de giro a split lateral o carpado abierto) con un giro completo más, visible al principio, a mitad o al final; cuenta una vez.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_switch_leap_ring_half_turn_sankova', 'floor', '1', 'D', null, '1.405', 'Salto con cambio de piernas a anillo y medio giro', 'Sankova', 'Medio giro (180°) en un salto con cambio de piernas a anillo, que puede mostrar el anillo al principio o al final del giro. Sale de un pie.', 152, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_straddle_side_split_jump_one_half_turn', 'floor', '1', 'D', null, '1.407', 'Salto carpado abierto o split lateral con giro y medio', 'Salto abierto con giro y medio', 'Giro y medio (540°) en un salto de dos pies con las piernas en carpado abierto o en split lateral, forma que puede aparecer al principio, a mitad o al final del giro. Con split de frente y el mismo giro cuenta igual; solo se reconoce una vez.', 153, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_ferrari_tour_jete_ring_extra_half_turn', 'floor', '1', 'D', null, '1.409', 'Tour jeté en anillo con medio giro adicional', 'Ferrari (Ting)', 'Tour jeté en anillo con medio giro (180°) añadido hasta completar una vuelta (360°); sale lanzando la pierna adelante, el anillo puede verse al principio o al final del medio giro y cae en el mismo pie o en los dos. Cuenta igual el Ting, zancada split en anillo con medio giro (180°).', 155, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_prat_split_ring_leap_full_turn', 'floor', '1', 'E', null, '1.509', 'Salto split en anillo con giro completo', 'Prat', 'Prat es la zancada split en anillo con giro completo (360°); el anillo puede verse al principio, a mitad o al final del giro. Sale de un pie.', 155, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null),
  ('fx_wolf_jump_double_turn', 'floor', '1', 'E', null, '1.514', 'Salto lobo con doble giro', 'Lobo doble giro', 'Doble giro (720°) en posición de lobo; vale saliendo de dos pies o como salto a un pie.', 158, '2026-11-20'::date, 'Claude', '2026-11-20'::date, 10, 'draft', null);

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
