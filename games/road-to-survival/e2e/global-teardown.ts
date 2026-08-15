import { stopPostgres } from "./test-infra/postgres.js";

export default async function globalTeardown(): Promise<void> {
  await stopPostgres();
}
