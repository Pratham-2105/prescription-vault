import type { IsoDate, PrescriptionListItem } from '@/domain/prescription';

export type PrescriptionSection = {
  /** Raw 'YYYY-MM-DD' — stable key, safe to compare. */
  date: IsoDate;
  /** Human label for the header. */
  title: string;
  data: PrescriptionListItem[];
};

/** '2026-09-06' -> '6 September 2026', in the device's locale. */
export function formatVisitDate(iso: IsoDate): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;

  // Built from local components on purpose: new Date('2026-09-06')
  // parses as UTC midnight and renders as the previous day west of GMT.
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Group prescriptions into date sections.
 *
 * DEPENDS ON server ordering (visit_date DESC, created_at DESC): rows with
 * the same date must already be adjacent. If that ordering ever changes,
 * this produces repeated headers instead of merged ones.
 */
export function groupByVisitDate(
  items: PrescriptionListItem[],
): PrescriptionSection[] {
  const sections: PrescriptionSection[] = [];
  let current: PrescriptionSection | undefined;

  for (const item of items) {
    if (!current || current.date !== item.visitDate) {
      current = {
        date: item.visitDate,
        title: formatVisitDate(item.visitDate),
        data: [],
      };
      sections.push(current);
    }
    current.data.push(item);
  }

  return sections;
}