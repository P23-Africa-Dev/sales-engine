import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TaskProofGallery } from "@/components/operations/task-proof-gallery";
import type { TaskProofItem } from "@/lib/api/tasks";

const {
  downloadTaskProofMock,
  triggerProofBlobDownloadMock,
  getAuthTokenFromDocumentMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  downloadTaskProofMock: vi.fn(),
  triggerProofBlobDownloadMock: vi.fn(),
  getAuthTokenFromDocumentMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock("@/lib/api/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/tasks")>("@/lib/api/tasks");
  return {
    ...actual,
    downloadTaskProof: downloadTaskProofMock,
    triggerProofBlobDownload: triggerProofBlobDownloadMock,
  };
});

vi.mock("@/lib/auth/session", () => ({
  getAuthTokenFromDocument: () => getAuthTokenFromDocumentMock(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

const proofs: TaskProofItem[] = [
  {
    id: 11,
    uploaded_by_user_id: 3,
    file_url: "https://api.test/api/v1/tasks/5/proofs/11?company_id=99",
    file_name: "site-photo.jpg",
    mime_type: "image/jpeg",
    size_bytes: 2048,
    notes: "Front gate",
    uploader: { id: 3, name: "Ada Agent", email: "ada@example.com" },
    created_at: "2026-07-17T10:00:00.000Z",
  },
  {
    id: 12,
    uploaded_by_user_id: 3,
    file_url: "https://api.test/api/v1/tasks/5/proofs/12?company_id=99",
    file_name: "meter.jpg",
    mime_type: "image/jpeg",
    size_bytes: 4096,
    uploader: { id: 3, name: "Ada Agent", email: "ada@example.com" },
    created_at: "2026-07-17T10:05:00.000Z",
  },
];

describe("TaskProofGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthTokenFromDocumentMock.mockReturnValue("token-abc");
    downloadTaskProofMock.mockImplementation(async (_taskId: number, proofId: number) => {
      return new Blob([`proof-${proofId}`], { type: "image/jpeg" });
    });

    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((blob: Blob) => `blob:mock-${blob.size}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches authenticated blobs and opens a preview lightbox", async () => {
    render(
      <TaskProofGallery taskId={5} companyId={99} proofs={proofs} canDownload />,
    );

    await waitFor(() => {
      expect(downloadTaskProofMock).toHaveBeenCalledWith(
        5,
        11,
        { company_id: 99 },
        "token-abc",
      );
      expect(downloadTaskProofMock).toHaveBeenCalledWith(
        5,
        12,
        { company_id: 99 },
        "token-abc",
      );
    });

    expect(screen.getByText("site-photo.jpg")).toBeTruthy();
    expect(screen.getByText("meter.jpg")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Preview site-photo.jpg"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    expect(screen.getAllByText("Front gate").length).toBeGreaterThan(0);
    expect(screen.getByText("1 of 2")).toBeTruthy();
  });

  it("downloads via authenticated blob helper", async () => {
    render(
      <TaskProofGallery taskId={5} companyId={99} proofs={[proofs[0]]} canDownload />,
    );

    await waitFor(() => expect(downloadTaskProofMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(triggerProofBlobDownloadMock).toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalledWith("Proof downloaded.");
    });

    const [blobArg, nameArg] = triggerProofBlobDownloadMock.mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);
    expect(nameArg).toBe("site-photo.jpg");
  });

  it("does not fetch proofs when download is restricted", () => {
    render(
      <TaskProofGallery taskId={5} companyId={99} proofs={proofs} canDownload={false} />,
    );

    expect(downloadTaskProofMock).not.toHaveBeenCalled();
    expect(screen.getAllByText("Restricted").length).toBeGreaterThan(0);
  });
});
