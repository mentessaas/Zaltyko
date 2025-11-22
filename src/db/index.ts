import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl, isProduction } from "@/lib/env";

// Lazy initialization para evitar errores durante el build o desarrollo sin variables
let poolInstance: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function initializeDb() {
  if (poolInstance && dbInstance) {
    return dbInstance;
  }

  try {
    const connectionString = getDatabaseUrl();
    
    poolInstance = new Pool({
      connectionString,
      max: isProduction() ? 20 : undefined,
    });

    dbInstance = drizzle(poolInstance);
    return dbInstance;
  } catch (error) {
    // Si hay un error obteniendo la URL, crear un pool dummy
    // Esto permitirá que el código compile pero fallará cuando se intente usar
    poolInstance = new Pool({
      connectionString: "postgresql://dummy:dummy@localhost:5432/dummy",
      max: isProduction() ? 20 : undefined,
      connectionTimeoutMillis: 1000,
      idleTimeoutMillis: 1000,
    });
    dbInstance = drizzle(poolInstance);
    return dbInstance;
  }
}

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = initializeDb();
    return instance[prop as keyof typeof instance];
  },
});
