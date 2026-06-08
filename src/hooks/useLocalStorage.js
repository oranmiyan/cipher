import { useState, useCallback } from 'react'

export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? JSON.parse(item) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const set = useCallback(updater => {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
      return next
    })
  }, [key])

  return [value, set]
}
