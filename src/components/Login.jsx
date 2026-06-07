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
        <h1 className={styles.title}>B2 Browser</h1>
        <p className={styles.sub}>Encrypted Backblaze B2</p>
        <form onSubmit={submit} className={styles.form}>
          <label>B2 Key ID
            <input value={keyId} onChange={e => setKeyId(e.target.value)}
              placeholder="00..." autoCapitalize="none" spellCheck="false" required />
          </label>
          <label>B2 Application Key
            <input value={appKey} onChange={e => setAppKey(e.target.value)}
              placeholder="K003..." type="password" autoCapitalize="none" required />
          </label>
          <label>Encryption Password
            <input value={password} onChange={e => setPassword(e.target.value)}
              type="password" required />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  )
}
