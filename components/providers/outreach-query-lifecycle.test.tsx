import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QueryProvider from "./query-provider";
import { useAuthStore } from "@/store/auth";
import { LiveOutreachDashboard } from "@/components/dashboard/live-outreach-dashboard";
import { useOutreachActivities } from "@/hooks/use-sales-engine-outreach";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api/sales-engine", () => ({ seRequest: request, ensureSalesEngineSession: vi.fn(), SalesEngineApiError: class extends Error {} }));
vi.mock("@/lib/sales-engine/session", () => ({ getSalesEngineToken: () => "native-token", getSalesEngineOrgId: () => "7", clearSalesEngineSession: vi.fn() }));
vi.mock("@/components/dashboard/outreach-dashboard-view", () => ({ OutreachDashboardView: ({ data, loading }: { data: { counts: { outreach: number } }; loading: boolean }) => <div>{loading ? "Loading dashboard" : `Dashboard records: ${data.counts.outreach}`}</div> }));

function Activities() {
  const query = useOutreachActivities({ page: 1, per_page: 20, search: "", channel: "all", status: "all", sort: "newest" });
  return <div>{query.isLoading ? "Loading list" : `Activity records: ${query.data?.total ?? "missing"}`}</div>;
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async ({ path }: { path: string }) => path === "/outreach/dashboard"
    ? { source: "live", counts: { outreach: 3, businesses: 0 }, businesses: [], outreach: [], metrics: [], defaultBusinessId: null }
    : { items: [], total: 3, last_page: 1, metrics: {} });
  useAuthStore.setState({ user: null, _hasHydrated: false });
});

describe("outreach query lifecycle", () => {
  it("starts dashboard and list APIs after auth hydration without orphaning observers", async () => {
    render(<QueryProvider><LiveOutreachDashboard /><Activities /></QueryProvider>);
    await act(async () => {
      useAuthStore.setState({ _hasHydrated: true, user: { id: 7, name: "User", email: "user@example.com", avatar: null, active_company: null } });
    });
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/outreach/dashboard" })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("/outreach/activities?") })));
    await waitFor(() => expect(screen.getByText("Dashboard records: 3")).toBeTruthy());
    expect(screen.getByText("Activity records: 3")).toBeTruthy();
  });
  it("refetches both endpoints when navigating back rather than retaining old totals", async () => {
    useAuthStore.setState({ _hasHydrated: true, user: { id: 7, name: "User", email: "user@example.com", avatar: null, active_company: null } });
    function Pages({ visible }: { visible: boolean }) {
      return <QueryProvider>{visible && <><LiveOutreachDashboard /><Activities /></>}</QueryProvider>;
    }
    const page = render(<Pages visible />);
    await waitFor(() => expect(screen.getByText("Dashboard records: 3")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Activity records: 3")).toBeTruthy());
    page.rerender(<Pages visible={false} />);
    request.mockClear();
    page.rerender(<Pages visible />);
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/outreach/dashboard" })));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("/outreach/activities?") })));
  });

});
