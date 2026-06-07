import { Pool } from "pg";

import { logWarn } from "@/lib/server/observability";

let pgPool: Pool | null = null;

export function shouldUsePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return pgPool;
}

function isRetryablePgError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "40001" || code === "40P01" || code === "53300" || code === "57P01";
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function withPgRetry<T>(name: string, operation: () => Promise<T>): Promise<T> {
  const maxAttempts = Math.max(1, Number.parseInt(process.env.DB_RETRY_ATTEMPTS ?? "3", 10) || 3);
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      const canRetry = isRetryablePgError(error) && attempt < maxAttempts;
      logWarn("db.retry", {
        op: name,
        attempt,
        maxAttempts,
        retrying: canRetry,
        error: error instanceof Error ? error.message : String(error)
      });
      if (!canRetry) throw error;
      await sleep(attempt * 50);
    }
  }
  throw new Error(`${name} failed after retries`);
}
