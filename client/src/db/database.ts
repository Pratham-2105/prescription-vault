import * as SQLite from 'expo-sqlite';
import { LATEST_VERSION, MIGRATIONS, type Migration } from './schema';

const DATABASE_NAME = 'prescription-vault.db';

/**
 * The single open connection.
 *
 * A module-level handle rather than one per call: expo-sqlite connections are
 * expensive to open, and PRAGMAs below are per-connection, so a second
 * connection would quietly have foreign keys disabled.
 */
let handle: SQLite.SQLiteDatabase | null = null;

/** Guards against two callers racing to open and migrate at startup. */
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the database, applies any outstanding migrations, and returns it.
 *
 * Safe to call from anywhere; the work happens once.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (handle) return Promise.resolve(handle);

  opening ??= openAndMigrate().then((db) => {
    handle = db;
    opening = null;
    return db;
  });

  return opening;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // SQLite ships with foreign keys OFF. Without this, every
  // `ON DELETE CASCADE` in the schema is decorative: deleting a prescription
  // leaves its attachments and medications behind, silently, forever.
  //
  // It is per-connection and a no-op inside a transaction, so it has to be
  // here, before any migration runs.
  await db.execAsync('PRAGMA foreign_keys = ON');

  // WAL lets a read proceed while a write is in flight. On a phone that is the
  // difference between the timeline stuttering during a save and not.
  await db.execAsync('PRAGMA journal_mode = WAL');

  await migrate(db);
  return db;
}

/**
 * Applies every migration newer than the database's current `user_version`.
 *
 * `user_version` is a 4-byte integer SQLite stores in the database header for
 * exactly this purpose. It costs nothing to read and survives everything short
 * of deleting the file.
 *
 * This exists because of what happens without it: someone installs v2 of the
 * app holding 200 prescriptions, the schema has changed, and the only recovery
 * is dropping their data. Versioning from the first release is the cheap
 * moment; retrofitting it after the app is public is not.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const current = await readUserVersion(db);

  if (current > LATEST_VERSION) {
    // The user downgraded the app, or a build went out of order. Refusing is
    // the safe move: an older binary writing against a newer schema corrupts
    // data in ways that are hard to detect and impossible to undo.
    throw new Error(
      `Database is at version ${String(current)}, but this build only knows up to ` +
        `${String(LATEST_VERSION)}. Update the app.`,
    );
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await applyMigration(db, migration);
  }
}

async function applyMigration(
  db: SQLite.SQLiteDatabase,
  migration: Migration,
): Promise<void> {
  // One transaction per migration: a migration either lands whole or not at
  // all. A half-applied schema with a bumped version number is unrecoverable.
  await db.withTransactionAsync(async () => {
    for (const statement of migration.statements) {
      await db.execAsync(statement);
    }

    // PRAGMA does not accept bound parameters, so this is interpolated. Safe
    // because the value is a number from our own frozen migration list, never
    // anything a user supplies — but it is the one place in this file where a
    // parameter would normally go, so it is worth being explicit about why.
    await db.execAsync(`PRAGMA user_version = ${String(migration.version)}`);
  });
}

async function readUserVersion(db: SQLite.SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Closes and forgets the connection.
 *
 * Only needed by tests and by a future "clear all local data" action; the app
 * itself keeps one connection for its lifetime.
 */
export async function closeDatabase(): Promise<void> {
  if (!handle) return;
  const db = handle;
  handle = null;
  await db.closeAsync();
}