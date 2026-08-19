import { ICON, activeDistrictCount } from '../../lib/habita'

export default function Icon({ name, size = 18, fill = 'none', stroke = 'currentColor', w = 1.7, style }) {
  const path = ICON[name] || name
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
      strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={path} />
    </svg>
  )
}

export function Logo({ size = 34 }) {
  return (
    <div className="hb-logo">
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="var(--clay)" />
        <path d="M11 21 L20 12 L29 21" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        <rect x="16.4" y="21.4" width="7.2" height="7.6" rx="1.4" fill="#fff" />
        <circle cx="20" cy="25.2" r="1" fill="var(--clay)" />
      </svg>
      <div className="hb-logo-txt">
        <span className="hb-wordmark">Habita</span>
        <span className="hb-sub">Lima · {activeDistrictCount} distritos</span>
      </div>
    </div>
  )
}
