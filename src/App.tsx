import { useEffect, useRef, useState } from 'react'
import { useAppStore, type Settings, type FeedItem } from './store'
import './index.css'
import './speech-recognition.d.ts'

const orchestrator = new Worker(new URL('./workers/orchestrator.worker.ts', import.meta.url), { type: 'module' })
const enricher = new Worker(new URL('./workers/enricher.worker.ts', import.meta.url), { type: 'module' })

function App() {
  const { feed, settings, setSettings, addFeedItem, updateFeedItem, loadCachedFeed, offline, setOffline } = useAppStore()
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')

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
      setProcessingStatus('Analisando contexto...')
      const { summary, topics, intents, questions } = e.data
      const id = Date.now()
      addFeedItem({ id, summary, topics, intents, questions, news: [], insights: [], timestamp: Date.now() })
      enricher.postMessage({ type: 'enrich', id, topics, newsApiKey: settings.newsApiKey, bingKey: settings.bingKey, offline })
      setTimeout(() => setProcessingStatus(''), 3000)
    }
    enricher.onmessage = (e) => {
      setProcessingStatus('Enriquecendo com insights...')
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
      setTimeout(() => setProcessingStatus(''), 2000)
    }
  }, [settings.newsApiKey, settings.bingKey, offline])

  const start = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) return
    const recognition = new SpeechRecognitionClass()
    recognition.lang = settings.language
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setCurrentTranscript(transcript)
      if (e.results[e.results.length - 1].isFinal) {
        orchestrator.postMessage({ type: 'transcript', text: transcript, offline })
      }
    }
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stop = () => {
    recognitionRef.current?.stop()
    setListening(false)
    setCurrentTranscript('')
  }

  const exportJson = () => {
    const data = JSON.stringify(feed, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `insider-agent-${new Date().toISOString()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen text-white p-8 maximalist-bg">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/2 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center slide-up">
          <h1 className="text-6xl font-bold mb-4 text-gradient float-animation rotate-in-3d">
            Insider Agent
          </h1>
          <p className="text-xl text-gray-300">
            Inteligência em tempo real para suas conversas
          </p>
        </header>

        {/* Status Bar */}
        <div className="mb-8 flex items-center justify-center gap-6 flex-wrap">
          <div className={`px-4 py-2 rounded-full glass-morphism flex items-center gap-2 ${offline ? 'border-red-500' : 'border-green-500'}`}>
            <span className={`w-3 h-3 rounded-full ${offline ? 'bg-red-500' : 'bg-green-500 pulse-dot'}`}></span>
            <span className="text-sm">{offline ? 'Offline' : 'Online'}</span>
          </div>

          {listening && (
            <div className="px-4 py-2 rounded-full glass-morphism flex items-center gap-3">
              <div className="sound-wave">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
              <span className="text-sm font-medium">Ouvindo...</span>
            </div>
          )}

          {processingStatus && (
            <div className="px-4 py-2 rounded-full glass-morphism shimmer">
              <span className="text-sm font-medium">{processingStatus}</span>
            </div>
          )}
        </div>

        {/* Control Center */}
        <div className="mb-8 glass-morphism rounded-3xl p-8 glow-effect">
          <div className="flex flex-col items-center gap-6">
            {/* Main Control Button */}
            <div className="relative">
              {!listening ? (
                <button
                  onClick={start}
                  className="relative w-32 h-32 rounded-full bg-gradient-to-r from-green-400 to-emerald-600 hover:from-green-500 hover:to-emerald-700 shadow-2xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center group tilt-hover"
                >
                  <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                  <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm font-medium whitespace-nowrap">
                    Iniciar Escuta
                  </span>
                </button>
              ) : (
                <button
                  onClick={stop}
                  className="relative w-32 h-32 rounded-full bg-gradient-to-r from-red-400 to-pink-600 hover:from-red-500 hover:to-pink-700 shadow-2xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center group pulse-ring tilt-hover"
                >
                  <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                  </svg>
                  <span className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-sm font-medium whitespace-nowrap">
                    Parar Escuta
                  </span>
                </button>
              )}
            </div>

            {/* Current Transcript Display */}
            {currentTranscript && (
              <div className="w-full max-w-2xl p-4 rounded-2xl bg-black/30 border border-white/10">
                <p className="text-sm text-gray-300 italic">"{currentTranscript}"</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 font-medium transform hover:scale-105 transition-all duration-300 shadow-lg tilt-hover"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                  Configurações
                </span>
              </button>

              <button
                onClick={exportJson}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 font-medium transform hover:scale-105 transition-all duration-300 shadow-lg tilt-hover"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Exportar
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 glass-morphism rounded-3xl p-8 slide-up">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}

        {/* Feed Display */}
        <div className="glass-morphism rounded-3xl p-8">
          <h2 className="text-2xl font-bold mb-6 text-gradient">Feed de Inteligência</h2>
          <Feed feed={feed} />
        </div>
      </div>
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold mb-4 text-gradient">Configurações</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Cadência de Análise
          </label>
          <select
            value={settings.cadence}
            onChange={(e) => setSettings({ cadence: Number(e.target.value) })}
            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white focus:border-purple-500 focus:outline-none"
          >
            <option value={10}>10 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Idioma
          </label>
          <input
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white focus:border-purple-500 focus:outline-none"
            placeholder="pt-BR"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            OpenAI API Key
          </label>
          <input
            type="password"
            value={settings.openaiKey}
            onChange={(e) => setSettings({ openaiKey: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white focus:border-purple-500 focus:outline-none"
            placeholder="sk-..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            NewsAPI Key
          </label>
          <input
            type="password"
            value={settings.newsApiKey}
            onChange={(e) => setSettings({ newsApiKey: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white focus:border-purple-500 focus:outline-none"
            placeholder="API Key"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Bing API Key
          </label>
          <input
            type="password"
            value={settings.bingKey}
            onChange={(e) => setSettings({ bingKey: e.target.value })}
            className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/20 text-white focus:border-purple-500 focus:outline-none"
            placeholder="API Key"
          />
        </div>
      </div>
    </div>
  )
}

function Feed({ feed }: { feed: FeedItem[] }) {
  if (feed.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="w-24 h-24 mx-auto text-gray-600 mb-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
        </svg>
        <p className="text-gray-400">Nenhuma análise ainda. Clique em "Iniciar Escuta" para começar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {feed.slice().reverse().map((item, index) => (
        <div
          key={item.id}
          className="gradient-border card-hover tilt-hover"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">
                  {new Date(item.timestamp).toLocaleString('pt-BR')}
                </p>
                <p className="text-gray-200 mb-4">{item.summary}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Topics */}
              <div>
                <h4 className="text-sm font-semibold text-purple-400 mb-3">Tópicos</h4>
                <div className="flex flex-wrap gap-2">
                  {item.topics.map((topic, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 text-xs rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>

              {/* News */}
              <div>
                <h4 className="text-sm font-semibold text-blue-400 mb-3">Notícias Relacionadas</h4>
                <div className="space-y-2">
                  {item.news.length > 0 ? (
                    item.news.slice(0, 3).map((n, i) => (
                      <a
                        key={i}
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs text-blue-300 hover:text-blue-400 truncate"
                      >
                        → {n.title}
                      </a>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500">Buscando notícias...</p>
                  )}
                </div>
              </div>

              {/* Insights */}
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-3">Insights</h4>
                <div className="space-y-2">
                  {item.insights.length > 0 ? (
                    item.insights.map((insight, i) => (
                      <p key={i} className="text-xs text-gray-300">
                        • {insight}
                      </p>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500">Processando insights...</p>
                  )}
                </div>
              </div>
            </div>

            {/* Questions */}
            {item.questions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <h4 className="text-sm font-semibold text-yellow-400 mb-2">Questões Levantadas</h4>
                <div className="flex flex-wrap gap-2">
                  {item.questions.map((q, i) => (
                    <span key={i} className="text-xs text-gray-400">
                      {q}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default App