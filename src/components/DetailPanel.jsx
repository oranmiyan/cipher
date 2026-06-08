import styles from './DetailPanel.module.css'

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

function fileType(name, isFolder) {
  if (isFolder) return 'Folder'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    mp4: 'MP4 Video', mov: 'QuickTime Video', m4v: 'MP4 Video', avi: 'AVI Video', mkv: 'MKV Video',
    mp3: 'MP3 Audio', m4a: 'AAC Audio', wav: 'WAV Audio', flac: 'FLAC Audio', ogg: 'OGG Audio', aac: 'AAC Audio',
    png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image', gif: 'GIF Image', webp: 'WebP Image', svg: 'SVG Image',
    pdf: 'PDF Document', doc: 'Word Document', docx: 'Word Document',
    xls: 'Excel Spreadsheet', xlsx: 'Excel Spreadsheet',
    ppt: 'PowerPoint', pptx: 'PowerPoint',
    txt: 'Text File', md: 'Markdown', csv: 'CSV File', json: 'JSON File', xml: 'XML File',
    zip: 'ZIP Archive', gz: 'GZ Archive', tar: 'TAR Archive', '7z': '7-Zip Archive',
  }
  return map[ext] || (ext.toUpperCase() + ' File')
}

function thumbBg(name, isFolder) {
  if (isFolder) return '#112240'
  const ext = name.split('.').pop().toLowerCase()
  if (['mp3','m4a','wav','flac','aac','ogg'].includes(ext)) return '#12082a'
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return '#082018'
  if (['mp4','mov','avi','mkv','webm','m4v'].includes(ext)) return '#180828'
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return '#281010'
  return '#252628'
}

function fileEmoji(name, isFolder) {
  if (isFolder) return '📁'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    mp3: '🎵', m4a: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵', aac: '🎵',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    pdf: '📄', doc: '📝', docx: '📝', txt: '📃', md: '📃',
    zip: '📦', gz: '📦', tar: '📦',
  }
  return map[ext] || '📎'
}

export default function DetailPanel({ item, isStarred, onStar, onClose }) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Details</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.thumb} style={{ background: thumbBg(item.label, item.isFolder) }}>
          <span className={styles.thumbIcon}>{fileEmoji(item.label, item.isFolder)}</span>
        </div>

        <p className={styles.name} title={item.label}>{item.label}</p>

        <button
          className={styles.starBtn + (isStarred ? ' ' + styles.starred : '')}
          onClick={onStar}
        >
          <svg viewBox="0 0 24 24" fill={isStarred ? '#eab308' : 'none'} stroke={isStarred ? '#eab308' : 'currentColor'} strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          {isStarred ? 'Starred' : 'Star this item'}
        </button>

        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Type</span>
            <span className={styles.rowValue}>{fileType(item.label, item.isFolder)}</span>
          </div>
          {!item.isFolder && item.size != null && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Size</span>
              <span className={styles.rowValue}>{fmtSize(item.size)}</span>
            </div>
          )}
          {item.lastModified && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Modified</span>
              <span className={styles.rowValue}>{fmtDate(item.lastModified)}</span>
            </div>
          )}
          {item.openedAt && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Last opened</span>
              <span className={styles.rowValue}>{fmtDate(item.openedAt)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
