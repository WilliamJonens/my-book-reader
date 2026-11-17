<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, shallowRef, useTemplateRef } from 'vue'
import { useViewer } from 'v-viewer'
import type { ZhihuComment, ZhihuFeedItem, ZhihuResult } from '../../../shared/zhihu'
import type { ReaderSettings } from '../../../shared/reader'
import { formatTime } from '../utils/formatTime'

/*** 字号沿用阅读器设置，知乎三个文字层级独立调节。 */
const props = defineProps<{ settings: ReaderSettings }>()

/*** 推荐卡片、评论和回复分别按需加载。 */
const items = shallowRef<ZhihuFeedItem[]>([])
const nextPage = shallowRef<string | null>(null)
const loading = shallowRef(false)
const message = shallowRef('')
const expanded = reactive<Record<string, boolean>>({})
const comments = reactive<Record<string, ZhihuComment[]>>({})
const commentOpen = reactive<Record<string, boolean>>({})
const commentError = reactive<Record<string, string>>({})
const commentNext = reactive<Record<string, string | null>>({})
const replies = reactive<Record<string, ZhihuComment[]>>({})
const replyNext = reactive<Record<string, string | null>>({})
const replyError = reactive<Record<string, string>>({})
const busy = reactive<Record<string, boolean>>({})
const scroller = useTemplateRef<HTMLElement>('scroller')
const sentinel = useTemplateRef<HTMLElement>('sentinel')
/*** 单张图片预览沿用当前已加载的地址，兼容主进程补取后的图片。 */
const previewImages = shallowRef<string[]>([])
const { show: showImage } = useViewer({ images: previewImages, options: { toolbar: true, navbar: false, title: false } })
let observer: IntersectionObserver | undefined

/*** 点击已加载的知乎图片时打开缩放查看器。 */
function openImage(event: MouseEvent): void {
  const image = event.currentTarget as HTMLImageElement
  if (!image.naturalWidth) return
  previewImages.value = [image.currentSrc || image.src]
  showImage()
}

/*** 从富文本中只提取文本、图片和视频地址，不执行站外 HTML。 */
function blocks(html: string): Array<{ kind: 'text' | 'image' | 'video'; value: string }> {
  const document = new DOMParser().parseFromString(html || '', 'text/html')
  const result: Array<{ kind: 'text' | 'image' | 'video'; value: string }> = []
  let text = ''
  const flush = (): void => {
    const value = text.trim()
    if (value) result.push({ kind: 'text', value })
    text = ''
  }
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(node.tagName)) return
    if (node.tagName === 'BR') { text += '\n'; return }
    if (node instanceof HTMLImageElement || node instanceof HTMLVideoElement || node instanceof HTMLSourceElement) {
      flush()
      const raw = [node.getAttribute('data-actualsrc'), node.getAttribute('data-original'), node.getAttribute('src')]
        .find(value => value && /^https?:\/\/|^\/\//.test(value))
      if (raw) {
        const url = new URL(raw, 'https://www.zhihu.com')
        if (url.protocol === 'https:') result.push({ kind: node instanceof HTMLImageElement ? 'image' : 'video', value: url.href })
      }
      return
    }
    const block = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE'].includes(node.tagName)
    if (block) flush()
    node.childNodes.forEach(walk)
    if (block) flush()
  }
  document.body.childNodes.forEach(walk)
  flush()
  return result
}

/*** 知乎图片直连失败时，由主进程带知乎来源请求同一图片。 */
async function rescueImage(event: Event, original: string): Promise<void> {
  const image = event.target as HTMLImageElement
  if (image.dataset.retried) return
  image.dataset.retried = '1'
  const result = await window.api.getZhihuImage(original)
  if (result.ok && result.data) image.src = result.data
}

/*** 接口失败时展示错误；Cookie 失效提示由主进程明确返回。 */
function showError<T>(result: ZhihuResult<T>): boolean {
  if (result.ok) return false
  message.value = result.error || '知乎请求失败。'
  return true
}

/*** 首次加载和刷新都从推荐流第一页开始。 */
async function refresh(): Promise<void> {
  if (loading.value) return
  items.value = []
  nextPage.value = null
  message.value = ''
  Object.keys(expanded).forEach(key => { delete expanded[key] })
  Object.keys(commentOpen).forEach(key => { delete commentOpen[key] })
  await loadMore(true)
  scroller.value?.scrollTo({ top: 0 })
}

/*** 滚动到列表末尾时请求下一页，并按类型与编号去重。 */
async function loadMore(first = false): Promise<void> {
  if (loading.value || (!first && !nextPage.value)) return
  loading.value = true
  const result = await window.api.getZhihuFeed(first ? undefined : nextPage.value || undefined)
  loading.value = false
  if (showError(result) || !result.data) return
  const known = new Set(items.value.map(item => `${item.type}:${item.id}`))
  items.value = [...items.value, ...result.data.items.filter(item => !known.has(`${item.type}:${item.id}`))]
  nextPage.value = result.data.next
  if (first && !items.value.length) message.value = '当前没有可显示的知乎推荐内容。'
  await nextTick()
  if (nextPage.value && scroller.value && scroller.value.scrollHeight <= scroller.value.clientHeight) void loadMore()
}

/*** 展开全文后将卡片起点移到阅读区顶部，长回答从标题开始阅读。 */
async function toggle(item: ZhihuFeedItem, event: MouseEvent): Promise<void> {
  const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.feed-card')
  const key = `${item.type}:${item.id}`
  if (expanded[key]) { expanded[key] = false; return }
  if (!item.content || item.type === 'zvideo') {
    busy[key] = true
    const result = await window.api.getZhihuDetail(item.type, item.id)
    busy[key] = false
    if (showError(result) || !result.data) return
    Object.assign(item, result.data)
  }
  expanded[key] = true
  await nextTick()
  if (card && scroller.value) {
    scroller.value.scrollTop += card.getBoundingClientRect().top - scroller.value.getBoundingClientRect().top - 8
  }
}

/*** 评论区域首次展开时加载一级评论，后续点击继续分页。 */
async function loadComments(item: ZhihuFeedItem, more = false): Promise<void> {
  const key = `${item.type}:${item.id}`
  if (busy[`c:${key}`]) return
  commentError[key] = ''
  busy[`c:${key}`] = true
  const result = await window.api.getZhihuComments(item.type, item.id, more ? commentNext[key] || undefined : undefined)
  busy[`c:${key}`] = false
  if (!result.ok || !result.data) { commentError[key] = result.error || '评论加载失败。'; return }
  comments[key] = more ? [...(comments[key] || []), ...result.data.items] : result.data.items
  commentNext[key] = result.data.next
}

/*** 评论按钮控制当前卡片的评论区域。 */
function toggleComments(item: ZhihuFeedItem): void {
  const key = `${item.type}:${item.id}`
  commentOpen[key] = !commentOpen[key]
  if (commentOpen[key] && !comments[key]) void loadComments(item)
}

/*** 回复按一级评论编号单独分页。 */
async function loadReplies(comment: ZhihuComment, more = false): Promise<void> {
  if (busy[`r:${comment.id}`]) return
  replyError[comment.id] = ''
  busy[`r:${comment.id}`] = true
  const result = await window.api.getZhihuReplies(comment.id, more ? replyNext[comment.id] || undefined : undefined)
  busy[`r:${comment.id}`] = false
  if (!result.ok || !result.data) { replyError[comment.id] = result.error || '回复加载失败。'; return }
  replies[comment.id] = more ? [...(replies[comment.id] || []), ...result.data.items] : result.data.items
  replyNext[comment.id] = result.data.next
}

/*** 观察列表底部，避免滚动事件反复发起请求。 */
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries[0]?.isIntersecting && nextPage.value) void loadMore()
  }, { root: scroller.value, rootMargin: '200px' })
  if (sentinel.value) observer.observe(sentinel.value)
  void refresh()
})
onUnmounted(() => observer?.disconnect())
</script>

<template>
  <section ref="scroller" class="zhihu-feed" aria-label="知乎内容" :style="{ '--title-size': `${props.settings.zhihuTitleSize}px`, '--body-size': `${props.settings.zhihuBodySize}px`, '--hint-size': `${props.settings.zhihuHintSize}px`, color: props.settings.fontColor }">
    <div class="feed-head"><strong>知乎推荐</strong><button type="button" :disabled="loading" @click="refresh">刷新</button></div>
    <p v-if="message" class="feed-message" role="alert">{{ message }}</p>
    <article v-for="item in items" :key="`${item.type}:${item.id}`" class="feed-card">
      <h2>{{ blocks(item.title).map(block => block.value).join(' ') }}</h2>
      <small>{{ item.author }} · {{ item.type === 'zvideo' ? '视频' : item.type === 'article' ? '文章' : item.type === 'pin' ? '想法' : '回答' }}<span v-if="item.createdTime" class="timestamp">{{ formatTime(item.createdTime) }}</span></small>
      <p v-if="!expanded[`${item.type}:${item.id}`]" class="excerpt">{{ blocks(item.excerpt).filter(block => block.kind === 'text').map(block => block.value).join(' ') }}</p>
      <img v-if="!expanded[`${item.type}:${item.id}`] && item.coverUrl?.startsWith('https://')" class="media" :src="item.coverUrl" alt="内容封面" loading="lazy" referrerpolicy="no-referrer" @error="rescueImage($event, item.coverUrl || '')" @click="openImage($event)" />
      <div v-if="expanded[`${item.type}:${item.id}`]" class="full-content">
        <button class="collapse-top" type="button" @click="toggle(item, $event)">收起全文</button>
        <template v-for="(block, index) in blocks(item.content || '')" :key="index">
          <p v-if="block.kind === 'text'">{{ block.value }}</p>
          <img v-else-if="block.kind === 'image'" class="media" :src="block.value" alt="文章配图" loading="lazy" referrerpolicy="no-referrer" @error="rescueImage($event, block.value)" @click="openImage($event)" />
          <video v-else class="media" :src="block.value" controls preload="none"></video>
        </template>
        <video v-if="item.videoUrl?.startsWith('https://')" class="media" :src="item.videoUrl" controls preload="none" :poster="item.coverUrl"></video>
      </div>
      <div class="card-actions">
        <button type="button" :disabled="busy[`${item.type}:${item.id}`]" @click="toggle(item, $event)">{{ expanded[`${item.type}:${item.id}`] ? '收起全文' : '展开全文' }}</button>
        <button type="button" @click="toggleComments(item)">评论 {{ item.commentCount || '' }}</button>
      </div>
      <div v-if="commentOpen[`${item.type}:${item.id}`]" class="comments">
        <p v-if="busy[`c:${item.type}:${item.id}`]" class="comment-state">评论加载中…</p>
        <p v-if="commentError[`${item.type}:${item.id}`]" class="comment-state" role="alert">{{ commentError[`${item.type}:${item.id}`] }} <button type="button" @click="loadComments(item)">重试</button></p>
        <p v-if="comments[`${item.type}:${item.id}`]?.length === 0 && !busy[`c:${item.type}:${item.id}`]" class="comment-state">暂无评论</p>
        <div v-for="comment in comments[`${item.type}:${item.id}`] || []" :key="comment.id" class="comment">
          <strong>{{ comment.author }}</strong><span v-if="comment.createdTime" class="timestamp">{{ formatTime(comment.createdTime) }}</span>
          <p>{{ blocks(comment.content).filter(block => block.kind === 'text').map(block => block.value).join(' ') }}</p>
          <button v-if="comment.childCount && !replies[comment.id]" type="button" @click="loadReplies(comment)">展开 {{ comment.childCount }} 条回复</button>
          <p v-if="replyError[comment.id]" class="comment-state" role="alert">{{ replyError[comment.id] }} <button type="button" @click="loadReplies(comment)">重试</button></p>
          <div v-if="replies[comment.id]" class="replies">
            <div v-for="reply in replies[comment.id]" :key="reply.id" class="comment">
              <strong>{{ reply.author }}</strong><span v-if="reply.replyTo"> 回复 {{ reply.replyTo }}</span><span v-if="reply.createdTime" class="timestamp">{{ formatTime(reply.createdTime) }}</span>
              <p>{{ blocks(reply.content).filter(block => block.kind === 'text').map(block => block.value).join(' ') }}</p>
            </div>
            <button v-if="replyNext[comment.id]" type="button" @click="loadReplies(comment, true)">加载更多回复</button>
          </div>
        </div>
        <button v-if="commentNext[`${item.type}:${item.id}`]" type="button" @click="loadComments(item, true)">加载更多评论</button>
      </div>
    </article>
    <p v-if="loading" class="feed-message">加载中…</p>
    <div ref="sentinel" aria-hidden="true"></div>
  </section>
</template>

<style scoped>
.zhihu-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 11px 18px 24px; scrollbar-width: none; -ms-overflow-style: none; font-size: var(--body-size); }
.zhihu-feed::-webkit-scrollbar { display: none; }
.feed-head, .card-actions { display: flex; align-items: center; justify-content: space-between; }
.feed-head { margin-bottom: 9px; font-size: var(--hint-size); }
.feed-head button, .card-actions button, .comments button, .collapse-top { padding: 4px 7px; border: 1px solid #ffffff38; border-radius: 5px; background: #ffffff12; color: inherit; cursor: pointer; font-size: var(--hint-size); }
.collapse-top { margin: 8px 0 5px; }
.feed-card { margin-bottom: 9px; padding: 12px; border: 1px solid #ffffff26; border-radius: 8px; }
.feed-card h2 { margin: 0 0 5px; font-size: var(--title-size); line-height: 1.4; }
.feed-card small { color: #ffffffa8; font-size: var(--hint-size); }
.timestamp { margin-left: 7px; color: #ffffffa8; font-size: 12px; font-weight: 400; }
.excerpt { max-height: 4.5em; overflow: hidden; margin: 7px 0; line-height: 1.5; }
.full-content { line-height: 1.55; overflow-wrap: anywhere; }
.full-content p { margin: 6px 0; }
.media { display: block; max-width: 100%; max-height: 420px; margin: 8px 0; }
.media:is(img) { cursor: zoom-in; }
.card-actions { justify-content: flex-start; margin-top: 8px; }
.card-actions button { margin-right: 8px; }
.comments { margin-top: 8px; border-top: 1px solid #ffffff24; }
.comment { padding: 7px 0; border-bottom: 1px solid #ffffff16; font-size: var(--body-size); }
.comment p { margin: 4px 0; line-height: 1.5; }
.replies { margin: 8px 0 0 15px; padding-left: 10px; border-left: 1px solid #ffffff30; }
.feed-message, .comment-state { color: #e7b89f; font-size: var(--hint-size); }
</style>
