import type { ApiClient } from '@/api/client';
import type { components } from '@/types/api';
import type { NewPatient, Patient } from '@/domain/patient';
import type { PatientRepository } from './patientRepository';

type ApiPatient = components['schemas']['PatientRead'];
type ApiPatientCreate = components['schemas']['PatientCreate'];

/** Wire format -> domain. The one place snake_case is allowed to exist. */
function toDomain(dto: ApiPatient): Patient {
  return {
    id: dto.id,
    displayName: dto.display_name,
    relation: dto.relation ?? null,
    dateOfBirth: dto.date_of_birth ?? null,
    bloodGroup: dto.blood_group ?? null,
    allergies: dto.allergies ?? null,
    notes: dto.notes ?? null,
    createdAt: dto.created_at,
  };
}

export class ApiPatientRepository implements PatientRepository {
  constructor(private readonly api: ApiClient) {}

  async list(signal?: AbortSignal): Promise<Patient[]> {
    const items = await this.api.get<ApiPatient[]>('/api/v1/patients', { signal });

    // The endpoint documents no ordering, so impose one here. Chips that
    // reshuffle between renders are a usability bug, and oldest-first keeps
    // the account holder's own profile in the leftmost position.
    // ISO date-times sort correctly as plain strings.
    return [...items]
      .map(toDomain)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async create(input: NewPatient, signal?: AbortSignal): Promise<Patient> {
    const body: ApiPatientCreate = {
      display_name: input.displayName,
      // Empty strings are not absent values. Normalise here so the server
      // stores NULL rather than "", which would render as a blank subtitle.
      relation: emptyToNull(input.relation),
    };

    const created = await this.api.post<ApiPatient>('/api/v1/patients', {
      body,
      signal,
    });
    return toDomain(created);
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}