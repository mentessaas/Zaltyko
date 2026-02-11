/**
 * Endpoint de métricas y monitoreo de errores
 * US-011: Add metrics endpoint and error rate tracking
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isProduction } from "@/lib/env";

// Métricas en memoria (en producción usar Redis o DB)
interface Metrics {
  requests: {
    total: number;
    byMethod: Record<string, number>;
    byStatus: Record<string, number>;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
    byEndpoint: Record<string, number>;
    recent: Array<{
      timestamp: string;
      error: string;
      endpoint: string;
      message: string;
    }>;
  };
  responseTime: {
    avg: number;
    p95: number;
    p99: number;
    byEndpoint: Record<string, number>;
  };
  dbOperations: {
    total: number;
    slowQueries: number;
    errors: number;
  };
  uptime: number;
  lastReset: string;
}

const metrics: Metrics = {
  requests: {
    total: 0,
    byMethod: {},
    byStatus: {},
  },
  errors: {
    total: 0,
    byType: {},
    byEndpoint: {},
    recent: [],
  },
  responseTime: {
    avg: 0,
    p95: 0,
    p99: 0,
    byEndpoint: {},
  },
  dbOperations: {
    total: 0,
    slowQueries: 0,
    errors: 0,
  },
  uptime: Date.now(),
  lastReset: new Date().toISOString(),
};

// Store response times for percentile calculation
const responseTimes: number[] = [];
const MAX_RESPONSE_TIMES = 10000;

/**
 * Registra una request
 */
export function trackRequest(method: string, status: number, duration: number, endpoint: string): void {
  metrics.requests.total++;
  metrics.requests.byMethod[method] = (metrics.requests.byMethod[method] || 0) + 1;
  metrics.requests.byStatus[status] = (metrics.requests.byStatus[status] || 0) + 1;
  
  // Track response times
  responseTimes.push(duration);
  if (responseTimes.length > MAX_RESPONSE_TIMES) {
    responseTimes.shift();
  }
  
  // Update average
  metrics.responseTime.avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  
  // Update endpoint average
  if (!metrics.responseTime.byEndpoint[endpoint]) {
    metrics.responseTime.byEndpoint[endpoint] = duration;
  } else {
    metrics.responseTime.byEndpoint[endpoint] = 
      (metrics.responseTime.byEndpoint[endpoint] + duration) / 2;
  }
  
  // Calculate percentiles
  const sorted = [...responseTimes].sort((a, b) => a - b);
  metrics.responseTime.p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  metrics.responseTime.p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  
  // Track errors
  if (status >= 400) {
    trackError(status >= 500 ? "server" : "client", endpoint, `HTTP ${status}`);
  }
}

/**
 * Registra un error
 */
export function trackError(type: string, endpoint: string, message: string): void {
  metrics.errors.total++;
  metrics.errors.byType[type] = (metrics.errors.byType[type] || 0) + 1;
  metrics.errors.byEndpoint[endpoint] = (metrics.errors.byEndpoint[endpoint] || 0) + 1;
  
  // Keep only last 100 errors
  metrics.errors.recent.unshift({
    timestamp: new Date().toISOString(),
    error: type,
    endpoint,
    message: message.substring(0, 200), // Truncate long messages
  });
  
  if (metrics.errors.recent.length > 100) {
    metrics.errors.recent.pop();
  }
  
  logger.warn(`Error tracked: ${type}`, { endpoint, message });
}

/**
 * Registra operación de DB
 */
export function trackDbOperation(duration: number, isError: boolean): void {
  metrics.dbOperations.total++;
  
  if (duration > 1000) {
    metrics.dbOperations.slowQueries++;
    logger.warn(`Slow query detected: ${duration}ms`);
  }
  
  if (isError) {
    metrics.dbOperations.errors++;
  }
}

/**
 * GET /api/metrics
 * Devuelve métricas actuales del sistema
 */
export async function GET(): Promise<Response> {
  const uptime = Date.now() - metrics.uptime;
  
  const health = {
    status: metrics.errors.total > 100 ? "warning" : "healthy",
    uptime: Math.floor(uptime / 1000), // seconds
    uptimeFormatted: formatUptime(uptime),
  };
  
  return NextResponse.json({
    health,
    metrics: {
      requests: metrics.requests,
      errors: {
        ...metrics.errors,
        rate: metrics.requests.total > 0 
          ? (metrics.errors.total / metrics.requests.total * 100).toFixed(2) + "%"
          : "0%",
      },
      responseTime: metrics.responseTime,
      dbOperations: metrics.dbOperations,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/metrics/reset
 * Resetea las métricas (solo en desarrollo o para admin)
 */
export async function POST(req: Request): Promise<Response> {
  // En producción, verificar autenticación
  if (isProduction()) {
    // Aquí iría verificación de admin
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }
  
  // Reset metrics
  metrics.requests = { total: 0, byMethod: {}, byStatus: {} };
  metrics.errors = { total: 0, byType: {}, byEndpoint: {}, recent: [] };
  metrics.responseTime = { avg: 0, p95: 0, p99: 0, byEndpoint: {} };
  metrics.dbOperations = { total: 0, slowQueries: 0, errors: 0 };
  metrics.lastReset = new Date().toISOString();
  responseTimes.length = 0;
  
  logger.info("Metrics reset");
  
  return NextResponse.json({
    message: "Metrics reset successfully",
    timestamp: metrics.lastReset,
  });
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
