import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as locationBuffer from "@/lib/tracking/location-buffer";

const {
    recordTaskLocationMock,
    positionCallbackRef,
} = vi.hoisted(() => ({
    recordTaskLocationMock: vi.fn(),
    positionCallbackRef: {
        current: null as
            | ((reading: {
                latitude: number;
                longitude: number;
                accuracyMeters: number | null;
                speedMps: number | null;
                headingDegrees: number | null;
                recordedAt: string;
            }) => void)
            | null,
    },
}));

vi.mock("@/lib/api/tracking", () => ({
    recordTaskLocation: recordTaskLocationMock,
}));

vi.mock("@/lib/tracking/geolocation", () => ({
    watchPosition: vi.fn((onPosition: typeof positionCallbackRef.current) => {
        positionCallbackRef.current = onPosition;
        return vi.fn();
    }),
    watchVisibilityAccuracy: vi.fn(() => vi.fn()),
}));

describe("location-buffer", () => {
    const keyFor = (companyId: number | string, taskId: number) =>
        `factory_location_buffer:${String(companyId)}:${taskId}`;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        positionCallbackRef.current = null;
        recordTaskLocationMock.mockResolvedValue({ data: { arrived: false } });
    });

    afterEach(() => {
        locationBuffer.stop();
        vi.useRealTimers();
    });

    it("queues location readings and flushes the first sample immediately", async () => {
        locationBuffer.start(55, 9, "token");

        expect(positionCallbackRef.current).not.toBeNull();
        positionCallbackRef.current?.({
            latitude: 6.5,
            longitude: 3.3,
            accuracyMeters: 5,
            speedMps: null,
            headingDegrees: null,
            recordedAt: "2026-05-16T10:00:00.000Z",
        });

        await Promise.resolve();
        await Promise.resolve();

        expect(recordTaskLocationMock).toHaveBeenCalledTimes(1);
        expect(recordTaskLocationMock.mock.calls[0][1]).toMatchObject({
            company_id: 9,
            points: [
                {
                    latitude: 6.5,
                    longitude: 3.3,
                    accuracy_meters: 5,
                    speed_mps: null,
                    heading_degrees: null,
                    recorded_at: "2026-05-16T10:00:00.000Z",
                },
            ],
        });
    });

    it("flushes recovered queue and triggers arrival callback when backend reports arrived", async () => {
        sessionStorage.setItem(
            keyFor(12, 77),
            JSON.stringify([
                {
                    latitude: 6.6,
                    longitude: 3.4,
                    accuracyMeters: 4,
                    speedMps: null,
                    headingDegrees: null,
                    recordedAt: "2026-05-16T11:00:00.000Z",
                },
            ])
        );

        recordTaskLocationMock.mockResolvedValue({ data: { arrived: true } });
        const onArrived = vi.fn();

        locationBuffer.start(77, 12, "token", { onArrived });

        await Promise.resolve();

        expect(recordTaskLocationMock).toHaveBeenCalled();
        expect(onArrived).toHaveBeenCalledTimes(1);
    });

    it("does not reuse queued points from a different task/company session key", async () => {
        sessionStorage.setItem(
            keyFor(12, 77),
            JSON.stringify([
                {
                    latitude: 6.6,
                    longitude: 3.4,
                    accuracyMeters: 4,
                    speedMps: null,
                    headingDegrees: null,
                    recordedAt: "2026-05-16T11:00:00.000Z",
                },
            ])
        );

        locationBuffer.start(55, 9, "token");
        await Promise.resolve();

        expect(recordTaskLocationMock).not.toHaveBeenCalled();

        positionCallbackRef.current?.({
            latitude: 6.7,
            longitude: 3.5,
            accuracyMeters: 6,
            speedMps: null,
            headingDegrees: null,
            recordedAt: "2026-05-16T11:01:00.000Z",
        });

        await vi.advanceTimersByTimeAsync(30_000);

        expect(recordTaskLocationMock).toHaveBeenCalledTimes(1);
        expect(recordTaskLocationMock.mock.calls[0][1]).toMatchObject({
            company_id: 9,
            points: [
                {
                    latitude: 6.7,
                    longitude: 3.5,
                },
            ],
        });
    });

    it("flushes when the agent has moved ~20m without waiting for the 30s heartbeat", async () => {
        locationBuffer.start(55, 9, "token");
        positionCallbackRef.current?.({
            latitude: 6.5,
            longitude: 3.3,
            accuracyMeters: 5,
            speedMps: 8,
            headingDegrees: 90,
            recordedAt: "2026-05-16T10:00:00.000Z",
        });
        await Promise.resolve();
        recordTaskLocationMock.mockClear();

        positionCallbackRef.current?.({
            latitude: 6.5 + 30 / 111_320,
            longitude: 3.3,
            accuracyMeters: 5,
            speedMps: 8,
            headingDegrees: 90,
            recordedAt: "2026-05-16T10:00:02.000Z",
        });
        await Promise.resolve();

        expect(recordTaskLocationMock).toHaveBeenCalled();
    });
});