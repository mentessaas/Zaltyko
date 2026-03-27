import { createMcpHandler } from 'mcp-handler';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/db';
import {
  academies,
  athletes,
  classes,
  groups,
  events,
  charges,
  profiles,
  subscriptions,
  plans,
} from '@/db/schema';
import { eq, and, desc, sql, count, ilike } from 'drizzle-orm';
import { getDatabaseUrl } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getCurrentProfile } from '@/lib/authz/profile-service';
import { getTenantId } from '@/lib/authz/tenant-resolver';

/**
 * Verify authentication from request headers
 * Checks Bearer token in Authorization header
 */
async function verifyAuth(request: Request): Promise<{ userId: string; profile: any; tenantId: string | null } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    return null;
  }

  try {
    const adminClient = getSupabaseAdminClient();
    const { data: { user }, error } = await adminClient.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return null;
    }

    const tenantId = await getTenantId(user.id);
    return { userId: user.id, profile, tenantId };
  } catch {
    return null;
  }
}

/**
 * Check if user has access to an academy
 */
async function hasAcademyAccess(userId: string, academyId: string): Promise<boolean> {
  const tenantId = await getTenantId(userId, academyId);
  if (!tenantId) {
    return false;
  }

  // Get academy to verify tenant
  const [academy] = await db
    .select({ tenantId: academies.tenantId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  return academy?.tenantId === tenantId;
}

const handler = createMcpHandler(
  (server) => {
    // ============================================
    // TOOLS DE CONSULTA DE DATOS
    // ============================================

    /**
     * Obtiene información detallada de una academia
     */
    server.tool(
      'get_academy_info',
      'Obtiene información completa de una academia por ID',
      {
        academyId: z.string().uuid(),
      },
      async ({ academyId }) => {
        try {
          const [academy] = await db
            .select()
            .from(academies)
            .where(eq(academies.id, academyId))
            .limit(1);

          if (!academy) {
            return {
              content: [{ 
                type: 'text', 
                text: `❌ Academia con ID ${academyId} no encontrada` 
              }],
            };
          }

          // Obtener estadísticas de la academia
          const [athletesCount] = await db
            .select({ count: count() })
            .from(athletes)
            .where(eq(athletes.academyId, academyId));

          const [classesCount] = await db
            .select({ count: count() })
            .from(classes)
            .where(eq(classes.academyId, academyId));

          const [groupsCount] = await db
            .select({ count: count() })
            .from(groups)
            .where(eq(groups.academyId, academyId));

          const info = `
🏛️ **ACADEMIA: ${academy.name}**

📋 **Información General:**
- ID: ${academy.id}
- Tipo: ${academy.academyType}
- Ubicación: ${academy.city || 'N/A'}, ${academy.region || 'N/A'}, ${academy.country || 'N/A'}
- Pública: ${academy.isPublic ? 'Sí' : 'No'}
- Estado: ${academy.isSuspended ? '⚠️ Suspendida' : '✅ Activa'}

📊 **Estadísticas:**
- Atletas: ${athletesCount.count}
- Clases: ${classesCount.count}
- Grupos: ${groupsCount.count}

📞 **Contacto:**
- Email: ${academy.contactEmail || 'N/A'}
- Teléfono: ${academy.contactPhone || 'N/A'}
- Web: ${academy.website || 'N/A'}

📅 **Fechas:**
- Creada: ${academy.createdAt?.toISOString() || 'N/A'}
- Trial activo: ${academy.isTrialActive ? 'Sí' : 'No'}
${academy.trialEndsAt ? `- Trial termina: ${academy.trialEndsAt.toISOString()}` : ''}
          `.trim();

          return {
            content: [{ type: 'text', text: info }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Lista academias con filtros opcionales
     */
    server.tool(
      'list_academies',
      'Lista academias con filtros opcionales (país, región, ciudad, tipo)',
      {
        country: z.string().optional(),
        region: z.string().optional(),
        city: z.string().optional(),
        academyType: z.enum(['artistica', 'ritmica', 'trampolin', 'general', 'parkour', 'danza']).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      async ({ country, region, city, academyType, limit }) => {
        try {
          const conditions = [];
          
          if (country) conditions.push(eq(academies.country, country));
          if (region) conditions.push(eq(academies.region, region));
          if (city) conditions.push(eq(academies.city, city));
          if (academyType) conditions.push(eq(academies.academyType, academyType));

          const results = await db
            .select()
            .from(academies)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(academies.createdAt))
            .limit(limit);

          if (results.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: '❌ No se encontraron academias con los filtros especificados' 
              }],
            };
          }

          const list = results.map((academy, idx) => 
            `${idx + 1}. **${academy.name}** (${academy.academyType})\n   📍 ${academy.city || 'N/A'}, ${academy.region || 'N/A'}\n   🆔 ${academy.id}`
          ).join('\n\n');

          return {
            content: [{ 
              type: 'text', 
              text: `📋 **ACADEMIAS ENCONTRADAS (${results.length}):**\n\n${list}` 
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Obtiene atletas de una academia
     */
    server.tool(
      'get_academy_athletes',
      'Obtiene la lista de atletas de una academia',
      {
        academyId: z.string().uuid(),
        status: z.enum(['active', 'inactive', 'all']).default('active'),
        limit: z.number().int().min(1).max(200).default(50),
      },
      async ({ academyId, status, limit }) => {
        try {
          const conditions = [eq(athletes.academyId, academyId)];
          if (status !== 'all') {
            conditions.push(eq(athletes.status, status));
          }

          const results = await db
            .select({
              id: athletes.id,
              name: athletes.name,
              dob: athletes.dob,
              level: athletes.level,
              status: athletes.status,
              groupId: athletes.groupId,
            })
            .from(athletes)
            .where(and(...conditions))
            .orderBy(desc(athletes.createdAt))
            .limit(limit);

          if (results.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: `❌ No se encontraron atletas ${status === 'all' ? '' : `con estado ${status}`} en esta academia` 
              }],
            };
          }

          const list = results.map((athlete, idx) => 
            `${idx + 1}. **${athlete.name}**\n   🆔 ${athlete.id}\n   📊 Nivel: ${athlete.level || 'N/A'}\n   📅 Fecha nacimiento: ${athlete.dob || 'N/A'}\n   ✅ Estado: ${athlete.status}`
          ).join('\n\n');

          return {
            content: [{ 
              type: 'text', 
              text: `👥 **ATLETAS (${results.length}):**\n\n${list}` 
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Obtiene clases de una academia
     */
    server.tool(
      'get_academy_classes',
      'Obtiene las clases programadas de una academia',
      {
        academyId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(30),
      },
      async ({ academyId, limit }) => {
        try {
          const results = await db
            .select({
              id: classes.id,
              name: classes.name,
              weekday: classes.weekday,
              startTime: classes.startTime,
              endTime: classes.endTime,
              capacity: classes.capacity,
              isExtra: classes.isExtra,
            })
            .from(classes)
            .where(eq(classes.academyId, academyId))
            .orderBy(classes.weekday, classes.startTime)
            .limit(limit);

          if (results.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: '❌ No se encontraron clases en esta academia' 
              }],
            };
          }

          const weekdays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
          const list = results.map((cls, idx) => 
            `${idx + 1}. **${cls.name}**\n   🆔 ${cls.id}\n   📅 ${weekdays[cls.weekday || 0] || 'N/A'}\n   ⏰ ${cls.startTime || 'N/A'} - ${cls.endTime || 'N/A'}\n   👥 Capacidad: ${cls.capacity || 'N/A'}\n   ${cls.isExtra ? '⭐ Clase extra' : ''}`
          ).join('\n\n');

          return {
            content: [{ 
              type: 'text', 
              text: `📚 **CLASES (${results.length}):**\n\n${list}` 
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Obtiene métricas financieras de una academia
     */
    server.tool(
      'get_academy_financial_metrics',
      'Obtiene métricas financieras de una academia (ingresos, pagos pendientes, etc.)',
      {
        academyId: z.string().uuid(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(), // Formato: YYYY-MM
      },
      async ({ academyId, month }) => {
        try {
          const now = new Date();
          const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          
          const conditions = [
            eq(charges.academyId, academyId),
            eq(charges.period, targetMonth),
          ];

          // Ingresos del mes (cargos pagados)
          const [paidCharges] = await db
            .select({ 
              total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
              count: count(),
            })
            .from(charges)
            .where(and(...conditions, eq(charges.status, 'paid')));

          // Pagos pendientes
          const [pendingCharges] = await db
            .select({ 
              total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)`,
              count: count(),
            })
            .from(charges)
            .where(and(...conditions, eq(charges.status, 'pending')));

          const revenue = (paidCharges.total || 0) / 100;
          const pending = (pendingCharges.total || 0) / 100;

          return {
            content: [{ 
              type: 'text', 
              text: `💰 **MÉTRICAS FINANCIERAS - ${targetMonth}**

💵 **Ingresos del mes:** €${revenue.toFixed(2)}
   - Cargos pagados: ${paidCharges.count}

⏳ **Pagos pendientes:** €${pending.toFixed(2)}
   - Cargos pendientes: ${pendingCharges.count}

📊 **Total facturado:** €${(revenue + pending).toFixed(2)}
              `.trim()
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Obtiene eventos de una academia
     */
    server.tool(
      'get_academy_events',
      'Obtiene eventos de una academia',
      {
        academyId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      async ({ academyId, limit }) => {
        try {
          const results = await db
            .select({
              id: events.id,
              title: events.title,
              startDate: events.startDate,
              endDate: events.endDate,
              country: events.country,
              province: events.province,
              city: events.city,
              isPublic: events.isPublic,
              level: events.level,
              academyId: events.academyId,
              createdAt: events.createdAt,
            })
            .from(events)
            .where(eq(events.academyId, academyId))
            .orderBy(desc(events.startDate), desc(events.createdAt))
            .limit(limit);

          if (results.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: '❌ No se encontraron eventos en esta academia' 
              }],
            };
          }

          const list = results.map((event, idx) => {
            const location = [event.city, event.province, event.country].filter(Boolean).join(", ") || 'Sin ubicación';
            const dateText = event.startDate 
              ? event.endDate && event.endDate !== event.startDate
                ? `${event.startDate} - ${event.endDate}`
                : event.startDate
              : 'Sin fecha';
            return `${idx + 1}. **${event.title}**\n   🆔 ${event.id}\n   📅 ${dateText}\n   📍 ${location}\n   📊 Estado: ${event.isPublic ? 'público' : 'privado'}`;
          }).join('\n\n');

          return {
            content: [{ 
              type: 'text', 
              text: `📅 **EVENTOS (${results.length}):**\n\n${list}` 
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Obtiene información de un usuario/perfil
     */
    server.tool(
      'get_user_profile',
      'Obtiene información de un perfil de usuario por ID',
      {
        userId: z.string().uuid(),
      },
      async ({ userId }) => {
        try {
          const [profile] = await db
            .select()
            .from(profiles)
            .where(eq(profiles.userId, userId))
            .limit(1);

          if (!profile) {
            return {
              content: [{ 
                type: 'text', 
                text: `❌ Usuario con ID ${userId} no encontrado` 
              }],
            };
          }

          // Obtener email del usuario desde Supabase Auth
          const adminClient = getSupabaseAdminClient();
          const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
          const userEmail = authUser?.user?.email || 'N/A';

          // Obtener suscripción
          const [subscription] = await db
            .select({
              plan: plans,
              subscription: subscriptions,
            })
            .from(subscriptions)
            .innerJoin(plans, eq(subscriptions.planId, plans.id))
            .where(eq(subscriptions.userId, userId))
            .limit(1);

          const info = `
👤 **PERFIL DE USUARIO**

📋 **Información:**
- Nombre: ${profile.name || 'N/A'}
- Email: ${userEmail}
- ID Usuario: ${profile.userId}
- ID Perfil: ${profile.id}

💳 **Suscripción:**
${subscription ? `- Plan: ${subscription.plan.nickname || subscription.plan.code}\n- Estado: ${subscription.subscription.status || 'N/A'}` : '- Sin suscripción activa'}

📅 **Creado:** ${profile.createdAt?.toISOString() || 'N/A'}
          `.trim();

          return {
            content: [{ type: 'text', text: info }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    // ============================================
    // TOOLS DE ANÁLISIS Y DEBUGGING
    // ============================================

    /**
     * Obtiene estadísticas generales del sistema
     */
    server.tool(
      'get_system_stats',
      'Obtiene estadísticas generales del sistema (total academias, atletas, clases, etc.)',
      {},
      async () => {
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
              text: `❌ Error: ${error.message}` 
            }],
          };
        }
      }
    );

    /**
     * Busca academias por nombre (búsqueda parcial)
     */
    server.tool(
      'search_academies',
      'Busca academias por nombre (búsqueda parcial, case-insensitive)',
      {
        query: z.string().min(1),
        limit: z.number().int().min(1).max(50).default(10),
      },
      async ({ query, limit }) => {
        try {
          const results = await db
            .select()
            .from(academies)
            .where(ilike(academies.name, `%${query}%`))
            .orderBy(desc(academies.createdAt))
            .limit(limit);

          if (results.length === 0) {
            return {
              content: [{ 
                type: 'text', 
                text: `❌ No se encontraron academias que coincidan con "${query}"` 
              }],
            };
          }

          const list = results.map((academy, idx) => 
            `${idx + 1}. **${academy.name}**\n   🆔 ${academy.id}\n   📍 ${academy.city || 'N/A'}, ${academy.region || 'N/A'}\n   🏛️ Tipo: ${academy.academyType}`
          ).join('\n\n');

          return {
            content: [{ 
              type: 'text', 
              text: `🔍 **RESULTADOS DE BÚSQUEDA (${results.length}):**\n\n${list}` 
            }],
          };
        } catch (error: any) {
          return {
            content: [{ 
              type: 'text', 
              text: `❌ Error: ${error.message}` 
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
      async () => {
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
  },
  {
    // Opciones del servidor MCP
  },
  {
    // Configuración de Redis (opcional - solo si tienes Redis configurado)
    // redisUrl: process.env.REDIS_URL,
    basePath: '/api/mcp',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === 'development',
  }
);

/**
 * Auth wrapper for MCP handler
 * Verifies Bearer token before processing requests
 */
async function authHandler(
  request: Request,
  options?: { method: 'GET' | 'POST' }
): Promise<Response> {
  // Skip auth for GET requests (MCP protocol uses POST for tool calls)
  // But for now, require auth for all requests
  if (options?.method === 'GET') {
    return handler(request);
  }

  // Verify authentication
  const auth = await verifyAuth(request);
  if (!auth) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Valid authentication token required' },
      { status: 401 }
    );
  }

  // Store auth context for tools to use
  // Note: In production, consider using AsyncLocalStorage for context propagation
  (global as any).__mcpAuthContext = auth;

  try {
    return await handler(request);
  } finally {
    delete (global as any).__mcpAuthContext;
  }
}

export { authHandler as GET, authHandler as POST };

