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

    // Verificar que no sea una URL dummy
    if (connectionString.includes("dummy:dummy@localhost")) {
      console.warn("⚠️  Usando conexión dummy - la base de datos no está configurada correctamente");
    }

    // For Supabase pooler, we need to handle SSL specially
    // Extract connection parameters and configure SSL
    const connectionParams = new URL(connectionString);

    poolInstance = new Pool({
      host: connectionParams.hostname,
      port: parseInt(connectionParams.port || '5432'),
      database: connectionParams.pathname.replace('/', ''),
      user: connectionParams.username,
      password: connectionParams.password,
      max: isProduction() ? 20 : undefined,
      connectionTimeoutMillis: 10000,
      // SSL configuration for Supabase
      ssl: isProduction() ? {
        rejectUnauthorized: false
      } : false,
    });

    poolInstance.on('connect', () => {
      console.log('Database connected successfully');
    });

    // Probar la conexión inmediatamente
    poolInstance.on('error', (err) => {
      console.error('❌ Error en el pool de conexiones:', err.message);
    });

    dbInstance = drizzle(poolInstance);
    return dbInstance;
  } catch (error) {
    console.error("❌ Error inicializando base de datos:", error);

    // En producción, lanzar error para no iniciar con configuración inválida
    if (isProduction()) {
      throw new Error("Failed to initialize database connection. Please check DATABASE_URL configuration.");
    }

    // Solo en desarrollo crear pool dummy para evitar crash inmediato
    console.warn("Using dummy database connection for development");
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
