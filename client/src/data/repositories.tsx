import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api } from '@/api';
import { CLOUD_ENABLED } from '@/flags';
import { ApiPatientRepository } from './apiPatientRepository';
import { ApiPrescriptionRepository } from './apiPrescriptionRepository';
import { SqlitePatientRepository } from './sqlitePatientRepository';
import { SqlitePrescriptionRepository } from './sqlitePrescriptionRepository';
import type { PatientRepository } from './patientRepository';
import type { PrescriptionRepository } from './prescriptionRepository';

export type Repositories = {
  prescriptions: PrescriptionRepository;
  patients: PatientRepository;
};

const RepositoriesContext = createContext<Repositories | null>(null);

/**
 * The one place that decides where data lives.
 *
 * Screens depend on the repository interfaces, never on a concrete class, so
 * this swap is invisible to them. That was the point of the seam: adding
 * offline support should not require editing a single screen, and if one needs
 * editing, the seam was drawn in the wrong place.
 */
function createRepositories(): Repositories {
  if (CLOUD_ENABLED) {
    return {
      prescriptions: new ApiPrescriptionRepository(api),
      patients: new ApiPatientRepository(api),
    };
  }
  return {
    prescriptions: new SqlitePrescriptionRepository(),
    patients: new SqlitePatientRepository(),
  };
}

export function RepositoryProvider({
  children,
  value,
}: {
  children: ReactNode;
  /** Tests pass fakes here. Production leaves it undefined. */
  value?: Repositories;
}) {
  const repositories = useMemo<Repositories>(() => value ?? createRepositories(), [value]);

  return (
    <RepositoriesContext.Provider value={repositories}>
      {children}
    </RepositoriesContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const repositories = useContext(RepositoriesContext);
  if (!repositories) {
    throw new Error('useRepositories must be used inside <RepositoryProvider>.');
  }
  return repositories;
}