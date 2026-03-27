/**
 * Category definitions and utilities
 */

import type { CategoryDef, NameStyle } from './types';

export const CAT: Record<string, CategoryDef> = {
  Available: { label: 'Available', color: '#8F76D8', rgb: [143, 118, 216] },
  General: { label: 'General', color: '#63BBF4', rgb: [99, 187, 244] },
  Unavailable: { label: 'Unavailable', color: '#E36C73', rgb: [227, 108, 115] },
  Other: { label: 'Other', color: '#787878', rgb: [120, 120, 120] },
};

export const CAT_ORDER = ['Available', 'General', 'Unavailable', 'Other'];

export const NAME_STYLES: NameStyle[] = [
  { size: '14px', weight: '600', color: '#ffffff' },
  { size: '12px', weight: '400', color: '#c4b5fd' },
  { size: '12px', weight: '400', color: '#ef9a9a' },
  { size: '11px', weight: '400', color: '#6ee7b7' },
];

/**
 * Detect category based on hex color
 */
export function detectCat(hex: string | null): string {
  if (!hex) return 'General';

  try {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;

    if (!d || d / (l > 0.5 ? 2 - max - min : max + min) < 0.1) return 'Other';

    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;

    h *= 360;

    if (h < 20 || h >= 330) return 'Unavailable';
    if (h >= 245 && h < 330) return 'Available';
    if (h >= 170 && h < 245) return 'General';
    return 'Other';
  } catch {
    return 'Other';
  }
}

/**
 * Convert RGB array to hex string
 */
export function rgbToHex(rgb: [number, number, number]): string {
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

/**
 * Get RGB from category name
 */
export function getCategoryRgb(catName: string): [number, number, number] {
  return CAT[catName]?.rgb || CAT.Other.rgb;
}

/**
 * Measure the width needed for name display
 */
export function measureNameWidth(rows: any[]): number {
  const probe = document.createElement('span');
  probe.style.cssText =
    'position:fixed;visibility:hidden;white-space:nowrap;top:-999px;left:-999px;font-family:"Geist Mono","Geist",monospace;';
  document.body.appendChild(probe);

  let maxW = 0;
  rows.forEach(row => {
    const lines = (row.values[0] || '').split('\n').filter((l: string) => l.trim());
    (lines.length ? lines : ['—']).forEach((line: string, li: number) => {
      const st = NAME_STYLES[Math.min(li, NAME_STYLES.length - 1)];
      probe.style.fontSize = st.size;
      probe.style.fontWeight = st.weight;
      probe.textContent = line;
      maxW = Math.max(maxW, probe.getBoundingClientRect().width);
    });
  });

  document.body.removeChild(probe);
  return Math.min(Math.max(Math.ceil(maxW) + 22, 80), 260);
}
