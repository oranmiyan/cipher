import styles from './EmptyState.module.css'

const CONFIGS = {
  home: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="20" width="64" height="38" rx="4" stroke="#3a3b3d" strokeWidth="2"/>
        <path d="M8 28h64" stroke="#3a3b3d" strokeWidth="1.5"/>
        <rect x="8" y="10" width="28" height="12" rx="2" stroke="#3a3b3d" strokeWidth="1.5"/>
        <path d="M32 44h16M40 36v16" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: 'This folder is empty',
    sub: 'Upload files or create a folder to get started',
  },
  starred: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="40,10 47,26 65,28 52,41 55,58 40,50 25,58 28,41 15,28 33,26" stroke="#3a3b3d" strokeWidth="2" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'No starred files',
    sub: 'Right-click any file or folder and choose Star to pin it here',
  },
  recent: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="40" cy="32" r="22" stroke="#3a3b3d" strokeWidth="2"/>
        <path d="M40 20v12l8 6" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'No recent files',
    sub: 'Files you open will appear here for quick access',
  },
  search: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="34" cy="30" r="18" stroke="#3a3b3d" strokeWidth="2"/>
        <path d="M47 43l14 14" stroke="#3a3b3d" strokeWidth="2" strokeLinecap="round"/>
        <path d="M28 30h12M34 24v12" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: 'No results',
    sub: 'Try a different search term, or build the search index first',
  },
  searchReady: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="34" cy="30" r="18" stroke="#3a3b3d" strokeWidth="2"/>
        <path d="M47 43l14 14" stroke="#3a3b3d" strokeWidth="2" strokeLinecap="round"/>
        <path d="M28 30h12M34 24v12" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: 'No results',
    sub: 'No files match your search',
  },
  trash: {
    icon: (
      <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 22h40M30 22v-4a2 2 0 012-2h16a2 2 0 012 2v4" stroke="#3a3b3d" strokeWidth="2" strokeLinecap="round"/>
        <rect x="22" y="22" width="36" height="34" rx="3" stroke="#3a3b3d" strokeWidth="2"/>
        <path d="M33 32v14M40 32v14M47 32v14" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Trash is empty',
    sub: 'Deleted files appear here before being permanently removed',
  },
}

export default function EmptyState({ section }) {
  const cfg = CONFIGS[section] || CONFIGS.home
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>{cfg.icon}</div>
      <p className={styles.title}>{cfg.title}</p>
      <p className={styles.sub}>{cfg.sub}</p>
    </div>
  )
}
