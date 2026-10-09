import { describe, expect, it } from "vitest";

import {
    buildTaskTrail,
    createAgentMarkerElement,
    getAgentInitials,
    sanitizePolyline,
    updateAgentMarkerElement,
} from "@/lib/tracking/map-visualization";
import type { LiveTaskState } from "@/types/tracking";

describe("map-visualization", () => {
    it("derives initials for single and multi-word names", () => {
        expect(getAgentInitials("Ahmed")).toBe("A");
        expect(getAgentInitials("Abdul Bello")).toBe("AB");
        expect(getAgentInitials("Muyiwa Moses")).toBe("MM");
        expect(getAgentInitials("")).toBeNull();
        expect(getAgentInitials(undefined)).toBeNull();
    });

    it("sanitizes polylines by dropping duplicate and null-island points", () => {
        const sanitized = sanitizePolyline([
            [0, 0],
            [3.4, 6.5],
            [3.4, 6.5],
            [3.41, 6.51],
        ]);

        expect(sanitized).toEqual([
            [3.4, 6.5],
            [3.41, 6.51],
        ]);
    });

    it("builds task trail by appending the latest live point", () => {
        const task: LiveTaskState = {
            taskId: 5,
            trackingSessionId: 9,
            userId: 12,
            agentName: "Agent Test",
            taskTitle: "Install panel",
            status: "in_progress",
            lastPosition: [3.42, 6.52],
            polyline: [
                [3.4, 6.5],
                [3.41, 6.51],
            ],
            lastEventAt: "2026-05-17T11:00:00.000Z",
        };

        expect(buildTaskTrail(task)).toEqual([
            [3.4, 6.5],
            [3.41, 6.51],
            [3.42, 6.52],
        ]);
    });

    it("renders avatar fallback priority: initials then generic", () => {
        const marker = createAgentMarkerElement({
            name: "Abdul Bello",
            visualState: "in_progress",
            stale: false,
        });

        const initials = marker.querySelector("[data-part='initials']") as HTMLElement;
        const generic = marker.querySelector("[data-part='generic']") as HTMLElement;

        expect(initials.style.display).toBe("flex");
        expect(generic.style.display).toBe("none");

        updateAgentMarkerElement(marker, {
            name: "",
            visualState: "in_progress",
            stale: false,
        });

        expect(initials.style.display).toBe("none");
        expect(generic.style.display).toBe("flex");
    });

    it("shows avatar image when load succeeds and falls back on error", () => {
        const marker = createAgentMarkerElement({
            name: "Agent One",
            avatarUrl: "https://example.com/avatar.png",
            visualState: "in_progress",
            stale: false,
        });

        const img = marker.querySelector("[data-part='avatar']") as HTMLImageElement;
        const initials = marker.querySelector("[data-part='initials']") as HTMLElement;

        expect(img.style.display).toBe("none");
        expect(initials.style.display).toBe("flex");

        img.dispatchEvent(new Event("load"));

        expect(img.style.display).toBe("block");
        expect(initials.style.display).toBe("none");
        expect(marker.dataset.loadedAvatarUrl).toBe("https://example.com/avatar.png");

        img.dispatchEvent(new Event("error"));

        expect(img.style.display).toBe("none");
        expect(initials.style.display).toBe("flex");
        expect(marker.dataset.loadedAvatarUrl).toBeUndefined();
    });

    it("resets cached avatar when url changes to prevent stale image reuse", () => {
        const marker = createAgentMarkerElement({
            name: "Agent One",
            avatarUrl: "https://example.com/user-a.png",
            visualState: "in_progress",
            stale: false,
        });

        const img = marker.querySelector("[data-part='avatar']") as HTMLImageElement;
        const initials = marker.querySelector("[data-part='initials']") as HTMLElement;

        img.dispatchEvent(new Event("load"));
        expect(marker.dataset.loadedAvatarUrl).toBe("https://example.com/user-a.png");

        updateAgentMarkerElement(marker, {
            name: "Agent Two",
            avatarUrl: "https://example.com/user-b.png",
            visualState: "in_progress",
            stale: false,
        });

        expect(img.getAttribute("src")).toBe("https://example.com/user-b.png");
        expect(img.style.display).toBe("none");
        expect(initials.style.display).toBe("flex");
        expect(marker.dataset.loadedAvatarUrl).toBeUndefined();

        img.dispatchEvent(new Event("load"));

        expect(img.style.display).toBe("block");
        expect(initials.style.display).toBe("none");
        expect(marker.dataset.loadedAvatarUrl).toBe("https://example.com/user-b.png");
    });
});
