import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseUrl, isProduction } from "@/lib/env";
import { logger } from "@/lib/logger";

// Lazy initialization para evitar errores durante el build o desarrollo sin variables
let poolInstance: Pool | null = null;
let dbInstance: ReturnType<typeof drizzle> | null = null;

function initializeDb() {
  if (poolInstance && dbInstance) {
    return dbInstance;
  }

  try {
    const connectionString = getDatabaseUrl();

    // Verificar que no sea una URL dummy
    if (connectionString.includes("dummy:dummy@localhost")) {
      logger.warn("⚠️  Usando conexión dummy - la base de datos no está configurada correctamente");
    }

    // For Supabase pooler, we need to handle SSL specially
    // Extract connection parameters and configure SSL
    const connectionParams = new URL(connectionString);

    // Scalability improvement: increased pool size from 20 to 50
    // Note: Supabase connection pooler has its own limits - adjust if needed
    // Consider PgBouncer or Supabase pooler for production at scale
    poolInstance = new Pool({
      host: connectionParams.hostname,
      port: parseInt(connectionParams.port || '5432'),
      database: connectionParams.pathname.replace('/', ''),
      user: connectionParams.username,
      password: connectionParams.password,
      max: isProduction() ? 50 : undefined, // Increased from 20 for better concurrency
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000, // Keep connections alive longer (was 1000 in dev dummy)
      // Statement timeout to prevent long-running queries
      statement_timeout: isProduction() ? 30000 : undefined, // 30 second timeout
      // SSL configuration for Supabase
      ssl: isProduction() ? {
        rejectUnauthorized: false
      } : false,
    });

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
      max: isProduction() ? 50 : undefined,
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
