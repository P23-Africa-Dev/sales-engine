import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LeadContactHeroSlider, LeadContactsSlider, LeadContactsView } from "@/components/crm/lead-contacts";
import type { LeadContact } from "@/lib/api/crm";

vi.mock("@/components/ui/phone-number-input", () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <input aria-label="Phone" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

function SliderHarness() {
  const [contacts, setContacts] = useState<LeadContact[]>([
    { name: "Primary Person", email: "", phone: "", location: "", sort_order: 0 },
  ]);
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <LeadContactsSlider
      contacts={contacts}
      activeIndex={activeIndex}
      onActiveIndexChange={setActiveIndex}
      onChange={(index, contact) =>
        setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? contact : item))
      }
      onAdd={() => {
        setContacts((current) => [
          ...current,
          { name: "", email: "", phone: "", location: "", sort_order: current.length },
        ]);
        setActiveIndex(contacts.length);
      }}
      onRemove={(index) => {
        setContacts((current) => current.filter((_, itemIndex) => itemIndex !== index));
        setActiveIndex(0);
      }}
    />
  );
}

describe("LeadContactsSlider", () => {
  it("adds contacts and preserves values while navigating", () => {
    render(<SliderHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Add another contact" }));
    expect(screen.getByText("Contact 2 of 2")).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText("E.g John Doe"), {
      target: { value: "Secondary Person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Previous contact" }));
    expect((screen.getByPlaceholderText("E.g John Doe") as HTMLInputElement).value).toBe("Primary Person");

    fireEvent.click(screen.getByRole("button", { name: "Next contact" }));
    expect((screen.getByPlaceholderText("E.g John Doe") as HTMLInputElement).value).toBe("Secondary Person");
  });
});

describe("LeadContactsView", () => {
  it("renders every contact and identifies the primary contact", () => {
    render(
      <LeadContactsView
        contacts={[
          { name: "Primary Person", email: "primary@example.com" },
          { name: "Secondary Person", phone: "+2348000000002" },
        ]}
      />,
    );

    expect(screen.getByText("Primary Person")).not.toBeNull();
    expect(screen.getByText("Secondary Person")).not.toBeNull();
    expect(screen.getByText("Primary")).not.toBeNull();
    expect(screen.getByText("2 total")).not.toBeNull();
  });
});

describe("LeadContactHeroSlider", () => {
  it("shows one contact at a time and navigates with arrows", () => {
    render(
      <LeadContactHeroSlider
        contacts={[
          { name: "Primary Person", email: "primary@example.com" },
          { name: "Secondary Person", phone: "+2348000000002" },
        ]}
      />,
    );

    expect(screen.getByText("Primary Person")).not.toBeNull();
    expect(screen.queryByText("Secondary Person")).toBeNull();
    expect(screen.getByText("Contact 1 of 2 · Primary")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next contact" }));

    expect(screen.queryByText("Primary Person")).toBeNull();
    expect(screen.getByText("Secondary Person")).not.toBeNull();
    expect(screen.getByText("Contact 2 of 2")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Previous contact" }));
    expect(screen.getByText("Primary Person")).not.toBeNull();
  });
});
