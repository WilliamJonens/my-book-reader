import type { ReaderApi } from '../shared/reader'

declare global {
  interface Window {
    api: ReaderApi
  }
}
