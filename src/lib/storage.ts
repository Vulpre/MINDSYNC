import { EMPTY_APP_DATA, type AppData } from '../types';

const STORAGE_KEY = 'mindsync.prototype.data.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadAppData(): AppData {
  if (typeof window === 'undefined') return { ...EMPTY_APP_DATA };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_APP_DATA };

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1) return { ...EMPTY_APP_DATA };

    return {
      version: 1,
      checklists: Array.isArray(parsed.checklists) ? parsed.checklists : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      evaluations: Array.isArray(parsed.evaluations) ? parsed.evaluations : [],
    } as AppData;
  } catch {
    return { ...EMPTY_APP_DATA };
  }
}

export function saveAppData(data: AppData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function clearAppData(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
