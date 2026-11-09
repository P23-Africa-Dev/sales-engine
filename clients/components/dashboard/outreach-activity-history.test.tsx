import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { OutreachActivityHistory } from "./outreach-activity-history";
const { request, detail } = vi.hoisted(() => ({ request: vi.fn(), detail: vi.fn() }));
vi.mock("@/lib/api/sales-engine", () => ({ seRequest: request, fetchOutreachActivity: detail }));
vi.mock("@/lib/sales-engine/session", () => ({ getSalesEngineOrgId: () => "7" }));
function show(props: Parameters<typeof OutreachActivityHistory>[0]) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><OutreachActivityHistory {...props} /></QueryClientProvider>);
}
describe("outreach history API", () => {
  it("loads and paginates actual company records", async () => {
    request.mockResolvedValue({ items: [{ id: 14, name: "ICA Chapter", channel: "email", preview: "Actual message", delivery_status: "delivered", occurred_at: "2026-10-07T04:46:57Z" }], last_page: 2 });
    show({ businessId: "482" });
    await screen.findByText("Actual message");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("business_id=482&page=1") }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("business_id=482&page=2") })));
  });
  it("loads individual history by lead instead of the employer", async () => {
    request.mockResolvedValue({ items: [{ id: 25, name: "Ada", channel: "email", preview: "Personal introduction", occurred_at: "2026-10-07T04:46:57Z" }], last_page: 1 });
    show({ businessId: "lead:95" });
    await screen.findByText("Personal introduction");
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining("lead_id=95&page=1") }));
  });
  it("loads an unlinked outreach by its activity id", async () => {
    detail.mockResolvedValue({ name: "Blessing", channel: "email", body: "Actual social outreach" });
    show({ activity: { id: "16", businessId: null, name: "Blessing", channel: "email", status: "delivered", owner: "—", created: "2026-10-06", avatarColor: "#42a8a1" } });
    await screen.findByText("Actual social outreach");
    expect(detail).toHaveBeenCalledWith(16);
    expect(screen.getByText("email · delivered")).toBeTruthy();
  });
});
