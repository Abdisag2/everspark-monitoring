'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { EverSparkMark } from '@/components/brand/EverSparkLogo';

/**
 * Entry route. Normally forwards to the dashboard, but if a Supabase auth
 * callback (invite / password-recovery / magic link) lands here — i.e. the
 * URL hash carries an access_token — we forward to /welcome with the hash
 * intact so the user can finish setting their password. This makes the flow
 * resilient even if Supabase falls back to the Site URL root instead of the
 * configured redirect path.
 */
export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      router.replace('/welcome' + hash);
      return;
    }
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="grid place-items-center h-screen">
      <EverSparkMark size={48} />
    </div>
  );
}
