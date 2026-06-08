import { useState, useEffect, useRef, useCallback } from 'react'
import { getMetaObject, putObject } from '../b2client'
import { encryptMeta, decryptMeta } from '../rclone-crypt'

const META_PREFIX = '.b2browser/'
const LS_PREFIX   = 'b2-browser.'

/**
 * Like useLocalStorage, but persists data as an encrypted file in B2.
 * Survives browser cache clears and works across devices.
 * Writes are debounced by 1 s to avoid hammering the API.
 *
 * @param {string}     name          Short name used as the B2 key suffix, e.g. 'starred'
 * @param {*}          defaultValue  Returned until B2 data loads
 * @param {Uint8Array} dataKey       NaCl secretbox key (from deriveKeys)
 * @returns {[value, setValue, loaded]}
 */
export function useB2Storage(name, defaultValue, dataKey) {
  const b2Key = META_PREFIX + name + '.json'
  const [value, setValue] = useState(defaultValue)
  const [loaded, setLoaded] = useState(false)
  const saveTimer    = useRef(null)
  const pendingValue = useRef(defaultValue)

  // Load on mount: B2 first, then fall back to localStorage migration
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const bytes = await getMetaObject(b2Key)
        if (cancelled) return
        if (bytes) {
          const data = decryptMeta(bytes, dataKey)
          if (data !== null) {
            setValue(data)
            pendingValue.current = data
            setLoaded(true)
            return
          }
        }
        // Nothing in B2 yet — migrate from localStorage if present
        const lsRaw = localStorage.getItem(LS_PREFIX + name)
        if (lsRaw && !cancelled) {
          try {
            const lsData = JSON.parse(lsRaw)
            setValue(lsData)
            pendingValue.current = lsData
            // Upload to B2 and clear localStorage (best effort)
            putObject(b2Key, encryptMeta(lsData, dataKey)).catch(() => {})
            localStorage.removeItem(LS_PREFIX + name)
          } catch {}
        }
      } catch {}
      if (!cancelled) setLoaded(true)
    }
    load()
    return () => { cancelled = true }
  }, [b2Key, dataKey, name])

  const schedSave = useCallback((val) => {
    pendingValue.current = val
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      putObject(b2Key, encryptMeta(pendingValue.current, dataKey)).catch(() => {})
    }, 1000)
  }, [b2Key, dataKey])

  const set = useCallback((updater) => {
    setValue(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      schedSave(next)
      return next
    })
  }, [schedSave])

  return [value, set, loaded]
}
