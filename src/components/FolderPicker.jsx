import { useState, useEffect } from 'react'
import { listPrefix } from '../b2client'
import { decryptFilename } from '../rclone-crypt'
import styles from './FolderPicker.module.css'

export default function FolderPicker({ nameKey, nameTweak, excludePrefix, onSelect, onClose }) {
  const [prefix, setPrefix]       = useState('')
  const [breadcrumb, setBreadcrumb] = useState([])
  const [folders, setFolders]     = useState([])
  const [loading, setLoading]     = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { folders: raw } = await listPrefix(prefix)
        if (cancelled) return
        const dec = await Promise.all(
          raw
            .filter(enc => enc !== '.b2browser/')
            .map(async encPfx => {
              const rel = encPfx.slice(prefix.length).replace(/\/$/, '')
              let label = rel
              try { label = await decryptFilename(rel, nameKey, nameTweak) } catch {}
              return { encPrefix: encPfx, label }
            })
        )
        if (!cancelled) setFolders(dec)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [prefix, nameKey, nameTweak])

  function enter(folder) {
    setBreadcrumb(bc => [...bc, { label: folder.label, prefix }])
    setPrefix(folder.encPrefix)
  }

  function goTo(idx) {
    const dest = breadcrumb[idx]
    setBreadcrumb(bc => bc.slice(0, idx + 1))
    setPrefix(dest.prefix)
  }

  function goRoot() {
    setBreadcrumb([])
    setPrefix('')
  }

  const canMoveHere = prefix !== excludePrefix

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <span className={styles.title}>Move to…</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Breadcrumb */}
        <div className={styles.breadcrumb}>
          <button onClick={goRoot} className={styles.bcBtn}>Home</button>
          {breadcrumb.map((b, i) => (
            <span key={i} className={styles.bcSep}>
              <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <button className={styles.bcBtn} onClick={() => goTo(i)}>{b.label}</button>
            </span>
          ))}
        </div>

        {/* Folder list */}
        <div className={styles.list}>
          {loading && <div className={styles.loading}><span className={styles.spinner}/>Loading…</div>}
          {!loading && folders.length === 0 && (
            <p className={styles.empty}>No subfolders here</p>
          )}
          {!loading && folders.map(f => (
            <button
              key={f.encPrefix}
              className={styles.folder + (f.encPrefix === excludePrefix ? ' ' + styles.disabled : '')}
              onClick={() => f.encPrefix !== excludePrefix && enter(f)}
              disabled={f.encPrefix === excludePrefix}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
              </svg>
              {f.label}
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto', opacity: 0.4 }}>
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          ))}
        </div>

        <div className={styles.footer}>
          <span className={styles.dest}>
            Move to: <strong>{breadcrumb.length ? breadcrumb[breadcrumb.length - 1].label : 'Home'}</strong>
          </span>
          <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            className={styles.moveBtn}
            disabled={!canMoveHere}
            onClick={() => canMoveHere && onSelect(prefix)}
          >
            Move here
          </button>
        </div>
      </div>
    </div>
  )
}
