import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignalTypeEditor } from "./signal-type-editor";

const { list, update, create } = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@/lib/api/sales-engine", () => ({
  listManagedSignalTypes: list,
  updateSignalType: update,
  createSignalType: create,
  deleteSignalType: vi.fn(),
}));

const types = [
  { key: "new_market_entry", label: "New Market Entry", pack: "default", triggerDescription: "Opens in a new territory", recencyWindowDays: 180, active: true },
  { key: "fund_launch", label: "New Fund", pack: "funding_opportunities", triggerDescription: "A fund launches", recencyWindowDays: 120, active: true },
];

describe("SignalTypeEditor", () => {
  it("shows only the selected packs' event types and switches one off", async () => {
    list.mockResolvedValue(types);
    update.mockResolvedValue({});
    render(<SignalTypeEditor packs={["default"]} />);

    fireEvent.click(screen.getByRole("button", { name: /Customise these events/ }));

    await screen.findByText("New Market Entry");
    expect(screen.queryByText("New Fund")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("new_market_entry", { active: false }));
  });

  it("adds a custom event type with its own search wording", async () => {
    list.mockResolvedValue(types);
    create.mockResolvedValue({});
    render(<SignalTypeEditor packs={["default"]} />);

    fireEvent.click(screen.getByRole("button", { name: /Customise these events/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Add your own event type/ }));
    fireEvent.change(screen.getByPlaceholderText(/Name, e.g./), { target: { value: "Tender win" } });
    fireEvent.change(screen.getByPlaceholderText(/What counts as this event/), { target: { value: "A named company wins a tender." } });
    fireEvent.change(screen.getByPlaceholderText("{industry} wins tender {territory}"), { target: { value: "{industry} wins tender {territory}\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ label: "Tender win", pack: "default", searchPhrases: ["{industry} wins tender {territory}"] }),
      ),
    );
  });

  it("renders nothing when event detection is off", () => {
    const { container } = render(<SignalTypeEditor packs={["none"]} />);
    expect(container.innerHTML).toBe("");
  });
});
