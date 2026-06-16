/**
 * User-related MCP tools
 * Tools for querying user/profile data
 */

import { z } from 'zod';
import { db } from '@/db';
import { profiles, subscriptions, plans } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import type { McpAuthContext } from '../types';

/**
 * Register user tools on the MCP server
 */
export function registerUserTools(server: any) {
  /**
   * Obtiene información de un usuario/perfil
   */
  server.tool(
    'get_user_profile',
    'Obtiene información de un perfil de usuario por ID',
    {
      userId: z.string().uuid(),
    },
    async ({ userId }: { userId: string }, context?: McpAuthContext) => {
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
              text: `Usuario con ID ${userId} no encontrado`
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
            text: `Error: ${error.message}`
          }],
        };
      }
    }
  );
}
