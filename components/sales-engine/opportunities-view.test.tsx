import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { OpportunitiesView } from "./opportunities-view";

const { fetchOpportunities, syncSignalToCrm } = vi.hoisted(() => ({
  fetchOpportunities: vi.fn(),
  syncSignalToCrm: vi.fn(),
}));

vi.mock("@/lib/api/sales-engine", () => ({
  fetchOpportunities,
  syncSignalToCrm,
  dismissSignal: vi.fn(),
  downloadOpportunitiesCsv: vi.fn(),
}));

const rows = [
  {
    id: 1,
    company: "ABC Manufacturing",
    signal: "New Market Entry",
    signalTypeKey: "new_market_entry",
    detail: "Announced a new distribution operation in Kenya.",
    territory: "Kenya",
    signalDate: "2026-10-12",
    sourceUrl: "https://news.example/abc",
    source: "News · Example",
    icpStatus: "qualified",
    icpChecks: { industry: "verified", company_size: "unknown" },
    companyProfile: { industry: "Machinery Manufacturing", size: "201-500", headquarters: "Stuttgart", website: null, linkedinUrl: null },
    contact: { name: "John Smith", role: "Export Director", email: "john@abc.example", emailStatus: "verified", phone: null, linkedinUrl: null },
    contactStatus: "enriched",
    status: "new",
    savedAsLead: false,
  },
  {
    id: 2,
    company: "TechWorks GmbH",
    signal: "Leadership Hire",
    signalTypeKey: "leadership_hire_in_territory",
    detail: null,
    territory: "Ghana",
    signalDate: "2026-10-01",
    sourceUrl: null,
    source: null,
    icpStatus: "partial",
    icpChecks: {},
    companyProfile: { industry: null, size: null, headquarters: null, website: null, linkedinUrl: null },
    contact: { name: null, role: null, email: null, emailStatus: null, phone: null, linkedinUrl: null },
    contactStatus: "no_contact_found",
    status: "new",
    savedAsLead: false,
  },
];

function renderView() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <OpportunitiesView />
    </QueryClientProvider>,
  );
}

describe("OpportunitiesView", () => {
  it("shows the overview's columns with plain-language statuses", async () => {
    fetchOpportunities.mockResolvedValue({ items: rows, meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 } });
    renderView();

    await screen.findByText("ABC Manufacturing");
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Qualified")).toBeTruthy();
    expect(table.getByText("Partly verified")).toBeTruthy();
    expect(table.getByText("Enriched")).toBeTruthy();
    expect(table.getByText("No contact found")).toBeTruthy();
    expect(table.getByText("Not identified")).toBeTruthy();
    expect(table.getByText("Export Director")).toBeTruthy();
  });

  it("expands a row to the evidence and saves it to leads", async () => {
    fetchOpportunities.mockResolvedValue({ items: rows, meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 } });
    syncSignalToCrm.mockResolvedValue({ lead_id: 9 });
    renderView();

    fireEvent.click(await screen.findByText("ABC Manufacturing"));
    expect(screen.getByText("Announced a new distribution operation in Kenya.")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
    expect(screen.getByText(/not public/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Save to leads" })[0]);
    await waitFor(() => expect(syncSignalToCrm).toHaveBeenCalledWith(1));
  });
});
