import { useState, useEffect, useRef } from 'react'
import styles from './AudioPlayer.module.css'

function fmtTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export default function AudioPlayer({ track, onClose }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(0)
    setDuration(0)
    audio.src = track.url
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false))

    const onTime = () => setCurrentTime(audio.currentTime)
    const onDur  = () => setDuration(audio.duration)
    const onEnd  = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDur)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDur)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.pause()
    }
  }, [track.url])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    playing ? audio.pause() : audio.play()
  }

  function seek(e) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
    setCurrentTime(audio.currentTime)
  }

  const pct = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className={styles.player}>
      <audio ref={audioRef} preload="auto" />

      <div className={styles.trackInfo}>
        <span className={styles.trackIcon}>🎵</span>
        <span className={styles.trackName}>{track.name}</span>
      </div>

      <button className={styles.playBtn} onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <rect x="6" y="4" width="4" height="16" rx="1"/>
            <rect x="14" y="4" width="4" height="16" rx="1"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        )}
      </button>

      <div className={styles.progressRow}>
        <span className={styles.timeLabel}>{fmtTime(currentTime)}</span>
        <input
          type="range"
          className={styles.scrubber}
          style={{ '--pct': `${pct}%` }}
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={seek}
          aria-label="Seek"
        />
        <span className={styles.timeLabel}>{fmtTime(duration)}</span>
      </div>

      <button className={styles.closeBtn} onClick={onClose} aria-label="Close player">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="14" height="14">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}
