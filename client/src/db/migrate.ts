import { one, type SqlDriver } from './driver';
import { MIGRATIONS, type Migration } from './migrations';

export class MigrationError extends Error {
  override readonly name = 'MigrationError';
}

/**
 * The database on disk was written by a NEWER build of the app.
 *
 * Happens when someone sideloads an older APK over a newer one. There is no
 * safe automatic response: a "downgrade" means dropping columns that hold the
 * user's data. We refuse to open the database instead.
 */
export class SchemaTooNewError extends Error {
  override readonly name = 'SchemaTooNewError';

  constructor(
    readonly foundVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Database is at schema version ${foundVersion} but this build only ` +
        `understands up to ${supportedVersion}. Refusing to open it.`,
    );
  }
}

export async function readSchemaVersion(driver: SqlDriver): Promise<number> {
  const row = await one<{ user_version: number }>(driver, 'PRAGMA user_version');
  if (row === null) {
    throw new MigrationError('PRAGMA user_version returned no rows');
  }
  return row.user_version;
}

/**
 * Guards against a bad merge producing two migrations numbered 3, or a gap.
 * Cheap, runs on every cold start, and turns a data-corrupting mistake into a
 * crash on the developer's machine the first time they run the app.
 */
function assertVersionsAreContiguous(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new MigrationError(
        `MIGRATIONS is malformed: entry at index ${index} has version ` +
          `${migration.version}, expected ${expected}.`,
      );
    }
  });
}

async function applyMigration(driver: SqlDriver, migration: Migration): Promise<void> {
  // PRAGMA user_version does not accept bound parameters, so this value is
  // interpolated into SQL. It comes from a literal in migrations.ts and is
  // re-checked here so that stays true.
  if (!Number.isInteger(migration.version) || migration.version < 1) {
    throw new MigrationError(`Refusing to apply non-integer version ${migration.version}`);
  }

  // BEGIN IMMEDIATE takes the write lock now rather than on first write, so a
  // migration cannot fail halfway through because something else got there.
  // DDL is transactional in SQLite, so a failure here rolls the tables back
  // too. That is not true of every database and it is the property this
  // whole function depends on.
  await driver.run('BEGIN IMMEDIATE');
  try {
    for (const statement of migration.statements) {
      await driver.run(statement);
    }
    await driver.run(`PRAGMA user_version = ${migration.version}`);
    await driver.run('COMMIT');
  } catch (error) {
    // A rollback failure would mask the real error, so it is swallowed.
    await driver.run('ROLLBACK').catch(() => undefined);
    throw new MigrationError(
      `Migration ${migration.version} (${migration.name}) failed and was ` +
        `rolled back: ${String(error)}`,
    );
  }
}

/**
 * Bring the database up to the latest schema version. Returns that version.
 * Safe to call on every cold start; a no-op when there is nothing to do.
 */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number> {
  assertVersionsAreContiguous(migrations);

  const latest = migrations.length;
  const current = await readSchemaVersion(driver);

  if (current > latest) {
    throw new SchemaTooNewError(current, latest);
  }

  // A fresh database reports 0, so `slice(current)` is also the fresh-install
  // path. There is no special case for first run.
  for (const migration of migrations.slice(current)) {
    await applyMigration(driver, migration);
  }

  return latest;
}