import { consume, getComments, getPosts, getThreads, initClient, TiebaClient } from 'tieba.js'
import type { PbContent, Post, SubPostList } from 'tieba.js'
import type { TiebaFragment, TiebaPage, TiebaPost, TiebaResult, TiebaSort, TiebaThread } from '../shared/tieba'

/*** 使用现成 SDK 读取公开贴吧内容，不配置账号或写操作。 */
export function createTiebaClient() {
  initClient(new TiebaClient({ bduss: '' }))

  async function result<T>(action: () => Promise<T>): Promise<TiebaResult<T>> {
    try { return { ok: true, data: await action() } }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '贴吧内容读取失败。' }
    }
  }

  /*** 限制从界面传入的帖子和楼层编号，避免超出 JS 安全整数范围。 */
  function numericId(value: string): number {
    const number = Number(value)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number <= 0) throw new Error('无效的贴吧编号。')
    return number
  }

  function pageNumber(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 600) throw new Error('页码无效。')
    return value
  }

  /*** SDK 返回富文本片段；按类型保留图片和贴吧表情。 */
  function fragments(content: PbContent[]): TiebaFragment[] {
    return content.flatMap<TiebaFragment>(part => {
      if (part.type === 2 || part.type === 11) {
        if (/^image_emoticon\d*$/.test(part.text)) {
          return [{ type: 'emoji', value: `https://tb2.bdstatic.com/tb/editor/images/client/${part.text}.png` }]
        }
        return part.c ? [{ type: 'text', value: `[${part.c}]` }] : []
      }
      if (part.type === 3 || part.type === 20) {
        const urls = [part.cdnSrc, part.bigCdnSrc, part.originSrc, part.src]
          .filter(Boolean).map(raw => raw.startsWith('//') ? `https:${raw}` : raw.replace(/^http:/, 'https:'))
          .filter(url => url.startsWith('https://'))
        return urls.length ? [{ type: 'image' as const, value: urls[0], fallbackUrls: [...new Set(urls.slice(1))].filter(url => url !== urls[0]) }] : []
      }
      if (part.type === 9) return [{ type: 'text' as const, value: '[视频内容]' }]
      return part.text ? [{ type: 'text' as const, value: part.text }] : []
    })
  }

  function mapPost(post: Post | SubPostList): TiebaPost {
    return {
      id: post.id,
      floor: post.floor,
      author: post.author?.nameShow || post.author?.name || post.authorId,
      createdTime: post.time || undefined,
      fragments: fragments(post.content),
      replyCount: 'subPostNumber' in post ? post.subPostNumber : 0
    }
  }

  return {
    /*** 图片直连失败时在主进程按 CDN、原图顺序重试；失效表情改用公开镜像。 */
    image: (urls: string[]): Promise<TiebaResult<string>> => result(async () => {
      if (!Array.isArray(urls) || !urls.length || urls.length > 4) throw new Error('无效的贴吧图片地址。')
      for (const raw of urls) {
        const url = new URL(raw)
        if (url.protocol !== 'https:' || !/(^|\.)(baidu\.com|bdstatic\.com)$/.test(url.hostname)) continue
        const candidates = [url.href]
        const emoji = url.pathname.match(/\/image_emoticon(\d*)\.png$/)
        if (emoji && (!emoji[1] || Number(emoji[1]) <= 124)) {
          candidates.push(`https://cdn.jsdelivr.net/gh/microlong666/tieba_mobile_emotions/image_emoticon${emoji[1]}.png`)
        }
        for (const candidate of candidates) {
          try {
            const response = await fetch(candidate, { headers: { Referer: 'https://tieba.baidu.com/' }, redirect: 'manual' })
            if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) continue
            const bytes = Buffer.from(await response.arrayBuffer())
            if (bytes.length > 15 * 1024 * 1024) continue
            return `data:${response.headers.get('content-type')};base64,${bytes.toString('base64')}`
          } catch { /* 尝试下一个图片地址。 */ }
        }
      }
      throw new Error('贴吧图片加载失败。')
    }),
    threads: (forum: string, page: number, sort: TiebaSort): Promise<TiebaResult<TiebaPage<TiebaThread>>> => result(async () => {
      const fname = forum.trim()
      if (!fname || fname.length > 80) throw new Error('请输入贴吧名称。')
      const current = pageNumber(page)
      const data = await consume(getThreads({ fname, page: current, rn: 30, sort: sort === 'latest' ? 1 : 34 }))
      return {
        items: (data?.threadList || []).filter(thread => !thread.isAd).map(thread => {
          const image = thread.firstPostContent.find(part => (part.type === 3 || part.type === 20) && (part.cdnSrc || part.bigCdnSrc || part.originSrc || part.src))
          const raw = image?.cdnSrc || image?.bigCdnSrc || image?.originSrc || image?.src || ''
          const cover = raw.startsWith('//') ? `https:${raw}` : raw.replace(/^http:/, 'https:')
          return {
            id: thread.id, title: thread.title || '无标题',
            author: thread.author?.nameShow || thread.author?.name || thread.authorId,
            createdTime: thread.createTime || undefined,
            replyCount: thread.replyNum,
            coverUrl: cover.startsWith('https://') ? cover : undefined
          }
        }),
        hasMore: Boolean(data?.page?.hasMore || (data?.page?.totalPage && current < data.page.totalPage))
      }
    }),
    posts: (threadId: string, page: number): Promise<TiebaResult<TiebaPage<TiebaPost>>> => result(async () => {
      const current = pageNumber(page)
      const data = await consume(getPosts(numericId(threadId), current))
      return {
        items: (data?.postList || []).map(mapPost),
        hasMore: Boolean(data?.page?.hasMore || (data?.page?.totalPage && current < data.page.totalPage))
      }
    }),
    replies: (threadId: string, postId: string, page: number): Promise<TiebaResult<TiebaPage<TiebaPost>>> => result(async () => {
      const current = pageNumber(page)
      const data = await consume(getComments({ tid: numericId(threadId), pid: numericId(postId), pn: current }))
      return {
        items: (data?.subpostList || []).map(mapPost),
        hasMore: Boolean(data?.page?.hasMore || (data?.page?.totalPage && current < data.page.totalPage))
      }
    })
  }
}
