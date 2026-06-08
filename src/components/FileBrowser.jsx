import { useState, useEffect, useCallback, useRef } from 'react'
import { listPrefix, listAllObjects, getObjectBytes, getMetaObject, deleteObject, putObject, uploadWithProgress, copyAndDelete } from '../b2client'
import { decryptFilename, decryptFileContent, encryptFilename, encryptFileContent, encryptMeta, decryptMeta } from '../rclone-crypt'
import { useB2Storage } from '../hooks/useB2Storage'
import AvatarMenu from './AvatarMenu'
import FileList from './FileList'
import AudioPlayer from './AudioPlayer'
import VideoPlayer from './VideoPlayer'
import ContextMenu from './ContextMenu'
import DetailPanel from './DetailPanel'
import VersionHistory from './VersionHistory'
import EmptyState from './EmptyState'
import FolderPicker from './FolderPicker'
import styles from './FileBrowser.module.css'

const FILTER_EXTS = {
  images:   ['png','jpg','jpeg','gif','webp','svg'],
  videos:   ['mp4','mov','avi','mkv','webm','m4v'],
  audio:    ['mp3','m4a','wav','flac','aac','ogg'],
  docs:     ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','md','csv'],
  archives: ['zip','gz','tar','7z','rar'],
}
const FILTERS     = ['all','folders','images','videos','audio','docs','archives']
const SORT_FIELDS = [{ field: 'name', label: 'Name' }, { field: 'size', label: 'Size' }, { field: 'date', label: 'Date' }]

const itemId = item => item.isFolder ? item.encPrefix : item.key

function sortItems(arr, { field, dir }) {
  return [...arr].sort((a, b) => {
    let va, vb
    if (field === 'name') { va = a.label.toLowerCase(); vb = b.label.toLowerCase() }
    if (field === 'size') { va = a.size || 0; vb = b.size || 0 }
    if (field === 'date') { va = a.lastModified ? new Date(a.lastModified).getTime() : 0; vb = b.lastModified ? new Date(b.lastModified).getTime() : 0 }
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })
}

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function FileBrowser({ cryptKeys, keyId, onLogout, onSignOutForget }) {
  const { nameKey, nameTweak, dataKey } = cryptKeys

  // Navigation
  const [prefix, setPrefix]           = useState('')
  const [breadcrumb, setBreadcrumb]   = useState([])
  const [items, setItems]             = useState(null)
  const [error, setError]             = useState('')
  const [activeSection, setActiveSection] = useState('home')

  // UI
  const [search, setSearch]   = useState('')
  const [sort, setSort]       = useState({ field: 'name', dir: 'asc' })
  const [filter, setFilter]   = useState('all')

  // Persisted preferences (view + idle timeout) — stored in B2
  const [prefs, setPrefs] = useB2Storage('prefs', { defaultView: 'grid', idleMinutes: 15 }, dataKey)
  const view        = prefs.defaultView || 'grid'
  const idleMinutes = prefs.idleMinutes ?? 15
  const setView     = val => setPrefs(p => ({ ...p, defaultView: val }))
  const setIdleMinutes = val => setPrefs(p => ({ ...p, idleMinutes: val }))

  // Media
  const [audioTrack, setAudioTrack]   = useState(null)
  const [videoTrack, setVideoTrack]   = useState(null)
  const [downloading, setDownloading] = useState('')

  // Selection & overlays
  const [selected, setSelected]         = useState(new Set())
  const [preview, setPreview]           = useState(null)
  const [contextMenu, setContextMenu]   = useState(null)
  const [detailItem, setDetailItem]     = useState(null)
  const [versionItem, setVersionItem]   = useState(null)
  const [moveItem, setMoveItem]         = useState(null)

  // Drag-and-drop
  const [isDragging, setIsDragging]     = useState(false)

  // Offline
  const [isOffline, setIsOffline]       = useState(!navigator.onLine)

  // Persistent search index (loaded from B2 on mount)
  const [searchIndexBuiltAt, setSearchIndexBuiltAt] = useState(null)
  const [searchDateFrom, setSearchDateFrom] = useState('')
  const [searchDateTo, setSearchDateTo]     = useState('')
  const [searchSizeRange, setSearchSizeRange] = useState('any')

  // Persistent — stored as encrypted JSON files in B2 (survive cache clears, work across devices)
  const [starred,      setStarred]      = useB2Storage('starred',      [], dataKey)
  const [recent,       setRecent]       = useB2Storage('recent',       [], dataKey)
  const [folderColors, setFolderColors] = useB2Storage('folderColors', {}, dataKey)
  const [trash,        setTrash]        = useB2Storage('trash',        [], dataKey)

  // Global search index
  const [searchIndex, setSearchIndex]     = useState(null)
  const [searchIndexing, setSearchIndexing] = useState(false)
  const [indexProgress, setIndexProgress]   = useState(0)

  // Upload state
  const [uploads, setUploads] = useState([])  // [{ name, status }]

  const searchRef  = useRef(null)
  const uploadRef  = useRef(null)
  const starredIds = new Set(starred.map(i => itemId(i)))
  const trashIds   = new Set(trash.map(i => itemId(i)))

  const load = useCallback(async (p) => {
    setItems(null)
    setError('')
    setSelected(new Set())
    try {
      const { folders, files } = await listPrefix(p)
      const decFolders = await Promise.all(folders.filter(encPfx => encPfx !== '.b2browser/').map(async encPfx => {
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

  // Auto-lock after idle (configurable, 0 = never)
  useEffect(() => {
    if (!idleMinutes) return
    const IDLE_MS = idleMinutes * 60 * 1000
    let timer = setTimeout(onLogout, IDLE_MS)
    const reset = () => { clearTimeout(timer); timer = setTimeout(onLogout, IDLE_MS) }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [onLogout, idleMinutes])

  // Online/offline detection
  useEffect(() => {
    const onOnline  = () => setIsOffline(false)
    const onOffline = () => setIsOffline(true)
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [])

  // Load persistent search index from B2 on mount
  useEffect(() => {
    let cancelled = false
    async function loadIndex() {
      try {
        const bytes = await getMetaObject('.b2browser/searchIndex.json')
        if (cancelled || !bytes) return
        const data = decryptMeta(bytes, dataKey)
        if (data?.entries && !cancelled) {
          setSearchIndex(data.entries)
          setSearchIndexBuiltAt(data.builtAt || null)
        }
      } catch {}
    }
    loadIndex()
    return () => { cancelled = true }
  }, [dataKey])

  // Lock after tab is hidden for 3 minutes (screen lock, app switch)
  useEffect(() => {
    let hiddenTimer = null
    function onVisibility() {
      if (document.hidden) {
        hiddenTimer = setTimeout(onLogout, 3 * 60 * 1000)
      } else {
        clearTimeout(hiddenTimer)
        hiddenTimer = null
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { document.removeEventListener('visibilitychange', onVisibility); clearTimeout(hiddenTimer) }
  }, [onLogout])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setContextMenu(null)
        setSelected(new Set())
        setDetailItem(null)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && activeSection === 'home') {
        e.preventDefault()
        setSelected(new Set((items || []).map(itemId)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, activeSection])

  function navigate(folder) {
    setBreadcrumb(bc => [...bc, { label: folder.label, prefix: folder.encPrefix }])
    setPrefix(folder.encPrefix)
    setSearch('')
    setFilter('all')
    setActiveSection('home')
  }

  function goTo(idx) {
    const dest = breadcrumb[idx]
    setBreadcrumb(bc => bc.slice(0, idx + 1))
    setPrefix(dest.prefix)
    setSearch('')
    setFilter('all')
  }

  function goHome() {
    setBreadcrumb([])
    setPrefix('')
    setSearch('')
    setFilter('all')
    setActiveSection('home')
  }

  function addToRecent(item) {
    setRecent(prev => {
      const id = itemId(item)
      const without = prev.filter(r => itemId(r) !== id)
      return [{ ...item, openedAt: Date.now() }, ...without].slice(0, 20)
    })
  }

  async function openFile(item) {
    if (item.isFolder) { navigate(item); return }
    addToRecent(item)
    const name = item.label
    if (/\.(mp4|m4v|mov)$/i.test(name)) {
      setVideoTrack({ key: item.key, name, encSize: item.size })
      return
    }
    setDownloading(item.key)
    try {
      const buf   = await getObjectBytes(item.key)
      const plain = decryptFileContent(buf, dataKey)
      const blob  = new Blob([plain])
      const url   = URL.createObjectURL(blob)
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
      const isPdf   = /\.pdf$/i.test(name)
      const isText  = /\.(txt|md|csv|json|log|xml|html?)$/i.test(name)
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

  async function downloadFile(item) {
    if (item.isFolder) return
    setDownloading(item.key)
    try {
      const buf   = await getObjectBytes(item.key)
      const plain = decryptFileContent(buf, dataKey)
      const blob  = new Blob([plain])
      const url   = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = item.label; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) {
      setError('Failed to download: ' + e.message)
    } finally {
      setDownloading('')
    }
  }

  function handleSelect(item) {
    const id = itemId(item)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleContextMenu(e, item) {
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  function toggleStar(item) {
    const id = itemId(item)
    setStarred(prev => {
      const has = prev.some(i => itemId(i) === id)
      if (has) return prev.filter(i => itemId(i) !== id)
      return [...prev, item]
    })
  }

  // Soft delete — moves to trash (no B2 deletion)
  function handleDelete(item) {
    if (item.isFolder) { setError('Folder deletion not yet supported.'); return }
    const id = itemId(item)
    setTrash(prev => prev.some(i => itemId(i) === id) ? prev : [...prev, { ...item, deletedAt: Date.now() }])
    setItems(prev => prev ? prev.filter(i => itemId(i) !== id) : prev)
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    setStarred(prev => prev.filter(i => itemId(i) !== id))
    setRecent(prev => prev.filter(i => itemId(i) !== id))
    if (detailItem && itemId(detailItem) === id) setDetailItem(null)
  }

  // Permanent delete from trash
  async function handleDeleteForever(item) {
    if (!window.confirm(`Permanently delete "${item.label}"? This cannot be undone.`)) return
    try {
      await deleteObject(item.key)
      setTrash(prev => prev.filter(i => itemId(i) !== itemId(item)))
    } catch (e) {
      setError('Delete failed: ' + e.message)
    }
  }

  function handleRestore(item) {
    setTrash(prev => prev.filter(i => itemId(i) !== itemId(item)))
  }

  async function handleEmptyTrash() {
    if (!trash.length) return
    if (!window.confirm(`Permanently delete all ${trash.length} item(s) in trash? This cannot be undone.`)) return
    for (const item of trash) {
      if (!item.isFolder) {
        try { await deleteObject(item.key) } catch {}
      }
    }
    setTrash([])
  }

  function bulkDelete() {
    const toTrash = displayedAll.filter(i => !i.isFolder && selected.has(itemId(i)))
    if (!toTrash.length) return
    const now = Date.now()
    setTrash(prev => {
      const newItems = toTrash.filter(t => !prev.some(p => itemId(p) === itemId(t)))
      return [...prev, ...newItems.map(i => ({ ...i, deletedAt: now }))]
    })
    setItems(prev => prev ? prev.filter(i => !selected.has(itemId(i))) : prev)
    setSelected(new Set())
  }

  async function bulkDownload() {
    const toDownload = displayedAll.filter(i => !i.isFolder && selected.has(itemId(i)))
    for (const item of toDownload) await downloadFile(item)
  }

  async function buildSearchIndex() {
    setSearchIndexing(true)
    setIndexProgress(0)
    try {
      const allObjects = await listAllObjects()
      const index = []
      let done = 0
      for (const obj of allObjects) {
        if (obj.key.startsWith('.b2browser/')) continue
        const parts = obj.key.split('/').filter(Boolean)
        const decParts = []
        for (const part of parts) {
          let dec = part
          try { dec = await decryptFilename(part, nameKey, nameTweak) } catch {}
          decParts.push(dec)
        }
        const label = decParts[decParts.length - 1] || obj.key
        const path  = decParts.slice(0, -1).join('/')
        index.push({ key: obj.key, label, path, size: obj.size, lastModified: obj.lastModified, isFolder: false })
        done++
        if (done % 50 === 0) setIndexProgress(Math.round((done / allObjects.length) * 100))
      }
      const builtAt = Date.now()
      setSearchIndex(index)
      setSearchIndexBuiltAt(builtAt)
      // Persist to B2 so it loads instantly next session
      try {
        const payload = encryptMeta({ builtAt, entries: index }, dataKey)
        await putObject('.b2browser/searchIndex.json', payload)
      } catch {}
    } catch (e) {
      setError('Failed to build search index: ' + e.message)
    } finally {
      setSearchIndexing(false)
      setIndexProgress(100)
    }
  }

  async function handleUpload(fileList) {
    const files = Array.from(fileList)
    const existingLabels = new Set((items || []).map(i => i.label))

    for (const file of files) {
      // Duplicate detection
      if (existingLabels.has(file.name)) {
        if (!window.confirm(`"${file.name}" already exists in this folder. Overwrite?`)) continue
      }

      setUploads(prev => [...prev, { name: file.name, status: 'encrypting', progress: 0, speed: '' }])
      try {
        const buf   = await file.arrayBuffer()
        const plain = new Uint8Array(buf)
        const enc   = encryptFileContent(plain, dataKey)

        setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'uploading' } : u))

        const encName = await encryptFilename(file.name, nameKey, nameTweak)
        const key     = prefix + encName

        await uploadWithProgress(key, enc, ({ percent, speedMBs }) => {
          setUploads(prev => prev.map(u =>
            u.name === file.name ? { ...u, progress: percent, speed: speedMBs + ' MB/s' } : u
          ))
        })

        const newItem = { key, label: file.name, size: file.size, lastModified: new Date(), isFolder: false }
        setItems(prev => prev ? [...prev, newItem] : [newItem])
        existingLabels.add(file.name)
        setUploads(prev => prev.filter(u => u.name !== file.name))
      } catch (e) {
        setUploads(prev => prev.map(u => u.name === file.name ? { ...u, status: 'error', speed: e.message } : u))
        setTimeout(() => setUploads(prev => prev.filter(u => u.name !== file.name)), 4000)
      }
    }
  }

  async function handleRename(item) {
    const newName = window.prompt('Rename to:', item.label)
    if (!newName || newName === item.label) return
    try {
      const encName = await encryptFilename(newName, nameKey, nameTweak)
      const parentPrefix = item.key.includes('/')
        ? item.key.slice(0, item.key.lastIndexOf('/') + 1)
        : ''
      const newKey = parentPrefix + encName
      await copyAndDelete(item.key, newKey)
      setItems(prev => prev
        ? prev.map(i => i.key === item.key ? { ...i, key: newKey, label: newName } : i)
        : prev
      )
      if (detailItem && detailItem.key === item.key) setDetailItem({ ...detailItem, key: newKey, label: newName })
    } catch (e) {
      setError('Rename failed: ' + e.message)
    }
  }

  function handleClearMeta() {
    setStarred([])
    setRecent([])
    setTrash([])
    setFolderColors({})
  }

  async function handleNewFolder() {
    const name = window.prompt('Folder name:')
    if (!name?.trim()) return
    const trimmed = name.trim()
    try {
      const encFolder = await encryptFilename(trimmed, nameKey, nameTweak)
      const encKeep   = await encryptFilename('.keep', nameKey, nameTweak)
      const folderPrefix = prefix + encFolder + '/'
      const keepKey      = folderPrefix + encKeep
      await putObject(keepKey, encryptFileContent(new Uint8Array(0), dataKey))
      setItems(prev => prev ? [{ encPrefix: folderPrefix, label: trimmed, isFolder: true }, ...prev] : [{ encPrefix: folderPrefix, label: trimmed, isFolder: true }])
    } catch (e) {
      setError('Failed to create folder: ' + e.message)
    }
  }

  async function handleMove(item, destPrefix) {
    const filename = item.key.slice(item.key.lastIndexOf('/') + 1)
    const newKey   = destPrefix + filename
    if (newKey === item.key) { setMoveItem(null); return }
    try {
      await copyAndDelete(item.key, newKey)
      setItems(prev => prev ? prev.filter(i => i.key !== item.key) : prev)
      setStarred(prev => prev.map(i => i.key === item.key ? { ...i, key: newKey } : i))
    } catch (e) {
      setError('Move failed: ' + e.message)
    } finally {
      setMoveItem(null)
    }
  }

  async function handleShare(item) {
    if (!navigator.share) return
    setDownloading(item.key)
    try {
      const buf   = await getObjectBytes(item.key)
      const plain = decryptFileContent(buf, dataKey)
      const file  = new File([plain], item.label, { type: 'application/octet-stream' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: item.label })
      } else {
        await navigator.share({ title: item.label })
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError('Share failed: ' + e.message)
    } finally {
      setDownloading('')
    }
  }

  // Thumbnail getter — decrypts image files for grid preview
  const thumbCache = useRef(new Map())
  const getThumbnail = useCallback(async (item) => {
    if (thumbCache.current.has(item.key)) return thumbCache.current.get(item.key)
    try {
      const buf   = await getObjectBytes(item.key)
      const plain = decryptFileContent(buf, dataKey)
      const url   = URL.createObjectURL(new Blob([plain]))
      thumbCache.current.set(item.key, url)
      return url
    } catch { return null }
  }, [dataKey])

  // Drag & drop
  function onDragOver(e) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }
  function onDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    if (activeSection === 'home' && e.dataTransfer.files.length) {
      handleUpload(e.dataTransfer.files)
    }
  }

  // Search date/size filters applied to the index
  function applySearchFilters(entries) {
    let out = entries
    if (searchDateFrom) out = out.filter(i => i.lastModified && new Date(i.lastModified) >= new Date(searchDateFrom))
    if (searchDateTo)   out = out.filter(i => i.lastModified && new Date(i.lastModified) <= new Date(searchDateTo + 'T23:59:59'))
    if (searchSizeRange !== 'any') {
      const [minMB, maxMB] = {
        'tiny':  [0,    1],
        'small': [1,    100],
        'large': [100,  1000],
        'huge':  [1000, Infinity],
      }[searchSizeRange] || [0, Infinity]
      out = out.filter(i => {
        const mb = (i.size || 0) / 1024 / 1024
        return mb >= minMB && mb < maxMB
      })
    }
    return out
  }

  function fmtIndexAge(builtAt) {
    if (!builtAt) return ''
    const mins = Math.round((Date.now() - builtAt) / 60000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
  }

  function cycleSort(field) {
    setSort(prev => {
      if (prev.field !== field) return { field, dir: 'asc' }
      return { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
    })
  }

  function closeAudio() {
    if (audioTrack) URL.revokeObjectURL(audioTrack.url)
    setAudioTrack(null)
  }

  // Compute display items
  let displayItems =
    activeSection === 'trash'   ? trash :
    activeSection === 'starred' ? starred :
    activeSection === 'recent'  ? recent :
    (activeSection === 'search' && searchIndex) ? applySearchFilters(searchIndex.filter(i => !trashIds.has(itemId(i)))) :
    (items || []).filter(i => !trashIds.has(itemId(i)))

  if (search) {
    displayItems = displayItems.filter(i =>
      i.label.toLowerCase().includes(search.toLowerCase()) ||
      (i.path && i.path.toLowerCase().includes(search.toLowerCase()))
    )
  }

  if ((activeSection === 'home' || activeSection === 'search') && filter !== 'all') {
    if (filter === 'folders') {
      displayItems = displayItems.filter(i => i.isFolder)
    } else {
      const exts = FILTER_EXTS[filter] || []
      displayItems = displayItems.filter(i => {
        if (i.isFolder) return false
        return exts.includes(i.label.split('.').pop().toLowerCase())
      })
    }
  }

  const folders      = activeSection === 'trash' ? [] : sortItems(displayItems.filter(i => i.isFolder), sort)
  const files        = activeSection === 'trash'
    ? displayItems
    : sortItems(displayItems.filter(i => !i.isFolder), sort)
  const displayedAll = [...folders, ...files]

  const currentTitle =
    activeSection === 'starred' ? 'Starred' :
    activeSection === 'recent'  ? 'Recent'  :
    activeSection === 'trash'   ? 'Trash'   :
    breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1].label : 'Home'

  const showControlBar = activeSection === 'home' || activeSection === 'search'

  const storageEstimate = searchIndex
    ? searchIndex.reduce((s, i) => s + (i.size || 0), 0)
    : (items || []).filter(i => !i.isFolder).reduce((s, i) => s + (i.size || 0), 0)

  return (
    <div className={styles.shell}>

      {/* ── Sidebar ── */}
      <nav className={styles.sidebar}>
        <div className={styles.logo}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.logoIcon}>
            <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
          </svg>
          Cipher
        </div>

        <div className={styles.navGroup}>
          <button
            className={styles.navItem + (activeSection === 'home' ? ' ' + styles.navActive : '')}
            onClick={goHome}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Home
          </button>
          <button
            className={styles.navItem + (activeSection === 'starred' ? ' ' + styles.navActive : '')}
            onClick={() => { setActiveSection('starred'); setSearch('') }}
          >
            <svg
              viewBox="0 0 24 24"
              fill={activeSection === 'starred' ? '#eab308' : 'none'}
              stroke={activeSection === 'starred' ? '#eab308' : 'currentColor'}
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Starred
          </button>
          <button
            className={styles.navItem + (activeSection === 'recent' ? ' ' + styles.navActive : '')}
            onClick={() => { setActiveSection('recent'); setSearch('') }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            Recent
          </button>
          <button
            className={styles.navItem + (activeSection === 'search' ? ' ' + styles.navActive : '')}
            onClick={() => { setActiveSection('search'); setTimeout(() => searchRef.current?.focus(), 50) }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            Search
          </button>
          <button
            className={styles.navItem + (activeSection === 'trash' ? ' ' + styles.navActive : '')}
            onClick={() => { setActiveSection('trash'); setSearch('') }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
            Trash
            {trash.length > 0 && <span className={styles.trashBadge}>{trash.length}</span>}
          </button>
        </div>

        <div className={styles.sidebarSpacer} />

        {/* Storage estimate */}
        <div className={styles.storageBar}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/>
          </svg>
          <span>
            {fmtSize(storageEstimate)}
            {searchIndex ? ` · ${searchIndex.length} files` : ' (current folder)'}
          </span>
        </div>

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

        {/* Offline banner */}
        {isOffline && (
          <div className={styles.offlineBanner}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>
            </svg>
            You're offline — uploads will resume when you reconnect
          </div>
        )}

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
              onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveSection('search') }}
            />
          </div>
          <AvatarMenu
            keyId={keyId}
            idleMinutes={idleMinutes}
            onIdleChange={setIdleMinutes}
            view={view}
            onViewChange={setView}
            onLock={onLogout}
            onSignOutForget={onSignOutForget}
          />
        </div>

        {/* Content — drag-and-drop target */}
        <div
          className={styles.content + (isDragging ? ' ' + styles.dropTarget : '')}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragging && activeSection === 'home' && (
            <div className={styles.dropOverlay}>
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Drop files to upload
            </div>
          )}

          {/* Breadcrumb */}
          {activeSection === 'home' && breadcrumb.length > 0 && (
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

          {/* Toolbar */}
          <div className={styles.toolbar}>
            <h2 className={styles.folderTitle}>{currentTitle}</h2>
            {activeSection === 'trash' && trash.length > 0 && (
              <button className={styles.emptyTrashBtn} onClick={handleEmptyTrash}>
                Empty trash
              </button>
            )}
            {activeSection === 'home' && (
              <>
                <input
                  ref={uploadRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => { handleUpload(e.target.files); e.target.value = '' }}
                />
                <button className={styles.newFolderBtn} onClick={handleNewFolder} title="New folder">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                    <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
                  </svg>
                  New Folder
                </button>
                <button className={styles.uploadBtn} onClick={() => uploadRef.current?.click()}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Upload
                </button>
              </>
            )}
            {activeSection !== 'trash' && (
              <div className={styles.viewToggle}>
                <button
                  className={styles.viewBtn + (view === 'grid' ? ' ' + styles.viewActive : '')}
                  onClick={() => setView('grid')} title="Grid view"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                  </svg>
                </button>
                <button
                  className={styles.viewBtn + (view === 'list' ? ' ' + styles.viewActive : '')}
                  onClick={() => setView('list')} title="List view"
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                    <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                    <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Control bar */}
          {showControlBar && (
            <div className={styles.controlBar}>
              <div className={styles.filterChips}>
                {FILTERS.map(f => (
                  <button
                    key={f}
                    className={styles.chip + (filter === f ? ' ' + styles.chipActive : '')}
                    onClick={() => setFilter(f)}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className={styles.sortGroup}>
                {SORT_FIELDS.map(({ field, label }) => (
                  <button
                    key={field}
                    className={styles.sortBtn + (sort.field === field ? ' ' + styles.sortActive : '')}
                    onClick={() => cycleSort(field)}
                  >
                    {label}
                    {sort.field === field && (
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {sort.dir === 'asc'
                          ? <polyline points="18 15 12 9 6 15"/>
                          : <polyline points="6 9 12 15 18 9"/>}
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search index bar */}
          {activeSection === 'search' && (
            <>
              <div className={styles.indexBar}>
                {searchIndex === null && !searchIndexing && (
                  <>
                    <span className={styles.indexHint}>Build an index to search across all files in your backup.</span>
                    <button className={styles.indexBtn} onClick={buildSearchIndex}>Build index</button>
                  </>
                )}
                {searchIndexing && (
                  <>
                    <span className={styles.spinner} />
                    <span className={styles.indexHint}>Indexing… {indexProgress}%</span>
                  </>
                )}
                {searchIndex && !searchIndexing && (
                  <>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#22c55e" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <span className={styles.indexHint}>
                      {searchIndex.length} files indexed
                      {searchIndexBuiltAt && ` · ${fmtIndexAge(searchIndexBuiltAt)}`}
                    </span>
                    <button className={styles.indexBtn} onClick={buildSearchIndex}>Refresh</button>
                  </>
                )}
              </div>
              {searchIndex && (
                <div className={styles.searchFilters}>
                  <span className={styles.filterLabel}>From</span>
                  <input type="date" className={styles.dateInput} value={searchDateFrom}
                    onChange={e => setSearchDateFrom(e.target.value)} />
                  <span className={styles.filterLabel}>To</span>
                  <input type="date" className={styles.dateInput} value={searchDateTo}
                    onChange={e => setSearchDateTo(e.target.value)} />
                  <select className={styles.sizeSelect} value={searchSizeRange}
                    onChange={e => setSearchSizeRange(e.target.value)}>
                    <option value="any">Any size</option>
                    <option value="tiny">Under 1 MB</option>
                    <option value="small">1 – 100 MB</option>
                    <option value="large">100 MB – 1 GB</option>
                    <option value="huge">Over 1 GB</option>
                  </select>
                  {(searchDateFrom || searchDateTo || searchSizeRange !== 'any') && (
                    <button className={styles.indexBtn} onClick={() => {
                      setSearchDateFrom(''); setSearchDateTo(''); setSearchSizeRange('any')
                    }}>Clear filters</button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className={styles.bulkBar}>
              <span className={styles.bulkCount}>{selected.size} selected</span>
              <button className={styles.bulkBtn} onClick={bulkDownload}>Download</button>
              <button className={styles.bulkBtn + ' ' + styles.bulkDanger} onClick={bulkDelete}>Move to trash</button>
              <button className={styles.bulkBtn} onClick={() => setSelected(new Set())}>Deselect all</button>
            </div>
          )}

          {/* Upload progress */}
          {uploads.length > 0 && (
            <div className={styles.uploadList}>
              {uploads.map(u => (
                <div key={u.name} className={styles.uploadItem}>
                  <div className={styles.uploadRow}>
                    <span className={styles.uploadName}>{u.name}</span>
                    <span className={styles.uploadStatus}>
                      {u.status === 'uploading'
                        ? `${u.progress || 0}% · ${u.speed || ''}`
                        : u.status === 'error'
                        ? `Error: ${u.speed}`
                        : u.status}
                    </span>
                    {(u.status === 'encrypting' || u.status === 'uploading') && (
                      <span className={styles.spinner} style={{ width: 12, height: 12 }} />
                    )}
                  </div>
                  {u.status === 'uploading' && (
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width: `${u.progress || 0}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          {/* Loading state */}
          {activeSection === 'home' && items === null && !error && (
            <div className={styles.loading}>
              <span className={styles.spinner}/>
              Loading...
            </div>
          )}

          {/* Trash view */}
          {activeSection === 'trash' && (
            <TrashList
              items={displayItems}
              onRestore={handleRestore}
              onDeleteForever={handleDeleteForever}
            />
          )}

          {/* File list */}
          {activeSection !== 'trash' && (activeSection !== 'home' || items !== null) && (
            <FileList
              folders={folders}
              files={files}
              view={view}
              onOpen={openFile}
              downloading={downloading}
              selected={selected}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              starredIds={starredIds}
              folderColors={folderColors}
              emptySection={
                activeSection === 'starred' ? 'starred' :
                activeSection === 'recent'  ? 'recent'  :
                activeSection === 'search' && searchIndex ? 'searchReady' :
                activeSection === 'search' ? 'search' : 'home'
              }
              getThumbnail={getThumbnail}
              onDelete={handleDelete}
              onStar={toggleStar}
            />
          )}
        </div>

        {audioTrack && <AudioPlayer track={audioTrack} onClose={closeAudio} />}

        {/* Bottom nav — mobile only */}
        <nav className={styles.bottomNav}>
          <button
            className={styles.bottomNavItem + (activeSection === 'home' ? ' ' + styles.bottomNavActive : '')}
            onClick={goHome}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Home</span>
          </button>
          <button
            className={styles.bottomNavItem + (activeSection === 'starred' ? ' ' + styles.bottomNavActive : '')}
            onClick={() => setActiveSection('starred')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>Starred</span>
          </button>
          <button
            className={styles.bottomNavItem + (activeSection === 'search' ? ' ' + styles.bottomNavActive : '')}
            onClick={() => { setActiveSection('search'); setTimeout(() => searchRef.current?.focus(), 50) }}
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

      {/* ── Detail panel ── */}
      {detailItem && (
        <DetailPanel
          item={detailItem}
          isStarred={starredIds.has(itemId(detailItem))}
          onStar={() => toggleStar(detailItem)}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* ── Context menu ── */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          isStarred={starredIds.has(itemId(contextMenu.item))}
          folderColor={contextMenu.item.isFolder ? (folderColors[contextMenu.item.encPrefix] || null) : null}
          onClose={() => setContextMenu(null)}
          onOpen={() => openFile(contextMenu.item)}
          onDownload={() => downloadFile(contextMenu.item)}
          onStar={() => toggleStar(contextMenu.item)}
          onDetail={() => setDetailItem(contextMenu.item)}
          onRename={() => handleRename(contextMenu.item)}
          onVersions={() => setVersionItem(contextMenu.item)}
          onDelete={() => handleDelete(contextMenu.item)}
          onSetColor={colorId => setFolderColors(prev => ({ ...prev, [contextMenu.item.encPrefix]: colorId }))}
          onMove={() => setMoveItem(contextMenu.item)}
          onShare={() => handleShare(contextMenu.item)}
        />
      )}

      {/* ── Move to… folder picker ── */}
      {moveItem && (
        <FolderPicker
          nameKey={nameKey}
          nameTweak={nameTweak}
          excludePrefix={moveItem.key.includes('/')
            ? moveItem.key.slice(0, moveItem.key.lastIndexOf('/') + 1)
            : ''}
          onSelect={destPrefix => handleMove(moveItem, destPrefix)}
          onClose={() => setMoveItem(null)}
        />
      )}

      {/* ── Version history modal ── */}
      {versionItem && (
        <VersionHistory
          item={versionItem}
          onClose={() => setVersionItem(null)}
          onRestored={() => load(prefix)}
        />
      )}

      {/* ── Video player ── */}
      {videoTrack && (
        <VideoPlayer
          track={videoTrack}
          dataKey={dataKey}
          onClose={() => setVideoTrack(null)}
        />
      )}

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
            {preview.isPdf   && <iframe src={preview.url} title={preview.name} className={styles.previewFrame} />}
            {preview.isText  && <TextViewer blob={preview.blob} />}
          </div>
        </div>
      )}
    </div>
  )
}

function TrashList({ items, onRestore, onDeleteForever }) {
  if (!items.length) {
    return <p style={{ color: '#555', padding: '60px 20px', textAlign: 'center', fontSize: '14px' }}>Trash is empty.</p>
  }
  return (
    <div>
      {items.map(item => (
        <div key={itemId(item)} style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 12px', borderRadius: '8px', borderBottom: '1px solid #2a2b2d'
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>{item.isFolder ? '📁' : '📄'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', color: '#e0e0e0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </div>
            <div style={{ fontSize: '11px', color: '#555' }}>
              Deleted {fmtDate(item.deletedAt)}
            </div>
          </div>
          <button
            onClick={() => onRestore(item)}
            style={{ padding: '5px 10px', background: '#3a3b3d', border: 'none', borderRadius: '6px', color: '#e0e0e0', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
          >
            Restore
          </button>
          <button
            onClick={() => onDeleteForever(item)}
            style={{ padding: '5px 10px', background: 'none', border: '1px solid #3a3b3d', borderRadius: '6px', color: '#f87171', cursor: 'pointer', fontSize: '12px', flexShrink: 0 }}
          >
            Delete forever
          </button>
        </div>
      ))}
    </div>
  )
}

function TextViewer({ blob }) {
  const [text, setText] = useState('')
  useEffect(() => { blob.text().then(setText) }, [blob])
  return <pre style={{ color: '#ccc', fontSize: '13px', overflow: 'auto', padding: '16px', whiteSpace: 'pre-wrap', maxHeight: '75dvh' }}>{text}</pre>
}
