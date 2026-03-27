/**
 * API client for communicating with backend services
 */

import type { DataResponse, Row, PinOrderMetadata } from './types';

/**
 * Generic API fetch wrapper with error handling
 */
export async function apiFetch<T>(
  url: string,
  opts: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> || {}),
    },
    ...opts,
  });

  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((e as any).error || res.statusText);
  }

  return res.json();
}

/**
 * Fetch current user session status
 */
export async function fetchSession(): Promise<{ loggedIn: boolean }> {
  return apiFetch('/api/me');
}

/**
 * Fetch data from the sheet
 */
export async function fetchData(): Promise<DataResponse> {
  return apiFetch('/api/data');
}

/**
 * Add a new row
 */
export async function addRow(
  sheetName: string,
  values: string[],
  rgb: [number, number, number]
): Promise<{ sheetRow: number }> {
  return apiFetch('/api/rows', {
    method: 'POST',
    body: JSON.stringify({ sheetName, values, rgb }),
  });
}

/**
 * Update an existing row
 */
export async function updateRow(
  sheetName: string,
  sheetRow: number,
  values: string[],
  rgb: [number, number, number],
  catChanged: boolean
): Promise<{ ok: boolean }> {
  return apiFetch('/api/rows', {
    method: 'PATCH',
    body: JSON.stringify({ sheetName, sheetRow, values, rgb, catChanged }),
  });
}

/**
 * Delete a row
 */
export async function deleteRow(sheetRow: number): Promise<{ ok: boolean }> {
  return apiFetch('/api/rows', {
    method: 'DELETE',
    body: JSON.stringify({ sheetRow }),
  });
}

/**
 * Save pinned rows order
 */
export async function savePinnedOrder(
  pinnedIds: string[],
  sheetName: string
): Promise<{ ok: boolean }> {
  return apiFetch('/api/pin-order', {
    method: 'PUT',
    body: JSON.stringify({ pinnedIds, sheetName }),
  });
}

/**
 * Load pinned rows order from backend
 */
export async function loadPinnedOrderFromServer(
  sheetName: string
): Promise<string[]> {
  const result = await apiFetch<{ pinnedIds: string[] }>(
    `/api/pin-order?sheetName=${encodeURIComponent(sheetName)}`
  );
  return result.pinnedIds || [];
}
