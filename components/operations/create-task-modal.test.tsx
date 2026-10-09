import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { useAuthStore, type AuthUser } from "@/store/auth";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  createSelfTask: vi.fn(),
  assignees: [
    { id: 7, name: "Olivia Owner", email: "owner@example.com", role: "owner" },
    { id: 8, name: "Adam Admin", email: "admin@example.com", role: "admin" },
    { id: 9, name: "Sasha Supervisor", email: "supervisor@example.com", role: "supervisor" },
    { id: 10, name: "Amara Agent", email: "agent@example.com", role: "agent" },
  ],
}));

vi.mock("@/hooks/use-tasks", () => ({
  useCreateTask: () => ({ mutate: mocks.createTask, isPending: false }),
  useCreateSelfTask: () => ({ mutate: mocks.createSelfTask, isPending: false }),
  useTaskAssignees: () => ({ data: mocks.assignees, isLoading: false }),
}));

vi.mock("@/hooks/use-projects", () => ({
  useInternalUsers: () => ({ data: [mocks.assignees[3]], isLoading: false }),
}));

vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder: string;
  }) => (
    <select
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/map/PlaceAutocompleteField", () => ({
  PlaceAutocompleteField: () => <input aria-label="Place autocomplete" />,
}));

function setUser(id: number, role: "owner" | "admin" | "supervisor" | "agent") {
  useAuthStore.setState({
    user: {
      id,
      name: `${role} user`,
      email: `${role}@example.com`,
      avatar: null,
      active_company: {
        id: 12,
        company_id: "FAC-12",
        name: "Factory",
        role,
      },
    } as AuthUser,
  });
}

describe("CreateTaskModal task assignees", () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.createSelfTask.mockReset();
  });

  it.each([
    ["owner", 7],
    ["admin", 8],
    ["supervisor", 9],
  ] as const)("preselects the logged-in %s from all company users", (role, id) => {
    setUser(id, role);

    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "Select user" }) as HTMLSelectElement;
    expect(select.value).toBe(String(id));
    expect(screen.getByRole("option", { name: "Olivia Owner" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Adam Admin" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Sasha Supervisor" })).not.toBeNull();
    expect(screen.getByRole("option", { name: "Amara Agent" })).not.toBeNull();
  });

  it("preserves an explicit edit-mode assignee", () => {
    setUser(7, "owner");

    render(
      <CreateTaskModal
        isOpen
        mode="edit"
        initialValues={{ assignTo: "10" }}
        onClose={vi.fn()}
      />,
    );

    const select = screen.getByRole("combobox", { name: "Select user" }) as HTMLSelectElement;
    expect(select.value).toBe("10");
  });

  it("preserves a selection while open and restores the default on reopen", () => {
    setUser(7, "owner");
    const onClose = vi.fn();
    const { rerender } = render(<CreateTaskModal isOpen onClose={onClose} />);

    const select = screen.getByRole("combobox", { name: "Select user" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "8" } });
    rerender(<CreateTaskModal isOpen onClose={onClose} />);
    expect(select.value).toBe("8");

    rerender(<CreateTaskModal isOpen={false} onClose={onClose} />);
    rerender(<CreateTaskModal isOpen onClose={onClose} />);

    expect(
      (screen.getByRole("combobox", { name: "Select user" }) as HTMLSelectElement).value,
    ).toBe("7");
  });

  it("submits the selected management user through assigned_agent_id", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Visit Shoprite Lekki"), {
      target: { value: "Review operations report" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 12, assigned_agent_id: 7 }),
      expect.any(Object),
    );
  });

  it("keeps agent-created tasks on the self-task flow", () => {
    setUser(10, "agent");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole("combobox", { name: "Select user" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("e.g. Visit Shoprite Lekki"), {
      target: { value: "Agent field visit" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createSelfTask).toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});
