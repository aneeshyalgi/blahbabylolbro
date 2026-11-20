/**
 * What a tab had open, kept in memory while the app stays open. The app unmounts a tab when another one is chosen, so a
 * tab that should come back as the user left it (e.g. an open lineage run) remembers that here. A reload starts fresh.
 */
const memory = new Map<string, unknown>();

export function rememberInTab<T>(key: string, value: T | null): void {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
}

export function recallInTab<T>(key: string): T | null {
  return (memory.get(key) as T | undefined) ?? null;
}
