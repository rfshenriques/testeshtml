import { useSyncExternalStore } from 'react';

const KEY = 'sitewright.adminToken';
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function read(): string | null {
  if (cached !== undefined) return cached;
  try {
    cached = globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    cached = null;
  }
  return cached;
}
function emit() {
  for (const l of listeners) l();
}

export const auth = {
  getToken: read,
  setToken(token: string | null) {
    cached = token;
    try {
      if (token) localStorage.setItem(KEY, token);
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: keep in memory */
    }
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useToken(): string | null {
  return useSyncExternalStore(auth.subscribe, read, read);
}
