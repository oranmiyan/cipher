import styles from './FileList.module.css'

function fileIcon(name, isFolder) {
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
  if (['mp4','mov','avi','mkv','webm'].includes(ext)) return styles.thumbVideo
  if (['pdf','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) return styles.thumbDoc
  return styles.thumbDefault
}

function fmtSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 ** 3) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 ** 3).toFixed(2) + ' GB'
}

function FileCard({ item, view, onOpen, downloading }) {
  const busy = !item.isFolder && downloading === item.key

  if (view === 'list') {
    return (
      <div
        className={styles.listItem + (busy ? ' ' + styles.busy : '')}
        onClick={() => onOpen(item)}
      >
        <span className={styles.listIcon}>{fileIcon(item.label, item.isFolder)}</span>
        <span className={styles.listName}>{item.label}</span>
        {!item.isFolder && (
          <span className={styles.listMeta}>{busy ? 'Decrypting...' : fmtSize(item.size)}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={styles.card + (busy ? ' ' + styles.busy : '')}
      onClick={() => onOpen(item)}
    >
      <div className={styles.cardThumb + ' ' + thumbClass(item.label, item.isFolder)}>
        {fileIcon(item.label, item.isFolder)}
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

export default function FileList({ folders, files, view, onOpen, downloading }) {
  const hasFolders = folders.length > 0
  const hasFiles = files.length > 0

  if (!hasFolders && !hasFiles) {
    return <p className={styles.empty}>No files here.</p>
  }

  return (
    <div>
      {hasFolders && (
        <>
          <p className={styles.sectionLabel}>Folders</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {folders.map(item => (
              <FileCard
                key={item.encPrefix}
                item={item}
                view={view}
                onOpen={onOpen}
                downloading={downloading}
              />
            ))}
          </div>
        </>
      )}
      {hasFiles && (
        <>
          <p className={styles.sectionLabel}>Files</p>
          <div className={view === 'grid' ? styles.grid : styles.listContainer}>
            {files.map(item => (
              <FileCard
                key={item.key}
                item={item}
                view={view}
                onOpen={onOpen}
                downloading={downloading}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
