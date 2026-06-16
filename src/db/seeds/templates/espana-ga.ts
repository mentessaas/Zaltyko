/**
 * Seed Data: España - Gimnasia Artística (RFEG)
 *
 * Template completo para España GA con:
 * - Mismos categorías por edad que GR
 * - Aparatos: VT, UB, BB, FX (femenino) / FX, PH, SR, VT, PB, HB (masculino)
 * - Sistema de puntuación FIG open-ended D-Score/E-Score
 * - Flujo competitivo RFEG
 */

import { db } from "../../index";
import { templates } from "../../schema/templates/templates";
import { templateAgeCategories } from "../../schema/templates/template-age-categories";
import { templateApparatus } from "../../schema/templates/template-apparatus";
import { templateCompetitionLevels } from "../../schema/templates/template-competition-levels";
import { templateScoringConfig } from "../../schema/templates/template-scoring-config";
import { templateCompetitionFlow } from "../../schema/templates/template-competition-flow";
import { templateLicenseConfig } from "../../schema/templates/template-license-config";

export async function seedEspanaGA() {
  console.log("🌱 Seeding España - Gimnasia Artística...");

  // 1. Create main template for GA
  const [template] = await db
    .insert(templates)
    .values({
      country: "España",
      countryCode: "ES",
      discipline: "artistic_female",
      name: "España - Gimnasia Artística (RFEG)",
      description:
        "Template oficial para Gimnasia Artística en España según normativa RFEG 2022-2024",
      isActive: true,
      isDefault: false,
    })
    .returning();

  console.log(`✅ Template created: ${template.id}`);

  // 2. Age Categories (same as GR)
  const ageCategories = [
    { code: "pre_iniciacion", name: "Pre-iniciación", description: "No competitiva, desarrollo motor básico", minAge: 5, maxAge: 7, isCompetitive: "false", sortOrder: 1 },
    { code: "iniciacion", name: "Iniciación", description: "Primeros niveles técnicos (A-B)", minAge: 8, maxAge: 9, isCompetitive: "true", sortOrder: 2 },
    { code: "alevin", name: "Alevín", description: "Niveles técnicos C-D", minAge: 10, maxAge: 11, isCompetitive: "true", sortOrder: 3 },
    { code: "infantil", name: "Infantil", description: "Niveles técnicos E-F", minAge: 12, maxAge: 13, isCompetitive: "true", sortOrder: 4 },
    { code: "junior", name: "Junior", description: "Niveles técnicos 1-2", minAge: 14, maxAge: 15, isCompetitive: "true", sortOrder: 5 },
    { code: "senior", name: "Senior", description: "Niveles técnicos 3-4", minAge: 16, maxAge: 17, isCompetitive: "true", sortOrder: 6 },
    { code: "absoluta", name: "Absoluta", description: "FIG / Elite, 18+ años", minAge: 18, maxAge: 99, isCompetitive: "true", sortOrder: 7 },
  ];

  await db.insert(templateAgeCategories).values(
    ageCategories.map((cat) => ({
      templateId: template.id,
      ...cat,
    }))
  );

  console.log(`✅ ${ageCategories.length} age categories created`);

  // 3. Apparatus (4 for feminine GA)
  const apparatusList = [
    { code: "vt", name: "Salto", shortName: "VT", hasRotation: true, isOptional: false, sortOrder: 1 },
    { code: "ub", name: "Barras Asimétricas", shortName: "BA", hasRotation: false, isOptional: false, sortOrder: 2 },
    { code: "bb", name: "Viga", shortName: "V", hasRotation: false, isOptional: false, sortOrder: 3 },
    { code: "fx", name: "Suelo", shortName: "S", hasRotation: false, isOptional: false, sortOrder: 4 },
  ];

  await db.insert(templateApparatus).values(
    apparatusList.map((ap) => ({
      templateId: template.id,
      ...ap,
    }))
  );

  console.log(`✅ ${apparatusList.length} apparatus created`);

  // 4. Competition Levels
  const competitionLevels = [
    { code: "pre_nivel", name: "Pre-nivel", description: "No competitiva, exhibiciones", isCompetitive: false, sortOrder: 1 },
    { code: "nivel_a", name: "Nivel A", description: "Primer nivel técnico", isCompetitive: true, sortOrder: 2 },
    { code: "nivel_b", name: "Nivel B", description: "Segundo nivel técnico", isCompetitive: true, sortOrder: 3 },
    { code: "nivel_c", name: "Nivel C", description: "Tercer nivel técnico", isCompetitive: true, sortOrder: 4 },
    { code: "nivel_d", name: "Nivel D", description: "Cuarto nivel técnico", isCompetitive: true, sortOrder: 5 },
    { code: "nivel_e", name: "Nivel E", description: "Quinto nivel técnico", isCompetitive: true, sortOrder: 6 },
    { code: "nivel_f", name: "Nivel F", description: "Sexto nivel técnico", isCompetitive: true, sortOrder: 7 },
    { code: "nivel_1", name: "Nivel 1", description: "Séptimo nivel técnico", isCompetitive: true, sortOrder: 8 },
    { code: "nivel_2", name: "Nivel 2", description: "Octavo nivel técnico", isCompetitive: true, sortOrder: 9 },
    { code: "nivel_3", name: "Nivel 3", description: "Noveno nivel técnico", isCompetitive: true, sortOrder: 10 },
    { code: "nivel_4", name: "Nivel 4", description: "Décimo nivel técnico", isCompetitive: true, sortOrder: 11 },
    { code: "fig", name: "FIG / Elite", description: "Nivel internacional FIG", isCompetitive: true, sortOrder: 12 },
  ];

  await db.insert(templateCompetitionLevels).values(
    competitionLevels.map((level) => ({
      templateId: template.id,
      ...level,
    }))
  );

  console.log(`✅ ${competitionLevels.length} competition levels created`);

  // 5. Scoring Configuration (FIG Open-Ended D-Score/E-Score)
  await db.insert(templateScoringConfig).values({
    templateId: template.id,
    scoringType: "d_e",
    maxDifficulties: 8, // More difficulties allowed in GA
    maxPerGroup: 2, // Can have up to 2 from same group
    deductionsSmall: 1, // 0.1
    deductionsMedium: 3, // 0.3
    deductionsLarge: 5, // 0.5
    deductionsFall: 10, // 1.0
    comboBonus2Elements: 1, // 0.1
    comboBonus3PlusElements: 2, // 0.2
    minDifficultyValue: 1, // 0.1
    maxDifficultyValue: 26, // 2.6
    extraConfig: {
      maxDuration: 90, // seconds
      maxApparatusValue: 20,
      difficultyGroups: [1, 2, 3, 4, 5, 6], // GA has 6 groups
      specialRequirements: {
        vt: { maxAttempts: 2, bestCounts: true },
        ub: { maxHalfSwingElements: 1 },
        bb: { maxAcroElements: 4 },
        fx: { maxAcroElements: 5 },
      },
    },
  });

  console.log("✅ Scoring configuration created");

  // 6. Competition Flow (same as GR but with GA-specific events)
  const competitionFlow = [
    { code: "concentracion_autonomica", name: "Concentración Autonómica", description: "Evaluación local/regional", level: "local", stageOrder: 1, requirements: { minAge: null, requiredLicense: true, previousStage: null } },
    { code: "copa_autonomica", name: "Copa Autonómica", description: "Competición de ámbito autonómico", level: "autonomic", stageOrder: 2, requirements: { minAge: null, requiredLicense: true, previousStage: "concentracion_autonomica" } },
    { code: "campeonato_autonomico", name: "Campeonato Autonómico", description: "Campeonato de la comunidad autónoma", level: "autonomic", stageOrder: 3, requirements: { minAge: null, requiredLicense: true, previousStage: "copa_autonomica" } },
    { code: "clasificacion_nacional", name: "Clasificación Nacional", description: "Clasificación para competiciones nacionales", level: "national", stageOrder: 4, requirements: { minAge: null, requiredLicense: true, previousStage: "campeonato_autonomico", qualificationRequired: true } },
    { code: "copa_espana", name: "Copa de España", description: "Copa de España", level: "national", stageOrder: 5, requirements: { minAge: null, requiredLicense: true, previousStage: "clasificacion_nacional", qualificationRequired: true, maxParticipants: 24 } },
    { code: "campeonato_espana", name: "Campeonato de España", description: "Campeonato nacional absoluto", level: "national", stageOrder: 6, requirements: { minAge: null, requiredLicense: true, previousStage: null, qualificationRequired: true, maxParticipants: 24 } },
    { code: "europeas", name: "Europeas", description: "Campeonatos europeos", level: "international", stageOrder: 7, requirements: { minAge: 14, requiredLicense: true, federationQualification: true, figLicense: true } },
    { code: "mundiales", name: "Mundiales", description: "Campeonatos mundiales", level: "international", stageOrder: 8, requirements: { minAge: 14, requiredLicense: true, federationQualification: true, figLicense: true } },
    { code: "juegos_olimpicos", name: "Juegos Olímpicos", description: "Clasificación y participación olímpica", level: "international", stageOrder: 9, requirements: { minAge: 16, requiredLicense: true, federationQualification: true, figLicense: true, ogQuota: true } },
  ];

  await db.insert(templateCompetitionFlow).values(
    competitionFlow.map((flow) => ({
      templateId: template.id,
      code: flow.code,
      name: flow.name,
      description: flow.description,
      level: flow.level,
      stageOrder: flow.stageOrder,
      requirements: flow.requirements,
      isActive: "true",
    }))
  );

  console.log(`✅ ${competitionFlow.length} competition flow stages created`);

  // 7. License Configuration
  await db.insert(templateLicenseConfig).values({
    templateId: template.id,
    requiredForCompetition: true,
    requiredForTraining: false,
    renewalMonths: 12,
    documentsRequired: ["identity_document", "medical_certificate", "consent_form", "photo"],
    medicalCertificateRequired: true,
    medicalCertificateValidityMonths: 12,
  });

  console.log("✅ License configuration created");

  // Also create masculine GA template
  const [templateMasculino] = await db
    .insert(templates)
    .values({
      country: "España",
      countryCode: "ES",
      discipline: "artistic_male",
      name: "España - Gimnasia Artística Masculina (RFEG)",
      description: "Template oficial para Gimnasia Artística Masculina en España",
      isActive: true,
      isDefault: false,
    })
    .returning();

  // Apparatus for masculine GA
  const apparatusMasculino = [
    { code: "fx", name: "Suelo", shortName: "S", hasRotation: false, isOptional: false, sortOrder: 1 },
    { code: "ph", name: "Caballo con Arcos", shortName: "CA", hasRotation: true, isOptional: false, sortOrder: 2 },
    { code: "sr", name: "Anillas", shortName: "A", hasRotation: false, isOptional: false, sortOrder: 3 },
    { code: "vt", name: "Salto", shortName: "VT", hasRotation: true, isOptional: false, sortOrder: 4 },
    { code: "pb", name: "Paralelas", shortName: "P", hasRotation: false, isOptional: false, sortOrder: 5 },
    { code: "hb", name: "Barra Fija", shortName: "BF", hasRotation: true, isOptional: false, sortOrder: 6 },
  ];

  await db.insert(templateApparatus).values(
    apparatusMasculino.map((ap) => ({
      templateId: templateMasculino.id,
      ...ap,
    }))
  );

  console.log(`✅ ${apparatusMasculino.length} apparatus created for masculine GA`);

  console.log("🎉 España - Gimnasia Artística seed completed!");
  return template;
}

