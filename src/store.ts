import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveHistory, loadHistory } from './utils/db'

export interface FeedItem {
  id: number
  summary: string
  topics: string[]
  intents: string[]
  questions: string[]
  news: { title: string; url: string }[]
  insights: string[]
  timestamp: number
}

export interface Settings {
  cadence: number
  language: string
  openaiKey: string
}

interface State {
  feed: FeedItem[]
  transcripts: string[]
  settings: Settings
  offline: boolean
  setOffline: (o: boolean) => void
  setSettings: (s: Partial<Settings>) => void
  addTranscript: (t: string) => void
  addFeedItem: (item: FeedItem) => void
  updateFeedItem: (id: number, data: Partial<FeedItem>) => void
  loadCachedFeed: () => Promise<void>
}

export const useAppStore = create<State>()(
  persist(
    (set, get) => ({
      feed: [],
      transcripts: [],
      offline: !navigator.onLine,
      settings: {
        cadence: 10,
        language: navigator.language || 'pt-BR',
        openaiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
      },
      setOffline: (o) => set({ offline: o }),
      setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
      addTranscript: (t) => set({ transcripts: [...get().transcripts, t] }),
      addFeedItem: (item) => {
        const feed = [...get().feed, item]
        set({ feed })
        saveHistory(feed)
      },
      updateFeedItem: (id, data) => {
        const feed = get().feed.map((f) => (f.id === id ? { ...f, ...data } : f))
        set({ feed })
        saveHistory(feed)
      },
      loadCachedFeed: async () => {
        const cached = await loadHistory()
        if (cached.length) set({ feed: cached })
      },
    }),
    { name: 'settings', partialize: (state) => ({ settings: state.settings }) }
  )
)
