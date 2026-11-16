import { contextBridge, ipcRenderer } from 'electron'
import type { ReaderApi, ReaderCommand, ReaderSettings } from '../shared/reader'

const api: ReaderApi = {
  getTiebaRecentForums: () => ipcRenderer.invoke('tieba:recent-forums'),
  rememberTiebaForum: (forum: string) => ipcRenderer.invoke('tieba:remember-forum', forum),
  getTiebaThreads: (forum, page, sort) => ipcRenderer.invoke('tieba:threads', forum, page, sort),
  getTiebaPosts: (threadId: string, page: number) => ipcRenderer.invoke('tieba:posts', threadId, page),
  getTiebaReplies: (threadId: string, postId: string, page: number) => ipcRenderer.invoke('tieba:replies', threadId, postId, page),
  getTiebaImage: (urls: string[]) => ipcRenderer.invoke('tieba:image', urls),
  getZhihuCookieStatus: () => ipcRenderer.invoke('zhihu:cookie-status'),
  saveZhihuCookie: (cookie: string) => ipcRenderer.invoke('zhihu:save-cookie', cookie),
  clearZhihuCookie: () => ipcRenderer.invoke('zhihu:clear-cookie'),
  getZhihuFeed: (next?: string) => ipcRenderer.invoke('zhihu:feed', next),
  getZhihuDetail: (type, id) => ipcRenderer.invoke('zhihu:detail', type, id),
  getZhihuComments: (type, id, next?: string) => ipcRenderer.invoke('zhihu:comments', type, id, next),
  getZhihuReplies: (id, next?: string) => ipcRenderer.invoke('zhihu:replies', id, next),
  getZhihuImage: (url: string) => ipcRenderer.invoke('zhihu:image', url),
  getSettings: () => ipcRenderer.invoke('reader:get-settings'),
  saveSettings: (settings: ReaderSettings) => ipcRenderer.invoke('reader:save-settings', settings),
  openBook: () => ipcRenderer.invoke('reader:open-book'),
  isCursorOutside: () => ipcRenderer.invoke('reader:cursor-outside'),
  restoreBook: () => ipcRenderer.invoke('reader:restore-book'),
  decodeBook: (encoding: string) => ipcRenderer.invoke('reader:decode-book', encoding),
  saveProgress: (path: string, progress: number) => ipcRenderer.invoke('reader:save-progress', path, progress),
  saveProgressSync: (path: string, progress: number) => { ipcRenderer.sendSync('reader:save-progress-sync', path, progress) },
  onCommand: (listener: (command: ReaderCommand) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, command: ReaderCommand): void => listener(command)
    ipcRenderer.on('reader:command', handler)
    return () => ipcRenderer.removeListener('reader:command', handler)
  },
  showContextMenu: (hasSelection, view) => ipcRenderer.invoke('reader:context-menu', hasSelection, view),
  resizeStart: (edge: string) => ipcRenderer.send('reader:resize-start', edge),
  resizeMove: () => ipcRenderer.send('reader:resize-move'),
  resizeEnd: () => ipcRenderer.send('reader:resize-end'),
  moveStart: () => ipcRenderer.send('reader:move-start'),
  moveWindow: () => ipcRenderer.send('reader:move'),
  moveEnd: () => ipcRenderer.send('reader:move-end'),
  hideWindow: () => ipcRenderer.send('reader:hide'),
  minimizeWindow: () => ipcRenderer.send('reader:minimize'),
  closeWindow: () => ipcRenderer.send('reader:close')
}

contextBridge.exposeInMainWorld('api', api)
