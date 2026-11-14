import { describe, expect, it, vi } from "vitest";

import { decodeOwnerUsage } from "@/components/owner-dashboard/owner-plan-usage-response";
import { isDefinitiveAttendanceRejection } from "@/components/owner-dashboard/owner-attendance-command";
import { ownerClassCreateRejection } from "@/components/owner-dashboard/owner-class-command-response";
import {
  DEMO_NOTICE,
  DEMO_NOTICE_DETAIL,
  createDemoFetch,
  demoBlockedResponse,
  installDemoFetch,
  type DemoRequestOutcome,
} from "@/modules/demo/demo-guard";
import { demoApiResponders, demoAttendanceView } from "@/modules/demo/demo-fixtures";

/**
 * La demo pública reutiliza componentes que escriben contra la API autenticada.
 * La guarda de red garantiza que ninguna de esas llamadas salga del navegador.
 */

const ORIGIN = "https://zaltyko.test";

function setup() {
  const baseFetch = vi.fn(async () => new Response("pasa", { status: 200 }));
  const onWriteBlocked = vi.fn();
  const outcomes: Array<{ method: string; pathname: string; outcome: DemoRequestOutcome }> = [];
  const demoFetch = createDemoFetch({
    origin: ORIGIN,
    baseFetch: baseFetch as unknown as typeof fetch,
    responders: demoApiResponders,
    onWriteBlocked,
    onRequest: (summary) => outcomes.push(summary),
  });
  return { baseFetch, onWriteBlocked, outcomes, demoFetch };
}

describe("la demo no llama a la API autenticada", () => {
  it("contesta las lecturas conocidas con datos de ejemplo, sin red", async () => {
    const { baseFetch, demoFetch } = setup();
    const response = await demoFetch(`${ORIGIN}/api/v1/owner/saas/usage?organizationId=x`);
    expect(response.status).toBe(200);
    // El cuerpo cumple el mismo contrato que valida la pantalla real.
    expect(decodeOwnerUsage(await response.json())).not.toBeNull();
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("sirve la lista de gimnastas por asignar y la lista de una sesión", async () => {
    const { baseFetch, demoFetch } = setup();
    const intake = await (await demoFetch("/api/v1/owner/athlete-intake?organizationId=x&page=1&pageSize=50")).json();
    expect(intake.ok).toBe(true);
    expect(intake.data.items.length).toBeGreaterThan(0);

    const view = demoAttendanceView(new Date());
    const roster = await (await demoFetch(`/api/v1/owner/sessions/${view.initialSessionId}/attendance?organizationId=x`)).json();
    expect(roster.data.items.length).toBeGreaterThan(0);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("una lectura de la API que no conoce no sale a la red: 404", async () => {
    const { baseFetch, demoFetch } = setup();
    const response = await demoFetch("/api/v1/owner/billing/manual-payments?cursor=abc");
    expect(response.status).toBe(404);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("ninguna petición a la base de datos de Supabase sale de la demo", async () => {
    const { baseFetch, demoFetch, outcomes } = setup();
    for (const method of ["GET", "POST"]) {
      const response = await demoFetch("https://abc.supabase.co/rest/v1/athletes", { method });
      expect(response.status).toBe(403);
    }
    expect(baseFetch).not.toHaveBeenCalled();
    expect(outcomes.every((item) => item.outcome === "database-blocked")).toBe(true);
  });
});

describe("las acciones de la demo no escriben", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("%s a la API se rechaza, avisa y no llega a la red", async (method) => {
    const { baseFetch, onWriteBlocked, demoFetch } = setup();
    const response = await demoFetch("/api/v1/owner/classes", { method, body: "{}" });
    expect(response.status).toBe(403);
    const problem = await response.json();
    expect(problem.type).toBe("https://zaltyko.com/problems/forbidden");
    expect(problem.detail).toBe(DEMO_NOTICE_DETAIL);
    expect(DEMO_NOTICE_DETAIL.startsWith(DEMO_NOTICE)).toBe(true);
    expect(onWriteBlocked).toHaveBeenCalledTimes(1);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("las acciones de servidor de Next (POST a la propia página) también se rechazan", async () => {
    const { baseFetch, onWriteBlocked, demoFetch } = setup();
    const response = await demoFetch(`${ORIGIN}/demo/clases`, { method: "POST", headers: { "Next-Action": "abc" } });
    expect(response.status).toBe(403);
    expect(onWriteBlocked).toHaveBeenCalledTimes(1);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("un Request con método de escritura se rechaza igual", async () => {
    const { baseFetch, demoFetch } = setup();
    const response = await demoFetch(new Request(`${ORIGIN}/api/v1/owner/groups`, { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("la negativa es definitiva para las pantallas: no dejan reintentos pendientes", async () => {
    const payload = await demoBlockedResponse().json();
    expect(isDefinitiveAttendanceRejection(403, payload, false)).toBe(true);
    expect(ownerClassCreateRejection({ ok: false, status: 403 }, payload, false).status).toBe("rejected");
    expect(ownerClassCreateRejection({ ok: false, status: 403 }, payload, false).message).toBe(DEMO_NOTICE_DETAIL);
  });
});

describe("lo que no es de la API pasa sin cambios", () => {
  it("las lecturas de la navegación y los recursos de otro origen siguen su camino", async () => {
    const { baseFetch, demoFetch, onWriteBlocked } = setup();
    await demoFetch(`${ORIGIN}/demo/clases?_rsc=1`);
    await demoFetch("https://fonts.gstatic.com/s/archivo.woff2");
    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(onWriteBlocked).not.toHaveBeenCalled();
  });
});

describe("instalación de la guarda", () => {
  it("sustituye fetch, no se apila y se puede retirar", async () => {
    const original = vi.fn(async () => new Response("original"));
    const target = { fetch: original as unknown as typeof fetch, location: { origin: ORIGIN } };
    const uninstall = installDemoFetch(target, { responders: demoApiResponders });
    const guarded = target.fetch;
    expect(guarded).not.toBe(original);

    // Una segunda instalación no apila otra guarda.
    const second = installDemoFetch(target, { responders: demoApiResponders });
    expect(target.fetch).toBe(guarded);
    second();
    expect(target.fetch).toBe(guarded);

    expect((await target.fetch("/api/v1/owner/classes", { method: "POST" })).status).toBe(403);
    expect(original).not.toHaveBeenCalled();

    uninstall();
    expect(target.fetch).toBe(original);
  });
});
