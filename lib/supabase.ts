/**
 * Supabase access layer.
 *
 * In production this returns a real @supabase/supabase-js client driven by env
 * vars. With no env configured (the default for this prototype) we expose a
 * lightweight *mock* query builder that mimics the chainable Supabase JS API
 * (`.from().select().eq().order()` …) over the in-memory mock dataset, so the
 * UI behaves identically whether or not a real database is wired up.
 *
 * The live, reactive state used by the dashboard lives in AppContext; this
 * module documents the exact client surface the app would call against a real
 * Supabase project and is what the /api/ingest route uses server-side.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(URL && ANON);

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_client) _client = createClient(URL!, ANON!);
  return _client;
}

/**
 * Server-only admin client (service-role key). Bypasses RLS — used by the
 * /api/ingest route so hardware nodes can write telemetry. Never import this
 * into client components.
 */
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!URL || !SERVICE_KEY) return null;
  if (!_admin) _admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
  return _admin;
}

/* ----------------------------------------------------------------------------
 * Mock query builder — illustrative shape of the queries the dashboard issues.
 * Returns a thenable that resolves to { data, error } just like supabase-js.
 * -------------------------------------------------------------------------- */
type Row = Record<string, any>;

class MockQuery<T extends Row> implements PromiseLike<{ data: T[] | null; error: null }> {
  private rows: T[];
  constructor(rows: T[]) { this.rows = [...rows]; }
  select() { return this; }
  eq(col: keyof T, val: any) { this.rows = this.rows.filter((r) => r[col] === val); return this; }
  in(col: keyof T, vals: any[]) { this.rows = this.rows.filter((r) => vals.includes(r[col])); return this; }
  order(col: keyof T, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? -1 : 1;
    this.rows.sort((a, b) => (a[col] > b[col] ? dir : a[col] < b[col] ? -dir : 0));
    return this;
  }
  limit(n: number) { this.rows = this.rows.slice(0, n); return this; }
  single() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  then<R1 = { data: T[] | null; error: null }, R2 = never>(
    onfulfilled?: ((v: { data: T[] | null; error: null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

export function mockFrom<T extends Row>(rows: T[]) {
  return new MockQuery<T>(rows);
}
