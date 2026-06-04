'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, ShieldCheck, PartyPopper } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { useMounted } from '@/lib/useMounted';
import { EverSparkLogo, EverSparkMark } from '@/components/brand/EverSparkLogo';

export default function WelcomePage() {
  const router = useRouter();
  const mounted = useMounted();

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Supabase parses the invite token from the URL and establishes a session.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setChecking(false); return; }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setEmail(session.user.email ?? null); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) setEmail(data.session.user.email ?? null);
      setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    const supabase = getSupabase();
    if (!supabase) { setError('Auth is not configured.'); return; }
    setBusy(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (upErr) { setError(upErr.message); return; }
    router.replace('/dashboard');
  };

  if (!mounted) return <div className="grid place-items-center h-screen"><EverSparkMark size={48} /></div>;

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden bg-ink">
        <div className="absolute inset-0 opacity-90"
          style={{ background: 'radial-gradient(900px 500px at 20% 0%, rgba(21,177,166,0.35), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(2,132,199,0.30), transparent 55%)' }} />
        <div className="relative"><EverSparkLogo markSize={40} invert tagline="MONITORING" /></div>
        <div className="relative space-y-5">
          <span className="grid place-items-center h-12 w-12 rounded-2xl bg-white/10 ring-1 ring-white/15"><PartyPopper size={24} className="text-brand-300" /></span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">You’re invited to<br />Ever Spark Monitoring.</h1>
          <p className="text-white/70 max-w-md leading-relaxed">Set a password to activate your account and start monitoring your assigned Clara field nodes.</p>
        </div>
        <div className="relative flex items-center gap-2 text-white/50 text-xs"><ShieldCheck size={14} /> Encrypted sessions · Multi-tenant isolation</div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><EverSparkLogo markSize={36} /></div>

          {!isSupabaseConfigured ? (
            <Notice title="Not available in demo mode" body="Invitations require a connected Supabase project." onBack={() => router.replace('/login')} />
          ) : checking ? (
            <div className="flex items-center gap-3 text-slate-500"><EverSparkMark size={28} /> Verifying your invitation…</div>
          ) : !email ? (
            <Notice title="Invalid or expired link" body="This invitation link is no longer valid. Ask an administrator to resend your invite." onBack={() => router.replace('/login')} />
          ) : (
            <>
              <h2 className="text-2xl font-bold text-ink">Welcome aboard 👋</h2>
              <p className="mt-1 text-sm text-slate-500">Set a password for <span className="font-medium text-ink">{email}</span> to finish setting up your account.</p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">New password</span>
                  <div className="relative mt-1.5">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" className="input pl-10 pr-10" />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink rounded cursor-pointer">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Confirm password</span>
                  <div className="relative mt-1.5">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={show ? 'text' : 'password'} required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" className="input pl-10" />
                  </div>
                </label>
                {error && <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600"><AlertCircle size={15} className="shrink-0" /> {error}</div>}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? 'Activating…' : <>Activate account <ArrowRight size={16} /></>}</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  return (
    <div>
      <span className="grid place-items-center h-12 w-12 rounded-2xl bg-slate-100 text-slate-500"><AlertCircle size={22} /></span>
      <h2 className="mt-4 text-2xl font-bold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
      <button onClick={onBack} className="btn-primary w-full py-3 mt-6">Go to sign in</button>
    </div>
  );
}
