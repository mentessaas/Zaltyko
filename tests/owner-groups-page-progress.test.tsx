import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2 #17: /owner/groups calcula en servidor si existen las tablas de
 * objetivos y observaciones y lo pasa a OwnerGroupsManager. Sin ellas, la
 * prop es false y la ficha no ofrece la sección (ver
 * tests/owner-athlete-progress-wiring.test.tsx para el gestor).
 */
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  pageData: vi.fn(),
  progressAvailable: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/modules/groups/application/group-management-service", () => ({
  getOwnerGroupsPageData: mocks.pageData,
}));
vi.mock("@/modules/athlete-progress/application/athlete-progress-storage", () => ({
  isAthleteProgressAvailableForPage: mocks.progressAvailable,
}));

import OwnerGroupsPage from "@/app/owner/groups/page";
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";

const organizationId = "91000000-0000-4000-8000-000000000001";

function findAll(node: ReactNode, type: unknown): ReactElement[] {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  const own = element.type === type ? [element] : [];
  return [...own, ...Children.toArray(element.props.children).flatMap((child) => findAll(child, type))];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } } });
  mocks.pageData.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: "owner-1", role: "owner", locationScopeMode: "all" },
    selectedLocationId: null,
    selectedGroupId: null,
  });
});

describe("/owner/groups pasa la disponibilidad de objetivos y observaciones", () => {
  it.each([false, true])("progressAvailable=%s llega a OwnerGroupsManager", async (available) => {
    mocks.progressAvailable.mockResolvedValue(available);

    const page = await OwnerGroupsPage({ searchParams: Promise.resolve({ organizationId }) });

    expect(mocks.progressAvailable).toHaveBeenCalledTimes(1);
    const [manager] = findAll(page, OwnerGroupsManager);
    expect(manager, "OwnerGroupsManager").toBeDefined();
    expect(manager!.props).toMatchObject({ progressAvailable: available });
  });
});
