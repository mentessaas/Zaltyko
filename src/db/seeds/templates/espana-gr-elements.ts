/**
 * Seed Data: España GR - Elementos FIG (Niveles 1-5)
 *
 * Elementos oficiales FIG 2022-2024 para Gimnasia Rítmica
 * Solo se incluyen elementos comunes para niveles 1-5
 *
 * Schema actual: skillCode, name, description, difficulty, apparatus
 */

import { db } from "../../index";
import { skillCatalog } from "../../schema/skill-catalog";

// Skill codes follow pattern: {APPARATUS}-{GROUP}-{CODE}
// e.g., R-G1-SJ = Rope, Group 1, Saltito Jump

interface GRElement {
  skillCode: string;
  name: string;
  description: string;
  apparatus: string;
  difficulty: number; // 1-10 scale
}

const grElements: GRElement[] = [
  // ============ ROPE (Cuerda) ============
  // Group 1 - Body difficulties
  { skillCode: "R-G1-SJ", name: "Salto con cuerda", description: "Salto básico manteniendo la cuerda", apparatus: "rope", difficulty: 1 },
  { skillCode: "R-G1-JT", name: "Jeté con cuerda", description: "Jeté pasando la cuerda por debajo", apparatus: "rope", difficulty: 2 },
  { skillCode: "R-G1-SP", name: "Spagat con cuerda", description: "Spagat frontal con cuerda", apparatus: "rope", difficulty: 3 },
  { skillCode: "R-G1-BL", name: "Balance con cuerda", description: "Balance manteniendo la cuerda", apparatus: "rope", difficulty: 2 },
  { skillCode: "R-G1-RB", name: "Rodamiento con cuerda", description: "Rodamiento con cuerda", apparatus: "rope", difficulty: 2 },
  // Group 2 - Apparatus handling
  { skillCode: "R-G2-FS", name: "Fundido simple", description: "Fundido de la cuerda de un lado a otro", apparatus: "rope", difficulty: 1 },
  { skillCode: "R-G2-FD", name: "Fundido doble", description: "Fundido con doble vuelta", apparatus: "rope", difficulty: 2 },
  { skillCode: "R-G2-GR", name: "Giro de muñeca", description: "Giro de muñeca con la cuerda", apparatus: "rope", difficulty: 1 },
  { skillCode: "R-G2-SW", name: "Swing", description: "Swing de la cuerda", apparatus: "rope", difficulty: 1 },
  // Group 4 - Dynamic elements with throws
  { skillCode: "R-G4-TR", name: "Tiro de cuerda", description: "Tiro y recogida de cuerda", apparatus: "rope", difficulty: 2 },
  { skillCode: "R-G4-CA", name: "Catch alto", description: "Tiro alto y catch con las manos", apparatus: "rope", difficulty: 3 },
  // Group 5 - Balance and pivot
  { skillCode: "R-G5-PD", name: "Pivot directamente", description: "Pivot sin cambio de dirección", apparatus: "rope", difficulty: 1 },
  { skillCode: "R-G5-PI", name: "Pivot indirecto", description: "Pivot con cambio de dirección", apparatus: "rope", difficulty: 2 },

  // ============ BALL (Pelota) ============
  // Group 1 - Body difficulties
  { skillCode: "B-G1-SJ", name: "Salto con pelota", description: "Salto manteniendo la pelota", apparatus: "ball", difficulty: 1 },
  { skillCode: "B-G1-RB", name: "Rodamiento de espalda", description: "Rodamiento hacia atrás con pelota", apparatus: "ball", difficulty: 2 },
  { skillCode: "B-G1-BL", name: "Balance con pelota", description: "Balance con pelota en mano", apparatus: "ball", difficulty: 1 },
  { skillCode: "B-G1-DI", name: "Disoc", description: "Disoc con pelota", apparatus: "ball", difficulty: 3 },
  // Group 2 - Apparatus handling
  { skillCode: "B-G2-BO", name: "Bounce", description: "Rebote de la pelota en el suelo", apparatus: "ball", difficulty: 1 },
  { skillCode: "B-G2-RO", name: "Rodamiento corporal", description: "Rodamiento de la pelota por el cuerpo", apparatus: "ball", difficulty: 1 },
  { skillCode: "B-G2-TH", name: "Throws pequeño", description: "Tiro pequeño de la pelota", apparatus: "ball", difficulty: 2 },
  { skillCode: "B-G2-HA", name: "Handle", description: "Handle con la pelota", apparatus: "ball", difficulty: 2 },
  // Group 3 - Mixed apparatus + body
  { skillCode: "B-G3-FL", name: "Flicar", description: "Flic con la pelota", apparatus: "ball", difficulty: 2 },
  { skillCode: "B-G3-PO", name: "Pivot con oscillation", description: "Pivot combinado con oscilación", apparatus: "ball", difficulty: 3 },
  // Group 4 - Dynamic elements with throws
  { skillCode: "B-G4-TC", name: "Tiro y catch", description: "Tiro alto y catch", apparatus: "ball", difficulty: 2 },
  { skillCode: "B-G4-TR", name: "Tiro rotational", description: "Tiro con rotación", apparatus: "ball", difficulty: 3 },
  // Group 5 - Balance and pivot
  { skillCode: "B-G5-PD", name: "Pivot directamente", description: "Pivot con pelota", apparatus: "ball", difficulty: 1 },
  { skillCode: "B-G5-PS", name: "Pivot sostenido", description: "Pivot mantenido con pelota", apparatus: "ball", difficulty: 2 },

  // ============ CLUBS (Mazas) ============
  // Group 1 - Body difficulties
  { skillCode: "C-G1-SJ", name: "Salto con mazas", description: "Salto manteniendo las mazas", apparatus: "clubs", difficulty: 1 },
  { skillCode: "C-G1-JT", name: "Jeté con mazas", description: "Jeté con mazas en posición", apparatus: "clubs", difficulty: 2 },
  { skillCode: "C-G1-SP", name: "Spagat con mazas", description: "Spagat con mazas", apparatus: "clubs", difficulty: 3 },
  // Group 2 - Apparatus handling
  { skillCode: "C-G2-CL", name: "Clarinet", description: "Movimiento de clarinet", apparatus: "clubs", difficulty: 1 },
  { skillCode: "C-G2-MI", name: "Mill", description: "Movimiento circular con ambas mazas", apparatus: "clubs", difficulty: 2 },
  { skillCode: "C-G2-SP", name: "Swing", description: "Swing de las mazas", apparatus: "clubs", difficulty: 1 },
  { skillCode: "C-G2-RI", name: "Risc", description: "Risc simple", apparatus: "clubs", difficulty: 2 },
  // Group 3 - Mixed apparatus + body
  { skillCode: "C-G3-FL", name: "Flic", description: "Flic con mazas", apparatus: "clubs", difficulty: 2 },
  { skillCode: "C-G3-CO", name: "Combo flip", description: "Combinación de flip y flic", apparatus: "clubs", difficulty: 3 },
  // Group 4 - Dynamic elements with throws
  { skillCode: "C-G4-TC", name: "Tiro y catch", description: "Tiro de mazas y catch", apparatus: "clubs", difficulty: 2 },
  { skillCode: "C-G4-RT", name: "Rota y tira", description: "Rotación y tiro simultáneo", apparatus: "clubs", difficulty: 3 },
  // Group 5 - Balance and pivot
  { skillCode: "C-G5-PD", name: "Pivot directamente", description: "Pivot con mazas", apparatus: "clubs", difficulty: 1 },
  { skillCode: "C-G5-KP", name: "Kinetic", description: "Elemento cinético con mazas", apparatus: "clubs", difficulty: 3 },

  // ============ HOOP (Aro) ============
  // Group 1 - Body difficulties
  { skillCode: "H-G1-SJ", name: "Salto con aro", description: "Salto atravesando el aro", apparatus: "hoop", difficulty: 1 },
  { skillCode: "H-G1-RB", name: "Rodamiento de espalda", description: "Rodamiento con aro", apparatus: "hoop", difficulty: 2 },
  { skillCode: "H-G1-DI", name: "Disoc", description: "Disoc con aro", apparatus: "hoop", difficulty: 3 },
  // Group 2 - Apparatus handling
  { skillCode: "H-G2-RD", name: "Rodamiento directo", description: "Rodamiento del aro por el suelo", apparatus: "hoop", difficulty: 1 },
  { skillCode: "H-G2-GR", name: "Giro", description: "Giro del aro", apparatus: "hoop", difficulty: 2 },
  { skillCode: "H-G2-PU", name: "Pass through", description: "Paso a través del aro", apparatus: "hoop", difficulty: 1 },
  // Group 3 - Mixed apparatus + body
  { skillCode: "H-G3-RB", name: "Rebound", description: "Rebote del aro", apparatus: "hoop", difficulty: 2 },
  { skillCode: "H-G3-ST", name: "Stockli", description: "Stockli con aro", apparatus: "hoop", difficulty: 3 },
  // Group 4 - Dynamic elements with throws
  { skillCode: "H-G4-TR", name: "Tirorotacional", description: "Tiro con rotación del aro", apparatus: "hoop", difficulty: 3 },
  { skillCode: "H-G4-TH", name: "Throw alto", description: "Tiro alto del aro", apparatus: "hoop", difficulty: 2 },
  // Group 5 - Balance and pivot
  { skillCode: "H-G5-PD", name: "Pivot directamente", description: "Pivot con aro", apparatus: "hoop", difficulty: 1 },
  { skillCode: "H-G5-SC", name: "Scale con aro", description: "Scale manteniendo el aro", apparatus: "hoop", difficulty: 2 },

  // ============ RIBBON (Cinta) ============
  // Group 1 - Body difficulties
  { skillCode: "RI-G1-SJ", name: "Salto con cinta", description: "Salto manteniendo la cinta", apparatus: "ribbon", difficulty: 1 },
  { skillCode: "RI-G1-WV", name: "Wave", description: "Onda con la cinta", apparatus: "ribbon", difficulty: 1 },
  { skillCode: "RI-G1-SG", name: "Spagat con cinta", description: "Spagat con movimiento de cinta", apparatus: "ribbon", difficulty: 3 },
  // Group 2 - Apparatus handling
  { skillCode: "RI-G2-CI", name: "Circle", description: "Círculo con la cinta", apparatus: "ribbon", difficulty: 1 },
  { skillCode: "RI-G2-SF", name: "Spiral", description: "Espiral con la cinta", apparatus: "ribbon", difficulty: 2 },
  { skillCode: "RI-G2-FL", name: "Flutter", description: "Flutter de la cinta", apparatus: "ribbon", difficulty: 1 },
  // Group 3 - Mixed apparatus + body
  { skillCode: "RI-G3-OS", name: "Oscilación", description: "Oscilación de la cinta", apparatus: "ribbon", difficulty: 2 },
  { skillCode: "RI-G3-SD", name: "Snake", description: "Serpiente con la cinta", apparatus: "ribbon", difficulty: 2 },
  // Group 4 - Dynamic elements with throws
  { skillCode: "RI-G4-TR", name: "Tiro de cinta", description: "Tiro de la cinta", apparatus: "ribbon", difficulty: 2 },
  { skillCode: "RI-G4-CA", name: "Catch alto", description: "Tiro alto y catch", apparatus: "ribbon", difficulty: 3 },
  // Group 5 - Balance and pivot
  { skillCode: "RI-G5-PD", name: "Pivot directamente", description: "Pivot con cinta", apparatus: "ribbon", difficulty: 1 },
  { skillCode: "RI-G5-PI", name: "Pivot indirecto", description: "Pivot con cambio de dirección", apparatus: "ribbon", difficulty: 2 },
];

export async function seedEspanaGRElements() {
  console.log("🌱 Seeding España GR elements...");

  // Tenant placeholder - in production should be tied to actual tenant
  const tenantId = "00000000-0000-0000-0000-000000000001";

  const insertedElements = [];

  for (const element of grElements) {
    const [inserted] = await db
      .insert(skillCatalog)
      .values({
        tenantId,
        apparatus: element.apparatus,
        skillCode: element.skillCode,
        name: element.name,
        description: element.description,
        difficulty: element.difficulty,
      })
      .returning();

    insertedElements.push(inserted);
  }

  console.log(`✅ ${insertedElements.length} GR elements seeded`);
  return insertedElements;
}

// Run if executed directly
seedEspanaGRElements()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
