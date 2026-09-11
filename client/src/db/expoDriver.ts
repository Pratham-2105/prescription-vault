import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDriver, SqlParam } from './driver';

export function createExpoDriver(db: SQLiteDatabase): SqlDriver {
  return {
    async run(sql: string, params?: readonly SqlParam[]): Promise<void> {
      if (params === undefined || params.length === 0) {
        await db.execAsync(sql);
        return;
      }
      // Spread rather than cast: expo's bind params are a mutable array and
      // ours is readonly. A copy is honest; `as` would be papering over it.
      await db.runAsync(sql, [...params]);
    },

    async all<Row extends object>(sql: string, params?: readonly SqlParam[]): Promise<Row[]> {
      return db.getAllAsync<Row>(sql, params === undefined ? [] : [...params]);
    },

    async close(): Promise<void> {
      await db.closeAsync();
    },
  };
}