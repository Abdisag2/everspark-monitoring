'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, ShieldCheck, Shield, Briefcase,
  AlertCircle, CheckCircle2, KeyRound, MailCheck,
} from 'lucide-react';
import { useApp, DEMO_PASSWORD } from '@/context/AppContext';
import { useMounted } from '@/lib/useMounted';
import { EverSparkLogo, EverSparkMark } from '@/components/brand/EverSparkLogo';
import { isSupabaseConfigured } from '@/lib/supabase';

type View = 'login' | 'forgot' | 'reset' | 'sent';

const QUICK = [
  { role: 'Admin',   email: 'admin@eversparktech.com', icon: Shield,    color: 'text-violet-600' },
  { role: 'Manager', email: 'g.tadesse@aaws.gov.et',   icon: Briefcase, color: 'text-accent-600' },
  { role: 'Viewer',  email: 'a.bekele@aaws.gov.et',    icon: Eye,       color: 'text-emerald-600' },
];

export default function LoginPage() {
  const { authUser, authReady, login, requestPasswordReset, resetPassword } = useApp();
  const router = useRouter();
  const mounted = useMounted();

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authReady && authUser) router.replace('/dashboard');
  }, [authReady, authUser, router]);

  const goto = (v: View) => { setView(v); setError(''); };

  const submitLogin = async (mail: string, pass: string) => {
    setError(''); setInfo(''); setBusy(true);
    const res = await login(mail, pass);
    setBusy(false);
    if (res.ok) router.replace('/dashboard');
    else setError(res.error ?? 'Sign-in failed');
  };

  const onLogin = (e: React.FormEvent) => { e.preventDefault(); submitLogin(email, password); };
  const quickLogin = (mail: string) => { setEmail(mail); setPassword(DEMO_PASSWORD); submitLogin(mail, DEMO_PASSWORD); };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not start reset'); return; }
    // Real Supabase emails a link; demo lets you set a new password inline.
    if (isSupabaseConfigured) goto('sent');
    else { setNewPw(''); setConfirmPw(''); goto('reset'); }
  };

  const onReset = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setBusy(true);
    const res = await resetPassword(email, newPw);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'Could not reset password'); return; }
    setPassword(''); setInfo('Password updated. Sign in with your new password.'); goto('login');
  };

  if (!mounted) return <div className="grid place-items-center h-screen"><EverSparkMark size={48} /></div>;

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden bg-ink">
        <div className="absolute inset-0 opacity-90"
          style={{ background: 'radial-gradient(900px 500px at 20% 0%, rgba(21,177,166,0.35), transparent 60%), radial-gradient(700px 500px at 100% 100%, rgba(2,132,199,0.30), transparent 55%)' }} />
        <div className="relative"><EverSparkLogo markSize={40} invert tagline="MONITORING" /></div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Real-time visibility<br />for every field node.</h1>
          <p className="text-white/70 max-w-md leading-relaxed">
            Multi-tenant monitoring for Clara chlorine-production systems — live telemetry,
            production alarms, and role-based access across all your organizations.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-2">
            {['Live telemetry', 'Production alarms', 'Row-level security', 'CSV export'].map((t) => (
              <span key={t} className="chip bg-white/10 text-white/80 ring-1 ring-white/15">{t}</span>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-white/50 text-xs">
          <ShieldCheck size={14} /> Encrypted sessions · Multi-tenant isolation
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><EverSparkLogo markSize={36} /></div>

          {/* ---------- SIGN IN ---------- */}
          {view === 'login' && (
            <>
              <h2 className="text-2xl font-bold text-ink">Welcome back</h2>
              <p className="mt-1 text-sm text-slate-500">Sign in to your Ever Spark Monitoring workspace.</p>

              {info && (
                <div className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 animate-scale-in">
                  <CheckCircle2 size={15} className="shrink-0" /> {info}
                </div>
              )}

              <form onSubmit={onLogin} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <div className="relative mt-1.5">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organization.gov.et" className="input pl-10" />
                  </div>
                </label>

                <label className="block">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <button type="button" onClick={() => { setInfo(''); goto('forgot'); }} className="text-xs font-semibold text-brand-600 hover:text-brand-700 cursor-pointer">Forgot password?</button>
                  </div>
                  <div className="relative mt-1.5">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="input pl-10 pr-10" />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink rounded cursor-pointer" aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>

                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600 animate-scale-in">
                    <AlertCircle size={15} className="shrink-0" /> {error}
                  </div>
                )}

                <button type="submit" disabled={busy} className="btn-primary w-full py-3">
                  {busy ? 'Signing in…' : <>Sign in <ArrowRight size={16} /></>}
                </button>
              </form>

              {!isSupabaseConfigured && (
                <div className="mt-7 pt-6 border-t border-slate-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center">Demo quick sign-in</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {QUICK.map(({ role, email: mail, icon: Icon, color }) => (
                      <button key={role} onClick={() => quickLogin(mail)} disabled={busy}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 py-3 hover:border-brand-300 hover:bg-brand-50/40 transition-colors cursor-pointer disabled:opacity-50">
                        <Icon size={18} className={color} />
                        <span className="text-xs font-semibold text-ink">{role}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-xs text-slate-400">
                    Password for all demo accounts: <code className="font-mono text-slate-500">{DEMO_PASSWORD}</code>
                  </p>
                </div>
              )}
            </>
          )}

          {/* ---------- FORGOT (enter email) ---------- */}
          {view === 'forgot' && (
            <>
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60"><KeyRound size={22} /></span>
              <h2 className="mt-4 text-2xl font-bold text-ink">Reset your password</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isSupabaseConfigured
                  ? 'Enter your email and we’ll send you a reset link.'
                  : 'Enter your account email to set a new password.'}
              </p>
              <form onSubmit={onForgot} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Email</span>
                  <div className="relative mt-1.5">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@organization.gov.et" className="input pl-10" />
                  </div>
                </label>
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600 animate-scale-in">
                    <AlertCircle size={15} className="shrink-0" /> {error}
                  </div>
                )}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? 'Please wait…' : 'Continue'}</button>
              </form>
              <button onClick={() => goto('login')} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink cursor-pointer"><ArrowLeft size={15} /> Back to sign in</button>
            </>
          )}

          {/* ---------- RESET (set new password — demo) ---------- */}
          {view === 'reset' && (
            <>
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-brand-50 text-brand-600 ring-4 ring-brand-50/60"><Lock size={22} /></span>
              <h2 className="mt-4 text-2xl font-bold text-ink">Set a new password</h2>
              <p className="mt-1 text-sm text-slate-500">for <span className="font-medium text-ink">{email}</span></p>
              <form onSubmit={onReset} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">New password</span>
                  <div className="relative mt-1.5">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={show ? 'text' : 'password'} required value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 6 characters" className="input pl-10 pr-10" />
                    <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-ink rounded cursor-pointer">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                  </div>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Confirm password</span>
                  <div className="relative mt-1.5">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type={show ? 'text' : 'password'} required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Re-enter new password" className="input pl-10" />
                  </div>
                </label>
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-600 animate-scale-in">
                    <AlertCircle size={15} className="shrink-0" /> {error}
                  </div>
                )}
                <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? 'Updating…' : 'Update password'}</button>
              </form>
              <button onClick={() => goto('login')} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-ink cursor-pointer"><ArrowLeft size={15} /> Back to sign in</button>
            </>
          )}

          {/* ---------- SENT (real Supabase email) ---------- */}
          {view === 'sent' && (
            <>
              <span className="grid place-items-center h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/60"><MailCheck size={22} /></span>
              <h2 className="mt-4 text-2xl font-bold text-ink">Check your email</h2>
              <p className="mt-1 text-sm text-slate-500">We’ve sent a password reset link to <span className="font-medium text-ink">{email}</span>. Follow it to choose a new password.</p>
              <button onClick={() => goto('login')} className="btn-primary w-full py-3 mt-6"><ArrowLeft size={16} /> Back to sign in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
