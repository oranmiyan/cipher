import { useState, useEffect } from 'react'
import { listObjectVersions, restoreVersion, deleteVersion, getBucketVersioning, enableBucketVersioning } from '../b2client'
import styles from './VersionHistory.module.css'

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

export default function VersionHistory({ item, onClose, onRestored }) {
  const [versioningEnabled, setVersioningEnabled] = useState(null)
  const [enabling, setEnabling]     = useState(false)
  const [versions, setVersions]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [restoringId, setRestoringId] = useState(null)
  const [deletingId, setDeletingId]   = useState(null)

  useEffect(() => {
    async function check() {
      setLoading(true)
      setError('')
      try {
        const enabled = await getBucketVersioning()
        setVersioningEnabled(enabled)
        if (enabled) {
          const v = await listObjectVersions(item.key)
          setVersions(v)
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [item.key])

  async function handleEnableVersioning() {
    if (!window.confirm(
      'Enable versioning on this B2 bucket?\n\n' +
      'B2 will keep all previous versions of every file. ' +
      'You will be charged for storage used by old versions. ' +
      'Versioning can be suspended later but not fully removed.'
    )) return
    setEnabling(true)
    try {
      await enableBucketVersioning()
      setVersioningEnabled(true)
      const v = await listObjectVersions(item.key)
      setVersions(v)
    } catch (e) {
      setError('Failed to enable versioning: ' + e.message)
    } finally {
      setEnabling(false)
    }
  }

  async function handleRestore(versionId) {
    if (!window.confirm('Restore this version? The current version will be replaced (and saved as a new version).')) return
    setRestoringId(versionId)
    try {
      await restoreVersion(item.key, versionId)
      onRestored?.()
      const v = await listObjectVersions(item.key)
      setVersions(v)
    } catch (e) {
      setError('Restore failed: ' + e.message)
    } finally {
      setRestoringId(null)
    }
  }

  async function handleDeleteVersion(versionId) {
    if (!window.confirm('Permanently delete this version?')) return
    setDeletingId(versionId)
    try {
      await deleteVersion(item.key, versionId)
      setVersions(prev => prev.filter(v => v.VersionId !== versionId))
    } catch (e) {
      setError('Delete failed: ' + e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Version history</h3>
            <p className={styles.subtitle}>{item.label}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {loading && (
            <div className={styles.center}>
              <span className={styles.spinner}/>
              <span className={styles.hint}>Checking bucket versioning…</span>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          {!loading && versioningEnabled === false && (
            <div className={styles.noVersioning}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#444" strokeWidth="1.5">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
              </svg>
              <p className={styles.noVersioningTitle}>Versioning is not enabled</p>
              <p className={styles.hint}>
                Enable versioning on your B2 bucket so every file upload creates a recoverable snapshot.
                B2 charges for all stored data including old versions.
              </p>
              <button className={styles.enableBtn} disabled={enabling} onClick={handleEnableVersioning}>
                {enabling ? 'Enabling…' : 'Enable versioning'}
              </button>
            </div>
          )}

          {!loading && versioningEnabled && versions !== null && (
            versions.length === 0
              ? <p className={styles.hint} style={{ textAlign: 'center', padding: '24px 0' }}>
                  No versions yet. Each upload will create a new version.
                </p>
              : versions.map((v, i) => (
                  <div key={v.VersionId} className={styles.versionRow + (i === 0 ? ' ' + styles.current : '')}>
                    <div className={styles.versionInfo}>
                      <span className={styles.versionLabel}>{i === 0 ? 'Current version' : `Version ${versions.length - i}`}</span>
                      <span className={styles.versionDate}>{fmtDate(v.LastModified)}</span>
                      <span className={styles.versionSize}>{fmtSize(v.Size)}</span>
                    </div>
                    {i > 0 && (
                      <div className={styles.versionActions}>
                        <button
                          className={styles.restoreBtn}
                          disabled={restoringId === v.VersionId}
                          onClick={() => handleRestore(v.VersionId)}
                        >
                          {restoringId === v.VersionId ? 'Restoring…' : 'Restore'}
                        </button>
                        <button
                          className={styles.delVerBtn}
                          disabled={deletingId === v.VersionId}
                          onClick={() => handleDeleteVersion(v.VersionId)}
                          title="Delete this version"
                        >×</button>
                      </div>
                    )}
                  </div>
                ))
          )}
        </div>
      </div>
    </div>
  )
}
