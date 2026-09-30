import { afterEach, describe, expect, it, vi } from "vitest";
const { listEntries } = vi.hoisted(() => ({listEntries:vi.fn()}));
vi.mock("@/lib/directory/service", () => ({listEntries}));
import { getClusterAcademies } from "@/lib/seo/clusters";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Directorio en páginas por país", () => {
  it("incluye ambas ramas artísticas, conserva el enlace y deduplica fichas", async () => {
    vi.stubEnv("DIRECTORY_CATALOG_ENABLED", "true");
    const entry={id:"00000000-0000-4000-8000-000000000001",kind:"academy",slug:"academia-qa",academyId:null,eventId:null,data:{name:"Academia QA",city:"Madrid",region:"Madrid"}};
    listEntries.mockResolvedValue({items:[entry]});
    const result=await getClusterAcademies("es","artistic","espana",12);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("00000000-0000-4000-8000-000000000001-academia-qa");
    expect(listEntries).toHaveBeenCalledWith({kind:"academy",country:"ES",discipline:"artistic_female",limit:12});
    expect(listEntries).toHaveBeenCalledWith({kind:"academy",country:"ES",discipline:"artistic_male",limit:12});
  });
  it("no consulta ni prepara fichas durante el build", async () => {
    vi.stubEnv("DIRECTORY_CATALOG_ENABLED","true");
    vi.stubEnv("NEXT_PHASE","phase-production-build");
    expect(await getClusterAcademies("es","rhythmic","peru")).toEqual([]);
    expect(listEntries).not.toHaveBeenCalled();
  });
});
