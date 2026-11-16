import type { ZhihuComment, ZhihuContentType, ZhihuFeedItem, ZhihuPage, ZhihuResult } from './zhihu'
import type { TiebaPage, TiebaPost, TiebaResult, TiebaSort, TiebaThread } from './tieba'

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
  zhihuTitleSize: number
  zhihuBodySize: number
  zhihuHintSize: number
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

export type ReaderView = 'home' | 'book' | 'zhihu' | 'tieba'
export type ReaderCommand = 'return-home' | 'open-book' | 'toggle-menu' | 'toggle-hide-on-leave' | 'settings' | 'previous-page' | 'next-page'

export interface ReaderApi {
  getTiebaRecentForums: () => Promise<string[]>
  rememberTiebaForum: (forum: string) => Promise<string[]>
  getTiebaThreads: (forum: string, page: number, sort: TiebaSort) => Promise<TiebaResult<TiebaPage<TiebaThread>>>
  getTiebaPosts: (threadId: string, page: number) => Promise<TiebaResult<TiebaPage<TiebaPost>>>
  getTiebaReplies: (threadId: string, postId: string, page: number) => Promise<TiebaResult<TiebaPage<TiebaPost>>>
  getTiebaImage: (urls: string[]) => Promise<TiebaResult<string>>
  getZhihuCookieStatus: () => Promise<boolean>
  saveZhihuCookie: (cookie: string) => Promise<ZhihuResult<boolean>>
  clearZhihuCookie: () => Promise<void>
  getZhihuFeed: (next?: string) => Promise<ZhihuResult<ZhihuPage<ZhihuFeedItem>>>
  getZhihuDetail: (type: ZhihuContentType, id: string) => Promise<ZhihuResult<ZhihuFeedItem>>
  getZhihuComments: (type: ZhihuContentType, id: string, next?: string) => Promise<ZhihuResult<ZhihuPage<ZhihuComment>>>
  getZhihuReplies: (id: string, next?: string) => Promise<ZhihuResult<ZhihuPage<ZhihuComment>>>
  getZhihuImage: (url: string) => Promise<ZhihuResult<string>>
  getSettings: () => Promise<ReaderSettings>
  saveSettings: (settings: ReaderSettings) => Promise<SettingsResult>
  openBook: () => Promise<BookData | null>
  isCursorOutside: () => Promise<boolean>
  restoreBook: () => Promise<BookData | null>
  decodeBook: (encoding: string) => Promise<BookData | null>
  saveProgress: (path: string, progress: number) => Promise<void>
  saveProgressSync: (path: string, progress: number) => void
  onCommand: (listener: (command: ReaderCommand) => void) => () => void
  showContextMenu: (hasSelection: boolean, view: ReaderView) => Promise<void>
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
