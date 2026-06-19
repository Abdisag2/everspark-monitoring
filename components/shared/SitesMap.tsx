'use client';

import dynamic from 'next/dynamic';
import { MapPin } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { parseLatLng, cn } from '@/lib/utils';

// Leaflet touches `window`, so the map renders client-only.
const Inner = dynamic(() => import('./SitesMapInner'), {
  ssr: false,
  loading: () => <div className="h-full grid place-items-center text-sm text-slate-400">Loading map…</div>,
});

export function SitesMap({ className }: { className?: string }) {
  const { getVisibleDevices } = useApp();
  const devices = getVisibleDevices();
  const mapped = devices.filter((d) => (d.latitude != null && d.longitude != null) || parseLatLng(d.location)).length;

  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-50 text-brand-600"><MapPin size={16} /></span>
        <div>
          <h3 className="text-sm font-bold text-ink">Sites Map</h3>
          <p className="text-xs text-slate-400">
            {mapped} of {devices.length} device{devices.length !== 1 ? 's' : ''} geolocated
          </p>
        </div>
      </div>
      {/* `isolate` keeps Leaflet's internal z-indexes from overlapping the app chrome */}
      <div className="h-[360px] isolate relative">
        <Inner />
      </div>
    </div>
  );
}
