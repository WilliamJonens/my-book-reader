import { contextBridge, ipcRenderer } from 'electron'
import type { ReaderApi, ReaderCommand, ReaderSettings } from '../shared/reader'

const api: ReaderApi = {
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
  showContextMenu: (hasSelection: boolean) => ipcRenderer.invoke('reader:context-menu', hasSelection),
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
