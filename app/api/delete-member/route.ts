import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Remove a member completely.
 *
 * Deletes the member's Supabase Auth user (auth.users), which cascade-deletes
 * their public.profiles row via the FK `on delete cascade`. Deleting only the
 * profile row — as the browser anon client can — leaves the auth account behind,
 * so the email stays "registered" and re-inviting it fails. The auth user can
 * only be removed with the service-role admin API, which must run server-side.
 *
 * Secured server-side: the caller's session JWT is verified and their role
 * checked, enforcing the same RBAC as the UI — managers may only remove members
 * in their own org and may never remove admins; nobody may remove themselves.
 *
 * Requires the service-role key (server-only). Returns 503 in demo mode.
 */
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 503 });
  }

  // --- Authenticate the caller from their bearer token ---
  const authz = req.headers.get('authorization') ?? '';
  const jwt = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!jwt) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const { data: caller } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', userData.user.id)
    .single();
  if (!caller) return NextResponse.json({ error: 'No profile found for caller' }, { status: 403 });

  // --- Validate input ---
  const body = await req.json().catch(() => ({}));
  const targetId = String(body.id ?? '').trim();
  if (!targetId) return NextResponse.json({ error: 'A member id is required' }, { status: 400 });
  if (targetId === userData.user.id) {
    return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 400 });
  }

  // Look up the target's role/org for the RBAC check (may already be gone).
  const { data: target } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', targetId)
    .single();

  // --- RBAC ---
  if (caller.role === 'admin') {
    // admins may remove any member
  } else if (caller.role === 'manager') {
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    if (target.role === 'admin' || target.organization_id !== caller.organization_id) {
      return NextResponse.json(
        { error: 'Managers can only remove members in their own organization.' },
        { status: 403 },
      );
    }
  } else {
    return NextResponse.json({ error: 'You do not have permission to remove members.' }, { status: 403 });
  }

  // --- Delete the auth user (cascades to profiles) ---
  const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
  if (delErr && !/not.*found/i.test(delErr.message)) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  // Safety net in case the cascade didn't fire (idempotent).
  await admin.from('profiles').delete().eq('id', targetId);

  return NextResponse.json({ ok: true });
}
