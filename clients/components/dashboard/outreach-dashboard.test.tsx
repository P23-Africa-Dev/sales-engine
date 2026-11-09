import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "@/data/outreach-dashboard.json";
import { OutreachDashboardView } from "./outreach-dashboard-view";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- Image is deliberately mocked in jsdom.
  default: ({ alt, src, ...props }: { alt: string; src: string }) => <img alt={alt} src={src} {...props} />,
}));
vi.mock("@/components/sales-engine/icp-builder-modal", () => ({
  IcpBuilderModal: () => null,
}));

vi.mock("./outreach-activity-history", () => ({ OutreachActivityHistory: ({ businessId, activity }: { businessId?: string; activity?: { id: string } }) => <p>API selection: {businessId || activity?.id}</p> }));

afterEach(cleanup);

describe("outreach dashboard interaction", () => {
  it("renders individual and varied business icons in both tables", () => {
    const businesses = demo.businesses.slice(0, 3).map((item, index) => ({ ...item, leadType: index === 0 ? "individual" as const : "business" as const }));
    const outreach = demo.outreach.slice(0, 3).map((item, index) => ({ ...item, leadType: index === 0 ? "individual" as const : "business" as const }));
    render(<OutreachDashboardView data={{ ...demo, businesses, outreach }} />);
    const table = screen.getByRole("grid");
    expect(within(table).getAllByRole("img", { name: "Individual icon" })).toHaveLength(1);
    expect(within(table).getAllByRole("img", { name: "Business icon" })).toHaveLength(2);
    expect(within(table).getByText("Individual")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All Prospects 200" }));
    expect(within(table).getAllByRole("img", { name: "Individual icon" })).toHaveLength(1);
    expect(within(table).getAllByRole("img", { name: "Business icon" })).toHaveLength(2);
  });

  it("updates all overview values when selecting a business by click or keyboard", () => {
    render(<OutreachDashboardView data={demo} />);
    fireEvent.click(screen.getByRole("button", { name: "All Prospects 200" }));
    const overview = screen.getByRole("complementary", { name: "Activity Overview" });
    expect(within(overview).getByText("Nord Tech")).toBeTruthy();
    expect(within(overview).getByText("50,000")).toBeTruthy();
    const alpine = screen.getByRole("row", { name: "View activity for Alpine Industrial GmbH" });
    fireEvent.click(alpine);
    expect(alpine.getAttribute("aria-selected")).toBe("true");
    expect(within(overview).getByText("Alpine")).toBeTruthy();
    expect(within(overview).getByText("32,000")).toBeTruthy();
    expect(within(overview).getByText("6,400")).toBeTruthy();
    expect(within(overview).getByText("18")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("row", { name: "View activity for Meridian Systems GmbH" }), { key: "Enter" });
    expect(within(overview).getByText("Meridian")).toBeTruthy();
    expect(within(overview).getByText("18,000")).toBeTruthy();
  });

  it("links outreach rows to their business overview and filters the current view", () => {
    render(<OutreachDashboardView data={demo} />);
    fireEvent.click(screen.getByRole("button", { name: "All Outreach 200" }));
    const grid = screen.getByRole("grid", { name: "Outreach" });
    expect(within(grid).getByText("Received")).toBeTruthy();
    fireEvent.click(within(grid).getByRole("row", { name: "View activity for Alpine Industrial GmbH" }));
    expect(within(screen.getByRole("complementary")).getByText("Alpine")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    fireEvent.change(screen.getByPlaceholderText("Search businesses, owners or activity…"), { target: { value: "Clara" } });
    expect(within(grid).getAllByRole("row")).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("Search businesses, owners or activity…"), { target: { value: "missing business" } });
    expect(screen.getByText("No matching results")).toBeTruthy();
  });

  it("keeps empty or failed live data separate from sample totals", () => {
    const data = { ...demo, source: "live", defaultBusinessId: null, businesses: [], outreach: [],
      counts: { businesses: 0, outreach: 0 }, metrics: demo.metrics.map(metric => ({ ...metric, total: null, primaryPercent: null, secondaryPercent: null })) };
    const retry = vi.fn();
    render(<OutreachDashboardView data={data} error onRetry={retry} />);
    expect(screen.queryByText("220,000")).toBeNull();
    expect(screen.queryByText("Nord Tech")).toBeNull();
    expect(screen.queryByText("Sample data")).toBeNull();
    expect(screen.getByText("No Available Prospects")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Click to create your ICP" })).toBeTruthy();
    expect(screen.queryByText("Unable to load activity.")).toBeNull();
    expect(screen.getAllByText("No of Emails")).toHaveLength(2);
    expect(screen.getByText("No of SMS")).toBeTruthy();
  });
  it("renders repeated unavailable labels without duplicate React keys", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const page = render(<OutreachDashboardView data={demo} />);
      page.rerender(<OutreachDashboardView data={{ ...demo, metrics: demo.metrics.map(metric => ({ ...metric, primaryLabel: "Unavailable", secondaryLabel: "Unavailable", primaryPercent: null, secondaryPercent: null })) }} />);
      page.rerender(<OutreachDashboardView data={demo} />);
      expect(consoleError.mock.calls.some(args => args.some(arg => String(arg).includes("same key")))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("defaults to outreach and selects an outreach without a linked company", () => {
    const unlinked = { id: "16", businessId: null, name: "Blessing Ibunge", channel: "email", status: "delivered", owner: "—", created: "2026-10-06", avatarColor: "#42a8a1" };
    render(<OutreachDashboardView data={{ ...demo, outreach: [...demo.outreach.slice(0, 3), unlinked] }} />);
    expect(screen.getByRole("button", { name: "All Outreach 200" }).getAttribute("aria-pressed")).toBe("true");
    const row = screen.getByRole("row", { name: "View activity for Blessing Ibunge" });
    fireEvent.click(row);
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "View Full Activity" }));
    expect(within(screen.getByRole("dialog")).getByText("Blessing Ibunge")).toBeTruthy();
    expect(screen.getByText("API selection: 16")).toBeTruthy();
    expect(screen.queryByText("Follow up on our intro")).toBeNull();
  });

});
