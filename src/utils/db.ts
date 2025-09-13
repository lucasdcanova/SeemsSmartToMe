import { get, set } from 'idb-keyval'
import type { FeedItem } from '../store'

export async function saveHistory(feed: FeedItem[]) {
  await set('feed', feed)
}

export async function loadHistory(): Promise<FeedItem[]> {
  return (await get<FeedItem[]>('feed')) || []
}
