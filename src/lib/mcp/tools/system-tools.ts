/**
 * System-related MCP tools
 * Tools for system stats and health checks
 */

import { z } from 'zod';
import { db } from '@/db';
import { academies, athletes, classes, groups, events, profiles, charges } from '@/db/schema';
import { and, eq, count, sql, desc } from 'drizzle-orm';
import { getDatabaseUrl } from '@/lib/env';
import type { McpAuthContext } from '../types';

/**
 * Register system tools on the MCP server
 */
export function registerSystemTools(server: any) {
  /**
   * Obtiene estadísticas generales del sistema
   */
  server.tool(
    'get_system_stats',
    'Obtiene estadísticas generales del sistema (total academias, atletas, clases, etc.)',
    {},
    async (_params: any, context?: McpAuthContext) => {
      try {
        const [academiesCount] = await db.select({ count: count() }).from(academies);
        const [athletesCount] = await db.select({ count: count() }).from(athletes);
        const [classesCount] = await db.select({ count: count() }).from(classes);
        const [groupsCount] = await db.select({ count: count() }).from(groups);
        const [eventsCount] = await db.select({ count: count() }).from(events);
        const [profilesCount] = await db.select({ count: count() }).from(profiles);

        // Cargos del mes actual
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [chargesThisMonth] = await db
          .select({
            total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
            count: count(),
          })
          .from(charges)
          .where(and(
            eq(charges.period, currentMonth),
            eq(charges.status, 'paid')
          ));

        const revenue = (chargesThisMonth.total || 0) / 100;

        return {
          content: [{
            type: 'text',
            text: `📊 **ESTADÍSTICAS DEL SISTEMA**

🏛️ **Academias:** ${academiesCount.count}
👥 **Atletas:** ${athletesCount.count}
📚 **Clases:** ${classesCount.count}
👨‍👩‍👧‍👦 **Grupos:** ${groupsCount.count}
📅 **Eventos:** ${eventsCount.count}
👤 **Usuarios:** ${profilesCount.count}

💰 **Ingresos este mes (${currentMonth}):** €${revenue.toFixed(2)}
   - Cargos pagados: ${chargesThisMonth.count}
            `.trim()
          }],
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
        };
      }
    }
  );

  /**
   * Verifica el estado de la conexión a la base de datos
   */
  server.tool(
    'check_database_connection',
    'Verifica el estado de la conexión a la base de datos',
    {},
    async (_params: any, context?: McpAuthContext) => {
      try {
        const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(academies);
        const dbUrl = getDatabaseUrl();
        const isConnected = result.count >= 0;

        return {
          content: [{
            type: 'text',
            text: `✅ **CONEXIÓN A BASE DE DATOS**

Estado: ${isConnected ? '✅ Conectado' : '❌ Desconectado'}
URL: ${dbUrl ? 'Configurada' : 'No configurada'}
Prueba de consulta: ${isConnected ? '✅ Exitosa' : '❌ Fallida'}
            `.trim()
          }],
        };
      } catch (error: any) {
        return {
          content: [{
            type: 'text',
            text: `❌ Error de conexión: ${error.message}`
          }],
        };
      }
    }
  );
}
