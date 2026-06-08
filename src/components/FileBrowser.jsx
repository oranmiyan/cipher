import { useState, useEffect, useCallback, useRef } from 'react'
import { listPrefix, getObjectBytes } from '../b2client'
import { decryptFilename, decryptFileContent } from '../rclone-crypt'
import FileList from './FileList'
import AudioPlayer from './AudioPlayer'
import styles from './FileBrowser.module.css'

export default function FileBrowser({ cryptKeys, onLogout }) {
  const { nameKey, nameTweak, dataKey } = cryptKeys
  const [prefix, setPrefix] = useState('')
  const [breadcrumb, setBreadcrumb] = useState([])
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)
  const [downloading, setDownloading] = useState('')
  const [view, setView] = useState('grid')
  const [activeNav, setActiveNav] = useState('home')
  const [audioTrack, setAudioTrack] = useState(null)
  const searchRef = useRef(null)

  const load = useCallback(async (p) => {
    setItems(null)
    setError('')
    try {
      const { folders, files } = await listPrefix(p)
      const decFolders = await Promise.all(folders.map(async encPfx => {
        const rel = encPfx.slice(p.length).replace(/\/$/, '')
        let label = rel
        try { label = await decryptFilename(rel, nameKey, nameTweak) } catch {}
        return { encPrefix: encPfx, label, isFolder: true }
      }))
      const decFiles = await Promise.all(files.map(async obj => {
        const rel = obj.key.slice(p.length)
        let label = rel
        try { label = await decryptFilename(rel, nameKey, nameTweak) } catch {}
        return { ...obj, label, isFolder: false }
      }))
      setItems([...decFolders, ...decFiles])
    } catch (e) {
      setError(e.message)
    }
  }, [nameKey, nameTweak])

  useEffect(() => { load(prefix) }, [prefix, load])

  function navigate(folder) {
    setBreadcrumb(bc => [...bc, { label: folder.label, prefix: folder.encPrefix }])
    setPrefix(folder.encPrefix)
    setSearch('')
    setActiveNav('home')
  }

  function goTo(idx) {
    if (idx < 0) {
      setBreadcrumb([])
      setPrefix('')
    } else {
      const dest = breadcrumb[idx]
      setBreadcrumb(bc => bc.slice(0, idx + 1))
      setPrefix(dest.prefix)
    }
    setSearch('')
  }

  function goHome() {
    setBreadcrumb([])
    setPrefix('')
    setSearch('')
    setActiveNav('home')
  }

  function closeAudio() {
    if (audioTrack) URL.revokeObjectURL(audioTrack.url)
    setAudioTrack(null)
  }

  function handleNavSearch() {
    setActiveNav('search')
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  async function openFile(item) {
    if (item.isFolder) { navigate(item); return }
    setDownloading(item.key)
    try {
      const buf = await getObjectBytes(item.key)
      const plain = decryptFileContent(buf, dataKey)
      const blob = new Blob([plain])
      const url = URL.createObjectURL(blob)
      const name = item.label
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
      const isPdf = /\.pdf$/i.test(name)
      const isText = /\.(txt|md|csv|json|log|xml|html?)$/i.test(name)
      const isAudio = /\.(mp3|m4a|wav|flac|aac|ogg)$/i.test(name)
      if (isImage || isPdf || isText) {
        setPreview({ url, name, blob, isImage, isPdf, isText })
      } else if (isAudio) {
        if (audioTrack) URL.revokeObjectURL(audioTrack.url)
        setAudioTrack({ url, name })
      } else {
        const a = document.createElement('a')
        a.href = url; a.download = name; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
      }
    } catch (e) {
      setError('Failed to open file: ' + e.message)
    } finally {
      setDownloading('')
    }
  }

  const allFiltered = (items || []).filter(i =>
    !search || i.label.toLowerCase().includes(search.toLowerCase())
  )
  const folders = allFiltered.filter(i => i.isFolder)
  const files = allFiltered.filter(i => !i.isFolder)
  const currentTitle = breadcrumb.length > 0
    ? breadcrumb[breadcrumb.length - 1].label
    : 'Home'

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ── */}
      <nav className={styles.sidebar}>
        <div className={styles.logo}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.logoIcon}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          </svg>
          B2 Backup
        </div>

        <div className={styles.navGroup}>
          <button
            className={styles.navItem + (activeNav === 'home' ? ' ' + styles.navActive : '')}
            onClick={goHome}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Home
          </button>
          <button
            className={styles.navItem + (activeNav === 'search' ? ' ' + styles.navActive : '')}
            onClick={handleNavSearch}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Search
          </button>
        </div>

        <div className={styles.sidebarSpacer} />

        <button className={styles.lockBtn} onClick={onLogout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          Lock
        </button>
      </nav>

      {/* ── Main ── */}
      <div className={styles.main}>

        {/* Top bar */}
        <div className={styles.topbar}>
          <div className={styles.searchWrap}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.searchIcon}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={searchRef}
              className={styles.searchInput}
              placeholder="Search files..."
              value={search}
              onChange={e => { setSearch(e.target.value); setActiveNav('search') }}
            />
          </div>
          <div className={styles.avatar}>MO</div>
        </div>

        {/* Content */}
        <div className={styles.content}>

          {breadcrumb.length > 0 && (
            <nav className={styles.breadcrumb}>
              <button onClick={goHome}>Home</button>
              {breadcrumb.map((b, i) => (
                <span key={i} className={styles.bcSep}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                  <button onClick={() => goTo(i)}>{b.label}</button>
                </span>
              ))}
            </nav>
          )}

          <div className={styles.toolbar}>
            <h2 className={styles.folderTitle}>{currentTitle}</h2>
            <div className={styles.viewToggle}>
              <button
                className={styles.viewBtn + (view === 'grid' ? ' ' + styles.viewActive : '')}
                onClick={() => setView('grid')}
                title="Grid view"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </button>
              <button
                className={styles.viewBtn + (view === 'list' ? ' ' + styles.viewActive : '')}
                onClick={() => setView('list')}
                title="List view"
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                  <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                  <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          {items === null && !error && (
            <div className={styles.loading}>
              <span className={styles.spinner} />
              Loading...
            </div>
          )}

          {items !== null && (
            <FileList
              folders={folders}
              files={files}
              view={view}
              onOpen={openFile}
              downloading={downloading}
            />
          )}
        </div>

        {audioTrack && (
          <AudioPlayer track={audioTrack} onClose={closeAudio} />
        )}

        {/* Bottom nav — mobile only */}
        <nav className={styles.bottomNav}>
          <button
            className={styles.bottomNavItem + (activeNav === 'home' ? ' ' + styles.bottomNavActive : '')}
            onClick={goHome}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Home</span>
          </button>
          <button
            className={styles.bottomNavItem + (activeNav === 'search' ? ' ' + styles.bottomNavActive : '')}
            onClick={handleNavSearch}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>Search</span>
          </button>
          <button className={styles.bottomNavItem} onClick={onLogout}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            <span>Lock</span>
          </button>
        </nav>
      </div>

      {/* ── Preview overlay ── */}
      {preview && (
        <div className={styles.overlay} onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null) }}>
          <div className={styles.previewBox} onClick={e => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <span>{preview.name}</span>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <a href={preview.url} download={preview.name} className={styles.dlBtn}>Download</a>
                <button onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null) }}>Close</button>
              </div>
            </div>
            {preview.isImage && <img src={preview.url} alt={preview.name} className={styles.previewImg} />}
            {preview.isPdf && <iframe src={preview.url} title={preview.name} className={styles.previewFrame} />}
            {preview.isText && <TextViewer blob={preview.blob} />}
          </div>
        </div>
      )}
    </div>
  )
}

function TextViewer({ blob }) {
  const [text, setText] = useState('')
  useEffect(() => { blob.text().then(setText) }, [blob])
  return <pre className={styles.previewText}>{text}</pre>
}
