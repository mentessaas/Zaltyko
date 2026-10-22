ALTER TABLE "athlete_assessments" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "athlete_assessments" ADD CONSTRAINT "athlete_assessments_session_id_class_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_assessments_session_idx" ON "athlete_assessments" USING btree ("session_id");
