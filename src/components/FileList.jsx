import { useRef, useState, useEffect, useCallback } from 'react'
import { FOLDER_COLORS } from '../utils/constants'
import EmptyState from './EmptyState'
import styles from './FileList.module.css'

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','svg'])

function fileEmoji(name, isFolder) {
  if (isFolder) return '📁'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    mp3: '🎵', m4a: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    zip: '📦', gz: '📦', tar: '📦', '7z': '📦', rar: '📦',
    txt: '📃', md: '📃', csv: '📃', json: '📃', xml: '📃',
  }
  return map[ext] || '📎'
}

function thumbClass(name, isFolder) {
  if (isFolder) return styles.thumbFolder
  const ext = name.split('.').pop().toLowerCase()
  if (['mp3','m4a','wav','flac','aac','ogg'].includes(ext)) return styles.thumbAudio
  if (IMAGE_EXTS.has(ext)) return styles.thumbImage
  if (['mp4','mov','avi','mkv','webm','m4v'].includes(ext)) return styles.thumbVideo
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return styles.thumbDoc
  return styles.thumbDefault
}

function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

const itemId = item => item.isFolder ? item.encPrefix : item.key

// ── Thumbnail (lazy-loaded for images in grid view) ──────────────────────────
const thumbCache = new Map()  // key → blob URL (session-scoped)

function Thumbnail({ item, getThumbnail, view }) {
  const [url, setUrl] = useState(() => thumbCache.get(item.key) || null)
  const ref = useRef(null)

  useEffect(() => {
    if (!getThumbnail || view !== 'grid') return
    const ext = item.label.split('.').pop().toLowerCase()
    if (!IMAGE_EXTS.has(ext) || item.isFolder) return
    if (url) return  // already loaded

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      getThumbnail(item).then(blobUrl => {
        if (blobUrl) {
          thumbCache.set(item.key, blobUrl)
          setUrl(blobUrl)
        }
      }).catch(() => {})
    }, { rootMargin: '100px' })

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [item, getThumbnail, view, url])

  const cls = thumbClass(item.label, item.isFolder)

  if (url) {
    return (
      <div ref={ref} className={styles.cardThumb + ' ' + cls}
        style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', fontSize: 0 }}
      />
    )
  }
  return <div ref={ref} className={styles.cardThumb + ' ' + cls}>{fileEmoji(item.label, item.isFolder)}</div>
}

// ── Swipe-to-reveal (list view, touch devices) ───────────────────────────────
function SwipeWrapper({ children, onSwipeStar, onSwipeDelete }) {
  const startX   = useRef(null)
  const [offset, setOffset] = useState(0)
  const THRESHOLD = 60

  function onTouchStart(e) { startX.current = e.touches[0].clientX }

  function onTouchMove(e) {
    if (startX.current === null) return
    const dx = e.touches[0].clientX - startX.current
    if (dx < 0) setOffset(Math.max(dx, -120))
  }

  function onTouchEnd() {
    if (offset <= -THRESHOLD) {
      // keep revealed — tap the action buttons
    } else {
      setOffset(0)
    }
    startX.current = null
  }

  function close() { setOffset(0) }

  return (
    <div className={styles.swipeContainer}>
      <div
        className={styles.swipeContent}
        style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? 'transform 0.2s' : 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
      {offset <= -THRESHOLD && (
        <div className={styles.swipeActions}>
          <button className={styles.swipeBtn + ' ' + styles.swipeStar}
            onClick={() => { onSwipeStar(); close() }}>★</button>
          <button className={styles.swipeBtn + ' ' + styles.swipeDelete}
            onClick={() => { onSwipeDelete(); close() }}>🗑</button>
        </div>
      )}
    </div>
  )
}

// ── FileCard ─────────────────────────────────────────────────────────────────
function FileCard({
  item, view, onOpen, downloading,
  selected, onSelect, onContextMenu,
  isStarred, folderColor,
  getThumbnail, onDelete, onStar,
  allItems, focusedIdx, setFocusedIdx, myIdx,
}) {
  const busy       = !item.isFolder && downloading === item.key
  const id         = itemId(item)
  const isSelected = selected.has(id)
  const colorObj   = folderColor ? FOLDER_COLORS.find(c => c.id === folderColor) : null
  const cardRef    = useRef(null)

  // Keyboard navigation
  function onKeyDown(e) {
    if (e.key === 'Enter')                        { e.preventDefault(); onOpen(item) }
    if (e.key === ' ')                            { e.preventDefault(); onSelect(item) }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete(item) }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const next = allItems[myIdx + 1]
      if (next) { setFocusedIdx(myIdx + 1) }
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = allItems[myIdx - 1]
      if (prev) { setFocusedIdx(myIdx - 1) }
    }
  }

  useEffect(() => {
    if (focusedIdx === myIdx) cardRef.current?.focus()
  }, [focusedIdx, myIdx])

  function handleClick(e) {
    if (e.target.closest('input[type=checkbox]')) return
    if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(item); return }
    setFocusedIdx(myIdx)
    onOpen(item)
  }

  function handleCheck(e) { e.stopPropagation(); onSelect(item) }
  function handleContextMenu(e) { e.preventDefault(); onContextMenu(e, item) }

  if (view === 'list') {
    const card = (
      <div
        ref={cardRef}
        tabIndex={0}
        className={[styles.listItem, busy && styles.busy, isSelected && styles.listSelected].filter(Boolean).join(' ')}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onKeyDown={onKeyDown}
      >
        <input type="checkbox" className={styles.checkbox} checked={isSelected}
          onChange={handleCheck} onClick={e => e.stopPropagation()} />
        {colorObj && item.isFolder && <span className={styles.colorDot} style={{ background: colorObj.hex }} />}
        <span className={styles.listIcon}>{fileEmoji(item.label, item.isFolder)}</span>
        <span className={styles.listName}>{item.label}</span>
        {isStarred && (
          <svg className={styles.starBadge} viewBox="0 0 24 24" fill="#eab308" stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        )}
        {!item.isFolder && (
          <span className={styles.listMeta}>{busy ? 'Decrypting…' : fmtSize(item.size)}</span>
        )}
      </div>
    )

    return (
      <SwipeWrapper onSwipeStar={() => onStar(item)} onSwipeDelete={() => onDelete(item)}>
        {card}
      </SwipeWrapper>
    )
  }

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      className={[styles.card, busy && styles.busy, isSelected && styles.cardSelected].filter(Boolean).join(' ')}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={onKeyDown}
    >
      <input type="checkbox" className={styles.cardCheckbox} checked={isSelected}
        onChange={handleCheck} onClick={e => e.stopPropagation()} />
      {isStarred && <div className={styles.cardStar}>★</div>}
      <Thumbnail item={item} getThumbnail={getThumbnail} view={view} />
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{item.label}</div>
        <div className={styles.cardMeta}>
          {item.isFolder ? ' ' : busy ? 'Decrypting…' : fmtSize(item.size)}
        </div>
      </div>
    </div>
  )
}

// ── FileList ─────────────────────────────────────────────────────────────────
export default function FileList({
  folders, files, view, onOpen, downloading,
  selected, onSelect, onContextMenu,
  starredIds, folderColors,
  emptySection,
  getThumbnail,
  onDelete, onStar,
}) {
  const hasFolders = folders.length > 0
  const hasFiles   = files.length > 0
  const [focusedIdx, setFocusedIdx] = useState(-1)

  const allItems = [...folders, ...files]

  if (!hasFolders && !hasFiles) {
    return <EmptyState section={emptySection || 'home'} />
  }

  const cardProps = (item, idx) => ({
    item, view, onOpen, downloading,
    selected, onSelect, onContextMenu,
    isStarred:   starredIds.has(itemId(item)),
    folderColor: item.isFolder ? (folderColors[item.encPrefix] || null) : null,
    getThumbnail, onDelete, onStar,
    allItems, focusedIdx, setFocusedIdx, myIdx: idx,
  })

  return (
    <div>
      {hasFolders && (
        <>
          <p className={styles.sectionLabel}>Folders</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {folders.map((item, i) => (
              <FileCard key={item.encPrefix} {...cardProps(item, i)} />
            ))}
          </div>
        </>
      )}
      {hasFiles && (
        <>
          <p className={styles.sectionLabel}>Files</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {files.map((item, i) => (
              <FileCard key={item.key} {...cardProps(item, folders.length + i)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
