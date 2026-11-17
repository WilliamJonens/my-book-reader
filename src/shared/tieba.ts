export interface TiebaFragment {
  type: 'text' | 'image' | 'emoji'
  value: string
  fallbackUrls?: string[]
}

export interface TiebaThread {
  id: string
  title: string
  author: string
  createdTime?: number
  replyCount: number
  coverUrl?: string
}

export type TiebaSort = 'hot' | 'latest'

export interface TiebaPost {
  id: string
  floor: number
  author: string
  createdTime?: number
  fragments: TiebaFragment[]
  replyCount: number
}

export interface TiebaPage<T> {
  items: T[]
  hasMore: boolean
}

export interface TiebaResult<T> {
  ok: boolean
  data?: T
  error?: string
}
