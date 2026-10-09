import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddToCrmPipelineModal } from "./crm-action-modals";

afterEach(cleanup);
const pipelines = [{ id: "11", name: "Default Pipeline" }, { id: "22", name: "Enterprise" }];

describe("native CRM destination confirmation", () => {
  it("opens a confirmation and sends only the selected destination when confirmed", () => {
    const confirm = vi.fn();
    render(<AddToCrmPipelineModal isOpen prospectName="Ada" pipelines={pipelines} onClose={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Enterprise/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add Prospect" }));
    expect(confirm).toHaveBeenCalledExactlyOnceWith("22");
  });

  it("cancel and Escape dismiss without saving", () => {
    const close = vi.fn(), confirm = vi.fn();
    render(<AddToCrmPipelineModal isOpen prospectName="Ada" pipelines={pipelines} onClose={close} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("blocks submission on pipeline failure and permits retry", () => {
    const retry = vi.fn(), confirm = vi.fn();
    render(<AddToCrmPipelineModal isOpen isError prospectName="Ada" pipelines={[]} onClose={vi.fn()} onConfirm={confirm} onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Prospect" }));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("prevents repeated confirmation and closing while the save is pending", () => {
    const close = vi.fn(), confirm = vi.fn();
    render(<AddToCrmPipelineModal isOpen isConfirming prospectName="Ada" pipelines={pipelines} onClose={close} onConfirm={confirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Adding…" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(confirm).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
