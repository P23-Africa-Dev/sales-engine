import { describe, expect, it } from "vitest";

import {
    getCountryFallbackViewport,
} from "@/lib/map/default-viewport";

describe("default-viewport", () => {
    it("builds a country-level viewport when an explicit country code is provided", () => {
        const viewport = getCountryFallbackViewport("GB");

        expect(viewport.granularity).toBe("country");
        expect(viewport.countryCode).toBe("GB");
        expect(viewport.center).toEqual([-3.4, 55.4]);
    });

    it("falls back to global view when country is unknown", () => {
        const viewport = getCountryFallbackViewport("ZZ");

        expect(viewport.granularity).toBe("global");
        expect(viewport.countryCode).toBeNull();
        expect(viewport.center).toEqual([0, 20]);
    });

    it("keeps a stable global fallback for unknown countries", () => {
        const viewport = getCountryFallbackViewport(null);

        expect(viewport.granularity).toBe("global");
        expect(viewport.center).toEqual([0, 20]);
        expect(viewport.zoom).toBe(1.9);
    });
});
