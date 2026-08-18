import { useStore } from '../../store'

export default function Toast() {
  const t = useStore((s) => s.toast)
  if (!t) return null
  return (
    <div style={{
      position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--espresso)', color: '#fff', padding: '10px 16px', borderRadius: 12,
      fontSize: '.85rem', fontWeight: 600, zIndex: 2000, boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      maxWidth: 'calc(100% - 28px)', textAlign: 'center', pointerEvents: 'none',
    }}>
      {t}
    </div>
  )
}
