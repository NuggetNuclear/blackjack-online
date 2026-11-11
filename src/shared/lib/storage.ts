// Preferences and local game data remain usable when browser storage is denied.
const memory = new Map<string, string>();

export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); } catch { /* Use memory for this session. */ }
}

export function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  memory.delete(key);
  try { window.localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}
