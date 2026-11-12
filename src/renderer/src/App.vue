<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { BookData, ReaderSettings } from '../../shared/reader'
import SettingsPanel from './components/SettingsPanel.vue'
import { eventToShortcut } from './utils/keyboard'

/*** 当前阅读的小说与本地设置。 */
const book = shallowRef<BookData | null>(null)
const settings = shallowRef<ReaderSettings | null>(null)
const showSettings = shallowRef(false)
const message = shallowRef('')
const reader = useTemplateRef<HTMLElement>('reader')
const progress = shallowRef(0)
/*** 正文按原有换行分段，仅渲染可见段。 */
const chunks = shallowRef<Array<{ start: number; text: string }>>([])
const readerWidth = shallowRef(600)
const virtualizer = useVirtualizer(computed(() => ({
  count: chunks.value.length,
  getScrollElement: () => reader.value,
  estimateSize: (index: number) => {
    const fontSize = settings.value?.fontSize ?? 19
    const charsPerLine = Math.max(8, readerWidth.value / (fontSize * 0.75))
    return Math.max(fontSize * 1.85, Math.ceil(chunks.value[index].text.length / charsPerLine) * fontSize * 1.85)
  },
  overscan: 3
})))
const virtualRows = computed(() => virtualizer.value.getVirtualItems())
let restoringBook = false
/*** 窗口边缘和四角的拖拽方向。 */
const resizeEdges = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const
const resizing = shallowRef(false)
const moving = shallowRef(false)
const contextMenuOpen = shallowRef(false)
/*** 鼠标移出时仅让窗口内容不可见，保留窗口以便移入恢复。 */
const stealthHidden = shallowRef(false)
let scrollFrame = 0
let lastFrame = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined
let removeCommandListener: (() => void) | undefined

/*** 分离背景和文字透明度，避免背景设置影响文字。 */
const shellStyle = computed(() => ({
  backgroundColor: `rgba(15, 22, 31, ${settings.value?.backgroundOpacity ?? 0.82})`,
  opacity: stealthHidden.value ? 0 : 1
}))
const textStyle = computed(() => ({
  color: settings.value?.fontColor ?? '#f5f1e8',
  opacity: settings.value?.fontOpacity ?? 1,
  fontSize: `${settings.value?.fontSize ?? 19}px`
}))
const encodingOptions = computed(() => Array.from(new Set([
  book.value?.encoding,
  'utf8', 'gb18030', 'gbk', 'utf16-le', 'utf16-be', 'big5'
].filter((value): value is string => Boolean(value)))))

/*** 将文本按原有换行分段，避免生成一个巨大的 DOM 文本节点。 */
function splitBook(content: string): Array<{ start: number; text: string }> {
  const result: Array<{ start: number; text: string }> = []
  let start = 0
  while (start < content.length) {
    let end = Math.min(start + 1600, content.length)
    if (end < content.length) {
      const newline = content.lastIndexOf('\n', end)
      if (newline > start + 400) end = newline + 1
      else {
        const nextNewline = content.indexOf('\n', end)
        if (nextNewline !== -1 && nextNewline < start + 3200) end = nextNewline + 1
        else if (/^[\uD800-\uDBFF]$/.test(content[end - 1])) end--
      }
    }
    result.push({ start, text: content.slice(start, end).replace(/\n$/, '') })
    start = end
  }
  return result
}

/*** 将动态高度的可见段交给虚拟列表测量。 */
function measureRow(element: Element | ComponentPublicInstance | null): void {
  if (element instanceof Element) virtualizer.value.measureElement(element)
}

/*** 按文本位置定位虚拟列表，窗口重排后仍停在同一段。 */
async function scrollToProgress(value: number): Promise<void> {
  if (!book.value || !chunks.value.length) return
  const target = Math.floor(value * book.value.content.length)
  let low = 0
  let high = chunks.value.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (chunks.value[middle].start <= target) low = middle
    else high = middle - 1
  }
  virtualizer.value.scrollToIndex(low, { align: 'start' })
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  virtualizer.value.scrollToIndex(low, { align: 'start' })
}

/*** 窗口或字体变化时重新估算高度并恢复当前阅读位置。 */
async function syncReaderWidth(force = false): Promise<void> {
  if (!reader.value) return
  const style = getComputedStyle(reader.value)
  const width = reader.value.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  if (!force && width === readerWidth.value) return
  const wasRestoring = restoringBook
  const anchor = progress.value
  restoringBook = true
  readerWidth.value = width
  await nextTick()
  virtualizer.value.measure()
  if (!wasRestoring) {
    await scrollToProgress(anchor)
    requestAnimationFrame(() => {
      restoringBook = false
      updateProgress()
    })
  }
}

function onReaderResize(): void { void syncReaderWidth() }

/*** 将阅读区恢复到该文件上次保存的文本位置。 */
async function showBook(nextBook: BookData): Promise<void> {
  restoringBook = true
  book.value = nextBook
  chunks.value = splitBook(nextBook.content)
  progress.value = nextBook.progress
  await nextTick()
  await syncReaderWidth(true)
  await scrollToProgress(nextBook.progress)
  requestAnimationFrame(() => {
    restoringBook = false
    updateProgress()
  })
}

/*** 打开用户手动选取的 TXT。 */
async function openBook(): Promise<void> {
  contextMenuOpen.value = false
  try {
    if (book.value) {
      clearTimeout(saveTimer)
      await window.api.saveProgress(book.value.path, progress.value)
    }
    const result = await window.api.openBook()
    if (result) {
      message.value = ''
      await showBook(result)
      /*** 原生文件选择框可能吞掉移出事件，换书后按实际鼠标位置同步隐去状态。 */
      if (await window.api.isCursorOutside()) onMouseLeave()
      else onMouseEnter()
    }
  } catch (error) {
    message.value = `打开文件失败：${String(error)}`
  }
}

/*** 用指定编码重新解码当前文件。 */
async function changeEncoding(encoding: string): Promise<void> {
  const result = await window.api.decodeBook(encoding)
  if (result) await showBook({ ...result, progress: progress.value })
  else message.value = '无法使用该编码解码文件。'
}

/*** 按当前可见文本位置记录进度，避免滚动时读取整本书的布局高度。 */
function updateProgress(): void {
  if (restoringBook || !book.value || !reader.value || !chunks.value.length) return
  const offset = reader.value.scrollTop
  const row = virtualRows.value.find((item) => item.end > offset) ?? virtualRows.value[0]
  if (!row) return
  const chunk = chunks.value[row.index]
  const fraction = Math.max(0, Math.min(1, (offset - row.start) / row.size))
  progress.value = Math.max(0, Math.min(1, (chunk.start + fraction * chunk.text.length) / book.value.content.length))
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (book.value) void window.api.saveProgress(book.value.path, progress.value)
  }, 400)
}

/*** 关闭窗口前同步保存最后一次滚动位置。 */
function flushProgress(): void {
  if (book.value) {
    clearTimeout(saveTimer)
    window.api.saveProgressSync(book.value.path, progress.value)
  }
}

/*** 自动滚动仅在鼠标离开且“移出隐藏”关闭时启动。 */
function autoScrollFrame(timestamp: number): void {
  if (!reader.value || !settings.value?.autoScroll) return
  if (lastFrame) reader.value.scrollTop += settings.value.scrollSpeed * (timestamp - lastFrame) / 1000
  lastFrame = timestamp
  if (reader.value.scrollTop < virtualizer.value.getTotalSize() - reader.value.clientHeight) {
    scrollFrame = requestAnimationFrame(autoScrollFrame)
  }
}

/*** 停止自动滚动。 */
function stopAutoScroll(): void {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  lastFrame = 0
}

/*** 鼠标移出时隐去窗口内容；未启用隐去时才自动滚动。 */
function onMouseLeave(): void {
  if (resizing.value || moving.value || contextMenuOpen.value || !settings.value) return
  if (settings.value.hideOnLeave) {
    stopAutoScroll()
    stealthHidden.value = true
  } else if (!showSettings.value && settings.value.autoScroll && book.value) {
    stopAutoScroll()
    scrollFrame = requestAnimationFrame(autoScrollFrame)
  }
}

/*** 鼠标移入时恢复内容并停止自动滚动。 */
function onMouseEnter(): void {
  stealthHidden.value = false
  stopAutoScroll()
}

/*** 保存设置，老板键占用时保留原值并提示用户。 */
async function updateSettings(patch: Partial<ReaderSettings>): Promise<void> {
  if (!settings.value) return
  const next = { ...settings.value, ...patch }
  settings.value = next
  const result = await window.api.saveSettings(next)
  if (!result.ok) {
    settings.value = result.settings
    message.value = result.error ?? '设置保存失败。'
  } else {
    message.value = ''
  }
  if (!next.autoScroll || next.hideOnLeave) stopAutoScroll()
  if (!next.hideOnLeave) stealthHidden.value = false
  if (patch.fontSize !== undefined) {
    await nextTick()
    await syncReaderWidth(true)
  }
}

/*** 最小化阅读窗口。 */
function minimizeWindow(): void { window.api.minimizeWindow() }
/*** 退出应用。 */
function closeWindow(): void { window.api.closeWindow() }

/*** 按当前窗口可见高度翻动一屏。 */
function turnPage(direction: number): void {
  if (!book.value || !reader.value) return
  reader.value.scrollBy({ top: direction * reader.value.clientHeight * 0.9, behavior: 'auto' })
}

/*** 响应主进程右键菜单的命令。 */
function handleCommand(command: 'open-book' | 'toggle-menu' | 'toggle-hide-on-leave' | 'settings' | 'previous-page' | 'next-page'): void {
  if (command === 'open-book') void openBook()
  if (command === 'toggle-menu' && settings.value) void updateSettings({ showToolbar: !settings.value.showToolbar })
  if (command === 'toggle-hide-on-leave' && settings.value) void updateSettings({ hideOnLeave: !settings.value.hideOnLeave })
  if (command === 'settings') showSettings.value = !showSettings.value
  if (command === 'previous-page') turnPage(-1)
  if (command === 'next-page') turnPage(1)
}

/*** 在阅读区及工具栏右键打开操作菜单。 */
async function openContextMenu(): Promise<void> {
  contextMenuOpen.value = true
  try {
    await window.api.showContextMenu(Boolean(window.getSelection() && !window.getSelection()?.isCollapsed))
  } finally {
    contextMenuOpen.value = false
  }
}

/*** 顶部透明条按住时移动窗口，拖动期间保持内容可见。 */
function startMove(event: PointerEvent): void {
  if (event.button !== 0) return
  moving.value = true
  stealthHidden.value = false
  stopAutoScroll()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  window.api.moveStart()
}

/*** 按指针在屏幕上的位置移动窗口。 */
function moveWindow(): void {
  if (moving.value) window.api.moveWindow()
}

/*** 结束窗口移动。 */
function endMove(): void {
  if (!moving.value) return
  moving.value = false
  window.api.moveEnd()
}

/*** 透明窗口通过边缘拖拽主动调整尺寸。 */
function startResize(event: PointerEvent, edge: string): void {
  if (event.button !== 0) return
  resizing.value = true
  stopAutoScroll()
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  window.api.resizeStart(edge)
}

/*** 拖动期间按当前屏幕指针位置更新窗口尺寸。 */
function moveResize(): void {
  if (resizing.value) window.api.resizeMove()
}

/*** 拖动结束后清除主进程的缩放状态。 */
function endResize(): void {
  if (!resizing.value) return
  resizing.value = false
  window.api.resizeEnd()
}

/*** 自定义按键每次翻动一屏；Ctrl+M 切换工具栏。 */
function onKeyDown(event: KeyboardEvent): void {
  if (!settings.value || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  const key = eventToShortcut(event)
  if (key === 'Control+M') {
    event.preventDefault()
    void updateSettings({ showToolbar: !settings.value.showToolbar })
    return
  }
  if (key === 'Control+,') {
    event.preventDefault()
    showSettings.value = !showSettings.value
    return
  }
  if (!book.value || !reader.value || showSettings.value) return
  const direction = key === settings.value.nextPageKey ? 1 : key === settings.value.prevPageKey ? -1 : 0
  if (direction) {
    event.preventDefault()
    turnPage(direction)
  }
}

onMounted(async () => {
  settings.value = await window.api.getSettings()
  removeCommandListener = window.api.onCommand(handleCommand)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onReaderResize)
  window.addEventListener('beforeunload', flushProgress)
  const lastBook = await window.api.restoreBook()
  if (lastBook) await showBook(lastBook)
})
onUnmounted(() => {
  stopAutoScroll()
  flushProgress()
  endResize()
  endMove()
  removeCommandListener?.()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onReaderResize)
  window.removeEventListener('beforeunload', flushProgress)
})
</script>

<template>
  <main class="shell" :class="{ fullyTransparent: settings?.backgroundOpacity === 0 }" :style="shellStyle" @mouseleave="onMouseLeave" @mouseenter="onMouseEnter" @contextmenu.prevent="openContextMenu">
    <!-- 顶部始终保留 10 像素透明区域，用于拖动窗口。 -->
    <div class="drag-strip" aria-hidden="true" @pointerdown="startMove" @pointermove="moveWindow" @pointerup="endMove" @pointercancel="endMove" @lostpointercapture="endMove"></div>
    <!-- 窗口边缘拖动区在透明窗口中提供缩放操作。 -->
    <div v-for="edge in resizeEdges" :key="edge" class="resize-handle" :class="edge"
      @pointerdown="startResize($event, edge)" @pointermove="moveResize"
      @pointerup="endResize" @pointercancel="endResize" @lostpointercapture="endResize"></div>
    <header v-if="settings?.showToolbar" class="toolbar">
      <div class="brand">my-book阅读器</div>
      <button type="button" @click="openBook">{{ book ? '换一本' : '打开 TXT' }}</button>
      <label v-if="book" class="encoding-label">编码
        <select :value="book.encoding" @change="changeEncoding(($event.target as HTMLSelectElement).value)">
          <option v-for="encoding in encodingOptions" :key="encoding" :value="encoding">{{ encoding }}</option>
        </select>
      </label>
      <div class="toolbar-spacer"></div>
      <button type="button" title="阅读设置" @click="showSettings = !showSettings">设置</button>
      <button class="toolbar-toggle" type="button" title="隐藏工具栏，Ctrl+M 恢复" @click="updateSettings({ showToolbar: false })">隐藏菜单</button>
      <button type="button" title="最小化" @click="minimizeWindow">—</button>
      <button type="button" title="退出" @click="closeWindow">×</button>
    </header>

    <div v-if="!book" class="empty-state">
      <h1>打开一本 TXT，开始阅读</h1>
      <p>小说仅在本地读取。可设置透明背景、翻页键与摸鱼操作。</p>
      <button v-if="!settings?.showToolbar" type="button" @click="openBook">打开 TXT</button>
      <p class="hint">Ctrl+M 显示或隐藏菜单 · Ctrl+, 打开设置</p>
    </div>
    <section v-else ref="reader" class="reader" :class="{ hideScrollbar: settings?.hideScrollbar }" aria-label="小说内容" @scroll="updateProgress">
      <h1 class="book-title">{{ book.name }}</h1>
      <!-- 只挂载视口附近的正文分段，保持滚轮和键盘翻页。 -->
      <div class="book-virtual" :style="{ height: virtualizer.getTotalSize() + 'px' }">
        <div v-for="row in virtualRows" :key="String(row.key)" :ref="measureRow" class="book-text"
          :data-index="row.index" :style="{ ...textStyle, transform: 'translateY(' + row.start + 'px)' }">{{ chunks[row.index].text }}</div>
      </div>
    </section>
    <footer v-if="book && settings?.showToolbar" class="status-bar">
      <span>{{ book.name }}</span><span>{{ Math.round(progress * 100) }}%</span>
    </footer>
    <div v-if="message" class="message" role="alert">{{ message }}</div>
    <SettingsPanel v-if="showSettings && settings" :settings="settings" @change="updateSettings" @close="showSettings = false" />
  </main>
</template>

<style scoped>
.shell { position: relative; display: flex; flex-direction: column; width: 100vw; height: 100vh; overflow: hidden; border: 1px solid #ffffff33; border-radius: 12px; color: #f5f1e8; }
.shell.fullyTransparent { border-color: transparent; }
.shell.fullyTransparent .toolbar { border-color: transparent; background: transparent; }
.shell.fullyTransparent .status-bar { border-color: transparent; }
.shell.fullyTransparent .toolbar button,
.shell.fullyTransparent .empty-state button,
.shell.fullyTransparent .encoding-label select { border-color: transparent; background: transparent; }
.shell.fullyTransparent .toolbar button:hover,
.shell.fullyTransparent .empty-state button:hover { background: transparent; }
.drag-strip { height: 10px; flex: none; background: transparent; cursor: move; touch-action: none; -webkit-app-region: no-drag; }
.resize-handle { position: absolute; z-index: 20; -webkit-app-region: no-drag; touch-action: none; }
.resize-handle.n, .resize-handle.s { left: 12px; right: 12px; height: 7px; cursor: ns-resize; }
.resize-handle.n { top: 10px; }
.resize-handle.s { bottom: 0; }
.resize-handle.e, .resize-handle.w { top: 12px; bottom: 12px; width: 7px; cursor: ew-resize; }
.resize-handle.e { right: 0; }
.resize-handle.w { left: 0; }
.resize-handle.ne, .resize-handle.sw { width: 12px; height: 12px; cursor: nesw-resize; }
.resize-handle.nw, .resize-handle.se { width: 12px; height: 12px; cursor: nwse-resize; }
.resize-handle.ne, .resize-handle.nw { top: 10px; }
.resize-handle.se, .resize-handle.sw { bottom: 0; }
.resize-handle.ne, .resize-handle.se { right: 0; }
.resize-handle.nw, .resize-handle.sw { left: 0; }
.toolbar { display: flex; align-items: center; overflow: hidden; min-height: 45px; padding: 0 12px; border-bottom: 1px solid #ffffff28; background: #11192366; -webkit-app-region: no-drag; }
.toolbar button, .toolbar select { -webkit-app-region: no-drag; }
.brand { margin-right: 18px; white-space: nowrap; font-weight: 600; font-size: 13px; }
.toolbar button, .empty-state button { margin-right: 5px; padding: 6px 10px; border: 1px solid #ffffff38; border-radius: 5px; background: #ffffff12; color: inherit; cursor: pointer; font-size: 12px; white-space: nowrap; }
.toolbar button:hover, .empty-state button:hover { background: #ffffff27; }
.toolbar-spacer { flex: 1; }
.encoding-label { margin-left: 8px; font-size: 12px; white-space: nowrap; -webkit-app-region: no-drag; }
.encoding-label select { max-width: 95px; margin-left: 5px; padding: 4px; border: 1px solid #ffffff38; border-radius: 5px; background: #202b38; color: inherit; font-size: 11px; }
.reader { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 22px 36px 38px; scrollbar-width: thin; scrollbar-color: #ffffff55 transparent; }
.reader.hideScrollbar { scrollbar-width: none; }
.reader.hideScrollbar::-webkit-scrollbar { display: none; }
.book-title { margin: 0 0 24px; color: #d7c19f; font-size: 14px; font-weight: 500; }
.book-virtual { position: relative; flex: none; }
.book-text { position: absolute; top: 0; left: 0; right: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.85; user-select: text; }
.status-bar { display: flex; justify-content: space-between; overflow: hidden; flex: none; padding: 6px 16px; border-top: 1px solid #ffffff28; color: #ffffffa8; font-size: 11px; }
.status-bar span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.empty-state { display: flex; flex: 1; min-height: 0; overflow: auto; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }
.empty-state h1 { font-size: 22px; font-weight: 500; }
.empty-state p { margin-top: 12px; color: #ffffffa8; font-size: 13px; }
.empty-state button { margin-top: 22px; }
.empty-state .hint { margin-top: 28px; font-size: 11px; }
.message { position: absolute; right: 20px; bottom: 20px; max-width: 70%; padding: 10px 14px; border-radius: 7px; background: #7b2b2b; color: white; font-size: 12px; }
@media (max-width: 560px) { .brand { display: none; } .reader { padding: 16px 20px; } .toolbar button { padding: 5px; } }
@media (max-width: 430px) { .encoding-label { display: none; } }
@media (max-width: 300px) { .toolbar { padding: 0 6px; } .toolbar-toggle { display: none; } .toolbar button { margin-right: 3px; padding: 5px 4px; } }
@media (prefers-reduced-motion: reduce) { .reader { scroll-behavior: auto; } }
</style>
