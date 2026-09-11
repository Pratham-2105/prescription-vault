import * as Crypto from 'expo-crypto';

/**
 * Identity and timestamps, which the server used to own.
 *
 * Every row the device creates now needs an id and timestamps of its own. The
 * backend's choice of UUID primary keys (rather than autoincrementing ints) is
 * what makes this possible: a UUID minted on a phone with no network is still
 * globally unique, so these rows can be pushed to a server later without
 * renumbering anything.
 */

/** A v4 UUID, formatted exactly as the server's `uuid.uuid4()` would be. */
export function newId(): string {
  return Crypto.randomUUID();
}

/**
 * Now, as ISO-8601 UTC — the format `created_at` / `updated_at` use.
 *
 * UTC here is correct and deliberate, unlike calendar dates (see lib/date.ts):
 * these are instants, not days. Storing them in UTC means they sort correctly
 * and stay meaningful if the user changes timezone.
 */
export function nowIso(): string {
  return new Date().toISOString();
}