import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { FOLDER_COLORS } from '../utils/constants'
import styles from './ContextMenu.module.css'

export default function ContextMenu({
  x, y, item, isStarred, folderColor,
  onClose, onOpen, onDownload, onStar, onDetail, onRename, onVersions, onDelete, onSetColor,
}) {
  const ref = useRef(null)

  useEffect(() => {
    function onMouse(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function onKey(e)   { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onMouse)
    document.addEventListener('keydown',   onKey)
    return () => {
      document.removeEventListener('mousedown', onMouse)
      document.removeEventListener('keydown',   onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth  - 196)
  const top  = Math.min(y, window.innerHeight - 300)

  return createPortal(
    <div ref={ref} className={styles.menu} style={{ left, top }}>
      <button className={styles.item} onClick={() => { onOpen(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Open
      </button>

      {!item.isFolder && (
        <button className={styles.item} onClick={() => { onDownload(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </button>
      )}

      <div className={styles.divider} />

      <button className={styles.item} onClick={() => { onStar(); onClose() }}>
        <svg viewBox="0 0 24 24" fill={isStarred ? '#eab308' : 'none'} stroke={isStarred ? '#eab308' : 'currentColor'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        {isStarred ? 'Remove star' : 'Star'}
      </button>

      <button className={styles.item} onClick={() => { onDetail(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        Details
      </button>

      <button className={styles.item} onClick={() => { onRename(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Rename
      </button>

      {!item.isFolder && (
        <button className={styles.item} onClick={() => { onVersions(); onClose() }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
          </svg>
          Version history
        </button>
      )}

      {item.isFolder && (
        <>
          <div className={styles.divider} />
          <div className={styles.colorRow}>
            <span className={styles.colorLabel}>Folder colour</span>
            <div className={styles.swatches}>
              {folderColor && (
                <button
                  className={styles.swatch}
                  style={{ background: '#3a3b3d', fontSize: 10, color: '#aaa' }}
                  title="Clear colour"
                  onClick={() => { onSetColor(null); onClose() }}
                >✕</button>
              )}
              {FOLDER_COLORS.map(c => (
                <button
                  key={c.id}
                  className={styles.swatch + (folderColor === c.id ? ' ' + styles.swatchActive : '')}
                  style={{ background: c.hex }}
                  title={c.id}
                  onClick={() => { onSetColor(c.id); onClose() }}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <div className={styles.divider} />

      <button className={styles.item + ' ' + styles.danger} onClick={() => { onDelete(); onClose() }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>
        Delete
      </button>
    </div>,
    document.body
  )
}
