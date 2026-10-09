import type { CopilotChatContext } from "@/lib/api/copilot";

export async function resolveCopilotGeolocationContext(): Promise<CopilotChatContext> {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return {};
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            () => resolve({}),
            { enableHighAccuracy: false, maximumAge: 120_000, timeout: 4_000 },
        );
    });
}
