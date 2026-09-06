const THREE_SLOT = ['morning', 'afternoon', 'night'] as const;
const FOUR_SLOT = ['morning', 'afternoon', 'evening', 'night'] as const;

/**
 * "1-0-1" -> "1 morning, 1 night".
 *
 * Formatting only. This function restates what the doctor wrote and must
 * never add guidance the prescription does not contain (hard product rule 1).
 * Unrecognised codes are returned verbatim rather than guessed at.
 */
export function formatFrequency(code: string | null): string | null {
  if (!code) return null;

  const parts = code.split('-').map((p) => p.trim());
  const labels =
    parts.length === 3 ? THREE_SLOT : parts.length === 4 ? FOUR_SLOT : null;
  if (!labels) return code;

  const doses: string[] = [];
  for (const [index, part] of parts.entries()) {
    const count = Number(part);
    if (!Number.isFinite(count)) return code; // e.g. "1-½-1": show as written
    if (count <= 0) continue;
    const label = labels[index];
    if (label) doses.push(`${count} ${label}`);
  }

  return doses.length ? doses.join(', ') : code;
}