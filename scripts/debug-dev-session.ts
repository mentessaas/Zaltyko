import "dotenv/config";

import { ensureDevSessionData } from "@/app/api/dev/session/route";

async function main() {
  try {
    const payload = await ensureDevSessionData();
    console.log("DEV SESSION OK", payload);
  } catch (error) {
    console.error("DEV SESSION ERROR", error);
  } finally {
    process.exit(0);
  }
}

main();
