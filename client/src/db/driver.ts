/**
 * The seam between this app's SQL and whatever engine executes it.
 *
 * In the app that engine is expo-sqlite. In tests it is better-sqlite3
 * running in memory, which is how the schema below gets exercised by CI
 * despite vitest running in `environment: 'node'` where react-native
 * cannot be imported.
 *
 * Deliberately minimal: no query builder, no migrations helper, no ORM.
 * Anything clever belongs in a repository, not in here.
 */

/** Everything we ever bind. No blobs: images live on the filesystem, not in the DB. */
export type SqlParam = string | number | null;

export interface SqlDriver {
  /**
   * Execute a statement that returns no rows we care about.
   *
   * Called with no params the statement is passed through verbatim, which is
   * how DDL and transaction control (BEGIN / COMMIT / ROLLBACK) get executed.
   * Called with params it is prepared and bound.
   */
  run(sql: string, params?: readonly SqlParam[]): Promise<void>;

  /** Execute a query and return every row. */
  all<Row extends object>(sql: string, params?: readonly SqlParam[]): Promise<Row[]>;

  close(): Promise<void>;
}

/**
 * First row or null.
 *
 * A free function rather than a fifth driver method: every driver would
 * implement it identically in terms of `all`, so making it part of the
 * contract is asking implementors to write the same three lines twice.
 */
export async function one<Row extends object>(
  driver: SqlDriver,
  sql: string,
  params?: readonly SqlParam[],
): Promise<Row | null> {
  const rows = await driver.all<Row>(sql, params);
  return rows[0] ?? null;
}