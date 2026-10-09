import { describe, expect, it } from "vitest";

import {
    buildCoveragePolygon,
    buildTerritoryFeature,
    territoryLabelPoint,
} from "@/lib/map/territory-geometry";

const londonCluster = [
    { latitude: 51.5265, longitude: -0.0782, weight: 2 },
    { latitude: 51.523, longitude: -0.081, weight: 1 },
    { latitude: 51.5288, longitude: -0.0871, weight: 1 },
    { latitude: 51.5199, longitude: -0.0921, weight: 1 },
    { latitude: 51.5155, longitude: -0.0922, weight: 1 },
    { latitude: 51.5178, longitude: -0.0801, weight: 1 },
];

describe("territory-geometry", () => {
    it("builds a polygon around a cluster of points", () => {
        const polygon = buildCoveragePolygon({
            task_points: londonCluster.slice(0, 2),
            trail_points: londonCluster.slice(2),
        });

        expect(polygon).not.toBeNull();
        expect(["Polygon", "MultiPolygon"]).toContain(polygon!.geometry.type);

        const label = territoryLabelPoint(polygon!);
        expect(label).not.toBeNull();
        const [lng, lat] = label!;
        expect(lng).toBeGreaterThan(-0.12);
        expect(lng).toBeLessThan(-0.05);
        expect(lat).toBeGreaterThan(51.5);
        expect(lat).toBeLessThan(51.55);
    });

    it("falls back to a buffered circle for a single point", () => {
        const polygon = buildCoveragePolygon({
            task_points: [{ latitude: 51.5074, longitude: -0.1278, weight: 2 }],
            trail_points: [],
        });

        expect(polygon).not.toBeNull();
        expect(polygon!.geometry.type).toBe("Polygon");
    });

    it("returns null when there are no usable points", () => {
        expect(
            buildCoveragePolygon({
                task_points: [{ latitude: Number.NaN, longitude: 200, weight: 1 }],
                trail_points: [],
            })
        ).toBeNull();
    });

    it("prefers the manual polygon when mode is manual", () => {
        const manual: GeoJSON.Polygon = {
            type: "Polygon",
            coordinates: [
                [
                    [-0.1, 51.5],
                    [-0.05, 51.5],
                    [-0.05, 51.54],
                    [-0.1, 51.54],
                    [-0.1, 51.5],
                ],
            ],
        };

        const feature = buildTerritoryFeature({
            userId: 7,
            name: "Harry Walker",
            color: "#5B5BD6",
            mode: "manual",
            manualPolygon: manual,
            coverage: { task_points: londonCluster, trail_points: [] },
        });

        expect(feature).not.toBeNull();
        expect(feature!.geometry).toEqual(manual);
        expect(feature!.properties).toEqual({
            userId: 7,
            name: "Harry Walker",
            color: "#5B5BD6",
            mode: "manual",
        });
    });

    it("returns null in auto mode with no coverage", () => {
        const feature = buildTerritoryFeature({
            userId: 3,
            name: "Emily Watson",
            color: "#E93D82",
            mode: "auto",
            manualPolygon: null,
            coverage: null,
        });

        expect(feature).toBeNull();
    });
});
