import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../server/prisma/schema.prisma");

let container: StartedPostgreSqlContainer | undefined;

export async function startPostgres(): Promise<string> {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const databaseUrl = container.getConnectionUri();

  execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", schemaPath], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });

  return databaseUrl;
}

export async function stopPostgres(): Promise<void> {
  await container?.stop();
  container = undefined;
}
