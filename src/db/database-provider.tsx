import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

import migrations from '../../drizzle/migrations';
import { createDatabase, createRepositoryDeps } from './client';
import { createRepositories, type Repositories } from './repositories';
import type { AppDatabase } from './types';

const db: AppDatabase = createDatabase();

const RepositoriesContext = createContext<Repositories | null>(null);

type Props = {
  children: ReactNode;
  /** Rendered while migrations run. */
  fallback?: ReactNode;
  /** Rendered when migration fails. Data is never discarded on failure. */
  renderError?: (error: Error) => ReactNode;
};

/** Runs pending Drizzle migrations, then exposes the repositories to the tree. */
export function DatabaseProvider({ children, fallback = null, renderError }: Props) {
  const { success, error } = useMigrations(db, migrations);
  const repositories = useMemo(() => createRepositories(createRepositoryDeps(db)), []);

  if (error) return <>{renderError?.(error) ?? null}</>;
  if (!success) return <>{fallback}</>;
  return <RepositoriesContext.Provider value={repositories}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const value = useContext(RepositoriesContext);
  if (!value) throw new Error('useRepositories must be used inside <DatabaseProvider>');
  return value;
}
