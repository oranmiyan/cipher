import { useState } from 'react'
import styles from './Login.module.css'

export default function Login({ onLogin, error }) {
  const [keyId, setKeyId] = useState('')
  const [appKey, setAppKey] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    await onLogin({ keyId: keyId.trim(), appKey: appKey.trim(), password })
    setLoading(false)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.lockIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h1 className={styles.title}>B2 Backup</h1>
        <p className={styles.sub}>Connect to your encrypted Backblaze B2</p>
        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>B2 Key ID</label>
            <input
              value={keyId}
              onChange={e => setKeyId(e.target.value)}
              placeholder="00380c..."
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Application Key</label>
            <input
              value={appKey}
              onChange={e => setAppKey(e.target.value)}
              placeholder="K003..."
              type="password"
              autoCapitalize="none"
              required
            />
          </div>
          <div className={styles.field}>
            <label>Encryption Password</label>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading
              ? <><span className={styles.spinner} /> Connecting...</>
              : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
