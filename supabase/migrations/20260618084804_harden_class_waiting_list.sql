ALTER TABLE "class_waiting_list"
  ADD COLUMN IF NOT EXISTS "tenant_id" uuid,
  ADD COLUMN IF NOT EXISTS "academy_id" uuid;

UPDATE "class_waiting_list" wl
SET
  "tenant_id" = c."tenant_id",
  "academy_id" = c."academy_id"
FROM "classes" c
WHERE wl."class_id" = c."id"
  AND (wl."tenant_id" IS NULL OR wl."academy_id" IS NULL);

DELETE FROM "class_waiting_list"
WHERE "tenant_id" IS NULL OR "academy_id" IS NULL;

ALTER TABLE "class_waiting_list"
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "academy_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_waiting_list_academy_id_academies_id_fk'
  ) THEN
    ALTER TABLE "class_waiting_list"
      ADD CONSTRAINT "class_waiting_list_academy_id_academies_id_fk"
      FOREIGN KEY ("academy_id") REFERENCES "public"."academies"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_waiting_list_class_id_classes_id_fk'
  ) THEN
    ALTER TABLE "class_waiting_list"
      ADD CONSTRAINT "class_waiting_list_class_id_classes_id_fk"
      FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "class_waiting_list_tenant_idx"
  ON "class_waiting_list" USING btree ("tenant_id");

CREATE INDEX IF NOT EXISTS "class_waiting_list_tenant_academy_idx"
  ON "class_waiting_list" USING btree ("tenant_id", "academy_id");

ALTER TABLE "class_waiting_list" ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "class_waiting_list" TO authenticated, service_role;

DROP POLICY IF EXISTS "class_waiting_list_tenant_access" ON "class_waiting_list";
CREATE POLICY "class_waiting_list_tenant_access" ON "class_waiting_list"
  FOR ALL USING (
    is_admin() OR "tenant_id" = get_current_tenant()
  )
  WITH CHECK (
    is_admin() OR "tenant_id" = get_current_tenant()
  );
