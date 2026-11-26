import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Business } from '@/types';

const icon = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:block;width:28px;height:28px;border-radius:9999px 9999px 9999px 0;transform:rotate(-45deg);background:${color};border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.3)"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

function Fit({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function MapView({ items, center, className }: { items: Business[]; center?: [number, number]; className?: string }) {
  const withLoc = items.filter((b) => b.address?.location?.coordinates?.length === 2);
  const points = withLoc.map((b) => [b.address!.location!.coordinates[1], b.address!.location!.coordinates[0]] as [number, number]);
  return (
    <MapContainer center={center ?? points[0] ?? [24.7136, 46.6753]} zoom={11} scrollWheelZoom={false} className={className ?? 'h-[520px] w-full'}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={points} />
      {withLoc.map((b, i) => (
        <Marker key={b._id} position={points[i]} icon={icon(b.branding?.primaryColor ?? '#4f46e5')}>
          <Popup>
            <Link to={`/b/${b.slug}`} className="font-semibold">{b.name}</Link>
            <br />
            {b.address?.city}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
