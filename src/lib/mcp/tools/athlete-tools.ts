/**
 * Athlete-related MCP tools
 * Tools for querying athlete data
 *
 * Note: Most athlete tools require academy context and are available
 * via academy-tools.ts (e.g., get_academy_athletes).
 * This file is for standalone athlete operations.
 */

import { z } from 'zod';
import type { McpAuthContext } from '../types';

/**
 * Register athlete tools on the MCP server
 */
export function registerAthleteTools(server: any) {
  // Placeholder for future standalone athlete tools
  // Currently, athlete queries require academy context via get_academy_athletes

  /**
   * Example future tool structure:
   *
   * server.tool(
   *   'get_athlete_details',
   *   'Obtiene información detallada de un atleta por ID',
   *   {
   *     athleteId: z.string().uuid(),
   *   },
   *   async ({ athleteId }: { athleteId: string }, context?: McpAuthContext) => {
   *     // Implementation here
   *   }
   * );
   */
}
