/**
 * Seed Data: España GA - Elementos Gimnasia Artística Femenina (Niveles 1-5)
 *
 * Elementos oficiales FIG 2022-2024 para Gimnasia Artística femenina
 * 4 aparatos: VT (Salto), UB (Barras), BB (Viga), FX (Suelo)
 */

import { db } from "../../index";
import { skillCatalog } from "../../schema/skill-catalog";

interface GAElement {
  skillCode: string;
  name: string;
  description: string;
  apparatus: string; // vt, ub, bb, fx
  difficulty: number; // 1-10 scale
}

const gaElements: GAElement[] = [
  // ============ VAULT (Salto) - VT ============
  // Group 1 - Yurchenko family
  { skillCode: "VT-Y1", name: "Yurchenko básico", description: "Yurchenko con colchoneta, vuelco abajo", apparatus: "vt", difficulty: 1 },
  { skillCode: "VT-Y2", name: "Yurchenko con mesa", description: "Yurchenko con mesa de salto", apparatus: "vt", difficulty: 2 },
  { skillCode: "VT-Y3", name: "Yurchenko 1/2 vuelta", description: "Yurchenko con 1/2 vuelta en vuelo", apparatus: "vt", difficulty: 3 },
  // Group 2 - Handspring family
  { skillCode: "VT-HS1", name: "Handspring básico", description: "Handspring con colchoneta", apparatus: "vt", difficulty: 2 },
  { skillCode: "VT-HS2", name: "Handspring con rechazo", description: "Handspring con rechazo", apparatus: "vt", difficulty: 3 },
  { skillCode: "VT-HS3", name: "Handspring 1/1 vuelta", description: "Handspring con 1 vuelta completa", apparatus: "vt", difficulty: 4 },
  // Group 3 - Tsukahara family
  { skillCode: "VT-TS1", name: "Tsukahara básico", description: "Tsukahara con 1/2 vuelta", apparatus: "vt", difficulty: 3 },
  { skillCode: "VT-TS2", name: "Tsukahara 3/2", description: "Tsukahara con 3/2 vueltas", apparatus: "vt", difficulty: 4 },
  // Group 4 - Rudi family
  { skillCode: "VT-RD1", name: "Rudi 1/1", description: "Tsukahara con Rudi 1/1", apparatus: "vt", difficulty: 4 },
  { skillCode: "VT-RD2", name: "Rudi 3/2", description: "Tsukahara con Rudi 3/2", apparatus: "vt", difficulty: 5 },

  // ============ UNEVEN BARS (Barras Asimétricas) - UB ============
  // Group 1 - Mounts
  { skillCode: "UB-M1", name: "Entrada a pie", description: "Entrada a barras desde abajo", apparatus: "ub", difficulty: 1 },
  { skillCode: "UB-M2", name: "Entrada con impulso", description: "Entrada con impulso desde trac", apparatus: "ub", difficulty: 2 },
  { skillCode: "UB-M3", name: "Kip", description: "Kip a barra inferior", apparatus: "ub", difficulty: 2 },
  // Group 2 - Swings
  { skillCode: "UB-SW1", name: "Balanceo básico", description: "Balanceo en barra inferior", apparatus: "ub", difficulty: 1 },
  { skillCode: "UB-SW2", name: "Kip swing", description: "Kip con swing posterior", apparatus: "ub", difficulty: 2 },
  { skillCode: "UB-SW3", name: "Gienger", description: "Balanceo con cambio a barra superior", apparatus: "ub", difficulty: 3 },
  { skillCode: "UB-SW4", name: "Clear hip", description: "Clear hip con swing", apparatus: "ub", difficulty: 3 },
  // Group 3 - Dismounts
  { skillCode: "UB-D1", name: "Salto abajo", description: "Salto desde barra inferior", apparatus: "ub", difficulty: 1 },
  { skillCode: "UB-D2", name: "Tuck down", description: "Tuck salto desde barra superior", apparatus: "ub", difficulty: 2 },
  { skillCode: "UB-D3", name: "Gainer layout", description: "Gainer layout desde barra superior", apparatus: "ub", difficulty: 4 },
  { skillCode: "UB-D4", name: "Double tuck", description: "Doble tuck desde barra superior", apparatus: "ub", difficulty: 5 },

  // ============ BALANCE BEAM (Viga) - BB ============
  // Group 1 - Mounts
  { skillCode: "BB-M1", name: "Entrada de pie", description: "Entrada a la viga desde abajo", apparatus: "bb", difficulty: 1 },
  { skillCode: "BB-M2", name: "Entrada de rodillas", description: "Entrada a rodillas sobre la viga", apparatus: "bb", difficulty: 1 },
  { skillCode: "BB-M3", name: "Handstand hold", description: "Entrar en handstand y bajar", apparatus: "bb", difficulty: 2 },
  // Group 2 - Acrobatic elements
  { skillCode: "BB-AC1", name: "Flic flac", description: "Flic flac adelante sobre la viga", apparatus: "bb", difficulty: 3 },
  { skillCode: "BB-AC2", name: "Tuck jump", description: "Tuck jump sobre la viga", apparatus: "bb", difficulty: 2 },
  { skillCode: "BB-AC3", name: "Layout", description: "Layout desde la viga", apparatus: "bb", difficulty: 4 },
  { skillCode: "BB-AC4", name: "Wolf jump", description: "Wolf jump sobre la viga", apparatus: "bb", difficulty: 2 },
  // Group 3 - Dance elements
  { skillCode: "BB-DA1", name: "Passo", description: "Passo hacia adelante", apparatus: "bb", difficulty: 1 },
  { skillCode: "BB-DA2", name: "Pivot", description: "Pivot 1/2 vuelta", apparatus: "bb", difficulty: 2 },
  { skillCode: "BB-DA3", name: "Scale", description: "Scale lateral", apparatus: "bb", difficulty: 2 },
  { skillCode: "BB-DA4", name: "Ring leap", description: "Salto en ring", apparatus: "bb", difficulty: 3 },
  // Group 4 - Dismounts
  { skillCode: "BB-DI1", name: "Salto abajo", description: "Salto desde la viga al colchoneta", apparatus: "bb", difficulty: 1 },
  { skillCode: "BB-DI2", name: "Flic flac down", description: "Flic flac desde la viga al colchoneta", apparatus: "bb", difficulty: 3 },

  // ============ FLOOR (Suelo) - FX ============
  // Group 1 - Acrobatic串联
  { skillCode: "FX-AC1", name: "Flic flac串联", description: "Flic flac adelante en串联", apparatus: "fx", difficulty: 2 },
  { skillCode: "FX-AC2", name: "2x Flic flac", description: "Dos flic flac en串联", apparatus: "fx", difficulty: 3 },
  { skillCode: "FX-AC3", name: "Triple flic", description: "Triple flic flac", apparatus: "fx", difficulty: 4 },
  { skillCode: "FX-AC4", name: "Rudi", description: "Rudi en串联", apparatus: "fx", difficulty: 4 },
  // Group 2 - Jumps
  { skillCode: "FX-JP1", name: "Tuck jump", description: "Tuck jump con 1/1 giro", apparatus: "fx", difficulty: 2 },
  { skillCode: "FX-JP2", name: "Layout 1/1", description: "Layout con 1 vuelta", apparatus: "fx", difficulty: 3 },
  { skillCode: "FX-JP3", name: "Double tuck", description: "Doble tuck", apparatus: "fx", difficulty: 4 },
  { skillCode: "FX-JP4", name: "Double layout", description: "Doble layout", apparatus: "fx", difficulty: 5 },
  // Group 3 - Turns
  { skillCode: "FX-TR1", name: "Pivot 1/1", description: "Pivot de 1 vuelta completa", apparatus: "fx", difficulty: 2 },
  { skillCode: "FX-TR2", name: "Ring turn", description: "Giro en posición ring", apparatus: "fx", difficulty: 3 },
  { skillCode: "FX-TR3", name: "Wolf turn", description: "Giro en posición wolf", apparatus: "fx", difficulty: 3 },
  // Group 4 - Dance passage
  { skillCode: "FX-DN1", name: "Chassé", description: "Chassé hacia adelante", apparatus: "fx", difficulty: 1 },
  { skillCode: "FX-DN2", name: "Pas de chat", description: "Pas de chat con salto", apparatus: "fx", difficulty: 2 },
  { skillCode: "FX-DN3", name: "Leap 1/1", description: "Leap con 1 vuelta", apparatus: "fx", difficulty: 3 },
];

export async function seedEspanaGAElements(tenantId?: string) {
  console.log("🌱 Seeding España GA elements...");

  const effectiveTenantId = tenantId ?? "00000000-0000-0000-0000-000000000001";

  const insertedElements = [];

  for (const element of gaElements) {
    const [inserted] = await db
      .insert(skillCatalog)
      .values({
        tenantId: effectiveTenantId,
        apparatus: element.apparatus,
        skillCode: element.skillCode,
        name: element.name,
        description: element.description,
        difficulty: element.difficulty,
      })
      .returning();

    insertedElements.push(inserted);
  }

  console.log(`✅ ${insertedElements.length} GA elements seeded`);
  return insertedElements;
}
