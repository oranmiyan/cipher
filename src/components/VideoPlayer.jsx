import { useState, useEffect, useRef } from 'react'
import * as MP4Box from '../vendor/mp4box.js'
import { getObjectRange } from '../b2client'
import { parseFileHeader, decryptBlock, HEADER_SIZE, ENC_BLOCK_SIZE } from '../rclone-crypt'
import styles from './VideoPlayer.module.css'

// Fetch 32 blocks (~2 MB) per range request to minimise round-trips
const BLOCKS_PER_FETCH = 32

// Creates a serialised append queue for a SourceBuffer.
// The MSE spec forbids calling appendBuffer while the SB is still updating.
function makeQueue(sb) {
  const queue = []
  let busy = false

  function flush() {
    if (busy || !queue.length) return
    busy = true
    try { sb.appendBuffer(queue.shift()) } catch { busy = false; flush() }
  }

  sb.addEventListener('updateend', () => { busy = false; flush() })
  sb.addEventListener('error',     () => { busy = false })

  return {
    push:    buf => { queue.push(buf); flush() },
    isEmpty: ()  => !busy && queue.length === 0,
  }
}

export default function VideoPlayer({ track, dataKey, onClose }) {
  // track = { key, name, encSize }
  const videoRef   = useRef(null)
  const cleanupRef = useRef([])
  const [status,   setStatus]   = useState('loading')  // loading | playing | error
  const [progress, setProgress] = useState(0)
  const [error,    setError]    = useState('')

  useEffect(() => {
    let cancelled = false
    cleanupRef.current = []

    async function run() {
      try {
        const { key, encSize } = track
        const totalBlocks = Math.ceil((encSize - HEADER_SIZE) / ENC_BLOCK_SIZE)

        // 1. Read the 32-byte file header to get the nonce
        const headerBytes = await getObjectRange(key, 0, HEADER_SIZE - 1)
        const fileNonce   = parseFileHeader(headerBytes.buffer)
        if (cancelled) return

        // 2. Create MediaSource and attach to <video>
        const ms    = new MediaSource()
        const msUrl = URL.createObjectURL(ms)
        cleanupRef.current.push(() => URL.revokeObjectURL(msUrl))
        videoRef.current.src = msUrl

        await new Promise((res, rej) => {
          ms.addEventListener('sourceopen', res, { once: true })
          ms.addEventListener('error',      rej, { once: true })
        })
        if (cancelled) return

        // 3. Wire up mp4box
        const mp4    = MP4Box.createFile()
        const queues = new Map()  // trackId → queue

        mp4.onReady = (info) => {
          if (cancelled) return

          const allTracks = [...(info.videoTracks || []), ...(info.audioTracks || [])]
          if (!allTracks.length) {
            setError('No playable tracks found in this file')
            setStatus('error')
            return
          }

          for (const t of allTracks) {
            const isVid = (info.videoTracks || []).some(v => v.id === t.id)
            const mime  = `${isVid ? 'video' : 'audio'}/mp4; codecs="${t.codec}"`
            if (!MediaSource.isTypeSupported(mime)) continue

            const sb = ms.addSourceBuffer(mime)
            const q  = makeQueue(sb)
            queues.set(t.id, q)
            mp4.setSegmentOptions(t.id, q, { nbSamples: 200 })
          }

          if (!queues.size) {
            setError('Video format not supported on this device')
            setStatus('error')
            return
          }

          // mp4box v2.x returns { tracks, buffer } (single shared init segment)
          const initSeg = mp4.initializeSegmentation()
          for (const track of initSeg.tracks) track.user?.push(initSeg.buffer)
          mp4.start()
          setStatus('playing')
        }

        mp4.onSegment = (id, user, buffer) => { user?.push(buffer) }
        mp4.onError   = (e) => { if (!cancelled) { setError('Parse error: ' + e); setStatus('error') } }

        // 4. Stream encrypted blocks in batches, decrypt, feed to mp4box
        let fileOffset = 0

        for (let b = 0; b < totalBlocks; b += BLOCKS_PER_FETCH) {
          if (cancelled) break

          const bEnd     = Math.min(b + BLOCKS_PER_FETCH, totalBlocks)
          const encStart = HEADER_SIZE + b    * ENC_BLOCK_SIZE
          const encEnd   = Math.min(HEADER_SIZE + bEnd * ENC_BLOCK_SIZE, encSize) - 1

          const chunk = await getObjectRange(key, encStart, encEnd)
          if (cancelled) break

          for (let n = b; n < bEnd; n++) {
            const off      = (n - b) * ENC_BLOCK_SIZE
            const encBlock = chunk.slice(off, Math.min(off + ENC_BLOCK_SIZE, chunk.length))
            const pt       = decryptBlock(encBlock, fileNonce, n, dataKey)

            const buf = pt.buffer.slice(pt.byteOffset, pt.byteOffset + pt.byteLength)
            buf.fileStart  = fileOffset
            fileOffset    += pt.byteLength
            mp4.appendBuffer(buf)
          }

          setProgress(Math.round(bEnd / totalBlocks * 100))
        }

        if (!cancelled) {
          mp4.flush()
          // Signal end of stream once all queued segments have been appended
          const poll = setInterval(() => {
            if ([...queues.values()].every(q => q.isEmpty())) {
              clearInterval(poll)
              try { ms.endOfStream() } catch {}
            }
          }, 300)
          cleanupRef.current.push(() => clearInterval(poll))
        }

      } catch (e) {
        if (!cancelled) { setError(e.message); setStatus('error') }
      }
    }

    run()

    return () => {
      cancelled = true
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' }
      for (const fn of cleanupRef.current) try { fn() } catch {}
    }
  }, [track.key, dataKey])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.box} onClick={e => e.stopPropagation()}>

        <div className={styles.header}>
          <span className={styles.title}>{track.name}</span>
          <button className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>

        <div className={styles.videoWrap}>
          {status === 'loading' && (
            <div className={styles.loadState}>
              <div className={styles.spinner} />
              <p>Decrypting video…</p>
            </div>
          )}
          {status === 'error' && (
            <div className={styles.loadState}>
              <p className={styles.errorMsg}>{error}</p>
            </div>
          )}
          <video
            ref={videoRef}
            controls
            playsInline
            className={styles.video}
            style={{ visibility: status === 'error' ? 'hidden' : 'visible' }}
          />
        </div>

        {progress > 0 && progress < 100 && (
          <div className={styles.progressWrap}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            <span className={styles.progressLabel}>{progress}% loaded</span>
          </div>
        )}

      </div>
    </div>
  )
}
