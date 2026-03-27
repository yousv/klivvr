/**
 * Shared type definitions for the Klivvr Scripts application
 */

/** Category definitions with visual styles */
export interface CategoryDef {
  label: string;
  color: string;
  rgb: [number, number, number];
}

/** Style definition for name lines */
export interface NameStyle {
  size: string;
  weight: string;
  color: string;
}

/** Row data structure */
export interface Row {
  values: string[];
  hex: string | null;
  cat: string;
  sheetRow: number;
  pinned?: boolean;
}

/** API data response */
export interface DataResponse {
  title: string;
  sheetName: string;
  headers: string[];
  rows: Row[];
}

/** Pin order metadata */
export interface PinOrderMetadata {
  pinnedIds: string[];
  order: Record<string, number>;
}

/** Application state */
export interface AppState {
  headers: string[];
  rows: Row[];
  sheetName: string;
  sheetTitle: string;
  editRow: Row | null;
  delRow: Row | null;
  editCat: string;
  loggedIn: boolean;
  writeEnabled: boolean;
  hideContent: boolean;
  openGroups: Set<string>;
  autoExpanded: Set<string>;
  pinnedRows: Row[];
  pinnedOrder: string[];
}

/** Local storage keys */
export interface StorageKeys {
  GROUPS: string;
  DATA: string;
  HIDE: string;
  PINNED_ORDER: string;
}
