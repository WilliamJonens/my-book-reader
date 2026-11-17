<script setup lang="ts">
import { nextTick, onMounted, reactive, shallowRef, useTemplateRef } from 'vue'
import { useViewer } from 'v-viewer'
import type { TiebaPost, TiebaSort, TiebaThread } from '../../../shared/tieba'
import { formatTime } from '../utils/formatTime'

/*** 吧名、帖子和楼层都只在当前视图中维护，不影响 TXT 阅读进度。 */
const forumInput = shallowRef('')
const forum = shallowRef('')
/*** 列表默认使用 SDK 的热门排序，可切换到最新发帖。 */
const sort = shallowRef<TiebaSort>('hot')
/*** 最近访问的吧名由主进程保存在本机。 */
const recentForums = shallowRef<string[]>([])
const threads = shallowRef<TiebaThread[]>([])
const threadPage = shallowRef(0)
const threadMore = shallowRef(false)
const selected = shallowRef<TiebaThread | null>(null)
const posts = shallowRef<TiebaPost[]>([])
const postPage = shallowRef(0)
const postMore = shallowRef(false)
const replies = reactive<Record<string, TiebaPost[]>>({})
const replyPage = reactive<Record<string, number>>({})
const replyMore = reactive<Record<string, boolean>>({})
const replyError = reactive<Record<string, string>>({})
const loading = shallowRef(false)
const message = shallowRef('')
const scroller = useTemplateRef<HTMLElement>('scroller')
/*** 单张图片预览使用实际加载地址，避免补取后的图片再次直连失败。 */
const previewImages = shallowRef<string[]>([])
const { show: showImage } = useViewer({ images: previewImages, options: { toolbar: true, navbar: false, title: false } })
/*** 相同表情只通过主进程补取一次，避免楼中楼重复请求。 */
const imageCache = new Map<string, Promise<string | null>>()
/*** 进入帖子前的列表滚动位置，仅在当前贴吧视图中使用。 */
let listScrollTop = 0

/*** 点击配图时优先读取较大图片，失败则预览当前已加载的图片。 */
async function openImage(event: MouseEvent, largerUrls: string[] = []): Promise<void> {
  const image = event.currentTarget as HTMLImageElement
  if (!image.naturalWidth) return
  let source = image.currentSrc || image.src
  if (largerUrls.length) {
    const result = await window.api.getTiebaImage(largerUrls)
    if (result.ok && result.data) source = result.data
  }
  previewImages.value = [source]
  showImage()
}

onMounted(async () => { recentForums.value = await window.api.getTiebaRecentForums() })

/*** 图片直连失败时交给主进程依次尝试贴吧 CDN 和原图地址。 */
async function rescueImage(event: Event, urls: string[]): Promise<void> {
  const image = event.target as HTMLImageElement
  if (image.dataset.retried) return
  image.dataset.retried = '1'
  const key = urls.join('|')
  let request = imageCache.get(key)
  if (!request) {
    request = window.api.getTiebaImage(urls).then(result => result.ok ? result.data || null : null)
    if (/\/image_emoticon\d*\.png/.test(urls[0])) imageCache.set(key, request)
  }
  const data = await request
  if (data) image.src = data
}

/*** 按吧名读取第一页帖子。 */
async function openForum(): Promise<void> {
  const name = forumInput.value.trim()
  if (!name) { message.value = '请输入贴吧名称。'; return }
  forum.value = name
  selected.value = null
  threads.value = []
  threadPage.value = 0
  threadMore.value = false
  await loadThreads()
  scroller.value?.scrollTo({ top: 0 })
}

/*** 切换排序时从当前贴吧的第一页重新读取。 */
async function changeSort(next: TiebaSort): Promise<void> {
  if (!forum.value || loading.value || sort.value === next) return
  sort.value = next
  threads.value = []
  threadPage.value = 0
  threadMore.value = false
  await loadThreads()
  scroller.value?.scrollTo({ top: 0 })
}

/*** 加载下一页帖子。 */
async function loadThreads(): Promise<void> {
  if (loading.value || !forum.value) return
  loading.value = true
  message.value = ''
  const page = threadPage.value + 1
  const result = await window.api.getTiebaThreads(forum.value, page, sort.value)
  loading.value = false
  if (!result.ok || !result.data) { message.value = result.error || '帖子加载失败。'; return }
  threads.value = [...threads.value, ...result.data.items]
  threadPage.value = page
  threadMore.value = result.data.hasMore
  if (page === 1) recentForums.value = await window.api.rememberTiebaForum(forum.value)
  if (!threads.value.length) message.value = '当前没有可显示的帖子。'
}

/*** 进入主题帖并从第一页加载楼层。 */
async function openThread(thread: TiebaThread): Promise<void> {
  listScrollTop = scroller.value?.scrollTop ?? 0
  selected.value = thread
  posts.value = []
  postPage.value = 0
  postMore.value = false
  Object.keys(replies).forEach(key => { delete replies[key] })
  await nextTick()
  scroller.value?.scrollTo({ top: 0 })
  await loadPosts()
}

/*** 列表重新渲染后回到进入帖子前的位置。 */
async function backToThreads(): Promise<void> {
  selected.value = null
  message.value = ''
  await nextTick()
  scroller.value?.scrollTo({ top: listScrollTop })
}

/*** 加载下一页楼层。 */
async function loadPosts(): Promise<void> {
  if (loading.value || !selected.value) return
  loading.value = true
  message.value = ''
  const page = postPage.value + 1
  const result = await window.api.getTiebaPosts(selected.value.id, page)
  loading.value = false
  if (!result.ok || !result.data) { message.value = result.error || '楼层加载失败。'; return }
  posts.value = [...posts.value, ...result.data.items]
  postPage.value = page
  postMore.value = result.data.hasMore
  if (!posts.value.length) message.value = '当前没有可显示的楼层。'
}

/*** 点击某楼时才读取楼中楼，后续页面单独加载。 */
async function loadReplies(post: TiebaPost): Promise<void> {
  if (!selected.value || loading.value) return
  loading.value = true
  replyError[post.id] = ''
  const page = (replyPage[post.id] || 0) + 1
  const result = await window.api.getTiebaReplies(selected.value.id, post.id, page)
  loading.value = false
  if (!result.ok || !result.data) { replyError[post.id] = result.error || '楼中楼读取失败。'; return }
  replies[post.id] = [...(replies[post.id] || []), ...result.data.items]
  replyPage[post.id] = page
  replyMore[post.id] = result.data.hasMore
}
</script>

<template>
  <div class="tieba-view">
    <!-- 主题帖导航放在滚动区外，阅读长帖时始终可见。 -->
    <div v-if="selected" class="section-head thread-nav">
      <button type="button" @click="backToThreads">返回列表</button>
      <strong>{{ selected.title }}</strong>
    </div>
  <section ref="scroller" class="tieba-feed" aria-label="贴吧内容">
    <form class="forum-form" @submit.prevent="openForum">
      <input v-model="forumInput" type="text" placeholder="输入吧名，例如：书吧" aria-label="贴吧名称" />
      <button type="submit" :disabled="loading">浏览</button>
    </form>
    <div v-if="!selected" class="recent-forums">
      <span>最近访问</span>
      <small v-if="!recentForums.length">浏览一次贴吧后会显示在这里</small>
      <button v-for="name in recentForums" :key="name" type="button" :disabled="loading" @click="forumInput = name; openForum()">{{ name }}</button>
    </div>
    <div v-if="!selected && forum" class="section-head"><strong>{{ forum }} · 帖子</strong></div>
    <div v-if="!selected && forum" class="sort-controls" role="group" aria-label="帖子排序">
      <button type="button" :class="{ active: sort === 'hot' }" :aria-pressed="sort === 'hot'" :disabled="loading" @click="changeSort('hot')">热门</button>
      <button type="button" :class="{ active: sort === 'latest' }" :aria-pressed="sort === 'latest'" :disabled="loading" @click="changeSort('latest')">最新</button>
    </div>
    <p v-if="message" class="status" role="alert">{{ message }}</p>

    <template v-if="selected">
      <article v-for="post in posts" :key="post.id" class="post-card">
        <div class="post-head"><strong>{{ post.floor }} 楼 · {{ post.author }}</strong><span v-if="post.createdTime" class="timestamp">{{ formatTime(post.createdTime) }}</span></div>
        <div class="post-content">
          <template v-for="(fragment, index) in post.fragments" :key="index">
            <span v-if="fragment.type === 'text'">{{ fragment.value }}</span>
            <img v-else :src="fragment.value" :class="{ emoji: fragment.type === 'emoji' }" :alt="fragment.type === 'emoji' ? '贴吧表情' : '帖子配图'" loading="lazy" referrerpolicy="no-referrer" @error="rescueImage($event, [fragment.value, ...(fragment.fallbackUrls || [])])" @click="fragment.type === 'image' && openImage($event, fragment.fallbackUrls)" />
          </template>
        </div>
        <button v-if="post.replyCount && !replies[post.id]" type="button" @click="loadReplies(post)">展开 {{ post.replyCount }} 条楼中楼</button>
        <p v-if="replyError[post.id]" class="status" role="alert">{{ replyError[post.id] }} <button type="button" @click="loadReplies(post)">重试</button></p>
        <div v-if="replies[post.id]" class="subposts">
          <p v-if="!replies[post.id].length" class="status">暂无可读取的楼中楼</p>
          <div v-for="reply in replies[post.id]" :key="reply.id" class="subpost">
            <strong>{{ reply.author }}</strong><span v-if="reply.createdTime" class="timestamp">{{ formatTime(reply.createdTime) }}</span>
            <div class="post-content">
              <template v-for="(fragment, index) in reply.fragments" :key="index">
                <span v-if="fragment.type === 'text'">{{ fragment.value }}</span>
                <img v-else :src="fragment.value" :class="{ emoji: fragment.type === 'emoji' }" :alt="fragment.type === 'emoji' ? '贴吧表情' : '回复配图'" loading="lazy" referrerpolicy="no-referrer" @error="rescueImage($event, [fragment.value, ...(fragment.fallbackUrls || [])])" @click="fragment.type === 'image' && openImage($event, fragment.fallbackUrls)" />
              </template>
            </div>
          </div>
          <button v-if="replyMore[post.id]" type="button" @click="loadReplies(post)">加载更多回复</button>
        </div>
      </article>
      <button v-if="postMore" type="button" :disabled="loading" @click="loadPosts">加载更多楼层</button>
    </template>
    <template v-else>
      <article v-for="thread in threads" :key="thread.id" class="thread-card">
        <button type="button" @click="openThread(thread)">
          <span class="thread-copy"><strong>{{ thread.title }}</strong><small>{{ thread.author }} · {{ thread.replyCount }} 条回复<span v-if="thread.createdTime" class="timestamp">{{ formatTime(thread.createdTime) }}</span></small></span>
          <img v-if="thread.coverUrl" :src="thread.coverUrl" alt="帖子缩略图" loading="lazy" referrerpolicy="no-referrer" @error="rescueImage($event, [thread.coverUrl])" @click.stop="openImage($event)" />
        </button>
      </article>
      <button v-if="threadMore" type="button" :disabled="loading" @click="loadThreads">加载更多帖子</button>
    </template>
    <p v-if="loading" class="status">加载中…</p>
  </section>
  </div>
</template>

<style scoped>
.tieba-view { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.tieba-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 18px 24px; scrollbar-width: none; }
.tieba-feed::-webkit-scrollbar { display: none; }
.tieba-view button { padding: 5px 8px; border: 1px solid #ffffff38; border-radius: 5px; background: #ffffff12; color: inherit; cursor: pointer; font-size: 12px; }
.forum-form { display: flex; margin-bottom: 12px; }
.forum-form input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #ffffff38; border-radius: 5px; background: #202b38; color: inherit; }
.forum-form button { margin-left: 7px; }
.recent-forums { display: flex; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.recent-forums span { margin: 0 8px 6px 0; color: #ffffffa8; font-size: 11px; }
.recent-forums small { margin-bottom: 6px; color: #ffffffa8; font-size: 11px; }
.recent-forums button { max-width: 100%; margin: 0 6px 6px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.section-head { display: flex; align-items: center; margin-bottom: 10px; }
.section-head strong { margin-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.thread-nav { flex: none; min-height: 40px; margin: 0; padding: 7px 18px; border-bottom: 1px solid #ffffff26; }
.thread-nav button { flex: none; white-space: nowrap; }
.sort-controls { display: flex; margin-bottom: 10px; }
.sort-controls button { margin-right: 6px; }
.sort-controls button.active { background: #ffffff30; }
.thread-card, .post-card { margin-bottom: 9px; padding: 11px; border: 1px solid #ffffff26; border-radius: 8px; }
.thread-card button { display: flex; align-items: flex-start; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; font-size: 14px; }
.thread-copy { flex: 1; min-width: 0; }
.thread-copy strong { display: block; font-weight: 400; }
.thread-card small { display: block; margin-top: 6px; color: #ffffffa8; font-size: 11px; }
.timestamp { margin-left: 7px; color: #ffffffa8; font-size: 12px; font-weight: 400; }
.thread-card img { flex: none; width: 96px; height: 72px; margin-left: 10px; border-radius: 5px; object-fit: cover; }
.thread-card img, .post-content img:not(.emoji) { cursor: zoom-in; }
.post-head { margin-bottom: 7px; font-size: 12px; }
.post-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.55; font-size: 14px; }
.post-content img { display: block; max-width: 100%; max-height: 420px; margin: 8px 0; }
.post-content img.emoji { display: inline; width: 28px; height: 28px; margin: 0 2px; vertical-align: middle; }
.post-card > button { margin-top: 8px; }
.subposts { margin: 9px 0 0 12px; padding-left: 10px; border-left: 1px solid #ffffff30; }
.subpost { padding: 7px 0; border-bottom: 1px solid #ffffff16; font-size: 12px; }
.status { color: #e7b89f; font-size: 12px; }
@media (max-width: 360px) { .thread-card img { width: 64px; height: 64px; } }
</style>
