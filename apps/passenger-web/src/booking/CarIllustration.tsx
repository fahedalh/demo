/** Original side-view vehicle illustrations per category (inline SVG, no external assets). */
const BODY: Record<string, { color: string; roof: string; long?: boolean; tall?: boolean; accent?: string }> = {
  ECONOMY: { color: '#E8E8E8', roof: 'M18 22 L30 12 H58 L70 22' },
  COMFORT: { color: '#C9D3DD', roof: 'M16 22 L29 11 H60 L72 22' },
  PREMIUM: { color: '#1C1C1E', roof: 'M14 22 L28 11 H62 L76 22', long: true },
  XL: { color: '#5B6B7A', roof: 'M12 22 L18 8 H66 L74 22', tall: true },
  BUSINESS: { color: '#0F2A3D', roof: 'M14 22 L28 10 H62 L76 22', long: true },
  ELECTRIC: { color: '#F4F4F4', roof: 'M16 22 L30 11 H58 L72 22', accent: '#06C167' },
};

export function CarIllustration({ code, className }: { code: string; className?: string }) {
  const b = BODY[code] ?? BODY.ECONOMY;
  return (
    <svg viewBox="0 0 90 44" className={className} aria-hidden>
      <ellipse cx="45" cy="38" rx="38" ry="3.2" fill="rgba(0,0,0,.12)" />
      <path d={`${b.roof} Z`} fill={b.color} stroke="rgba(0,0,0,.25)" strokeWidth=".8" />
      <path d="M20 21 L31 13 H44 V21 Z" fill="#9FC3E0" opacity=".85" />
      <path d="M47 21 V13 H57 L66 21 Z" fill="#9FC3E0" opacity=".85" />
      <rect x={b.long ? 4 : 7} y="21" width={b.long ? 82 : 76} height={b.tall ? 14 : 12} rx="6" fill={b.color} stroke="rgba(0,0,0,.25)" strokeWidth=".8" />
      {b.accent && <rect x="10" y="27" width="70" height="2" rx="1" fill={b.accent} />}
      <rect x={b.long ? 80 : 77} y="24" width="5" height="3" rx="1.5" fill="#FFD166" />
      <circle cx="24" cy={b.tall ? 35 : 33} r="6" fill="#222" />
      <circle cx="24" cy={b.tall ? 35 : 33} r="2.6" fill="#bbb" />
      <circle cx="67" cy={b.tall ? 35 : 33} r="6" fill="#222" />
      <circle cx="67" cy={b.tall ? 35 : 33} r="2.6" fill="#bbb" />
    </svg>
  );
}
