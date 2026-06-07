import { useState, useEffect, useCallback } from 'react'
import { listPrefix, getObjectBytes } from '../b2client'
import { decryptFilename, decryptFileContent } from '../rclone-crypt'
import FileList from './FileList'
import styles from './FileBrowser.module.css'

export default function FileBrowser({ cryptKeys, onLogout }) {
  const { nameKey, nameTweak, dataKey } = cryptKeys
  const [prefix, setPrefix] = useState('')          // encrypted B2 prefix
  const [breadcrumb, setBreadcrumb] = useState([])  // [{label, prefix}]
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState(null)
  const [downloading, setDownloading] = useState('')

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
      if (isImage || isPdf || isText) {
        setPreview({ url, name, blob, isImage, isPdf, isText })
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

  const visible = (items || []).filter(i =>
    !search || i.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>B2 Browser</h1>
        <button className={styles.logoutBtn} onClick={onLogout}>Logout</button>
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.breadcrumb}>
          <button onClick={() => goTo(-1)}>Home</button>
          {breadcrumb.map((b, i) => (
            <span key={i}> / <button onClick={() => goTo(i)}>{b.label}</button></span>
          ))}
        </nav>
        <input
          className={styles.search}
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {items === null && !error && <p className={styles.loading}>Loading...</p>}

      {items !== null && (
        <FileList items={visible} onOpen={openFile} downloading={downloading} />
      )}

      {preview && (
        <div className={styles.overlay} onClick={() => { URL.revokeObjectURL(preview.url); setPreview(null) }}>
          <div className={styles.previewBox} onClick={e => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <span>{preview.name}</span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
