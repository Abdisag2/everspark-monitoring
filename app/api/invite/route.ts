import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Invite a new member by email.
 *
 * Sends a Supabase Auth invitation email (magic link → /welcome where the
 * invitee sets a password). Secured server-side: the caller's session JWT is
 * verified and their role checked, enforcing the same RBAC as the UI —
 * managers may only invite into their own org and may never create admins.
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
  let email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  let role = String(body.role ?? 'viewer');
  let organization_id: string | null = body.organization_id ?? null;

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  if (!['admin', 'manager', 'viewer'].includes(role)) role = 'viewer';

  // --- RBAC ---
  if (caller.role === 'admin') {
    // admins may invite any role into any org
  } else if (caller.role === 'manager') {
    if (role === 'admin') {
      return NextResponse.json({ error: 'Managers cannot invite admins.' }, { status: 403 });
    }
    organization_id = caller.organization_id; // force into the manager's own org
  } else {
    return NextResponse.json({ error: 'You do not have permission to invite members.' }, { status: 403 });
  }
  if (role === 'admin') organization_id = null;

  // --- Send the invitation email ---
  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role, organization_id },
    redirectTo: `${origin}/welcome`,
  });

  if (inviteErr || !invited.user) {
    const msg = inviteErr?.message ?? 'Failed to send invitation';
    const already = /registered|already/i.test(msg);
    return NextResponse.json({ error: already ? 'That email is already a member.' : msg }, { status: 400 });
  }

  // --- Ensure the profile reflects the requested role/org ---
  // (the on-signup trigger creates a default viewer/null-org row; overwrite it)
  const { error: profErr } = await admin.from('profiles').upsert(
    { id: invited.user.id, email, name: name || email, role, organization_id, is_active: true },
    { onConflict: 'id' },
  );
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, email, role });
}
