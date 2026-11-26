/**
 * Map component on top of Leaflet (no API key needed). Tiles default to CARTO's minimal
 * basemaps (light/dark follow the theme); set VITE_MAP_TILE_URL to use Mapbox/MapTiler/etc.
 * Markers are diffed by id so live driver positions update smoothly without re-creating layers.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { cn } from '../lib/cn';
import { useTheme } from '../lib/theme';

export type MarkerKind = 'pickup' | 'dropoff' | 'car' | 'car-busy' | 'user' | 'pin';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: MarkerKind;
  heading?: number | null;
  label?: string;
  onClick?: () => void;
}

interface Props {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  route?: [number, number][] | null;
  /** A second, dimmer polyline (e.g. driver → pickup). */
  approach?: [number, number][] | null;
  fitTo?: [number, number][] | null;
  fitPadding?: [number, number, number, number]; // top, right, bottom, left (px)
  onMoveEnd?: (center: { lat: number; lng: number }) => void;
  onMapClick?: (p: { lat: number; lng: number }) => void;
  className?: string;
  zoomControl?: boolean;
  followId?: string | null;
}

const ENV_TILES = import.meta.env.VITE_MAP_TILE_URL as string | undefined;
const LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const DARK = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

const carSvg = (busy: boolean) => `
<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="17" cy="18" rx="9" ry="14" fill="rgba(0,0,0,.18)"/>
  <rect x="9" y="3" width="16" height="28" rx="6" fill="${busy ? '#06C167' : '#111'}" stroke="#fff" stroke-width="1.6"/>
  <rect x="11.5" y="8" width="11" height="6" rx="2" fill="#fff" opacity=".85"/>
  <rect x="11.5" y="21" width="11" height="5" rx="2" fill="#fff" opacity=".55"/>
</svg>`;

function iconFor(m: MapMarker): L.DivIcon {
  switch (m.kind) {
    case 'pickup':
      return L.divIcon({
        className: 'masar-marker',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: '<div style="width:22px;height:22px;border-radius:999px;background:#111;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid #fff"><div style="width:6px;height:6px;border-radius:999px;background:#fff"></div></div>',
      });
    case 'dropoff':
      return L.divIcon({
        className: 'masar-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        html: '<div style="width:20px;height:20px;background:#111;display:grid;place-items:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid #fff;border-radius:4px"><div style="width:6px;height:6px;background:#fff"></div></div>',
      });
    case 'user':
      return L.divIcon({
        className: 'masar-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        html: '<div style="position:relative;width:24px;height:24px"><span style="position:absolute;inset:0;border-radius:999px;background:rgba(37,99,235,.35);animation:pulse-ring 1.8s cubic-bezier(.2,.6,.3,1) infinite"></span><span style="position:absolute;inset:5px;border-radius:999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)"></span></div>',
      });
    case 'pin':
      return L.divIcon({
        className: 'masar-marker',
        iconSize: [30, 42],
        iconAnchor: [15, 42],
        html: '<svg width="30" height="42" viewBox="0 0 30 42"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 42 15 42s15-16 15-27.2C30 6.6 23.3 0 15 0z" fill="#111"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>',
      });
    default:
      return L.divIcon({
        className: 'masar-marker masar-animated',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        html: `<div class="masar-car" style="transform:rotate(${m.heading ?? 0}deg)">${carSvg(m.kind === 'car-busy')}</div>`,
      });
  }
}

export function MapView({
  center = [25.2048, 55.2708],
  zoom = 13,
  markers = [],
  route,
  approach,
  fitTo,
  fitPadding = [80, 40, 80, 40],
  onMoveEnd,
  onMapClick,
  className,
  zoomControl = false,
  followId,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layer = useRef<Map<string, L.Marker>>(new Map());
  const routeLine = useRef<L.Polyline | null>(null);
  const routeCasing = useRef<L.Polyline | null>(null);
  const approachLine = useRef<L.Polyline | null>(null);
  const handlers = useRef({ onMoveEnd, onMapClick });
  handlers.current = { onMoveEnd, onMapClick };
  const theme = useTheme((s) => s.theme);

  // Create once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center, zoom, zoomControl: false, attributionControl: true, worldCopyJump: true });
    if (zoomControl) L.control.zoom({ position: 'bottomright' }).addTo(m);
    m.on('moveend', () => {
      const c = m.getCenter();
      handlers.current.onMoveEnd?.({ lat: c.lat, lng: c.lng });
    });
    m.on('click', (e) => handlers.current.onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      layer.current.clear();
      tiles.current = null;
      routeLine.current = routeCasing.current = approachLine.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiles follow the theme.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const dark = document.documentElement.classList.contains('dark');
    const url = ENV_TILES || (dark ? DARK : LIGHT);
    tiles.current?.remove();
    tiles.current = L.tileLayer(url, { attribution: ATTRIBUTION, maxZoom: 19, subdomains: 'abcd', detectRetina: true }).addTo(m);
  }, [theme]);

  // Markers (diffed by id).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const seen = new Set<string>();
    for (const mk of markers) {
      seen.add(mk.id);
      const existing = layer.current.get(mk.id);
      if (existing) {
        existing.setLatLng([mk.lat, mk.lng]);
        const inner = existing.getElement()?.querySelector('.masar-car') as HTMLElement | null;
        if (inner && mk.heading != null) inner.style.transform = `rotate(${mk.heading}deg)`;
        if ((existing as any)._kind !== mk.kind) existing.setIcon(iconFor(mk));
      } else {
        const marker = L.marker([mk.lat, mk.lng], { icon: iconFor(mk), keyboard: false, zIndexOffset: mk.kind.startsWith('car') ? 500 : 1000 });
        (marker as any)._kind = mk.kind;
        if (mk.label) marker.bindTooltip(mk.label, { direction: 'top', offset: [0, -14] });
        if (mk.onClick) marker.on('click', mk.onClick);
        marker.addTo(m);
        layer.current.set(mk.id, marker);
      }
      (layer.current.get(mk.id) as any)._kind = mk.kind;
    }
    for (const [id, marker] of layer.current) {
      if (!seen.has(id)) {
        marker.remove();
        layer.current.delete(id);
      }
    }
    if (followId) {
      const f = markers.find((x) => x.id === followId);
      if (f) m.panTo([f.lat, f.lng], { animate: true, duration: 0.8 });
    }
  }, [markers, followId]);

  // Route polylines.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    routeLine.current?.remove();
    routeCasing.current?.remove();
    routeLine.current = routeCasing.current = null;
    if (route && route.length > 1) {
      const dark = document.documentElement.classList.contains('dark');
      routeCasing.current = L.polyline(route, { color: dark ? '#000' : '#fff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      routeLine.current = L.polyline(route, { color: dark ? '#f2f2f2' : '#111111', weight: 5, lineCap: 'round', lineJoin: 'round' }).addTo(m);
    }
  }, [route, theme]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    approachLine.current?.remove();
    approachLine.current = null;
    if (approach && approach.length > 1) {
      approachLine.current = L.polyline(approach, { color: '#06C167', weight: 5, dashArray: '2 10', lineCap: 'round' }).addTo(m);
    }
  }, [approach]);

  // Fit to points.
  const fitKey = fitTo ? fitTo.map((p) => p.map((n) => n.toFixed(4)).join(',')).join('|') : '';
  useEffect(() => {
    const m = map.current;
    if (!m || !fitTo || fitTo.length === 0) return;
    const [t, r, b, l] = fitPadding;
    if (fitTo.length === 1) m.setView(fitTo[0], Math.max(m.getZoom(), 15), { animate: true });
    else m.fitBounds(L.latLngBounds(fitTo), { paddingTopLeft: [l, t], paddingBottomRight: [r, b], maxZoom: 16, animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, fitPadding.join(',')]);

  return <div ref={el} className={cn('h-full w-full', className)} role="application" aria-label="Map" />;
}

export function useMapCenter(): [number, number] {
  const raw = (import.meta.env.VITE_DEFAULT_CENTER as string | undefined) ?? '25.2048,55.2708';
  const [lat, lng] = raw.split(',').map(Number);
  return [lat || 25.2048, lng || 55.2708];
}
