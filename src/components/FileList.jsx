import { FOLDER_COLORS } from '../utils/constants'
import styles from './FileList.module.css'

function fileEmoji(name, isFolder) {
  if (isFolder) return '📁'
  const ext = name.split('.').pop().toLowerCase()
  const map = {
    mp3: '🎵', m4a: '🎵', wav: '🎵', flac: '🎵', aac: '🎵', ogg: '🎵',
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️',
    pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📊', pptx: '📊',
    zip: '📦', gz: '📦', tar: '📦', '7z': '📦', rar: '📦',
    txt: '📃', md: '📃', csv: '📃', json: '📃', xml: '📃',
  }
  return map[ext] || '📎'
}

function thumbClass(name, isFolder) {
  if (isFolder) return styles.thumbFolder
  const ext = name.split('.').pop().toLowerCase()
  if (['mp3','m4a','wav','flac','aac','ogg'].includes(ext)) return styles.thumbAudio
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return styles.thumbImage
  if (['mp4','mov','avi','mkv','webm','m4v'].includes(ext)) return styles.thumbVideo
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return styles.thumbDoc
  return styles.thumbDefault
}

function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

const itemId = item => item.isFolder ? item.encPrefix : item.key

function FileCard({ item, view, onOpen, downloading, selected, onSelect, onContextMenu, isStarred, folderColor }) {
  const busy       = !item.isFolder && downloading === item.key
  const id         = itemId(item)
  const isSelected = selected.has(id)
  const colorObj   = folderColor ? FOLDER_COLORS.find(c => c.id === folderColor) : null

  function handleClick(e) {
    if (e.target.closest('input[type=checkbox]')) return
    if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(item); return }
    onOpen(item)
  }

  function handleCheck(e) {
    e.stopPropagation()
    onSelect(item)
  }

  function handleContextMenu(e) {
    e.preventDefault()
    onContextMenu(e, item)
  }

  if (view === 'list') {
    return (
      <div
        className={[styles.listItem, busy && styles.busy, isSelected && styles.listSelected].filter(Boolean).join(' ')}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={isSelected}
          onChange={handleCheck}
          onClick={e => e.stopPropagation()}
        />
        {colorObj && item.isFolder && (
          <span className={styles.colorDot} style={{ background: colorObj.hex }} />
        )}
        <span className={styles.listIcon}>{fileEmoji(item.label, item.isFolder)}</span>
        <span className={styles.listName}>{item.label}</span>
        {isStarred && (
          <svg className={styles.starBadge} viewBox="0 0 24 24" fill="#eab308" stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        )}
        {!item.isFolder && (
          <span className={styles.listMeta}>{busy ? 'Decrypting...' : fmtSize(item.size)}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={[styles.card, busy && styles.busy, isSelected && styles.cardSelected].filter(Boolean).join(' ')}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <input
        type="checkbox"
        className={styles.cardCheckbox}
        checked={isSelected}
        onChange={handleCheck}
        onClick={e => e.stopPropagation()}
      />
      {isStarred && <div className={styles.cardStar}>★</div>}
      <div
        className={styles.cardThumb + ' ' + thumbClass(item.label, item.isFolder)}
        style={colorObj && item.isFolder ? { borderBottom: '3px solid ' + colorObj.hex } : {}}
      >
        {fileEmoji(item.label, item.isFolder)}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardName}>{item.label}</div>
        <div className={styles.cardMeta}>
          {item.isFolder ? ' ' : busy ? 'Decrypting...' : fmtSize(item.size)}
        </div>
      </div>
    </div>
  )
}

export default function FileList({
  folders, files, view, onOpen, downloading,
  selected, onSelect, onContextMenu,
  starredIds, folderColors,
}) {
  const hasFolders = folders.length > 0
  const hasFiles   = files.length > 0

  if (!hasFolders && !hasFiles) {
    return <p className={styles.empty}>Nothing here.</p>
  }

  const cardProps = item => ({
    item, view, onOpen, downloading,
    selected, onSelect, onContextMenu,
    isStarred:   starredIds.has(itemId(item)),
    folderColor: item.isFolder ? (folderColors[item.encPrefix] || null) : null,
  })

  return (
    <div>
      {hasFolders && (
        <>
          <p className={styles.sectionLabel}>Folders</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {folders.map(item => (
              <FileCard key={item.encPrefix} {...cardProps(item)} />
            ))}
          </div>
        </>
      )}
      {hasFiles && (
        <>
          <p className={styles.sectionLabel}>Files</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {files.map(item => (
              <FileCard key={item.key} {...cardProps(item)} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
