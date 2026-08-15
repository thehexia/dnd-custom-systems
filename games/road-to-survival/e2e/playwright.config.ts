import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { startPostgres } from "./test-infra/postgres.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

// Distinct from the dev-server defaults (2567 / 5173) so this suite can run alongside a
// developer's `npm run dev` without port collisions.
const SERVER_PORT = 2569;
const CLIENT_PORT = 4174;

// Testcontainers-provisioned Postgres, started here (not in globalSetup) so the connection
// string is available before `webServer.env` below is constructed. Torn down in
// ./global-teardown.ts, which shares the container reference via ./test-infra/postgres.ts.
//
// This config module is re-evaluated once per worker process in addition to the main
// orchestrating process, but only the main process's `webServer` block is actually used to
// start/stop servers -- so only start the (real, non-trivial) container there. Worker
// processes get an unused placeholder instead of paying for a second container + migration run.
const databaseUrl =
  process.env.TEST_WORKER_INDEX === undefined
    ? await startPostgres()
    : "postgresql://unused:unused@localhost:1/unused";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each worker process re-evaluates this config file, and this module starts a real
  // Testcontainers Postgres as a side effect of loading it -- keep this at 1 worker so that
  // doesn't spin up (and migrate) an extra container per worker for no benefit, since both
  // spec files already share one webServer/database.
  workers: 1,
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev --workspace=server",
      cwd: gameRoot,
      port: SERVER_PORT,
      env: { DATABASE_URL: databaseUrl, SERVER_PORT: String(SERVER_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: `npm run dev --workspace=client -- --port ${CLIENT_PORT} --strictPort`,
      cwd: gameRoot,
      port: CLIENT_PORT,
      env: { VITE_SERVER_URL: `ws://localhost:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
    },
  ],
});
