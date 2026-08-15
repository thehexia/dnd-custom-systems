import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.integration.test.ts", "src/db/prisma.ts"],
      // Gate on the merged unit+integration run (`vitest run --coverage`, no --project filter).
      thresholds: {
        statements: 80,
        lines: 80,
      },
    },
    // Unit and integration are separate Vitest "projects" sharing this one config/coverage
    // session, so `vitest run --coverage` (no --project filter) produces a single merged
    // report across both instead of two coverage-final.json files that need merging by hand.
    // `--project unit` / `--project integration` still run either one in isolation.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          globalSetup: ["test/integration/globalSetup.ts"],
          // Container pull/start and Prisma migrations can take a while, especially cold.
          hookTimeout: 60_000,
          testTimeout: 30_000,
          // Integration tests share one Postgres container/connection pool for the whole run.
          fileParallelism: false,
        },
      },
    ],
  },
});
