import { useState, useEffect } from 'react'
import Login from './components/Login'
import FileBrowser from './components/FileBrowser'
import { initClient } from './b2client'
import { deriveKeys } from './rclone-crypt'
import './App.css'

const STORAGE_KEY = 'b2browser_creds'

export default function App() {
  const [keys, setKeys] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const { keyId, appKey, password } = JSON.parse(saved)
        initClient(keyId, appKey)
        deriveKeys(password).then(k => setKeys(k)).catch(() => localStorage.removeItem(STORAGE_KEY))
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  async function handleLogin({ keyId, appKey, password }) {
    try {
      setError('')
      initClient(keyId, appKey)
      const k = await deriveKeys(password)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ keyId, appKey, password }))
      setKeys(k)
    } catch (e) {
      setError(e.message)
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setKeys(null)
  }

  if (!keys) return <Login onLogin={handleLogin} error={error} />
  return <FileBrowser cryptKeys={keys} onLogout={handleLogout} />
}
