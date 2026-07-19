CREATE UNIQUE INDEX IF NOT EXISTS "coach_compensation_academy_coach_uq" ON "coach_compensation" USING btree ("academy_id","coach_id");
