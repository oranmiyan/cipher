import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './AvatarMenu.module.css'

const IDLE_OPTIONS = [
  { label: '5 minutes',  value: 5  },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour',     value: 60 },
  { label: 'Never',      value: 0  },
]

export default function AvatarMenu({
  keyId, idleMinutes, onIdleChange,
  view, onViewChange,
  onLock, onSignOutForget,
}) {
  const [open, setOpen] = useState(false)
  const btnRef  = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onKey(e)   { if (e.key === 'Escape') setOpen(false) }
    function onDown(e)  {
      if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target))
        setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown) }
  }, [open])

  const shortKey = keyId ? keyId.slice(0, 8) + '…' : '—'

  function menuStyle() {
    const r = btnRef.current?.getBoundingClientRect() || { bottom: 50, right: 50 }
    return { position: 'fixed', top: r.bottom + 8, right: window.innerWidth - r.right, zIndex: 9999 }
  }

  function confirmForget() {
    if (window.confirm('Sign out and forget your saved B2 credentials?')) {
      setOpen(false)
      onSignOutForget()
    }
  }

  return (
    <>
      <button ref={btnRef} className={styles.avatar} onClick={() => setOpen(o => !o)} title="Account">
        MO
      </button>

      {open && createPortal(
        <div ref={menuRef} className={styles.menu} style={menuStyle()}>

          {/* ── Connected as ── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Connected as</div>
            <div className={styles.keyId}>{shortKey}</div>
          </div>

          <div className={styles.divider} />

          {/* ── Preferences ── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Preferences</div>

            <div className={styles.row}>
              <span>Default view</span>
              <div className={styles.segmented}>
                <button
                  className={view === 'grid' ? styles.segActive : ''}
                  onClick={() => onViewChange('grid')}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                  Grid
                </button>
                <button
                  className={view === 'list' ? styles.segActive : ''}
                  onClick={() => onViewChange('list')}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  List
                </button>
              </div>
            </div>

            <div className={styles.row}>
              <span>Auto-lock after</span>
              <select
                className={styles.select}
                value={idleMinutes}
                onChange={e => onIdleChange(Number(e.target.value))}
              >
                {IDLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.divider} />

          {/* ── Session ── */}
          <div className={styles.section}>
            <button className={styles.item} onClick={() => { setOpen(false); onLock() }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
              Lock
            </button>
          </div>

          <div className={styles.divider} />

          {/* ── Danger zone ── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Danger zone</div>
            <button className={styles.item + ' ' + styles.danger} onClick={confirmForget}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out &amp; forget credentials
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
