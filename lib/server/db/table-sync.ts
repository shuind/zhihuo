import type { PoolClient } from "pg";

export type PgSyncPlan = {
  table: string;
  idColumn: string;
  columns: string[];
  conflictColumns: string[];
  rows: unknown[][];
};

export async function upsertTable(
  client: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflictColumns: string[]
) {
  if (!rows.length) return;

  const placeholders: string[] = [];
  const params: unknown[] = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rowPlaceholders: string[] = [];
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      params.push(row[columnIndex] ?? null);
      rowPlaceholders.push(`$${params.length}`);
    }
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  }

  const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
  const updateClause =
    updateColumns.length > 0
      ? `DO UPDATE SET ${updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(", ")}`
      : "DO NOTHING";

  await client.query(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")} ON CONFLICT (${conflictColumns.join(", ")}) ${updateClause}`,
    params
  );
}

export async function deleteRowsNotInSet(client: PoolClient, table: string, idColumn: string, ids: string[]) {
  if (!ids.length) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  await client.query(`DELETE FROM ${table} WHERE NOT (${idColumn} = ANY($1::text[]))`, [ids]);
}
