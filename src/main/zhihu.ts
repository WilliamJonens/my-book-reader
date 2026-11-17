import { net } from 'electron'
import type { ZhihuComment, ZhihuContentType, ZhihuFeedItem, ZhihuPage, ZhihuResult } from '../shared/zhihu'

// 知乎响应字段随内容类型变化，入口在此统一做运行时检查。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

/*** 知乎网页接口只在主进程请求，避免把 Cookie 传给渲染进程。 */
export function createZhihuClient(getCookie: () => string) {
  async function request(path: string): Promise<Json> {
    const cookie = getCookie()
    if (!cookie) throw new Error('请先在设置中保存知乎 Cookie。')
    const url = new URL(path, 'https://www.zhihu.com')
    if (!['www.zhihu.com', 'zhuanlan.zhihu.com', 'lens.zhihu.com'].includes(url.hostname) || url.protocol !== 'https:') {
      throw new Error('无效的知乎接口地址。')
    }
    const response = await net.fetch(url.href, {
      headers: { Cookie: cookie, Referer: 'https://www.zhihu.com/', Accept: 'application/json' },
      redirect: 'manual'
    })
    if (response.status >= 300 && response.status < 400) throw new Error('知乎请求被重定向，请检查登录状态或访问限制。')
    if (response.status === 401) throw new Error('知乎 Cookie 已过期，请在设置中更新。')
    if (response.status === 403) {
      const detail = response.headers.get('content-type')?.includes('json') ? await response.json() as Json : null
      const code = typeof detail?.code === 'number' ? `，错误码 ${detail.code}` : ''
      throw new Error(`知乎拒绝了请求（403${code}），请稍后重试。`)
    }
    if (!response.ok) throw new Error(`知乎请求失败（${response.status}）。`)
    if (!response.headers.get('content-type')?.includes('json')) throw new Error('知乎接口返回了非 JSON 内容，请稍后重试。')
    const body = await response.json() as Json
    if (!body || typeof body !== 'object') throw new Error('知乎返回了无法识别的数据。')
    if (body.code && body.message) throw new Error(String(body.message))
    return body
  }

  async function result<T>(action: () => Promise<T>): Promise<ZhihuResult<T>> {
    try { return { ok: true, data: await action() } }
    catch (error) {
      const message = error instanceof Error ? error.message : '知乎请求失败。'
      return { ok: false, error: message, expired: message.includes('过期') || message.includes('Cookie') }
    }
  }

  function paging(body: Json): string | null {
    return body.paging?.is_end ? null : typeof body.paging?.next === 'string' ? body.paging.next : null
  }

  function contentType(value: string): ZhihuContentType | null {
    if (value === 'video') return 'zvideo'
    return ['answer', 'article', 'pin', 'zvideo'].includes(value) ? value as ZhihuContentType : null
  }

  return {
    image: (raw: string): Promise<ZhihuResult<string>> => result(async () => {
      const url = new URL(raw)
      if (url.protocol !== 'https:' || !/(^|\.)(zhimg\.com|zhihu\.com)$/.test(url.hostname)) {
        throw new Error('图片地址不属于知乎。')
      }
      const response = await fetch(url, { headers: { Referer: 'https://www.zhihu.com/' } })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('图片加载失败。')
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 15 * 1024 * 1024) throw new Error('图片超过大小限制。')
      return `data:${response.headers.get('content-type')};base64,${bytes.toString('base64')}`
    }),
    feed: (next?: string): Promise<ZhihuResult<ZhihuPage<ZhihuFeedItem>>> => result(async () => {
      const path = next || '/api/v3/feed/topstory/recommend?limit=20&offset=0&desktop=true'
      const body = await request(path)
      const items = (Array.isArray(body.data) ? body.data : []).flatMap((entry: Json) => {
        const target = entry.target || {}
        const type = contentType(String(target.type || ''))
        if (!type || !target.id) return []
        return [{
          id: String(target.id), type,
          title: String(target.title || target.question?.title || target.excerpt_title || '知乎内容'),
          author: String(target.author?.name || ''),
          createdTime: Number(target.created_time) || undefined,
          excerpt: String(target.excerpt || entry.brief?.content || ''),
          content: typeof target.content === 'string' ? target.content : undefined,
          commentCount: Number(target.comment_count || 0),
          coverUrl: String(target.image_url || target.cover?.url || ''),
          videoUrl: String(target.video?.play_url || '')
        }]
      })
      const offset = Number(new URL(path, 'https://www.zhihu.com').searchParams.get('offset') || 0)
      const following = paging(body) || (!body.paging?.is_end && items.length
        ? `/api/v3/feed/topstory/recommend?limit=20&offset=${offset + 20}&desktop=true` : null)
      return { items, next: following }
    }),
    detail: (type: ZhihuContentType, id: string): Promise<ZhihuResult<ZhihuFeedItem>> => result(async () => {
      if (!/^\d+$/.test(id)) throw new Error('无效的内容编号。')
      const path = type === 'article' ? `https://zhuanlan.zhihu.com/api/articles/${id}`
        : type === 'answer' ? `/api/v4/answers/${id}?include=content,author,comment_count,question,excerpt`
          : type === 'pin' ? `/api/v4/pins/${id}?include=content,content_html,author,comment_count,excerpt_title`
            : `/api/v4/zvideos/${id}`
      const body = await request(path)
      const target = body.data || body
      let videoUrl = String(target.video?.play_url || target.video_url || target.video_play?.playlist?.mp4?.[0]?.url?.[0] || '')
      if (type === 'zvideo' && !videoUrl && target.video_id) {
        const play = await request(`https://lens.zhihu.com/api/v4/videos/${target.video_id}`)
        videoUrl = String(play.playlist?.HD?.play_url || play.playlist?.SD?.play_url || '')
      }
      return {
        id, type,
        title: String(target.title || target.question?.title || target.excerpt_title || '知乎内容'),
        author: String(target.author?.name || ''),
        createdTime: Number(target.created_time) || undefined,
        excerpt: String(target.excerpt || ''),
        content: String(target.content_html || (typeof target.content === 'string' ? target.content : '')),
        commentCount: Number(target.comment_count || 0),
        coverUrl: String(target.image_url || target.cover?.url || ''), videoUrl
      }
    }),
    comments: (type: ZhihuContentType, id: string, next?: string): Promise<ZhihuResult<ZhihuPage<ZhihuComment>>> => result(async () => {
      if (!/^\d+$/.test(id)) throw new Error('无效的内容编号。')
      const plural = type === 'zvideo' ? 'zvideos' : `${type}s`
      const path = `/api/v4/comment_v5/${plural}/${id}/root_comment?order_by=score&limit=20&offset=`
      const body = await request(next || path)
      return { items: normalizeComments(body.data), next: paging(body) }
    }),
    replies: (id: string, next?: string): Promise<ZhihuResult<ZhihuPage<ZhihuComment>>> => result(async () => {
      if (!/^\d+$/.test(id)) throw new Error('无效的评论编号。')
      const body = await request(next || `/api/v4/comment_v5/comment/${id}/child_comment?limit=20&offset=0`)
      return { items: normalizeComments(body.data), next: paging(body) }
    })
  }
}

/*** 把知乎评论对象映射为界面所需字段。 */
function normalizeComments(data: unknown): ZhihuComment[] {
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray((data as Json).items) ? (data as Json).items : [])
  return list.map((item: Json) => ({
    id: String(item.id), author: String(item.author?.name || item.author?.url_token || '匿名'),
    createdTime: Number(item.created_time) || undefined,
    content: String(item.content?.html || item.content?.text || item.content || item.comment?.content || item.content_html || item.text || ''),
    childCount: Number(item.child_comment_count || item.child_comments_count || item.child_comments?.length || 0),
    replyTo: item.reply_to_author?.name ? String(item.reply_to_author.name) : undefined
  }))
}
