import { useEffect, useRef, useState } from 'react'
import { useAppStore, type Settings, type FeedItem } from './store'
import './index.css'

const orchestrator = new Worker(new URL('./workers/orchestrator.worker.ts', import.meta.url), { type: 'module' })
const enricher = new Worker(new URL('./workers/enricher.worker.ts', import.meta.url), { type: 'module' })

function App() {
  const { feed, settings, setSettings, addFeedItem, updateFeedItem, loadCachedFeed, offline, setOffline } = useAppStore()
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)

  useEffect(() => {
    loadCachedFeed()
    orchestrator.postMessage({ type: 'init', cadence: settings.cadence, language: settings.language, openaiKey: settings.openaiKey })
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    orchestrator.postMessage({ type: 'init', cadence: settings.cadence, language: settings.language, openaiKey: settings.openaiKey })
  }, [settings.cadence, settings.language, settings.openaiKey])

  useEffect(() => {
    orchestrator.onmessage = (e) => {
      const { summary, topics, intents, questions } = e.data
      const id = Date.now()
      addFeedItem({ id, summary, topics, intents, questions, news: [], insights: [], timestamp: Date.now() })
      enricher.postMessage({ type: 'enrich', id, topics, newsApiKey: settings.newsApiKey, bingKey: settings.bingKey, offline })
    }
    enricher.onmessage = (e) => {
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
    }
  }, [settings.newsApiKey, settings.bingKey, offline])

  const start = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition: SpeechRecognition = new SpeechRecognition()
    recognition.lang = settings.language
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      orchestrator.postMessage({ type: 'transcript', text: transcript, offline })
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stop = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  const exportJson = () => {
    const data = JSON.stringify(feed, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'history.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Agente Insider</h1>
      <div className="space-x-2">
        {!listening ? (
          <button className="px-4 py-2 bg-green-600 text-white" onClick={start}>Start</button>
        ) : (
          <button className="px-4 py-2 bg-red-600 text-white" onClick={stop}>Stop</button>
        )}
        <button className="px-4 py-2 bg-blue-600 text-white" onClick={exportJson}>Exportar JSON</button>
      </div>
      <Settings settings={settings} setSettings={setSettings} />
      <Feed feed={feed} />
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mr-2">Cadência</label>
        <select value={settings.cadence} onChange={(e) => setSettings({ cadence: Number(e.target.value) })} className="border p-1">
          <option value={10}>10s</option>
          <option value={30}>30s</option>
        </select>
      </div>
      <div>
        <label className="mr-2">Idioma</label>
        <input value={settings.language} onChange={(e) => setSettings({ language: e.target.value })} className="border p-1" />
      </div>
      <div>
        <label className="mr-2">OpenAI Key</label>
        <input type="password" value={settings.openaiKey} onChange={(e) => setSettings({ openaiKey: e.target.value })} className="border p-1" />
      </div>
      <div>
        <label className="mr-2">NewsAPI Key</label>
        <input type="password" value={settings.newsApiKey} onChange={(e) => setSettings({ newsApiKey: e.target.value })} className="border p-1" />
      </div>
      <div>
        <label className="mr-2">Bing Key</label>
        <input type="password" value={settings.bingKey} onChange={(e) => setSettings({ bingKey: e.target.value })} className="border p-1" />
      </div>
    </div>
  )
}

function Feed({ feed }: { feed: FeedItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full table-auto border">
        <thead>
          <tr className="bg-gray-200">
            <th className="px-2 border">Tópicos</th>
            <th className="px-2 border">Notícias confiáveis</th>
            <th className="px-2 border">Insights</th>
          </tr>
        </thead>
        <tbody>
          {feed.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="px-2 border">{item.topics.join(', ')}</td>
              <td className="px-2 border">
                <ul>
                  {item.news.map((n: { title: string; url: string }) => (
                    <li key={n.url}>
                      <a className="text-blue-600 underline" href={n.url} target="_blank" rel="noreferrer">
                        {n.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-2 border">{item.insights.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default App
