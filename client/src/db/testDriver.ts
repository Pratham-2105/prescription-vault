/**
 * An in-memory SqlDriver for tests.
 *
 * better-sqlite3 is a devDependency, so this file must only ever be imported
 * from *.test.ts. It sits next to the production files rather than in a
 * subdirectory because the rest of src/ is flat — the safety here comes from
 * the import graph, not the location.
 */
import Database from 'better-sqlite3';

import type { SqlDriver, SqlParam } from './driver';

export function createTestDriver(): SqlDriver {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  return {
    async run(sql: string, params?: readonly SqlParam[]): Promise<void> {
      if (params === undefined || params.length === 0) {
        db.exec(sql);
        return;
      }
      db.prepare(sql).run(...params);
    },

    async all<Row extends object>(sql: string, params?: readonly SqlParam[]): Promise<Row[]> {
      return db.prepare(sql).all(...(params ?? [])) as Row[];
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}