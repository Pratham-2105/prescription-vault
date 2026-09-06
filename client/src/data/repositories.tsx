import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api } from '@/api';
import { ApiPrescriptionRepository } from './apiPrescriptionRepository';
import type { PrescriptionRepository } from './prescriptionRepository';

export type Repositories = {
  prescriptions: PrescriptionRepository;
};

const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoryProvider({
  children,
  value,
}: {
  children: ReactNode;
  /** Tests pass fakes here. Production leaves it undefined. */
  value?: Repositories;
}) {
  const repositories = useMemo<Repositories>(
    () => value ?? { prescriptions: new ApiPrescriptionRepository(api) },
    [value],
  );

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