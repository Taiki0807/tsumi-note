import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/** `%query%` for a LIKE substring match (`%`, `_` and `\` in the query are literal), or `undefined` when blank. */
export function containsPattern(query: string | undefined): string | undefined {
  const trimmed = query?.trim();
  if (!trimmed) return undefined;
  return `%${trimmed.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function likeContains(column: SQLiteColumn, pattern: string): SQL {
  return sql`${column} like ${pattern} escape '\\'`;
}
