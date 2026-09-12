import { getDatabase } from '@/db/database';
import { nowIso } from '@/db/ids';

/**
 * Small local key/value store for UI state that must survive a restart.
 *
 * Deliberately not part of any repository: these are not records, they never
 * sync, and they are meaningless off this device.
 */

export const PREF_WELCOME_DISMISSED = 'welcome_dismissed';
export const PREF_CLOUD_PROMPT_ANSWERED = 'cloud_prompt_answered';

export async function readFlag(key: string): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM preferences WHERE key = ?`,
    [key],
  );
  return row?.value === 'true';
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    // Upsert: the caller does not know or care whether the key existed.
    `INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                      updated_at = excluded.updated_at`,
    [key, value ? 'true' : 'false', nowIso()],
  );
}

/** Total records stored, used to decide when cloud backup becomes relevant. */
export async function countPrescriptions(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM prescriptions`,
  );
  return row?.total ?? 0;
}