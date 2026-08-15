import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../prisma/schema.prisma");

let container: StartedPostgreSqlContainer | undefined;

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();

  // Shared with the test workers so `db/prisma.ts` connects to the Testcontainers instance
  // instead of whatever DATABASE_URL is set in the developer's local .env.
  process.env.DATABASE_URL = databaseUrl;

  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
