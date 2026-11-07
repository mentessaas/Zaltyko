export type UsageResource = "athletes" | "groups" | "classes";
export type OwnerUsage = {
  readOnly: boolean;
  planCode: string;
  resources: Array<{ resource: UsageResource; current: number; limit: number | null; excess: number }>;
  items: Array<{ id: string; name: string }>;
  next: string | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function resource(value: unknown): value is UsageResource {
  return value === "athletes" || value === "groups" || value === "classes";
}

/** Validates response consistency while preserving the server as entitlement authority. */
export function decodeOwnerUsage(payload: unknown): OwnerUsage | null {
  if (!record(payload) || payload.ok !== true || !record(payload.data)) return null;
  const data = payload.data;
  if (typeof data.readOnly !== "boolean" || !text(data.planCode) || !Array.isArray(data.resources) || !Array.isArray(data.items)) return null;
  if (data.resources.length !== 3 || !data.resources.every(item => {
    if (!record(item) || !resource(item.resource) || !count(item.current) || (item.limit !== null && !count(item.limit)) || !count(item.excess)) return false;
    const expectedExcess = item.limit === null ? 0 : Math.max(item.current - item.limit, 0);
    return item.excess === expectedExcess;
  })) return null;
  if (new Set(data.resources.map(item => item.resource)).size !== 3) return null;
  if (data.readOnly !== data.resources.some(item => item.excess > 0)) return null;
  if (!data.items.every(item => record(item) && text(item.id) && text(item.name))) return null;
  if (new Set(data.items.map(item => item.id)).size !== data.items.length) return null;
  if (data.next !== null && !text(data.next)) return null;
  return {
    readOnly: data.readOnly, planCode: data.planCode,
    resources: data.resources.map(item => ({ resource: item.resource, current: item.current, limit: item.limit, excess: item.excess })),
    items: data.items.map(item => ({ id: item.id, name: item.name })), next: data.next,
  };
}
