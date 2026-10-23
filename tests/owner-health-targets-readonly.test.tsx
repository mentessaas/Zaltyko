// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcademyTargetProfileForm } from "@/components/owner-dashboard/AcademyTargetProfileForm";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import {
  clearStoredHealthTargetCommand,
  persistHealthTargetCommand,
  type StoredHealthTargetCommand,
} from "@/components/owner-dashboard/owner-health-target-command";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const organizationId = "90000000-0000-4000-8000-000000000001";
const otherOrganizationId = "90000000-0000-4000-8000-000000000002";
let generatedCommand = 10;

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  generatedCommand = 10;
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", {
    randomUUID: () =>
      `90000000-0000-4000-8000-${String(++generatedCommand).padStart(12, "0")}`,
  });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("metas Owner durante solo lectura", () => {
  it("mantiene las metas visibles y bloquea su guardado con acceso a regularización", () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    render(
      <AcademyTargetProfileForm
        organizationId={organizationId}
        profile={{ version: 1, targets: { class_fill_rate: 0.75 } }}
      />
    );

    expect(screen.getByText(/La academia está en solo lectura/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Uso y regularización" })).toHaveAttribute("href", `/owner/subscription?organizationId=${organizationId}#regularizar`);
    expect(screen.getByLabelText(/Ocupación de plazas/)).toBeDisabled();
    expect(screen.getByLabelText(/Retención de inscripciones/)).toBeDisabled();
    expect(screen.getByRole("button", { name: /Guardar versión 2/ })).toBeDisabled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("bloquea la edición y reenvía la misma clave y el mismo payload tras un error de red", async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError("network error")).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        profileId: "90000000-0000-4000-8000-000000000011",
        version: 1,
        replayed: false,
      }),
    });
    const { container } = render(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    const form = container.querySelector("form")!;

    const occupancy = screen.getByLabelText(/Ocupación de plazas/);
    const retention = screen.getByLabelText(/Retención de inscripciones/);
    const churn = screen.getByLabelText(/Límite de bajas/);
    const collection = screen.getByLabelText(/Cobro de vencimientos/);
    const attendance = screen.getByLabelText(/Asistencia registrada/);
    fireEvent.change(occupancy, { target: { value: "75" } });
    fireEvent.change(retention, { target: { value: "80" } });
    fireEvent.change(churn, { target: { value: "10" } });
    fireEvent.change(collection, { target: { value: "95" } });
    fireEvent.change(attendance, { target: { value: "90" } });

    await act(async () => {
      fireEvent.submit(form);
    });

    const firstRequest = mocks.fetch.mock.calls[0];
    expect(window.sessionStorage.length).toBe(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Reintenta para reenviar exactamente la misma solicitud"
    );
    for (const input of [occupancy, retention, churn, collection, attendance]) {
      expect(input).toBeDisabled();
    }
    expect(occupancy).toHaveValue(75);
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();

    await act(async () => {
      fireEvent.submit(form);
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      headers: firstRequest[1].headers,
      body: firstRequest[1].body,
    });
    expect(JSON.parse(firstRequest[1].body)).toEqual({
      organizationId,
      targets: {
        class_fill_rate: 0.75,
        cohort_retention_rate: 0.8,
        churn_rate: 0.1,
        collection_rate: 0.95,
        attendance_coverage: 0.9,
      },
    });
    for (const input of [occupancy, retention, churn, collection, attendance]) {
      expect(input).toBeEnabled();
    }
    expect(window.sessionStorage.length).toBe(0);
  });

  it("recupera tras recargar el mismo tab y reintenta idéntico antes de desbloquear", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          profileId: "90000000-0000-4000-8000-000000000011",
          version: 1,
          replayed: true,
        }),
      });

    const firstRender = render(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    const form = firstRender.container.querySelector("form")!;
    fireEvent.change(screen.getByLabelText(/Ocupación de plazas/), {
      target: { value: "75" },
    });
    fireEvent.change(screen.getByLabelText(/Retención de inscripciones/), {
      target: { value: "80" },
    });
    fireEvent.change(screen.getByLabelText(/Límite de bajas/), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText(/Cobro de vencimientos/), {
      target: { value: "95" },
    });
    fireEvent.change(screen.getByLabelText(/Asistencia registrada/), {
      target: { value: "90" },
    });

    await act(async () => {
      fireEvent.submit(form);
    });
    const originalRequest = mocks.fetch.mock.calls[0];
    firstRender.unmount();

    const secondRender = render(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    const retryButton = screen.getByRole("button", {
      name: "Reintentar el mismo envío",
    });
    expect(retryButton).toBeEnabled();
    expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(75);
    expect(screen.getByLabelText(/Ocupación de plazas/)).toBeDisabled();

    await act(async () => {
      fireEvent.submit(secondRender.container.querySelector("form")!);
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      headers: originalRequest[1].headers,
      body: originalRequest[1].body,
    });
    expect(window.sessionStorage.length).toBe(0);
    expect(screen.getByRole("status")).toHaveTextContent("Metas guardadas");
    expect(screen.getByLabelText(/Ocupación de plazas/)).toBeEnabled();
  });

  it("conserva la solicitud pendiente si el reintento recibe un rechazo ambiguo", async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          type: "https://zaltyko.com/problems/idempotency-conflict",
          title: "Conflicto de versión o estado",
          status: 409,
          detail: "No se pudo confirmar la misma operación.",
        }),
      });

    const { container } = render(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    const form = container.querySelector("form")!;
    for (const [label, value] of [
      [/Ocupación de plazas/, "75"],
      [/Retención de inscripciones/, "80"],
      [/Límite de bajas/, "10"],
      [/Cobro de vencimientos/, "95"],
      [/Asistencia registrada/, "90"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    await act(async () => {
      fireEvent.submit(form);
    });
    const firstRequest = mocks.fetch.mock.calls[0];
    const savedCommand = window.sessionStorage.getItem(
      "zaltyko:owner-health-target-command:v1:" + organizationId
    );
    expect(savedCommand).not.toBeNull();
    await act(async () => {
      fireEvent.submit(form);
    });

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][1]).toMatchObject({
      headers: firstRequest[1].headers,
      body: firstRequest[1].body,
    });
    expect(window.sessionStorage.getItem(
      "zaltyko:owner-health-target-command:v1:" + organizationId
    )).toBe(savedCommand);
    expect(screen.getByLabelText(/Ocupación de plazas/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
  });

  it("ignora la respuesta tardía de otra academia y conserva su comando pendiente", async () => {
    const otherTargets = {
      class_fill_rate: 0.33,
      cohort_retention_rate: 0.44,
      churn_rate: 0.22,
      collection_rate: 0.88,
      attendance_coverage: 0.66,
    };
    const otherCommand: StoredHealthTargetCommand = {
      organizationId: otherOrganizationId,
      key: "90000000-0000-4000-8000-000000000099",
      body: JSON.stringify({
        organizationId: otherOrganizationId,
        targets: otherTargets,
      }),
      targets: otherTargets,
    };
    expect(persistHealthTargetCommand(window.sessionStorage, otherCommand)).toBe(
      true
    );
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });

    type TestResponse = {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    let resolvePost!: (value: TestResponse) => void;
    mocks.fetch.mockImplementation(
      () =>
        new Promise<TestResponse>((resolve) => {
          resolvePost = resolve;
        })
    );

    const view = render(
      <AcademyTargetProfileForm
        organizationId={organizationId}
        profile={null}
      />
    );
    const fields = [
      [/Ocupación de plazas/, "75"],
      [/Retención de inscripciones/, "80"],
      [/Límite de bajas/, "10"],
      [/Cobro de vencimientos/, "95"],
      [/Asistencia registrada/, "90"],
    ] as const;
    for (const [label, value] of fields) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Activar Academy Health Score" })).toBeEnabled()
    );
    act(() => {
      fireEvent.submit(view.container.querySelector("form")!);
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + organizationId
      )
    ).not.toBeNull();

    view.rerender(
      <AcademyTargetProfileForm
        organizationId={otherOrganizationId}
        profile={null}
      />
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(33)
    );
    const storedOtherCommand = window.sessionStorage.getItem(
      "zaltyko:owner-health-target-command:v1:" + otherOrganizationId
    );

    await act(async () => {
      resolvePost({
        ok: true,
        status: 201,
        json: async () => ({
          profileId: "90000000-0000-4000-8000-000000000011",
          version: 1,
          replayed: false,
        }),
      });
    });

    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + organizationId
      )
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + otherOrganizationId
      )
    ).toBe(storedOtherCommand);
    expect(screen.getByRole("button", { name: "Reintentar el mismo envío" })).toBeEnabled();
    expect(screen.queryByText(/Metas guardadas/)).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("recupera el mismo comando A al volver de B y acepta su respuesta pendiente", async () => {
    const otherTargets = {
      class_fill_rate: 0.33,
      cohort_retention_rate: 0.44,
      churn_rate: 0.22,
      collection_rate: 0.88,
      attendance_coverage: 0.66,
    };
    const otherCommand: StoredHealthTargetCommand = {
      organizationId: otherOrganizationId,
      key: "90000000-0000-4000-8000-000000000099",
      body: JSON.stringify({
        organizationId: otherOrganizationId,
        targets: otherTargets,
      }),
      targets: otherTargets,
    };
    expect(persistHealthTargetCommand(window.sessionStorage, otherCommand)).toBe(
      true
    );
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });

    type TestResponse = {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    let resolvePost!: (value: TestResponse) => void;
    mocks.fetch.mockImplementation(
      () =>
        new Promise<TestResponse>((resolve) => {
          resolvePost = resolve;
        })
    );

    const view = render(
      <AcademyTargetProfileForm
        organizationId={organizationId}
        profile={null}
      />
    );
    const originalTargets = {
      class_fill_rate: 0.75,
      cohort_retention_rate: 0.8,
      churn_rate: 0.1,
      collection_rate: 0.95,
      attendance_coverage: 0.9,
    };
    for (const [label, value] of [
      [/Ocupación de plazas/, "75"],
      [/Retención de inscripciones/, "80"],
      [/Límite de bajas/, "10"],
      [/Cobro de vencimientos/, "95"],
      [/Asistencia registrada/, "90"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Activar Academy Health Score" })
      ).toBeEnabled()
    );
    act(() => {
      fireEvent.submit(view.container.querySelector("form")!);
    });
    const originalRequest = mocks.fetch.mock.calls[0];
    const originalStoredCommand = window.sessionStorage.getItem(
      "zaltyko:owner-health-target-command:v1:" + organizationId
    );
    expect(originalStoredCommand).not.toBeNull();
    expect(JSON.parse(originalRequest[1].body)).toEqual({
      organizationId,
      targets: originalTargets,
    });

    view.rerender(
      <AcademyTargetProfileForm
        organizationId={otherOrganizationId}
        profile={null}
      />
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(33)
    );
    view.rerender(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(75)
    );
    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + organizationId
      )
    ).toBe(originalStoredCommand);
    expect(
      screen.getByRole("button", { name: "Guardando metas…" })
    ).toBeDisabled();
    expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    await act(async () => {
      resolvePost({
        ok: true,
        status: 201,
        json: async () => ({
          profileId: "90000000-0000-4000-8000-000000000011",
          version: 1,
          replayed: false,
        }),
      });
    });

    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + organizationId
      )
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + otherOrganizationId
      )
    ).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Metas guardadas");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("no elimina un comando A distinto al llegar la respuesta del anterior", async () => {
    type TestResponse = {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    let resolvePost!: (value: TestResponse) => void;
    mocks.fetch.mockImplementation(
      () =>
        new Promise<TestResponse>((resolve) => {
          resolvePost = resolve;
        })
    );

    const view = render(
      <AcademyTargetProfileForm
        organizationId={organizationId}
        profile={null}
      />
    );
    for (const [label, value] of [
      [/Ocupación de plazas/, "75"],
      [/Retención de inscripciones/, "80"],
      [/Límite de bajas/, "10"],
      [/Cobro de vencimientos/, "95"],
      [/Asistencia registrada/, "90"],
    ] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Activar Academy Health Score" })
      ).toBeEnabled()
    );
    act(() => {
      fireEvent.submit(view.container.querySelector("form")!);
    });
    const originalCommand: StoredHealthTargetCommand = {
      organizationId,
      key: mocks.fetch.mock.calls[0][1].headers["idempotency-key"],
      body: mocks.fetch.mock.calls[0][1].body,
      targets: {
        class_fill_rate: 0.75,
        cohort_retention_rate: 0.8,
        churn_rate: 0.1,
        collection_rate: 0.95,
        attendance_coverage: 0.9,
      },
    };

    view.rerender(
      <AcademyTargetProfileForm
        organizationId={otherOrganizationId}
        profile={null}
      />
    );
    expect(
      clearStoredHealthTargetCommand(window.sessionStorage, originalCommand)
    ).toBe(true);
    const replacementCommand: StoredHealthTargetCommand = {
      organizationId,
      key: "90000000-0000-4000-8000-000000000098",
      body: JSON.stringify({
        organizationId,
        targets: {
          class_fill_rate: 0.41,
          cohort_retention_rate: 0.52,
          churn_rate: 0.12,
          collection_rate: 0.83,
          attendance_coverage: 0.67,
        },
      }),
      targets: {
        class_fill_rate: 0.41,
        cohort_retention_rate: 0.52,
        churn_rate: 0.12,
        collection_rate: 0.83,
        attendance_coverage: 0.67,
      },
    };
    expect(
      persistHealthTargetCommand(window.sessionStorage, replacementCommand)
    ).toBe(true);

    view.rerender(
      <AcademyTargetProfileForm organizationId={organizationId} profile={null} />
    );
    await waitFor(() =>
      expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(41)
    );
    const replacementStoredCommand = window.sessionStorage.getItem(
      "zaltyko:owner-health-target-command:v1:" + organizationId
    );
    expect(replacementStoredCommand).not.toBeNull();

    await act(async () => {
      resolvePost({
        ok: true,
        status: 201,
        json: async () => ({
          profileId: "90000000-0000-4000-8000-000000000011",
          version: 1,
          replayed: false,
        }),
      });
    });

    expect(
      window.sessionStorage.getItem(
        "zaltyko:owner-health-target-command:v1:" + organizationId
      )
    ).toBe(replacementStoredCommand);
    expect(screen.getByLabelText(/Ocupación de plazas/)).toHaveValue(41);
    expect(screen.getByLabelText(/Ocupación de plazas/)).toBeDisabled();
    expect(screen.queryByText(/Metas guardadas/)).not.toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
