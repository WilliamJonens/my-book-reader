export type ZhihuContentType = 'answer' | 'article' | 'pin' | 'zvideo'

export interface ZhihuFeedItem {
  id: string
  type: ZhihuContentType
  title: string
  author: string
  excerpt: string
  content?: string
  commentCount: number
  videoUrl?: string
  coverUrl?: string
}

export interface ZhihuComment {
  id: string
  author: string
  content: string
  childCount: number
  replyTo?: string
}

export interface ZhihuPage<T> {
  items: T[]
  next: string | null
}

export interface ZhihuResult<T> {
  ok: boolean
  data?: T
  error?: string
  expired?: boolean
}
