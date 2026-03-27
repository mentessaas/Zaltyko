/**
 * Seed Data: España - Gimnasia Rítmica (RFEG)
 *
 * Template completo para España GR con:
 * - Categorías por edad (5-7 hasta Absoluta)
 * - 5 Aparatos: Cuerda, Pelota, Mazas, Aro, Cinta
 * - Niveles de competición (Pre-nivel hasta FIG)
 * - Sistema de puntuación FIG D-Score/E-Score
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

export async function seedEspanaGR() {
  console.log("🌱 Seeding España - Gimnasia Rítmica...");

  // 1. Create main template
  const [template] = await db
    .insert(templates)
    .values({
      country: "España",
      countryCode: "ES",
      discipline: "rhythmic",
      name: "España - Gimnasia Rítmica (RFEG)",
      description:
        "Template oficial para Gimnasia Rítmica en España según normativa RFEG 2022-2024",
      isActive: true,
      isDefault: true,
    })
    .returning();

  console.log(`✅ Template created: ${template.id}`);

  // 2. Age Categories
  const ageCategories = [
    {
      code: "pre_iniciacion",
      name: "Pre-iniciación",
      description: "No competitiva, desarrollo motor básico",
      minAge: 5,
      maxAge: 7,
      isCompetitive: "false",
      sortOrder: 1,
    },
    {
      code: "iniciacion",
      name: "Iniciación",
      description: "Primeros niveles técnicos (1-2), primera licencia federativa",
      minAge: 8,
      maxAge: 9,
      isCompetitive: "true",
      sortOrder: 2,
    },
    {
      code: "alevin",
      name: "Alevín",
      description: "Niveles técnicos 3-4",
      minAge: 10,
      maxAge: 11,
      isCompetitive: "true",
      sortOrder: 3,
    },
    {
      code: "infantil",
      name: "Infantil",
      description: "Niveles técnicos 5-6",
      minAge: 12,
      maxAge: 13,
      isCompetitive: "true",
      sortOrder: 4,
    },
    {
      code: "junior",
      name: "Junior",
      description: "Niveles técnicos 7-8",
      minAge: 14,
      maxAge: 15,
      isCompetitive: "true",
      sortOrder: 5,
    },
    {
      code: "senior",
      name: "Senior",
      description: "Niveles técnicos 9-10",
      minAge: 16,
      maxAge: 17,
      isCompetitive: "true",
      sortOrder: 6,
    },
    {
      code: "absoluta",
      name: "Absoluta",
      description: "FIG / Elite, 18+ años",
      minAge: 18,
      maxAge: 99,
      isCompetitive: "true",
      sortOrder: 7,
    },
  ];

  await db.insert(templateAgeCategories).values(
    ageCategories.map((cat) => ({
      templateId: template.id,
      ...cat,
    }))
  );

  console.log(`✅ ${ageCategories.length} age categories created`);

  // 3. Apparatus (5 official FIG apparatus for GR)
  const apparatusList = [
    {
      code: "rope",
      name: "Cuerda",
      shortName: "C",
      hasRotation: false,
      isOptional: false,
      sortOrder: 1,
    },
    {
      code: "ball",
      name: "Pelota",
      shortName: "P",
      hasRotation: true,
      isOptional: false,
      sortOrder: 2,
    },
    {
      code: "clubs",
      name: "Mazas",
      shortName: "M",
      hasRotation: true,
      isOptional: false,
      sortOrder: 3,
    },
    {
      code: "hoop",
      name: "Aro",
      shortName: "A",
      hasRotation: true,
      isOptional: false,
      sortOrder: 4,
    },
    {
      code: "ribbon",
      name: "Cinta",
      shortName: "Ci",
      hasRotation: true,
      isOptional: false,
      sortOrder: 5,
    },
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
    {
      code: "pre_nivel",
      name: "Pre-nivel",
      description: "No competitiva, exhibiciones",
      isCompetitive: false,
      sortOrder: 1,
    },
    {
      code: "nivel_1",
      name: "Nivel 1",
      description: "Primer nivel técnico",
      isCompetitive: true,
      sortOrder: 2,
    },
    {
      code: "nivel_2",
      name: "Nivel 2",
      description: "Segundo nivel técnico",
      isCompetitive: true,
      sortOrder: 3,
    },
    {
      code: "nivel_3",
      name: "Nivel 3",
      description: "Tercer nivel técnico",
      isCompetitive: true,
      sortOrder: 4,
    },
    {
      code: "nivel_4",
      name: "Nivel 4",
      description: "Cuarto nivel técnico",
      isCompetitive: true,
      sortOrder: 5,
    },
    {
      code: "nivel_5",
      name: "Nivel 5",
      description: "Quinto nivel técnico",
      isCompetitive: true,
      sortOrder: 6,
    },
    {
      code: "nivel_6",
      name: "Nivel 6",
      description: "Sexto nivel técnico",
      isCompetitive: true,
      sortOrder: 7,
    },
    {
      code: "nivel_7",
      name: "Nivel 7",
      description: "Séptimo nivel técnico",
      isCompetitive: true,
      sortOrder: 8,
    },
    {
      code: "nivel_8",
      name: "Nivel 8",
      description: "Octavo nivel técnico",
      isCompetitive: true,
      sortOrder: 9,
    },
    {
      code: "nivel_9",
      name: "Nivel 9",
      description: "Noveno nivel técnico",
      isCompetitive: true,
      sortOrder: 10,
    },
    {
      code: "nivel_10",
      name: "Nivel 10",
      description: "Décimo nivel técnico",
      isCompetitive: true,
      sortOrder: 11,
    },
    {
      code: "fig",
      name: "FIG / Elite",
      description: "Nivel internacional FIG",
      isCompetitive: true,
      sortOrder: 12,
    },
  ];

  await db.insert(templateCompetitionLevels).values(
    competitionLevels.map((level) => ({
      templateId: template.id,
      ...level,
    }))
  );

  console.log(`✅ ${competitionLevels.length} competition levels created`);

  // 5. Scoring Configuration (FIG D-Score/E-Score 2022-2024)
  await db.insert(templateScoringConfig).values({
    templateId: template.id,
    scoringType: "d_e",
    maxDifficulties: 6,
    maxPerGroup: 1,
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
      maxApparatusValue: 20, // max value per apparatus
      difficultyGroups: [1, 2, 3, 4, 5],
    },
  });

  console.log("✅ Scoring configuration created");

  // 6. Competition Flow (RFEG official stages)
  const competitionFlow = [
    {
      code: "concentracion_autonomica",
      name: "Concentración Autonómica",
      description: "Evaluación local/regional",
      level: "local",
      stageOrder: 1,
      requirements: {
        minAge: null,
        requiredLicense: true,
        previousStage: null,
      },
    },
    {
      code: "copa_autonomica",
      name: "Copa Autonómica",
      description: "Competición de ámbito autonómico",
      level: "autonomic",
      stageOrder: 2,
      requirements: {
        minAge: null,
        requiredLicense: true,
        previousStage: "concentracion_autonomica",
      },
    },
    {
      code: "campeonato_autonomico",
      name: "Campeonato Autonómico",
      description: "Campeonato de la comunidad autónoma",
      level: "autonomic",
      stageOrder: 3,
      requirements: {
        minAge: null,
        requiredLicense: true,
        previousStage: "copa_autonomica",
      },
    },
    {
      code: "clasificacion_nacional",
      name: "Clasificación Nacional",
      description: "Clasificación para competiciones nacionales",
      level: "national",
      stageOrder: 4,
      requirements: {
        minAge: null,
        requiredLicense: true,
        previousStage: "campeonato_autonomico",
        qualificationRequired: true,
      },
    },
    {
      code: "copa_reina",
      name: "Copa de la Reina",
      description: "Copa de España小女孩",
      level: "national",
      stageOrder: 5,
      requirements: {
        minAge: 10,
        requiredLicense: true,
        previousStage: "clasificacion_nacional",
        qualificationRequired: true,
        maxParticipants: 24,
      },
    },
    {
      code: "campeonato_espana",
      name: "Campeonato de España",
      description: "Campeonato nacional absoluto",
      level: "national",
      stageOrder: 6,
      requirements: {
        minAge: 10,
        requiredLicense: true,
        previousStage: null, // Open to qualified athletes
        qualificationRequired: true,
        maxParticipants: 24,
      },
    },
    {
      code: "europeas",
      name: "Europeas",
      description: "Campeonatos europeos",
      level: "international",
      stageOrder: 7,
      requirements: {
        minAge: 14,
        requiredLicense: true,
        federationQualification: true,
        figLicense: true,
      },
    },
    {
      code: "mundiales",
      name: "Mundiales",
      description: "Campeonatos mundiales",
      level: "international",
      stageOrder: 8,
      requirements: {
        minAge: 14,
        requiredLicense: true,
        federationQualification: true,
        figLicense: true,
      },
    },
    {
      code: "juegos_olimpicos",
      name: "Juegos Olímpicos",
      description: "Clasificación y participación olímpica",
      level: "international",
      stageOrder: 9,
      requirements: {
        minAge: 16,
        requiredLicense: true,
        federationQualification: true,
        figLicense: true,
        ogQuota: true,
      },
    },
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
    documentsRequired: [
      "identity_document",
      "medical_certificate",
      "consent_form",
      "photo",
    ],
    medicalCertificateRequired: true,
    medicalCertificateValidityMonths: 12,
  });

  console.log("✅ License configuration created");

  console.log("🎉 España - Gimnasia Rítmica seed completed!");
  return template;
}

// Run if executed directly
seedEspanaGR()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
