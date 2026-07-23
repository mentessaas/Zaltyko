import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createDatabasePoolConfig } from "./pool-config";

// Lazy initialization para evitar errores durante el build o desarrollo sin variables
let poolInstance: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function initializeDb() {
  if (poolInstance && dbInstance) {
    return dbInstance;
  }

  try {
    if (
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NEXT_PHASE === "phase-development-build"
    ) {
      throw new Error("Database access is disabled during the Next.js build phase");
    }

    const connectionString = getDatabaseUrl();

    // Verificar que no sea una URL dummy
    if (connectionString.includes("dummy:dummy@localhost")) {
      logger.warn("⚠️  Usando conexión dummy - la base de datos no está configurada correctamente");
    }

    poolInstance = new Pool(
      createDatabasePoolConfig({
        connectionString,
        production: isProduction(),
      })
    );

    poolInstance.on('connect', () => {
      logger.info('Database connected successfully');
    });

    // Probar la conexión inmediatamente
    poolInstance.on('error', (err) => {
      logger.error('❌ Error en el pool de conexiones:', err.message);
    });

    dbInstance = drizzle(poolInstance);
    return dbInstance;
  } catch (error) {
    logger.error("❌ Error inicializando base de datos:", error);

    // En producción, lanzar error para no iniciar con configuración inválida
    if (isProduction()) {
      throw new Error("Failed to initialize database connection. Please check DATABASE_URL configuration.");
    }

    // Solo en desarrollo crear pool dummy para evitar crash inmediato
    logger.warn("Using dummy database connection for development");
    poolInstance = new Pool({
      connectionString: "postgresql://dummy:dummy@localhost:5432/dummy",
      max: 1,
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
