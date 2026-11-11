// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * P2 #17: la entrada «Objetivos y observaciones» de la ficha en Grupos solo
 * aparece cuando el servidor confirmó que existen las tablas, y el panel solo
 * se monta (y pide datos) al abrirlo.
 */
const panel = vi.hoisted(() => vi.fn((props: { athleteId?: string }) => `Panel de ${props.athleteId}`));

vi.mock("@/components/owner-dashboard/OwnerAthleteProfileEditor", () => ({ OwnerAthleteProfileEditor: () => null }));
vi.mock("@/components/owner-dashboard/OwnerAthleteFamilyAssociationEditor", () => ({
  OwnerAthleteFamilyAssociationEditor: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerAthleteArchiveEditor", () => ({ OwnerAthleteArchiveEditor: () => null }));
vi.mock("@/components/owner-dashboard/OwnerAthleteProgressPanel", () => ({ OwnerAthleteProgressPanel: panel }));

import { OwnerGroupMembershipRow } from "@/components/owner-dashboard/OwnerGroupMembershipRow";

const ATHLETE = "00000000-0000-4000-8000-000000000003";

function renderRow(showProgress: boolean | undefined) {
  const props = {
    membership: { id: "m1", athleteId: ATHLETE, athleteName: "Lúa Pérez", status: "active", startsOn: "2026-09-01" },
    organizationId: "00000000-0000-4000-8000-000000000001",
    locationId: "00000000-0000-4000-8000-000000000002",
    groupId: "00000000-0000-4000-8000-000000000004",
    effectiveFrom: "2026-11-11",
    allowExistingFamilies: true,
    commandsLocked: false,
    writesBlocked: false,
    showProgress,
    profileEditorKey: "p",
    profileEditorDisabled: false,
    pendingAthleteProfile: null,
    onProfileActiveChange: () => undefined,
    onProfilePendingCommandChange: () => undefined,
    familyAssociationKey: "f",
    familyAssociationEditorDisabled: false,
    pendingAthleteFamilyAssociation: null,
    onFamilyActiveChange: () => undefined,
    onFamilyPendingCommandChange: () => undefined,
    onSaved: () => undefined,
    showArchiveEditor: false,
    archiveEditorKey: "a",
    archiveEditorDisabled: false,
    pendingAthleteArchive: null,
    onArchiveActiveChange: () => undefined,
    onArchivePendingCommandChange: () => undefined,
    onArchived: () => undefined,
    onChangeMembership: () => undefined,
  } as unknown as ComponentProps<typeof OwnerGroupMembershipRow>;
  return render(
    <ul>
      <OwnerGroupMembershipRow {...props} />
    </ul>
  );
}

afterEach(() => {
  cleanup();
  panel.mockClear();
});

describe("entrada a objetivos y observaciones en la ficha de Grupos", () => {
  it.each([[false], [undefined]])("showProgress=%s: no hay entrada ni panel", (showProgress) => {
    renderRow(showProgress);
    expect(screen.queryByRole("button", { name: /Objetivos y observaciones/ })).not.toBeInTheDocument();
    expect(panel).not.toHaveBeenCalled();
  });

  it("con las tablas disponibles, el panel se monta solo al abrir", () => {
    renderRow(true);
    const toggle = screen.getByRole("button", { name: "Objetivos y observaciones de Lúa Pérez" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(`Panel de ${ATHLETE}`)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText(`Panel de ${ATHLETE}`)).not.toBeInTheDocument();
  });
});
