'use client';

import { useEffect, useState } from 'react';

/**
 * Returns false during SSR and the first client render, true after mount.
 * Used to gate live/time-relative UI so server HTML matches the first client
 * paint — avoiding React hydration mismatches in this real-time dashboard.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
