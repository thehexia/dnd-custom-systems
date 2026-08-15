import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      // main.ts (bootstrap wiring) and MainScene.ts (Phaser rendering/input, needs canvas/WebGL
      // jsdom doesn't provide) are excluded from the coverage denominator -- same reasoning as
      // server's thin entry-point/passthrough exclusions.
      exclude: ["src/**/*.test.ts", "src/vite-env.d.ts", "src/main.ts", "src/scenes/MainScene.ts"],
      thresholds: {
        statements: 80,
        lines: 80,
      },
    },
  },
});
