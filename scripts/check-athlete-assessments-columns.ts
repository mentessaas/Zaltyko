import { db } from "@/db";
import { sql } from "drizzle-orm";

async function main() {
  const result = await db.execute(sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'athlete_assessments'
    ORDER BY ordinal_position
  `);
  console.log("athlete_assessments columns:");
  console.log(JSON.stringify(result.rows, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
