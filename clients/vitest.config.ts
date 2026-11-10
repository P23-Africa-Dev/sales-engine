import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL("./", import.meta.url));
const agentSrc = path.resolve(rootDir, "the-factory-agent-pwa/src");

export default defineConfig({
    root: rootDir,
    test: {
        projects: [
            {
                root: rootDir,
                test: {
                    name: "root",
                    environment: "jsdom",
                    setupFiles: [path.join(rootDir, "tests/setup.ts")],
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    mockReset: true,
                    include: [
                        "hooks/**/*.test.ts",
                        "hooks/**/*.test.tsx",
                        "lib/**/*.test.ts",
                        "lib/**/*.test.tsx",
                        "components/**/*.test.ts",
                        "components/**/*.test.tsx",
                    ],
                    exclude: ["backend/**", "node_modules/**", "the-factory-agent-pwa/**"],
                },
                resolve: {
                    alias: {
                        "@": rootDir,
                    },
                },
            },
            {
                root: rootDir,
                test: {
                    name: "agent-pwa",
                    environment: "jsdom",
                    setupFiles: [path.join(rootDir, "tests/setup.ts")],
                    globals: true,
                    clearMocks: true,
                    restoreMocks: true,
                    mockReset: true,
                    include: ["the-factory-agent-pwa/src/**/*.test.ts"],
                    exclude: ["backend/**", "node_modules/**"],
                },
                resolve: {
                    alias: {
                        "@": agentSrc,
                    },
                },
            },
        ],
    },
});
