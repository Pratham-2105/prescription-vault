import { describe, expect, it } from 'vitest';
import { groupByVisitDate } from './groupByVisitDate';
import type { PrescriptionListItem } from '@/domain/prescription';

function item(id: string, visitDate: string): PrescriptionListItem {
  return {
    id,
    patientId: 'p1',
    visitDate,
    doctorName: null,
    clinicName: null,
    reason: null,
    attachmentCount: 0,
    medicationCount: 0,
  };
}

describe('groupByVisitDate', () => {
  it('returns no sections for an empty list', () => {
    expect(groupByVisitDate([])).toEqual([]);
  });

  it('merges adjacent items sharing a visit date', () => {
    const sections = groupByVisitDate([
      item('a', '2026-09-06'),
      item('b', '2026-09-06'),
      item('c', '2026-08-01'),
    ]);

    expect(sections).toHaveLength(2);
    expect(sections[0]?.data.map((p) => p.id)).toEqual(['a', 'b']);
    expect(sections[1]?.data.map((p) => p.id)).toEqual(['c']);
  });

  it('preserves server order within a section', () => {
    const sections = groupByVisitDate([
      item('newer', '2026-09-06'),
      item('older', '2026-09-06'),
    ]);
    expect(sections[0]?.data.map((p) => p.id)).toEqual(['newer', 'older']);
  });

  it('does not merge non-adjacent equal dates (documents the ordering dependency)', () => {
    const sections = groupByVisitDate([
      item('a', '2026-09-06'),
      item('b', '2026-08-01'),
      item('c', '2026-09-06'),
    ]);
    expect(sections).toHaveLength(3);
  });
});