type ReadinessForeignKey = {
  column: string;
  referencedTable: string;
  referencedColumn: string;
};

type ReadinessTableContract = {
  columns: readonly string[];
  uniqueConstraints?: readonly (readonly string[])[];
  foreignKeys?: readonly ReadinessForeignKey[];
};

export type ReadinessSchema = Readonly<Record<string, ReadinessTableContract>>;

type FirstPassKind = "columns" | "indexes" | "foreignKeys";

type FirstPassQuery = {
  kind: FirstPassKind;
  table: string;
  statement: D1PreparedStatement;
};

type IndexInfoQuery = {
  table: string;
  indexName: string;
  statement: D1PreparedStatement;
};

type TableSnapshot = {
  columns: Set<string>;
  uniqueIndexNames: string[];
  uniqueIndexes: string[][];
  foreignKeys: ReadinessForeignKey[];
};

export async function validateReadinessSchemaWithBatch(
  binding: D1Database,
  schema: ReadinessSchema,
): Promise<void> {
  const snapshots = new Map<string, TableSnapshot>();
  const firstPass: FirstPassQuery[] = [];

  for (const [table, contract] of Object.entries(schema)) {
    snapshots.set(table, {
      columns: new Set(),
      uniqueIndexNames: [],
      uniqueIndexes: [],
      foreignKeys: [],
    });
    firstPass.push({
      kind: "columns",
      table,
      statement: binding.prepare(`PRAGMA table_info('${escapePragmaString(table)}')`),
    });
    if ((contract.uniqueConstraints?.length ?? 0) > 0) {
      firstPass.push({
        kind: "indexes",
        table,
        statement: binding.prepare(`PRAGMA index_list('${escapePragmaString(table)}')`),
      });
    }
    if ((contract.foreignKeys?.length ?? 0) > 0) {
      firstPass.push({
        kind: "foreignKeys",
        table,
        statement: binding.prepare(`PRAGMA foreign_key_list('${escapePragmaString(table)}')`),
      });
    }
  }

  const firstResults = await binding.batch(firstPass.map((query) => query.statement));
  if (firstResults.length !== firstPass.length) {
    throw new Error("readiness D1 batch returned an incomplete result set");
  }

  for (const [index, query] of firstPass.entries()) {
    const snapshot = snapshots.get(query.table);
    if (!snapshot) throw new Error("readiness snapshot is unavailable");
    const rows = firstResults[index]?.results ?? [];

    if (query.kind === "columns") {
      snapshot.columns = new Set(
        rows
          .map((row) => (row as { name?: unknown }).name)
          .filter((name): name is string => typeof name === "string"),
      );
      continue;
    }

    if (query.kind === "indexes") {
      snapshot.uniqueIndexNames = rows
        .filter((row) => Number((row as { unique?: unknown }).unique) === 1)
        .map((row) => (row as { name?: unknown }).name)
        .filter((name): name is string => typeof name === "string");
      continue;
    }

    snapshot.foreignKeys = rows
      .map((row) => ({
        column: (row as { from?: unknown }).from,
        referencedTable: (row as { table?: unknown }).table,
        referencedColumn: (row as { to?: unknown }).to,
      }))
      .filter((foreignKey): foreignKey is ReadinessForeignKey =>
        typeof foreignKey.column === "string"
        && typeof foreignKey.referencedTable === "string"
        && typeof foreignKey.referencedColumn === "string"
      );
  }

  const indexQueries: IndexInfoQuery[] = [];
  for (const [table, snapshot] of snapshots) {
    for (const indexName of snapshot.uniqueIndexNames) {
      indexQueries.push({
        table,
        indexName,
        statement: binding.prepare(`PRAGMA index_info('${escapePragmaString(indexName)}')`),
      });
    }
  }

  if (indexQueries.length > 0) {
    const indexResults = await binding.batch(indexQueries.map((query) => query.statement));
    if (indexResults.length !== indexQueries.length) {
      throw new Error("readiness index batch returned an incomplete result set");
    }

    for (const [index, query] of indexQueries.entries()) {
      const snapshot = snapshots.get(query.table);
      if (!snapshot) throw new Error("readiness snapshot is unavailable");
      const columns = (indexResults[index]?.results ?? [])
        .map((row) => ({
          seqno: (row as { seqno?: unknown }).seqno,
          name: (row as { name?: unknown }).name,
        }))
        .filter((row): row is { seqno: number | string; name: string } =>
          (typeof row.seqno === "number" || typeof row.seqno === "string")
          && typeof row.name === "string"
        )
        .toSorted((a, b) => Number(a.seqno) - Number(b.seqno))
        .map((row) => row.name);
      snapshot.uniqueIndexes.push(columns);
    }
  }

  for (const [table, contract] of Object.entries(schema)) {
    const snapshot = snapshots.get(table);
    if (!snapshot) throw new Error("readiness snapshot is unavailable");

    if (contract.columns.some((column) => !snapshot.columns.has(column))) {
      throw new Error("required D1 schema is missing");
    }

    for (const requiredColumns of contract.uniqueConstraints ?? []) {
      const found = snapshot.uniqueIndexes.some((columns) =>
        columns.length === requiredColumns.length
        && columns.every((column, index) => column === requiredColumns[index])
      );
      if (!found) throw new Error("required D1 uniqueness constraint is missing");
    }

    for (const requiredForeignKey of contract.foreignKeys ?? []) {
      const found = snapshot.foreignKeys.some((foreignKey) =>
        foreignKey.referencedTable === requiredForeignKey.referencedTable
        && foreignKey.column === requiredForeignKey.column
        && foreignKey.referencedColumn === requiredForeignKey.referencedColumn
      );
      if (!found) throw new Error("required D1 foreign key is missing");
    }
  }
}

function escapePragmaString(value: string): string {
  return value.replaceAll("'", "''");
}
