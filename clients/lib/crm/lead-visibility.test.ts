import { describe, expect, it } from "vitest";
import { getLeadPageRange, mergeLeadPages } from "./lead-visibility";

describe("lead visibility helpers", () => {
  it("calculates an accurate server-pagination range", () => {
    expect(
      getLeadPageRange(
        {
          current_page: 2,
          last_page: 18,
          per_page: 20,
          total: 353,
          next_page_url: "/leads?page=3",
          prev_page_url: "/leads?page=1",
        },
        20,
      ),
    ).toEqual({ from: 21, to: 40, total: 353 });
  });

  it("handles the final and empty pages", () => {
    expect(
      getLeadPageRange(
        {
          current_page: 18,
          last_page: 18,
          per_page: 20,
          total: 353,
          next_page_url: null,
          prev_page_url: "/leads?page=17",
        },
        13,
      ),
    ).toEqual({ from: 341, to: 353, total: 353 });
    expect(getLeadPageRange(undefined, 0)).toEqual({ from: 0, to: 0, total: 0 });
  });

  it("merges progressively loaded pages without duplicate leads", () => {
    expect(
      mergeLeadPages([
        [{ id: 3, name: "Newest" }, { id: 2, name: "Second" }],
        [{ id: 2, name: "Second updated" }, { id: 1, name: "Oldest" }],
      ]),
    ).toEqual([
      { id: 3, name: "Newest" },
      { id: 2, name: "Second updated" },
      { id: 1, name: "Oldest" },
    ]);
  });
});
