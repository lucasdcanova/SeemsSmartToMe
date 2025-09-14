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
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcriptFinal, setTranscriptFinal] = useState('')
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  const addDebugInfo = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setDebugInfo(prev => [...prev.slice(-4), `[${timestamp}] ${message}`])
  }

  useEffect(() => {
    loadCachedFeed()
    addDebugInfo(`🔧 Iniciando sistema - OpenAI API: ${settings.openaiKey ? '✅ Configurada' : '❌ Não configurada'}`)
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
      addDebugInfo('Resposta recebida do orchestrator')
      setProcessingStatus('🧠 Analisando contexto e extraindo insights...')
      const { summary, topics, intents, questions } = e.data
      addDebugInfo(`Análise concluída: ${topics?.length || 0} tópicos encontrados`)

      const id = Date.now()
      addFeedItem({ id, summary, topics, intents, questions, news: [], insights: [], timestamp: Date.now() })

      setProcessingStatus('🔍 Gerando insights e informações...')
      enricher.postMessage({ type: 'enrich', id, topics, openaiKey: settings.openaiKey, offline })
      addDebugInfo('Solicitação de enriquecimento enviada')
    }

    enricher.onmessage = (e) => {
      addDebugInfo('Enriquecimento recebido')
      setProcessingStatus('✨ Finalizando insights...')
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
      addDebugInfo(`Concluído: ${news?.length || 0} informações, ${insights?.length || 0} insights`)
      setTimeout(() => setProcessingStatus(''), 2000)
    }
  }, [settings.openaiKey, offline])

  const start = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      addDebugInfo('❌ Speech Recognition não suportado neste navegador')
      return
    }

    addDebugInfo('🎤 Iniciando reconhecimento de voz...')
    const recognition = new SpeechRecognitionClass()
    recognition.lang = settings.language
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      addDebugInfo('✅ Reconhecimento de voz iniciado')
      setProcessingStatus('🎤 Ouvindo... Pode falar!')
    }

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setCurrentTranscript(transcript)

      // Simular nível de áudio baseado no comprimento da transcrição
      setAudioLevel(Math.min(transcript.length / 10, 10))

      if (e.results[e.results.length - 1].isFinal) {
        setTranscriptFinal(transcript)
        addDebugInfo(`📝 Transcrição finalizada: "${transcript.substring(0, 50)}..."`)
        setProcessingStatus('🔄 Enviando para análise...')

        orchestrator.postMessage({ type: 'transcript', text: transcript, offline })
        addDebugInfo('📤 Transcrição enviada para o orchestrator')

        // Limpar transcrição temporária após envio
        setTimeout(() => {
          setCurrentTranscript('')
          setAudioLevel(0)
        }, 1000)
      } else {
        addDebugInfo('🎧 Capturando áudio...')
      }
    }

    recognition.onerror = (e: any) => {
      addDebugInfo(`❌ Erro no reconhecimento: ${e.error || 'Erro desconhecido'}`)
      setProcessingStatus('❌ Erro no reconhecimento de voz')
    }

    recognition.onend = () => {
      addDebugInfo('🔴 Reconhecimento de voz finalizado')
      if (listening) {
        // Reiniciar automaticamente se ainda estiver no modo listening
        setTimeout(() => recognition.start(), 100)
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stop = () => {
    addDebugInfo('🛑 Parando reconhecimento de voz...')
    recognitionRef.current?.stop()
    setListening(false)
    setCurrentTranscript('')
    setAudioLevel(0)
    setProcessingStatus('')
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
    <div className="min-h-screen" style={{background: 'linear-gradient(to bottom right, #111827, #1f2937, #111827)'}}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2 text-gradient">
            Insider Agent
          </h1>
          <p className="text-gray-400">
            Inteligência em tempo real para suas conversas
          </p>
        </header>

        {/* Status Bar */}
        <div className="mb-6 flex items-center justify-center gap-4 flex-wrap">
          <div className={`status-indicator ${offline ? 'border-red-500/50' : 'border-green-500/50'}`}>
            <span className={`w-2 h-2 rounded-full ${offline ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`}></span>
            <span className="text-xs">{offline ? 'Offline' : 'Online'}</span>
          </div>

          {listening && (
            <div className="status-indicator">
              <div className="sound-wave">
                <span style={{transform: `scaleY(${0.3 + audioLevel * 0.1})`}}></span>
                <span style={{transform: `scaleY(${0.3 + audioLevel * 0.15})`}}></span>
                <span style={{transform: `scaleY(${0.3 + audioLevel * 0.2})`}}></span>
                <span style={{transform: `scaleY(${0.3 + audioLevel * 0.15})`}}></span>
                <span style={{transform: `scaleY(${0.3 + audioLevel * 0.1})`}}></span>
              </div>
              <span className="text-xs">
                {currentTranscript ? '🎙️ Capturando...' : '👂 Ouvindo...'}
              </span>
            </div>
          )}

          {processingStatus && (
            <div className="status-indicator animate-pulse-slow">
              <span className="text-xs">{processingStatus}</span>
            </div>
          )}
        </div>

        {/* Control Center */}
        <div className="mb-6 card">
          <div className="flex flex-col items-center gap-6">
            {/* Main Control Button */}
            <div style={{position: 'relative'}}>
              {!listening ? (
                <button
                  onClick={start}
                  style={{
                    width: '96px',
                    height: '96px',
                    borderRadius: '50%',
                    background: 'linear-gradient(to right, #059669, #10b981)',
                    border: 'none',
                    color: 'white',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, #047857, #059669)'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, #059669, #10b981)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <svg style={{width: '40px', height: '40px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={stop}
                  className="animate-pulse"
                  style={{
                    width: '96px',
                    height: '96px',
                    borderRadius: '50%',
                    background: 'linear-gradient(to right, #dc2626, #e11d48)',
                    border: 'none',
                    color: 'white',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    transform: 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, #b91c1c, #be185d)'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to right, #dc2626, #e11d48)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }}
                >
                  <svg style={{width: '40px', height: '40px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                </button>
              )}
              <p style={{textAlign: 'center', marginTop: '12px', fontSize: '14px', color: '#9ca3af'}}>
                {listening ? 'Parar' : 'Iniciar'} Escuta
              </p>
            </div>

            {/* Current Transcript Display */}
            {currentTranscript && (
              <div className="w-full max-w-2xl p-4 rounded-lg bg-black/20 border border-white/5">
                <p className="text-sm text-gray-300 italic">"{currentTranscript}"</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="btn-secondary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configurações
              </button>

              <button
                onClick={exportJson}
                className="btn-primary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar
              </button>
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-6 card">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}

        {/* Debug Panel */}
        {debugInfo.length > 0 && (
          <div className="mb-6 card">
            <h3 className="text-lg font-semibold mb-3">🔍 Status do Sistema</h3>
            <div className="space-y-1">
              {debugInfo.map((info, i) => (
                <p key={i} className="text-xs font-mono" style={{color: '#94a3b8'}}>
                  {info}
                </p>
              ))}
            </div>
            {transcriptFinal && (
              <div className="mt-4 p-3 rounded-lg" style={{backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)'}}>
                <p className="text-sm font-semibold text-green-400 mb-1">📝 Última Transcrição Processada:</p>
                <p className="text-sm" style={{color: '#d1d5db'}}>"{transcriptFinal}"</p>
              </div>
            )}
          </div>
        )}

        {/* Feed Display */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4 text-gradient">Feed de Inteligência</h2>
          <Feed feed={feed} />
        </div>
      </div>
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Configurações</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Cadência de Análise
          </label>
          <select
            value={settings.cadence}
            onChange={(e) => setSettings({ cadence: Number(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500 focus:outline-none"
          >
            <option value={10}>10 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            Idioma
          </label>
          <input
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500 focus:outline-none"
            placeholder="pt-BR"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1">
            OpenAI API Key
          </label>
          <input
            type="password"
            value={settings.openaiKey}
            onChange={(e) => setSettings({ openaiKey: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-black/20 border border-white/10 text-white text-sm focus:border-purple-500 focus:outline-none"
            placeholder="sk-..."
          />
        </div>

      </div>
    </div>
  )
}

function Feed({ feed }: { feed: FeedItem[] }) {
  if (feed.length === 0) {
    return (
      <div className="text-center py-8">
        <svg className="w-16 h-16 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 text-sm">Nenhuma análise ainda. Clique em "Iniciar Escuta" para começar.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {feed.slice().reverse().map((item) => (
        <div
          key={item.id}
          className="p-4 rounded-lg bg-black/20 border border-white/5 hover:border-white/10 transition-colors"
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">
                {new Date(item.timestamp).toLocaleString('pt-BR')}
              </p>
              <p className="text-sm text-gray-200">{item.summary}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Topics */}
            <div>
              <h4 className="font-semibold text-purple-400 mb-2">Tópicos</h4>
              <div className="flex flex-wrap gap-1">
                {item.topics.map((topic, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>

            {/* News */}
            <div>
              <h4 className="font-semibold text-blue-400 mb-2">Informações</h4>
              <div className="space-y-1">
                {item.news.length > 0 ? (
                  item.news.slice(0, 3).map((n, i) => (
                    <a
                      key={i}
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-blue-300 hover:text-blue-400 truncate"
                    >
                      → {n.title}
                    </a>
                  ))
                ) : (
                  <p className="text-gray-500">Buscando...</p>
                )}
              </div>
            </div>

            {/* Insights */}
            <div>
              <h4 className="font-semibold text-green-400 mb-2">Insights</h4>
              <div className="space-y-1">
                {item.insights.length > 0 ? (
                  item.insights.map((insight, i) => (
                    <p key={i} className="text-gray-300">
                      • {insight}
                    </p>
                  ))
                ) : (
                  <p className="text-gray-500">Processando...</p>
                )}
              </div>
            </div>
          </div>

          {/* Questions */}
          {item.questions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <h4 className="text-xs font-semibold text-yellow-400 mb-1">Questões</h4>
              <div className="flex flex-wrap gap-1">
                {item.questions.map((q, i) => (
                  <span key={i} className="text-xs text-gray-400">
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default App