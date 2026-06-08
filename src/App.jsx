import { useState, useCallback } from 'react'
import Login from './components/Login'
import FileBrowser from './components/FileBrowser'
import { initClient } from './b2client'
import { deriveKeys } from './rclone-crypt'
import './App.css'

// Stores only B2 key ID + app key — never the encryption password
const B2_CREDS_KEY = 'b2browser_b2creds'


function loadB2Creds() {
  try {
    // Also migrate / remove the old key that stored the plaintext password
    const old = localStorage.getItem('b2browser_creds')
    if (old) {
      const parsed = JSON.parse(old)
      localStorage.removeItem('b2browser_creds')
      // Keep the B2 credentials from the old entry, drop the password
      if (parsed.keyId && parsed.appKey) {
        localStorage.setItem(B2_CREDS_KEY, JSON.stringify({ keyId: parsed.keyId, appKey: parsed.appKey }))
      }
    }
    return JSON.parse(localStorage.getItem(B2_CREDS_KEY) || 'null')
  } catch {
    return null
  }
}

export default function App() {
  const [keys, setKeys]     = useState(null)
  const [keyId, setKeyId]   = useState('')
  const [error, setError]   = useState('')
  const savedB2 = loadB2Creds()

  async function handleLogin({ keyId, appKey, password, rememberB2 }) {
    try {
      setError('')
      initClient(keyId, appKey)
      const k = await deriveKeys(password)
      if (rememberB2) {
        localStorage.setItem(B2_CREDS_KEY, JSON.stringify({ keyId, appKey }))
      } else {
        localStorage.removeItem(B2_CREDS_KEY)
      }
      setKeyId(keyId)
      setKeys(k)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleLogout = useCallback(() => {
    setKeys(null)
    setKeyId('')
  }, [])

  // Sign out AND wipe saved B2 credentials from localStorage
  const handleSignOutForget = useCallback(() => {
    localStorage.removeItem(B2_CREDS_KEY)
    setKeys(null)
    setKeyId('')
  }, [])

  if (!keys) return <Login savedB2={savedB2} onLogin={handleLogin} error={error} />
  return <FileBrowser cryptKeys={keys} keyId={keyId} onLogout={handleLogout} onSignOutForget={handleSignOutForget} />
}
