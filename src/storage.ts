/**
 * Local storage utilities for caching and persistence
 */

import type { Row, AppState } from './types';

const K = {
  GROUPS: 'ks_groups',
  DATA: 'ks_data',
  HIDE: 'ks_hide',
  PINNED_ORDER: 'ks_pinned_order',
};

export { K };

interface CachedData {
  headers: string[];
  rows: Row[];
  sheetName: string;
  title: string;
}

/**
 * Save app cache to localStorage
 */
export function saveCache(state: {
  headers: string[];
  rows: Row[];
  sheetName: string;
  sheetTitle: string;
}): void {
  localStorage.setItem(
    K.DATA,
    JSON.stringify({
      headers: state.headers,
      rows: state.rows,
      sheetName: state.sheetName,
      title: state.sheetTitle,
    })
  );
}

/**
 * Load app cache from localStorage
 */
export function loadCache(): CachedData | null {
  const raw = localStorage.getItem(K.DATA);
  if (!raw) return null;

  try {
    const d = JSON.parse(raw) as CachedData;
    return d;
  } catch {
    return null;
  }
}

/**
 * Save pinned rows order to localStorage
 */
export function savePinnedOrder(pinnedIds: string[]): void {
  localStorage.setItem(K.PINNED_ORDER, JSON.stringify(pinnedIds));
}

/**
 * Load pinned rows order from localStorage
 */
export function loadPinnedOrder(): string[] {
  const raw = localStorage.getItem(K.PINNED_ORDER);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

/**
 * Save hide content preference
 */
export function saveHidePreference(hidden: boolean): void {
  localStorage.setItem(K.HIDE, hidden ? '1' : '0');
}

/**
 * Load hide content preference
 */
export function loadHidePreference(): boolean {
  return localStorage.getItem(K.HIDE) === '1';
}

/**
 * Save expanded groups
 */
export function saveExpandedGroups(groups: Set<string>): void {
  localStorage.setItem(K.GROUPS, JSON.stringify([...groups]));
}

/**
 * Load expanded groups
 */
export function loadExpandedGroups(): Set<string> {
  const raw = localStorage.getItem(K.GROUPS);
  if (!raw) return new Set();

  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Clear all cache data (logout)
 */
export function clearCache(): void {
  localStorage.removeItem(K.DATA);
  localStorage.removeItem(K.GROUPS);
  localStorage.removeItem(K.PINNED_ORDER);
}
