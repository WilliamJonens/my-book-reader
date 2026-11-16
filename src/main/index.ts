import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, screen, Tray } from 'electron'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { detect } from 'chardet'
import iconv from 'iconv-lite'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { BookData, ReaderCommand, ReaderSettings, ReaderView, SettingsResult } from '../shared/reader'
import type { ZhihuContentType, ZhihuResult } from '../shared/zhihu'
import type { TiebaSort } from '../shared/tieba'
import { createZhihuClient } from './zhihu'
import { createTiebaClient } from './tieba'

const defaultSettings: ReaderSettings = {
  hideOnLeave: false,
  autoScroll: false,
  scrollSpeed: 35,
  backgroundOpacity: 0.82,
  showToolbar: true,
  hideScrollbar: false,
  fontSize: 19,
  fontColor: '#f5f1e8',
  fontOpacity: 1,
  zhihuTitleSize: 16,
  zhihuBodySize: 14,
  zhihuHintSize: 11,
  bossKeyEnabled: false,
  bossShortcut: 'Control+Shift+Space',
  nextPageKey: 'PageDown',
  prevPageKey: 'PageUp'
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let selectedPath: string | null = null
let selectedBuffer: Buffer | null = null

function showWindow(): void {
  mainWindow?.show()
  mainWindow?.focus()
}

function createWindow(size: { width: number; height: number }): void {
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    title: 'my-book阅读器',
    minWidth: 220,
    minHeight: 130,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })

  mainWindow.on('ready-to-show', showWindow)
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function detectedEncoding(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf16-le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf16-be'
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf8'
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return 'utf8'
  } catch {
    const guess = detect(bytes.subarray(0, 262144))
    return guess && iconv.encodingExists(guess) ? guess : 'gb18030'
  }
}

function decodeCurrent(encoding: string, progress: number): BookData | null {
  if (!selectedPath || !selectedBuffer || !iconv.encodingExists(encoding)) return null
  return {
    name: basename(selectedPath),
    path: selectedPath,
    content: iconv.decode(selectedBuffer, encoding),
    encoding,
    progress
  }
}

/*** 沿用旧版数据目录，避免更名后丢失阅读设置和进度。 */
app.setPath('userData', join(app.getPath('appData'), 'desktop'))

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store')
  const store = new Store<{
    settings: ReaderSettings
    progress: Record<string, number>
    lastBookPath: string
    lastEncoding: string
    windowSize: { width: number; height: number }
    zhihuCookie: string
    tiebaForums: string[]
  }>({ defaults: { settings: defaultSettings, progress: {}, lastBookPath: '', lastEncoding: '', windowSize: { width: 760, height: 620 }, zhihuCookie: '', tiebaForums: [] } })
  /*** Cookie 只在主进程解密；设置面板仅查询是否已保存。 */
  const getZhihuCookie = (): string => {
    const encrypted = store.get('zhihuCookie')
    return encrypted && safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(Buffer.from(encrypted, 'base64')) : ''
  }
  const zhihu = createZhihuClient(getZhihuCookie)
  const tieba = createTiebaClient()
  /*** 只在本机保存最近访问过的吧名，重复访问时移到最前。 */
  ipcMain.handle('tieba:recent-forums', (): string[] => store.get('tiebaForums'))
  ipcMain.handle('tieba:remember-forum', (_event, forum: string): string[] => {
    const name = forum.trim()
    if (!name || name.length > 80) return store.get('tiebaForums')
    const recent = [name, ...store.get('tiebaForums').filter(item => item !== name)].slice(0, 10)
    store.set('tiebaForums', recent)
    return recent
  })
  ipcMain.handle('tieba:threads', (_event, forum: string, page: number, sort: TiebaSort) => tieba.threads(forum, page, sort))
  ipcMain.handle('tieba:posts', (_event, threadId: string, page: number) => tieba.posts(threadId, page))
  ipcMain.handle('tieba:replies', (_event, threadId: string, postId: string, page: number) => tieba.replies(threadId, postId, page))
  ipcMain.handle('tieba:image', (_event, urls: string[]) => tieba.image(urls))
  ipcMain.handle('zhihu:cookie-status', () => Boolean(store.get('zhihuCookie')))
  ipcMain.handle('zhihu:save-cookie', (_event, cookie: string): ZhihuResult<boolean> => {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: '系统加密服务不可用，无法保存 Cookie。' }
    if (typeof cookie !== 'string' || !cookie.includes('=')) return { ok: false, error: '请输入有效的知乎 Cookie。' }
    store.set('zhihuCookie', safeStorage.encryptString(cookie.trim()).toString('base64'))
    return { ok: true, data: true }
  })
  ipcMain.handle('zhihu:clear-cookie', () => { store.set('zhihuCookie', '') })
  ipcMain.handle('zhihu:feed', (_event, next?: string) => zhihu.feed(next))
  ipcMain.handle('zhihu:detail', (_event, type: ZhihuContentType, id: string) => zhihu.detail(type, id))
  ipcMain.handle('zhihu:comments', (_event, type: ZhihuContentType, id: string, next?: string) => zhihu.comments(type, id, next))
  ipcMain.handle('zhihu:replies', (_event, id: string, next?: string) => zhihu.replies(id, next))
  ipcMain.handle('zhihu:image', (_event, url: string) => zhihu.image(url))
  const progressKey = (path: string): string => Buffer.from(path).toString('base64url')
  const getProgress = (path: string): number => store.get('progress')[progressKey(path)] ?? 0
  const saveProgress = (path: string, progress: number): void => {
    if (path !== selectedPath || !Number.isFinite(progress)) return
    store.set(`progress.${progressKey(path)}`, Math.max(0, Math.min(1, progress)))
  }
  const loadBook = async (path: string, savedEncoding?: string): Promise<BookData | null> => {
    const bytes = await readFile(path)
    const encoding = savedEncoding && iconv.encodingExists(savedEncoding)
      ? savedEncoding : detectedEncoding(bytes)
    selectedPath = path
    selectedBuffer = bytes
    const book = decodeCurrent(encoding, getProgress(path))
    if (book) {
      store.set('lastBookPath', path)
      store.set('lastEncoding', encoding)
    }
    return book
  }
  const registerBossKey = (settings: ReaderSettings): boolean => {
    globalShortcut.unregisterAll()
    if (!settings.bossKeyEnabled) return true
    try {
      return globalShortcut.register(settings.bossShortcut, () => {
        if (mainWindow?.isVisible()) mainWindow.hide()
        else showWindow()
      })
    } catch {
      return false
    }
  }
  const sendCommand = (command: ReaderCommand): void => {
    mainWindow?.webContents.send('reader:command', command)
  }
  let resizeSession: { edge: string; bounds: Electron.Rectangle; cursor: Electron.Point } | null = null
  let moveSession: { bounds: Electron.Rectangle; cursor: Electron.Point } | null = null

  electronApp.setAppUserModelId('com.mybook.reader')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  createWindow(store.get('windowSize'))
  /*** 所有阅读板块共用窗口尺寸，缩放结束和关闭时都保存。 */
  const saveWindowSize = (): void => {
    if (!mainWindow) return
    const [width, height] = mainWindow.getSize()
    store.set('windowSize', { width, height })
  }
  mainWindow?.on('close', saveWindowSize)
  registerBossKey(store.get('settings'))

  ipcMain.handle('reader:context-menu', (_event, hasSelection: boolean, view: ReaderView): Promise<void> => {
    const currentSettings = store.get('settings')
    const menu = Menu.buildFromTemplate([
      { label: '返回主菜单', visible: view !== 'home', click: () => sendCommand('return-home') },
      { label: '换一本 TXT', visible: view === 'book', click: () => sendCommand('open-book') },
      { label: currentSettings.showToolbar ? '隐藏菜单' : '显示菜单', visible: view !== 'home', click: () => sendCommand('toggle-menu') },
      { label: '鼠标移出后隐去内容', type: 'checkbox', checked: currentSettings.hideOnLeave, click: () => sendCommand('toggle-hide-on-leave') },
      { label: '阅读设置', click: () => sendCommand('settings') },
      { type: 'separator' },
      { label: '上一页', visible: view === 'book', click: () => sendCommand('previous-page') },
      { label: '下一页', visible: view === 'book', click: () => sendCommand('next-page') },
      { label: '复制选中文字', role: 'copy', enabled: hasSelection },
      { type: 'separator' },
      { label: '隐藏窗口', click: () => mainWindow?.hide() }
    ])
    return new Promise((resolve) => menu.popup({ window: mainWindow!, callback: resolve }))
  })

  const trayImage = nativeImage.createFromPath(icon)
  tray = new Tray(trayImage)
  tray.setToolTip('my-book阅读器')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示阅读器', click: showWindow },
    { label: '退出', click: () => app.quit() }
  ]))
  tray.on('double-click', showWindow)

  ipcMain.handle('reader:get-settings', () => ({ ...defaultSettings, ...store.get('settings') }))
  /*** 原生文件选择框关闭后，用屏幕坐标确认鼠标是否已离开阅读窗口。 */
  ipcMain.handle('reader:cursor-outside', (): boolean => {
    if (!mainWindow) return false
    const { x, y, width, height } = mainWindow.getBounds()
    const cursor = screen.getCursorScreenPoint()
    return cursor.x < x || cursor.x >= x + width || cursor.y < y || cursor.y >= y + height
  })
  ipcMain.handle('reader:save-settings', (_, settings: ReaderSettings): SettingsResult => {
    const previous = store.get('settings')
    if (settings.bossKeyEnabled && (!settings.bossShortcut || !registerBossKey(settings))) {
      registerBossKey(previous)
      return { ok: false, settings: previous, error: '老板键快捷键不可用，请换一个组合键。' }
    }
    if (!settings.bossKeyEnabled) registerBossKey(settings)
    store.set('settings', settings)
    return { ok: true, settings }
  })
  ipcMain.handle('reader:open-book', async (): Promise<BookData | null> => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'TXT 文本', extensions: ['txt'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return loadBook(result.filePaths[0])
  })
  ipcMain.handle('reader:restore-book', async (): Promise<BookData | null> => {
    const path = store.get('lastBookPath')
    if (!path) return null
    try {
      return await loadBook(path, store.get('lastEncoding'))
    } catch {
      store.set('lastBookPath', '')
      return null
    }
  })
  ipcMain.handle('reader:decode-book', (_, encoding: string): BookData | null => {
    const book = decodeCurrent(encoding, selectedPath ? getProgress(selectedPath) : 0)
    if (book) store.set('lastEncoding', encoding)
    return book
  })
  ipcMain.handle('reader:save-progress', (_, path: string, progress: number): void => saveProgress(path, progress))
  ipcMain.on('reader:save-progress-sync', (event, path: string, progress: number) => {
    saveProgress(path, progress)
    event.returnValue = true
  })
  ipcMain.on('reader:resize-start', (_event, edge: string) => {
    if (!mainWindow || !/^(n|s|e|w|ne|nw|se|sw)$/.test(edge)) return
    resizeSession = { edge, bounds: mainWindow.getBounds(), cursor: screen.getCursorScreenPoint() }
  })
  ipcMain.on('reader:resize-move', () => {
    if (!mainWindow || !resizeSession) return
    const { edge, bounds, cursor } = resizeSession
    const point = screen.getCursorScreenPoint()
    const dx = point.x - cursor.x
    const dy = point.y - cursor.y
    const width = Math.max(220, bounds.width + (edge.includes('e') ? dx : edge.includes('w') ? -dx : 0))
    const height = Math.max(130, bounds.height + (edge.includes('s') ? dy : edge.includes('n') ? -dy : 0))
    mainWindow.setBounds({
      x: edge.includes('w') ? bounds.x + bounds.width - width : bounds.x,
      y: edge.includes('n') ? bounds.y + bounds.height - height : bounds.y,
      width,
      height
    })
  })
  ipcMain.on('reader:resize-end', () => {
    if (resizeSession) saveWindowSize()
    resizeSession = null
  })
  ipcMain.on('reader:move-start', () => {
    if (mainWindow) moveSession = { bounds: mainWindow.getBounds(), cursor: screen.getCursorScreenPoint() }
  })
  ipcMain.on('reader:move', () => {
    if (!mainWindow || !moveSession) return
    const cursor = screen.getCursorScreenPoint()
    mainWindow.setPosition(
      moveSession.bounds.x + cursor.x - moveSession.cursor.x,
      moveSession.bounds.y + cursor.y - moveSession.cursor.y
    )
  })
  ipcMain.on('reader:move-end', () => { moveSession = null })
  ipcMain.on('reader:hide', () => mainWindow?.hide())
  ipcMain.on('reader:minimize', () => mainWindow?.minimize())
  ipcMain.on('reader:close', () => app.quit())
})

app.on('will-quit', () => globalShortcut.unregisterAll())
