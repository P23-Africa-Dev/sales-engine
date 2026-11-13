import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetSafeBoundaryAttempts, SafeItem, SafeSection } from "./safe-boundary";

function Broken(): never {
  throw new Error("company is null");
}

describe("SafeItem", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("leaves out only the record that can't be drawn", () => {
    const records = [{ id: 1, name: "Acme" }, { id: 2, name: null }, { id: 3, name: "Globex" }];

    render(
      <ul>
        {records.map((record) => (
          <SafeItem key={record.id} name="signal">
            {() => <li>{record.name!.toUpperCase()}</li>}
          </SafeItem>
        ))}
      </ul>
    );

    expect(screen.getByText("ACME")).toBeTruthy();
    expect(screen.getByText("GLOBEX")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("SafeSection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    resetSafeBoundaryAttempts();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the rest of the screen and refreshes the broken panel on its own first", () => {
    render(
      <div>
        <nav>Navigation</nav>
        <SafeSection name="signals" label="your signals">
          <Broken />
        </SafeSection>
      </div>
    );

    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Refreshing your signals…");
    expect(screen.queryByText(/unexpected error/i)).toBeNull();
  });

  it("recovers without the user doing anything when the retry succeeds", async () => {
    let fail = true;
    function Flaky() {
      if (fail) {
        throw new Error("not ready");
      }
      return <p>Signals loaded</p>;
    }

    render(
      <SafeSection name="flaky" label="your signals">
        <Flaky />
      </SafeSection>
    );
    expect(screen.getByRole("status").textContent).toContain("Refreshing");

    fail = false;
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    // The retry re-renders inside a transition; let it commit.
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(screen.getByText("Signals loaded")).toBeTruthy();
  });

  it("shows a calm note with a refresh button after its automatic attempts", () => {
    render(
      <SafeSection name="always-broken" label="your signals">
        <Broken />
      </SafeSection>
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByText("Taking a moment to load your signals")).toBeTruthy();
    expect(screen.getByText(/Your data is safe/)).toBeTruthy();

    // A manual refresh starts over with automatic attempts.
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(screen.getByRole("status").textContent).toContain("Refreshing");
  });
});
