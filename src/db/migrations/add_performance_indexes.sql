-- Migración: Agregar índices para optimización de rendimiento
-- Fecha: 2025-01-XX
-- Descripción: Índices recomendados para mejorar el rendimiento de queries frecuentes

-- Índices para perfiles (búsquedas por tenant y rol)
CREATE INDEX IF NOT EXISTS profiles_tenant_role_idx ON profiles(tenant_id, role);
CREATE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_can_login_idx ON profiles(can_login) WHERE can_login = false;

-- Índices para atletas (filtros frecuentes)
CREATE INDEX IF NOT EXISTS athletes_status_idx ON athletes(status);
CREATE INDEX IF NOT EXISTS athletes_level_idx ON athletes(level);
CREATE INDEX IF NOT EXISTS athletes_group_id_idx ON athletes(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS athletes_dob_idx ON athletes(dob) WHERE dob IS NOT NULL;

-- Índices para sesiones de clase (filtros por fecha)
CREATE INDEX IF NOT EXISTS class_sessions_date_idx ON class_sessions(session_date);
CREATE INDEX IF NOT EXISTS class_sessions_class_date_idx ON class_sessions(class_id, session_date);
CREATE INDEX IF NOT EXISTS class_sessions_coach_date_idx ON class_sessions(coach_id, session_date) WHERE coach_id IS NOT NULL;

-- Índices para asistencia (búsquedas por sesión y atleta)
CREATE INDEX IF NOT EXISTS attendance_records_session_idx ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS attendance_records_athlete_idx ON attendance_records(athlete_id);
CREATE INDEX IF NOT EXISTS attendance_records_session_athlete_idx ON attendance_records(session_id, athlete_id);

-- Índices para suscripciones (búsquedas por usuario y estado)
CREATE INDEX IF NOT EXISTS subscriptions_user_status_idx ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_plan_status_idx ON subscriptions(plan_id, status);

-- Índices para facturas (búsquedas por tenant y fecha)
CREATE INDEX IF NOT EXISTS billing_invoices_tenant_created_idx ON billing_invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_invoices_academy_status_idx ON billing_invoices(academy_id, status);

-- Índices para evaluaciones (búsquedas por atleta y fecha)
CREATE INDEX IF NOT EXISTS athlete_assessments_athlete_date_idx ON athlete_assessments(athlete_id, assessment_date DESC);
CREATE INDEX IF NOT EXISTS athlete_assessments_academy_date_idx ON athlete_assessments(academy_id, assessment_date DESC);

-- Índices para notas de entrenador (búsquedas por atleta)
CREATE INDEX IF NOT EXISTS coach_notes_athlete_idx ON coach_notes(athlete_id);
CREATE INDEX IF NOT EXISTS coach_notes_academy_idx ON coach_notes(academy_id);

-- Índices para asignaciones de entrenadores (búsquedas por clase y entrenador)
CREATE INDEX IF NOT EXISTS class_coach_assignments_class_idx ON class_coach_assignments(class_id);
CREATE INDEX IF NOT EXISTS class_coach_assignments_coach_idx ON class_coach_assignments(coach_id);

-- Índices para miembros (búsquedas por usuario y academia)
CREATE INDEX IF NOT EXISTS memberships_user_academy_idx ON memberships(user_id, academy_id);
CREATE INDEX IF NOT EXISTS memberships_academy_role_idx ON memberships(academy_id, role);

-- Índices para contactos familiares (búsquedas por atleta)
CREATE INDEX IF NOT EXISTS guardian_athletes_athlete_idx ON guardian_athletes(athlete_id);
CREATE INDEX IF NOT EXISTS guardian_athletes_guardian_idx ON guardian_athletes(guardian_id);

-- Índices para grupos de atletas (búsquedas por academia)
CREATE INDEX IF NOT EXISTS group_athletes_group_idx ON group_athletes(group_id);
CREATE INDEX IF NOT EXISTS group_athletes_athlete_idx ON group_athletes(athlete_id);

-- Comentarios para documentación
COMMENT ON INDEX profiles_tenant_role_idx IS 'Optimiza búsquedas de usuarios por tenant y rol';
COMMENT ON INDEX athletes_status_idx IS 'Optimiza filtros por estado de atleta';
COMMENT ON INDEX class_sessions_date_idx IS 'Optimiza búsquedas de sesiones por fecha';
COMMENT ON INDEX attendance_records_session_athlete_idx IS 'Optimiza búsquedas de asistencia por sesión y atleta';
COMMENT ON INDEX subscriptions_user_status_idx IS 'Optimiza búsquedas de suscripciones activas por usuario';

