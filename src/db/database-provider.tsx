import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth/auth-context';
import { setImageOwner } from '@/features/notes/note-image-store';

import migrations from '../../drizzle/migrations';
import { closeDatabasesExcept, createRepositoryDeps, openDatabase } from './client';
import { databaseNameForOwner, type OwnerId } from './ownership';
import { ownerHintStorage } from './owner-hint-storage';
import { createRepositories, type Repositories } from './repositories';
import { resolveOwner, syncOwnerHint, type OwnerAuthState } from './resolve-owner';
import type { AppDatabase } from './types';

type DatabaseContextValue = {
  db: AppDatabase;
  owner: OwnerId;
  databaseName: string;
  repositories: Repositories;
  /** Remounts the screens so they re-read the active database. */
  reload: () => void;
};

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

type Props = {
  children: ReactNode;
  /** Rendered while migrations run. */
  fallback?: ReactNode;
  /** Rendered when migration fails. Data is never discarded on failure. */
  renderError?: (error: Error) => ReactNode;
};

/**
 * Chooses the local database from the auth state (guest -> `tsumi-note.db`, account -> its own file) and
 * exposes its repositories. The subtree is keyed by the database, so every screen, hook and cached value
 * of the previous owner is unmounted when the owner changes; nothing is carried over in memory.
 * Nothing is read from or written to any database other than the active one.
 */
export function DatabaseProvider({ children, fallback = null, renderError }: Props) {
  const { state } = useAuth();
  const owner = useOwner(state);
  const databaseName = databaseNameForOwner(owner);
  return (
    <OwnerDatabase
      key={databaseName}
      owner={owner}
      databaseName={databaseName}
      fallback={fallback}
      renderError={renderError}
    >
      {children}
    </OwnerDatabase>
  );
}

function useOwner(state: ReturnType<typeof useAuth>['state']): OwnerId {
  const authState: OwnerAuthState =
    state.status === 'signedIn' ? { status: 'signedIn', userId: state.user.id } : { status: state.status };
  const lastOwner = syncOwnerHint(authState, ownerHintStorage);
  return resolveOwner(authState, lastOwner);
}

function OwnerDatabase({
  owner,
  databaseName,
  children,
  fallback,
  renderError,
}: Props & { owner: OwnerId; databaseName: string }) {
  // Opened synchronously and cached per file, so a remount (e.g. React strict mode) reuses the connection.
  // The image directory is module-level state; it is switched together with the database, before any child renders.
  const db = useMemo(() => {
    setImageOwner(owner);
    return openDatabase(databaseName);
  }, [owner, databaseName]);
  const { success, error } = useMigrations(db, migrations);
  // Bumped after rows are added behind the screens' back (guest import) so they reload from the database.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo<DatabaseContextValue>(
    () => ({ db, owner, databaseName, repositories: createRepositories(createRepositoryDeps(db)), reload }),
    [db, owner, databaseName, reload],
  );

  // Close the previous owner's connection once this one is the active one.
  useEffect(() => {
    closeDatabasesExcept(databaseName);
  }, [databaseName]);

  if (error) return <>{renderError?.(error) ?? null}</>;
  if (!success) return <>{fallback}</>;
  return (
    <DatabaseContext.Provider value={value}>
      <Fragment key={version}>{children}</Fragment>
    </DatabaseContext.Provider>
  );
}

export function useDatabaseContext(): DatabaseContextValue {
  const value = useContext(DatabaseContext);
  if (!value) throw new Error('useDatabaseContext must be used inside <DatabaseProvider>');
  return value;
}

export function useRepositories(): Repositories {
  const value = useContext(DatabaseContext);
  if (!value) throw new Error('useRepositories must be used inside <DatabaseProvider>');
  return value.repositories;
}
