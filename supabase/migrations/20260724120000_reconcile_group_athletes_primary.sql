-- Reconcilia group_athletes con el grupo principal del atleta (athletes.group_id).
--
-- Contexto: el PATCH de atletas acumulaba filas obsoletas en group_athletes al
-- cambiar de grupo (insertaba el nuevo sin quitar el anterior). El código ya se
-- corrigió para reemplazar en vez de acumular; esta migración reconcilia los
-- datos históricos que quedaron divergentes.
--
-- Idempotente. Ver [[Decisiones#2026-07-24]] y [[Changelog interno#2026-07-24]].

-- 1. (No destructivo) Insertar la pertenencia al grupo principal si falta.
--    Garantiza que todo atleta con group_id aparezca también en la M2M, que es
--    lo que necesitan las lecturas de horario/capacidad/conflictos.
INSERT INTO group_athletes (id, tenant_id, group_id, athlete_id, created_at)
SELECT gen_random_uuid(), a.tenant_id, a.group_id, a.id, now()
FROM athletes a
WHERE a.group_id IS NOT NULL
  AND a.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM group_athletes ga
    WHERE ga.athlete_id = a.id AND ga.group_id = a.group_id
  );

-- 2. (DESTRUCTIVO — revisar antes de ejecutar) Eliminar pertenencias obsoletas
--    a grupos distintos del principal. Solo tiene sentido bajo el modelo actual
--    de un grupo principal por atleta; NO ejecutar si se decide adoptar
--    multi-grupo real (ver la decisión de producto pendiente en Decisiones).
--
-- DELETE FROM group_athletes ga
-- USING athletes a
-- WHERE ga.athlete_id = a.id
--   AND a.group_id IS NOT NULL
--   AND ga.group_id <> a.group_id;
--
-- DELETE FROM group_athletes ga
-- USING athletes a
-- WHERE ga.athlete_id = a.id
--   AND a.group_id IS NULL;
