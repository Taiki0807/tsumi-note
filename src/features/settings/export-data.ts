import { Directory, File, Paths } from 'expo-file-system';
import { Share } from 'react-native';

import type { Repositories } from '@/db/repositories';

export const EXPORT_FORMAT_VERSION = 1;

/** Use case: every local table as one JSON document. Note images are not embedded. */
export function buildExportJson(repos: Pick<Repositories, 'exporter'>, now: number): string {
  return JSON.stringify(
    {
      app: 'tsumi-note',
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: now,
      ...repos.exporter.snapshot(),
    },
    null,
    2,
  );
}

export function exportFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tsumi-note-export-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/** Writes the export into the app's cache directory and opens the share sheet. Fully local. */
export async function shareExport(repos: Pick<Repositories, 'exporter'>, now: number): Promise<void> {
  const directory = new Directory(Paths.cache, 'exports');
  if (!directory.exists) directory.create({ idempotent: true });
  const file = new File(directory, exportFileName(now));
  if (file.exists) file.delete();
  file.create();
  file.write(buildExportJson(repos, now));
  await Share.share({ url: file.uri });
}
