/***
 * 将键盘事件转成可保存、可比较的快捷键字符串。
 * @param event 键盘事件。
 * @returns Electron 兼容的快捷键字符串；单独按修饰键时返回空字符串。
 */
export function eventToShortcut(event: KeyboardEvent): string {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return ''
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Meta')
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join('+')
}
