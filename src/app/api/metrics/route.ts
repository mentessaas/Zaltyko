/**
 * Endpoint de métricas y monitoreo de errores
 * US-011: Add metrics endpoint and error rate tracking
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { isProduction } from "@/lib/env";
import { metrics, responseTimes, trackRequest, trackError, trackDbOperation } from "@/lib/metrics";

/**
 * GET /api/metrics
 * Devuelve métricas actuales del sistema
 */
export async function GET(): Promise<NextResponse> {
  const uptime = Date.now() - metrics.uptime;
  
  const health = {
    status: metrics.errors.total > 100 ? "warning" : "healthy",
    uptime: Math.floor(uptime / 1000),
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
 * Resetea las métricas
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (isProduction()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
