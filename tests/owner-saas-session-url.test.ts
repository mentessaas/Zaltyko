import { describe, expect, it } from "vitest";
import { isCheckoutSessionUrl, isPortalSessionUrl } from "@/components/owner-dashboard/owner-saas-session-url";

describe.each([
  ["checkout", isCheckoutSessionUrl, "checkout.stripe.com", "billing.stripe.com"],
  ["portal", isPortalSessionUrl, "billing.stripe.com", "checkout.stripe.com"],
] as const)("destino alojado de %s", (_kind, accepts, host, otherHost) => {
  it("acepta el origen exacto, con query y fragmento sin transformarlos", () => {
    const value = `https://${host}/synthetic-session?locale=es&opaque=a%2Fb#synthetic-fragment`;
    expect(accepts(value)).toBe(true);
    expect(accepts(`HTTPS://${host.toUpperCase()}:443/synthetic-session`)).toBe(true);
  });
  it.each([null, undefined, 1, {}, [], "", "/session", "javascript:alert(1)", "data:text/html,synthetic"])("rechaza un destino no absoluto/HTTPS %#", value => {
    expect(accepts(value)).toBe(false);
  });
  it.each([
    (host: string) => `http://${host}/session`,
    (host: string) => `//${host}/session`,
    (host: string) => `https:${host}/session`,
    (host: string) => `https:/${host}/session`,
    (host: string) => `https://${host}.example.test/session`,
    (host: string) => `https://other.${host}/session`,
    (host: string) => `https://${host}@example.test/session`,
    (host: string) => `https://synthetic-user@${host}/session`,
    (host: string) => `https://synthetic-user:synthetic-password@${host}/session`,
    (host: string) => `https://${host}:8443/session`,
    (host: string) => ` https://${host}/session`,
    (host: string) => `https://${host}/session `,
    (host: string) => `https://${host}/raw space`,
    (host: string) => `https://${host}/session\n`,
    (host: string) => `https://${host.replace(".", "\t.")}/session`,
    (host: string) => `https://${host}\\@example.test/session`,
  ])("rechaza dominios engañosos, credenciales, puertos o reparación del parser %#", make => {
    expect(accepts(make(host))).toBe(false);
  });
  it("no intercambia los destinos de Checkout y Portal", () => {
    expect(accepts(`https://${otherHost}/synthetic-session`)).toBe(false);
  });
});
