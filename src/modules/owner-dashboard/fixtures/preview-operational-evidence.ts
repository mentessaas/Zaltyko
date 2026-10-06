import type { getCapacityHeatmap } from "../application/capacity-heatmap";
import type { getRetentionCohorts } from "../application/retention-cohorts";

type CapacityBundle = Awaited<ReturnType<typeof getCapacityHeatmap>>;
type CohortsBundle = Awaited<ReturnType<typeof getRetentionCohorts>>;

const organization = {
  id: "30000000-0000-0000-0000-000000000001",
  name: "Academia Métricas Sintética",
  defaultCurrency: "EUR",
};
const locations = [
  {
    id: "30000000-0000-0000-0000-000000000011",
    name: "Sede Métricas Sintética",
  },
];

export const ownerDashboardCapacityPreview: CapacityBundle = {
  organization,
  scope: { locationId: null, locations, canViewOrganizationAggregate: true },
  asOf: "2026-09-30",
  filters: { programId: null, groupId: null },
  cells: [
    {
      isoWeekday: 1,
      startsAtLocal: "16:30:00",
      endsAtLocal: "17:30:00",
      occupied: 18,
      capacity: 24,
      openSeats: 6,
      fillRate: 0.75,
      classes: [
        {
          classTemplateId: "30000000-0000-0000-0000-000000000021",
          name: "Iniciación A · dato sintético",
          occupied: 10,
          capacity: 12,
          openSeats: 2,
          fillRate: 0.8333,
        },
        {
          classTemplateId: "30000000-0000-0000-0000-000000000022",
          name: "Iniciación B · dato sintético",
          occupied: 8,
          capacity: 12,
          openSeats: 4,
          fillRate: 0.6667,
        },
      ],
    },
    {
      isoWeekday: 3,
      startsAtLocal: "18:00:00",
      endsAtLocal: "19:30:00",
      occupied: 22,
      capacity: 24,
      openSeats: 2,
      fillRate: 0.9167,
      classes: [
        {
          classTemplateId: "30000000-0000-0000-0000-000000000023",
          name: "Tecnificación · dato sintético",
          occupied: 22,
          capacity: 24,
          openSeats: 2,
          fillRate: 0.9167,
        },
      ],
    },
    {
      isoWeekday: 6,
      startsAtLocal: "10:00:00",
      endsAtLocal: "11:00:00",
      occupied: 0,
      capacity: 0,
      openSeats: 0,
      fillRate: null,
      classes: [
        {
          classTemplateId: "30000000-0000-0000-0000-000000000024",
          name: "Taller sin aforo configurado · dato sintético",
          occupied: 0,
          capacity: 0,
          openSeats: 0,
          fillRate: null,
        },
      ],
    },
  ],
  nextCursor: null,
};

export const ownerDashboardCohortsPreview: CohortsBundle = {
  organization,
  scope: { locationId: null, locations, canViewOrganizationAggregate: true },
  asOf: "2026-09-30",
  filters: { programId: null, groupId: null },
  pauseGrace: {
    status: "unconfigured",
    reason:
      "No se calcula retentionRate para períodos con inscripciones pausadas hasta definir la gracia de pausa.",
  },
  items: [
    {
      cohortMonth: "2026-06-01",
      cohortSize: 20,
      matrix: [
        {
          periodEnd: "2026-06-30",
          activeCount: 20,
          pausedCount: 0,
          retentionRate: 1,
          quality: "complete",
        },
        {
          periodEnd: "2026-07-31",
          activeCount: 19,
          pausedCount: 0,
          retentionRate: 0.95,
          quality: "complete",
        },
        {
          periodEnd: "2026-08-31",
          activeCount: 18,
          pausedCount: 1,
          retentionRate: null,
          quality: "insufficient_data",
        },
      ],
      definition: "Fixture sintético; sin personas reales.",
    },
    {
      cohortMonth: "2026-07-01",
      cohortSize: 12,
      matrix: [
        {
          periodEnd: "2026-07-31",
          activeCount: 12,
          pausedCount: 0,
          retentionRate: 1,
          quality: "complete",
        },
        {
          periodEnd: "2026-08-31",
          activeCount: 11,
          pausedCount: 0,
          retentionRate: 0.9167,
          quality: "complete",
        },
        {
          periodEnd: "2026-09-30",
          activeCount: 10,
          pausedCount: 0,
          retentionRate: 0.8333,
          quality: "complete",
        },
      ],
      definition: "Fixture sintético; sin personas reales.",
    },
  ],
  nextCursor: null,
};
