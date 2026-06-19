'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from 'react-leaflet';
import { useApp } from '@/context/AppContext';
import { parseLatLng, googleMapsUrl, timeAgo } from '@/lib/utils';
import type { Device } from '@/lib/types';

type Site = { device: Device; lat: number; lng: number };

function coordsOf(d: Device): { lat: number; lng: number } | null {
  if (d.latitude != null && d.longitude != null) return { lat: d.latitude, lng: d.longitude };
  return parseLatLng(d.location);
}

/** Pans/zooms the map to fit all markers whenever they change. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 11); return; }
    map.fitBounds(points, { padding: [40, 40], maxZoom: 12 });
  }, [map, points]);
  return null;
}

export default function SitesMapInner() {
  const { getVisibleDevices } = useApp();
  const devices = getVisibleDevices();

  const sites = useMemo<Site[]>(() => {
    const out: Site[] = [];
    for (const d of devices) {
      const c = coordsOf(d);
      if (c) out.push({ device: d, lat: c.lat, lng: c.lng });
    }
    return out;
  }, [devices]);

  const points = sites.map((s) => [s.lat, s.lng] as [number, number]);

  return (
    <MapContainer
      center={[9.1, 40.0]}            // default: Ethiopia/Horn of Africa
      zoom={5}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {sites.map(({ device: d, lat, lng }) => {
        const online = d.status === 'online';
        return (
          <CircleMarker
            key={d.id}
            center={[lat, lng]}
            radius={9}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: online ? '#15b1a6' : '#94a3b8',
              fillOpacity: 0.9,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{d.name}</Tooltip>
            <Popup>
              <div style={{ minWidth: 170 }}>
                <strong>{d.name}</strong>
                <div style={{ fontSize: 12, color: online ? '#059669' : '#64748b', marginTop: 2 }}>
                  {online ? '● Online' : '○ Offline'} · {timeAgo(d.last_seen)}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>
                  {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
                <a href={googleMapsUrl(lat, lng)} target="_blank" rel="noreferrer"
                   style={{ fontSize: 12, color: '#0d8e87', fontWeight: 600, display: 'inline-block', marginTop: 6 }}>
                  Open in Google Maps ↗
                </a>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
