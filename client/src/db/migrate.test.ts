import { beforeEach, describe, expect, it } from 'vitest';

import { one, type SqlDriver } from './driver';
import { migrate, MigrationError, readSchemaVersion, SchemaTooNewError } from './migrate';
import { MIGRATIONS, type Migration } from './migrations';
import { createTestDriver } from './testDriver';

const LATEST = MIGRATIONS.length;

async function tableNames(driver: SqlDriver): Promise<string[]> {
  const rows = await driver.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

async function seedVisit(driver: SqlDriver): Promise<void> {
  await driver.run(
    `INSERT INTO patients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ['p1', 'Self', '2026-09-11T10:00:00.000Z', '2026-09-11T10:00:00.000Z'],
  );
  await driver.run(
    `INSERT INTO prescriptions (id, patient_id, visit_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    ['v1', 'p1', '2026-09-11', '2026-09-11T10:00:00.000Z', '2026-09-11T10:00:00.000Z'],
  );
}

describe('migrate', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = createTestDriver();
  });

  it('takes a fresh database to the latest version', async () => {
    expect(await readSchemaVersion(driver)).toBe(0);

    const version = await migrate(driver);

    expect(version).toBe(LATEST);
    expect(await readSchemaVersion(driver)).toBe(LATEST);
    expect(await tableNames(driver)).toEqual([
      'attachments',
      'medications',
      'patients',
      'prescriptions',
    ]);
  });

  it('is a no-op when already current', async () => {
    await migrate(driver);
    await seedVisit(driver);

    await expect(migrate(driver)).resolves.toBe(LATEST);

    const row = await one<{ count: number }>(
      driver,
      'SELECT COUNT(*) AS count FROM prescriptions',
    );
    expect(row?.count).toBe(1);
  });

  it('refuses to open a database written by a newer build', async () => {
    await migrate(driver);
    await driver.run(`PRAGMA user_version = ${LATEST + 1}`);

    await expect(migrate(driver)).rejects.toBeInstanceOf(SchemaTooNewError);
  });

  it('rolls a failing migration back completely', async () => {
    const broken: readonly Migration[] = [
      {
        version: 1,
        name: 'half-broken',
        statements: [
          'CREATE TABLE good (id TEXT NOT NULL PRIMARY KEY) STRICT',
          'CREATE TABLE bad (this is not sql)',
        ],
      },
    ];

    await expect(migrate(driver, broken)).rejects.toBeInstanceOf(MigrationError);

    // The version did not advance and the first table is gone too.
    expect(await readSchemaVersion(driver)).toBe(0);
    expect(await tableNames(driver)).toEqual([]);
  });

  it('rejects a non-contiguous migration list', async () => {
    const gapped: readonly Migration[] = [
      { version: 1, name: 'one', statements: [] },
      { version: 3, name: 'three', statements: [] },
    ];

    await expect(migrate(driver, gapped)).rejects.toBeInstanceOf(MigrationError);
  });
});

describe('schema', () => {
  let driver: SqlDriver;

  beforeEach(async () => {
    driver = createTestDriver();
    await migrate(driver);
  });

  it('cascades deletes from patient to prescription to page', async () => {
    await seedVisit(driver);
    await driver.run(
      `INSERT INTO attachments
         (id, prescription_id, storage_key, content_type, size_bytes, page_number,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['a1', 'v1', 'k1', 'image/jpeg', 1234, 1, '2026-09-11T10:00:00.000Z', '2026-09-11T10:00:00.000Z'],
    );

    await driver.run('DELETE FROM patients WHERE id = ?', ['p1']);

    const rows = await one<{ count: number }>(
      driver,
      'SELECT COUNT(*) AS count FROM attachments',
    );
    expect(rows?.count).toBe(0);
  });

  it('rejects a timestamp in visit_date', async () => {
    await driver.run(
      `INSERT INTO patients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ['p1', 'Self', 'now', 'now'],
    );

    await expect(
      driver.run(
        `INSERT INTO prescriptions (id, patient_id, visit_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        ['v1', 'p1', '2026-09-11T00:30:00.000Z', 'now', 'now'],
      ),
    ).rejects.toThrow();
  });

  it('rejects two pages with the same page number', async () => {
    await seedVisit(driver);
    const page = (id: string, n: number): readonly (string | number)[] => [
      id, 'v1', `key-${id}`, 'image/jpeg', 10, n, 'now', 'now',
    ];
    const sql = `INSERT INTO attachments
         (id, prescription_id, storage_key, content_type, size_bytes, page_number,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    await driver.run(sql, page('a1', 1));
    await expect(driver.run(sql, page('a2', 1))).rejects.toThrow();
  });

  it('rejects a string in an INTEGER column (STRICT is really on)', async () => {
    await seedVisit(driver);

    await expect(
      driver.run(
        `INSERT INTO attachments
           (id, prescription_id, storage_key, content_type, size_bytes, page_number,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['a1', 'v1', 'k1', 'image/jpeg', 'not a number', 1, 'now', 'now'],
      ),
    ).rejects.toThrow();
  });
});