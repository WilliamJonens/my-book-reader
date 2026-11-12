export interface ReaderSettings {
  hideOnLeave: boolean
  autoScroll: boolean
  scrollSpeed: number
  backgroundOpacity: number
  showToolbar: boolean
  hideScrollbar: boolean
  fontSize: number
  fontColor: string
  fontOpacity: number
  bossKeyEnabled: boolean
  bossShortcut: string
  nextPageKey: string
  prevPageKey: string
}

export interface BookData {
  name: string
  path: string
  content: string
  encoding: string
  progress: number
}

export interface SettingsResult {
  ok: boolean
  settings: ReaderSettings
  error?: string
}

export type ReaderCommand = 'open-book' | 'toggle-menu' | 'toggle-hide-on-leave' | 'settings' | 'previous-page' | 'next-page'

export interface ReaderApi {
  getSettings: () => Promise<ReaderSettings>
  saveSettings: (settings: ReaderSettings) => Promise<SettingsResult>
  openBook: () => Promise<BookData | null>
  isCursorOutside: () => Promise<boolean>
  restoreBook: () => Promise<BookData | null>
  decodeBook: (encoding: string) => Promise<BookData | null>
  saveProgress: (path: string, progress: number) => Promise<void>
  saveProgressSync: (path: string, progress: number) => void
  onCommand: (listener: (command: ReaderCommand) => void) => () => void
  showContextMenu: (hasSelection: boolean) => Promise<void>
  resizeStart: (edge: string) => void
  resizeMove: () => void
  resizeEnd: () => void
  moveStart: () => void
  moveWindow: () => void
  moveEnd: () => void
  hideWindow: () => void
  minimizeWindow: () => void
  closeWindow: () => void
}
