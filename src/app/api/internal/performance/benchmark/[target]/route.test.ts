import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();
const isSyntheticPerformanceAdmin = vi.fn();
const benchmarkDashboard = vi.fn();
const benchmarkDatabaseBaseline = vi.fn();
const benchmarkLeads = vi.fn();
const benchmarkProperties = vi.fn();
const benchmarkVisits = vi.fn();
const benchmarkFollowUps = vi.fn();

vi.mock("@/lib/api-auth", () => ({ requireSession }));
vi.mock("@/lib/organization", () => ({ getOrganizationId: () => "synthetic-org" }));
vi.mock("@/lib/performance-diagnostics", () => ({ performanceDiagnosticsEnabled: () => true }));
vi.mock("@/lib/preview-performance-admin", () => ({ isSyntheticPerformanceAdmin }));
vi.mock("@/lib/performance-diagnostic-context", () => ({
  collectPerformanceMetrics: async (work: () => Promise<void>) => { await work(); return { metrics: {}, queries: [] }; },
  measurePerformanceMetric: async <T>(_name: string, work: () => Promise<T>) => work(),
}));
vi.mock("@/lib/performance-benchmarks", () => ({ benchmarkDashboard, benchmarkDatabaseBaseline, benchmarkLeads, benchmarkProperties, benchmarkVisits, benchmarkFollowUps }));

const { GET } = await import("./route");
const context = (target: string) => ({ params: Promise.resolve({ target }) });

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ user: { id: "synthetic-admin", role: "ADMIN", email: "perf.admin@staging.invalid", organizationId: "synthetic-org" } });
  isSyntheticPerformanceAdmin.mockReturnValue(true);
});

describe("Preview performance benchmark endpoint", () => {
  it("allows only the synthetic ADMIN and returns timing metadata without data", async () => {
    const response = await GET(new Request("http://localhost/api/internal/performance/benchmark/leads") as never, context("leads"));
    expect(response.status).toBe(200);
    expect(requireSession).toHaveBeenCalledWith(["ADMIN"]);
    expect(isSyntheticPerformanceAdmin).toHaveBeenCalled();
    expect(benchmarkLeads).toHaveBeenCalledWith("synthetic-org");
    expect(await response.json()).toMatchObject({ experiment: "single-deployment" });
  });

  it("runs the read-only database baseline only for the synthetic ADMIN", async () => {
    const response = await GET(new Request("http://localhost/api/internal/performance/benchmark/database") as never, context("database"));
    expect(response.status).toBe(200);
    expect(benchmarkDatabaseBaseline).toHaveBeenCalledWith({ userId: "synthetic-admin", organizationId: "synthetic-org" });
  });

  it("returns 404 when the authenticated account is not the synthetic diagnostic account", async () => {
    isSyntheticPerformanceAdmin.mockReturnValue(false);
    const response = await GET(new Request("http://localhost/api/internal/performance/benchmark/dashboard") as never, context("dashboard"));
    expect(response.status).toBe(404);
    expect(benchmarkDashboard).not.toHaveBeenCalled();
  });

  it("returns 404 for an unsupported benchmark target", async () => {
    const response = await GET(new Request("http://localhost/api/internal/performance/benchmark/unknown") as never, context("unknown"));
    expect(response.status).toBe(404);
    expect(requireSession).not.toHaveBeenCalled();
  });
});
