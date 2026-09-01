import assert from "node:assert/strict";
import test from "node:test";
import { validateReadinessSchemaWithBatch } from "../src/readiness-batch";

const schema = {
  parent: {
    columns: ["id", "name"],
    uniqueConstraints: [["id"]],
  },
  child: {
    columns: ["id", "parent_id"],
    uniqueConstraints: [["id"]],
    foreignKeys: [{ column: "parent_id", referencedTable: "parent", referencedColumn: "id" }],
  },
} as const;

function batchedDatabase(options: { includeForeignKey?: boolean } = {}) {
  const batchSizes: number[] = [];
  const queries: string[] = [];
  const includeForeignKey = options.includeForeignKey ?? true;

  const database = {
    prepare(query: string) {
      queries.push(query);
      return { query } as unknown as D1PreparedStatement;
    },
    async batch(statements: D1PreparedStatement[]) {
      batchSizes.push(statements.length);
      return statements.map((statement) => {
        const query = (statement as unknown as { query: string }).query;
        const tableInfo = /^PRAGMA table_info\('([^']+)'\)$/.exec(query);
        if (tableInfo) {
          const columns = tableInfo[1] === "parent" ? ["id", "name"] : ["id", "parent_id"];
          return { success: true, meta: {}, results: columns.map((name) => ({ name })) };
        }
        const indexList = /^PRAGMA index_list\('([^']+)'\)$/.exec(query);
        if (indexList) {
          return {
            success: true,
            meta: {},
            results: [{ name: `fixture_${indexList[1]}_id`, unique: 1 }],
          };
        }
        const indexInfo = /^PRAGMA index_info\('([^']+)'\)$/.exec(query);
        if (indexInfo) {
          return { success: true, meta: {}, results: [{ name: "id", seqno: 0 }] };
        }
        if (query === "PRAGMA foreign_key_list('child')") {
          return {
            success: true,
            meta: {},
            results: includeForeignKey
              ? [{ table: "parent", from: "parent_id", to: "id" }]
              : [],
          };
        }
        throw new Error(`unexpected readiness query: ${query}`);
      });
    },
  } as unknown as D1Database;

  return { database, batchSizes, queries };
}

test("validates a schema in two D1 batch round trips", async () => {
  const { database, batchSizes, queries } = batchedDatabase();

  await validateReadinessSchemaWithBatch(database, schema);

  assert.deepEqual(batchSizes, [5, 2]);
  assert.equal(queries.filter((query) => query.startsWith("PRAGMA index_list")).length, 2);
  assert.equal(queries.filter((query) => query.startsWith("PRAGMA index_info")).length, 2);
});

test("keeps foreign-key validation fail closed on the batched path", async () => {
  const { database } = batchedDatabase({ includeForeignKey: false });

  await assert.rejects(
    validateReadinessSchemaWithBatch(database, schema),
    /foreign key is missing/,
  );
});
