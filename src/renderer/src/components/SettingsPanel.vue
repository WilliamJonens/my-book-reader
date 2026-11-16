<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { ReaderSettings, ReaderView } from '../../../shared/reader'
import { eventToShortcut } from '../utils/keyboard'

/*** 阅读设置由父组件保存；当前板块决定专属设置是否显示。 */
const props = defineProps<{ settings: ReaderSettings; view: ReaderView }>()
const emit = defineEmits<{
  change: [patch: Partial<ReaderSettings>]
  close: []
}>()

/*** Cookie 仅留在输入框中，保存后清空，不回显已保存的值。 */
const zhihuCookie = shallowRef('')
const cookieSaved = shallowRef(false)
const cookieMessage = shallowRef('')
onMounted(async () => {
  if (props.view === 'zhihu') cookieSaved.value = await window.api.getZhihuCookieStatus()
})

/*** 将用户输入交给主进程加密保存。 */
async function saveCookie(): Promise<void> {
  const result = await window.api.saveZhihuCookie(zhihuCookie.value)
  cookieMessage.value = result.ok ? '知乎 Cookie 已保存。' : (result.error || '保存失败。')
  if (result.ok) { cookieSaved.value = true; zhihuCookie.value = '' }
}

/*** 清除本机保存的知乎 Cookie。 */
async function clearCookie(): Promise<void> {
  await window.api.clearZhihuCookie()
  cookieSaved.value = false
  zhihuCookie.value = ''
  cookieMessage.value = '知乎 Cookie 已清除。'
}

/*** 更新单项设置。 */
function update<K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]): void {
  emit('change', { [key]: value } as Partial<ReaderSettings>)
}

/*** 记录用户按下的翻页键或老板键。 */
function capture(event: KeyboardEvent, key: 'nextPageKey' | 'prevPageKey' | 'bossShortcut'): void {
  event.preventDefault()
  const shortcut = eventToShortcut(event)
  if (shortcut) update(key, shortcut)
}
</script>

<template>
  <section class="settings-panel" aria-label="阅读设置">
    <div class="settings-head">
      <strong>阅读设置</strong>
      <button type="button" @click="emit('close')">完成</button>
    </div>
    <div class="settings-list">
      <div v-if="props.view === 'zhihu'" class="cookie-setting">
        <strong>知乎 Cookie</strong>
        <small>{{ cookieSaved ? '已保存，可输入新 Cookie 替换' : '未配置' }}</small>
        <textarea v-model="zhihuCookie" rows="3" placeholder="粘贴知乎网页请求中的 Cookie" autocomplete="off" spellcheck="false"></textarea>
        <div class="cookie-actions">
          <button type="button" @click="saveCookie">保存或更改</button>
          <button v-if="cookieSaved" type="button" @click="clearCookie">清除</button>
        </div>
        <small v-if="cookieMessage" role="status">{{ cookieMessage }}</small>
      </div>
      <label class="setting-row">
        <span>鼠标移出后隐去内容</span>
        <input type="checkbox" :checked="props.settings.hideOnLeave" @change="update('hideOnLeave', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting-row">
        <span>移出后自动滚动（仅在移出隐藏关闭时生效）</span>
        <input type="checkbox" :checked="props.settings.autoScroll" @change="update('autoScroll', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting-row">
        <span>自动滚动速度 <small>{{ props.settings.scrollSpeed }} 像素/秒</small></span>
        <input type="range" min="5" max="150" :value="props.settings.scrollSpeed" @input="update('scrollSpeed', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="setting-row">
        <span>老板键</span>
        <input type="checkbox" :checked="props.settings.bossKeyEnabled" @change="update('bossKeyEnabled', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting-row">
        <span>老板键组合</span>
        <input class="key-input" type="text" readonly :value="props.settings.bossShortcut" @keydown="capture($event, 'bossShortcut')" />
      </label>
      <label class="setting-row">
        <span>下一页</span>
        <input class="key-input" type="text" readonly :value="props.settings.nextPageKey" @keydown="capture($event, 'nextPageKey')" />
      </label>
      <label class="setting-row">
        <span>上一页</span>
        <input class="key-input" type="text" readonly :value="props.settings.prevPageKey" @keydown="capture($event, 'prevPageKey')" />
      </label>
      <label class="setting-row">
        <span>显示工具栏 <small>Ctrl+M 可切换</small></span>
        <input type="checkbox" :checked="props.settings.showToolbar" @change="update('showToolbar', ($event.target as HTMLInputElement).checked)" />
      </label>
      <!-- 阅读区滚动条外观开关，不影响滚轮和翻页。 -->
      <label class="setting-row">
        <span>隐藏阅读区滚动条</span>
        <input type="checkbox" :checked="props.settings.hideScrollbar" @change="update('hideScrollbar', ($event.target as HTMLInputElement).checked)" />
      </label>
      <label class="setting-row">
        <span>背景透明度 <small>{{ Math.round(props.settings.backgroundOpacity * 100) }}%</small></span>
        <input type="range" min="0" max="100" :value="props.settings.backgroundOpacity * 100" @input="update('backgroundOpacity', Number(($event.target as HTMLInputElement).value) / 100)" />
      </label>
      <label class="setting-row">
        <span>字体大小 <small>{{ props.settings.fontSize }} px</small></span>
        <input type="range" min="12" max="40" :value="props.settings.fontSize" @input="update('fontSize', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="setting-row">
        <span>字体颜色</span>
        <input type="color" :value="props.settings.fontColor" @input="update('fontColor', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="setting-row">
        <span>字体透明度 <small>{{ Math.round(props.settings.fontOpacity * 100) }}%</small></span>
        <input type="range" min="10" max="100" :value="props.settings.fontOpacity * 100" @input="update('fontOpacity', Number(($event.target as HTMLInputElement).value) / 100)" />
      </label>
      <!-- 知乎视图的三个文字层级分别调节。 -->
      <label class="setting-row">
        <span>知乎标题字号 <small>{{ props.settings.zhihuTitleSize }} px</small></span>
        <input type="range" min="12" max="28" :value="props.settings.zhihuTitleSize" @input="update('zhihuTitleSize', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="setting-row">
        <span>知乎正文字号 <small>{{ props.settings.zhihuBodySize }} px</small></span>
        <input type="range" min="11" max="26" :value="props.settings.zhihuBodySize" @input="update('zhihuBodySize', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="setting-row">
        <span>知乎描述与提示字号 <small>{{ props.settings.zhihuHintSize }} px</small></span>
        <input type="range" min="10" max="20" :value="props.settings.zhihuHintSize" @input="update('zhihuHintSize', Number(($event.target as HTMLInputElement).value))" />
      </label>
    </div>
    <p class="settings-note">点击快捷键输入框后按下新组合键。鼠标移出后窗口仍在原位，移入即可恢复。</p>
  </section>
</template>

<style scoped>
.cookie-setting { display: flex; flex-direction: column; padding: 14px 0; border-bottom: 1px solid #ffffff14; font-size: 13px; }
.cookie-setting small { margin-top: 5px; color: #a8b3c3; }
.cookie-setting textarea { width: 100%; margin-top: 9px; padding: 8px; resize: vertical; border: 1px solid #657185; border-radius: 5px; background: #202c3c; color: #f4f1ea; font-size: 12px; }
.cookie-actions { display: flex; margin-top: 8px; }
.cookie-actions button { margin-right: 8px; padding: 5px 9px; border: 1px solid #657185; border-radius: 5px; background: #202c3c; color: #f4f1ea; cursor: pointer; }
.settings-panel { position: absolute; z-index: 5; top: 52px; right: 16px; bottom: 16px; width: min(400px, calc(100% - 32px)); display: flex; flex-direction: column; border: 1px solid #495467; border-radius: 12px; background: #17202d; box-shadow: 0 12px 40px #0008; color: #f4f1ea; }
.settings-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #ffffff22; }
.settings-list { overflow-y: auto; padding: 2px 18px; }
.setting-row { display: flex; align-items: center; justify-content: space-between; min-height: 49px; border-bottom: 1px solid #ffffff14; font-size: 13px; }
.setting-row span { max-width: 62%; }
.setting-row small { display: block; color: #a8b3c3; font-size: 11px; }
.setting-row input[type='range'] { width: 110px; }
.setting-row input[type='checkbox'] { width: 16px; height: 16px; accent-color: #c3a77b; }
.setting-row input[type='color'] { width: 45px; height: 28px; border: 0; background: transparent; }
.key-input { width: 128px; padding: 5px; border: 1px solid #657185; border-radius: 5px; background: #202c3c; color: #f4f1ea; text-align: center; font-size: 12px; }
.settings-head button { border: 0; background: transparent; color: #d9c19b; cursor: pointer; }
.settings-note { margin: 0; padding: 10px 18px; border-top: 1px solid #ffffff22; color: #a8b3c3; font-size: 11px; }
</style>
