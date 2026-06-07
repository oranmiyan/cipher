import styles from './FileList.module.css'

function fileIcon(name, isFolder) {
  if (isFolder) return '📁'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
    png: '🖼', jpg: '🖼', jpeg: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', m4a: '🎵', wav: '🎵', flac: '🎵',
    zip: '📦', gz: '📦', tar: '📦', '7z': '📦',
    txt: '📃', md: '📃', csv: '📃', json: '📃',
  }
  return map[ext] || '📎'
}

function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(2) + ' GB'
}

export default function FileList({ items, onOpen, downloading }) {
  if (items.length === 0) {
    return <p className={styles.empty}>No files here.</p>
  }

  return (
    <ul className={styles.list}>
      {items.map(item => (
        <li
          key={item.isFolder ? item.encPrefix : item.key}
          className={styles.item + (downloading === item.key ? ' ' + styles.busy : '')}
          onClick={() => onOpen(item)}
        >
          <span className={styles.icon}>{fileIcon(item.label, item.isFolder)}</span>
          <span className={styles.name}>{item.label}</span>
          {!item.isFolder && (
            <span className={styles.meta}>
              {downloading === item.key ? 'Decrypting...' : fmtSize(item.size)}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
