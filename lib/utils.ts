import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Generate a device secret_token in the style flashed onto the SIM800L node. */
export function generateToken(): string {
  const hex = '0123456789abcdef';
  let out = 'es_';
  for (let i = 0; i < 32; i++) out += hex[Math.floor(Math.random() * 16)];
  return out;
}

export interface ParsedFrame {
  flow_rate: number;
  voltage: number;
  level_sensor_1: 0 | 1;
  level_sensor_2: 0 | 1;
  level_sensor_3: 0 | 1;
  naclo_pumped: number;
  target_frc: number;
  active_chlorine: number;
  ph_value: number;
}

/**
 * Parse the Clara wire frame: ;P1,P2,P3,P4,P5,P6,P7,P8,P9:
 *   ";" prefix, ":" suffix, "," separators.
 * Returns null on any structural error.
 */
export function parseDataString(raw: string): ParsedFrame | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s.startsWith(';') || !s.endsWith(':')) return null;
  const parts = s.slice(1, -1).split(',').map((p) => p.trim());
  if (parts.length !== 9) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return null;
  const bit = (n: number): 0 | 1 => (n >= 0.5 ? 1 : 0);
  return {
    flow_rate: nums[0],
    voltage: nums[1],
    level_sensor_1: bit(nums[2]),
    level_sensor_2: bit(nums[3]),
    level_sensor_3: bit(nums[4]),
    naclo_pumped: nums[5],
    target_frc: nums[6],
    active_chlorine: nums[7],
    ph_value: nums[8],
  };
}

/** Build the ;...: frame from a parsed-like object. */
export function buildDataString(f: ParsedFrame): string {
  return `;${f.flow_rate.toFixed(1)},${f.voltage.toFixed(1)},${f.level_sensor_1},${f.level_sensor_2},${f.level_sensor_3},${f.naclo_pumped.toFixed(1)},${f.target_frc.toFixed(1)},${f.active_chlorine.toFixed(1)},${f.ph_value.toFixed(1)}:`;
}

const RANGE_MS: Record<string, number> = {
  '6h': 6 * 3600e3,
  '24h': 24 * 3600e3,
  '7d': 7 * 86400e3,
  '30d': 30 * 86400e3,
};

export function rangeStart(range: string): number {
  return Date.now() - (RANGE_MS[range] ?? RANGE_MS['24h']);
}

/** Relative "time ago" label, no external deps. */
export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

/**
 * Extract { lat, lng } from raw GPS coords or a Google Maps URL.
 * Handles: "9.03, 38.74", ".../@9.03,38.74,15z", "?q=9.03,38.74",
 * "!3d9.03!4d38.74", and a generic "lat,lng" anywhere in the string.
 * (Shortened maps.app.goo.gl links can't be resolved client-side → null.)
 */
export function parseLatLng(input: string | null | undefined): { lat: number; lng: number } | null {
  if (!input) return null;
  const s = String(input).trim();
  const ok = (a: string, b: string) => {
    const lat = parseFloat(a), lng = parseFloat(b);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng };
    }
    return null;
  };
  const patterns: RegExp[] = [
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,                          // "lat,lng"
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                                          // /@lat,lng
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,                                      // place data
    /[?&](?:q|query|ll|sll|destination|center)=(-?\d+\.\d+),(-?\d+\.\d+)/, // url params
    /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,                             // generic fallback
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) { const r = ok(m[1], m[2]); if (r) return r; }
  }
  return null;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Stable-ish color for an avatar/badge from a string seed. */
export function seedColor(seed: string): string {
  const palette = ['#0d8e87', '#0284c7', '#7c3aed', '#db2777', '#d97706', '#059669', '#4f46e5'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
