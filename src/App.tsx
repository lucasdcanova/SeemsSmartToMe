import { useEffect, useMemo, useRef, useState } from 'react'
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

  const totalInsights = useMemo(
    () => feed.reduce((acc, item) => acc + (item.insights?.length ?? 0), 0),
    [feed]
  )
  const totalTopics = useMemo(
    () => feed.reduce((acc, item) => acc + (item.topics?.length ?? 0), 0),
    [feed]
  )
  const openQuestions = useMemo(() => {
    if (feed.length === 0) return 0
    return feed[feed.length - 1].questions?.length ?? 0
  }, [feed])

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

      setAudioLevel(Math.min(transcript.length / 10, 10))

      if (e.results[e.results.length - 1].isFinal) {
        setTranscriptFinal(transcript)
        addDebugInfo(`📝 Transcrição finalizada: "${transcript.substring(0, 50)}..."`)
        setProcessingStatus('🔄 Enviando para análise...')

        orchestrator.postMessage({ type: 'transcript', text: transcript, offline })
        addDebugInfo('📤 Transcrição enviada para o orchestrator')

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

  const statusNarrative = processingStatus || (listening ? '🎧 Imersão ativa' : '🛋️ Aguardando conversas')

  return (
    <div className="app-shell">
      <div className="aurora-layer aurora-layer--1" />
      <div className="aurora-layer aurora-layer--2" />
      <div className="aurora-layer aurora-layer--3" />
      <div className="grid-overlay" />
      <div className="orb orb--one" />
      <div className="orb orb--two" />

      <div className="app-container">
        <header className="app-header neon-panel">
          <div className="app-header__intro">
            <span className="app-eyebrow">Radar conversacional em tempo real</span>
            <h1 className="app-title">Insider Agent</h1>
            <p className="app-lead">
              Inteligência maximalista para transformar fala em estratégia instantânea. Mantenha sua equipe sincronizada com insights em
              3D, sem perder o ritmo da conversa.
            </p>
          </div>
          <div className="metric-wall">
            <div className="metric-card">
              <span className="metric-label">Conexão</span>
              <p className={`metric-value ${offline ? 'metric-value--danger' : ''}`}>{offline ? 'Offline' : 'Online'}</p>
              <span className="metric-legend">
                {offline ? 'Reconecte para novas coletas' : 'Sincronizado com a nuvem'}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Insights gerados</span>
              <p className="metric-value">{totalInsights}</p>
              <span className="metric-legend">{feed.length} análises completas</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Tópicos mapeados</span>
              <p className="metric-value">{totalTopics}</p>
              <span className="metric-legend">{openQuestions} questões em aberto</span>
            </div>
          </div>
        </header>

        <section className="status-dock">
          <div className={`status-pill ${offline ? 'status-pill--offline' : 'status-pill--online'}`}>
            <span className="status-lamp" />
            <span>{offline ? 'Modo offline' : 'Conexão estável'}</span>
          </div>

          <div className="status-pill status-pill--narrative">
            <span className="status-glow" />
            <span>{statusNarrative}</span>
          </div>

          {listening && (
            <div className="status-pill status-pill--listening">
              <div className="sound-wave">
                <span style={{ transform: `scaleY(${0.3 + audioLevel * 0.1})` }} />
                <span style={{ transform: `scaleY(${0.3 + audioLevel * 0.15})` }} />
                <span style={{ transform: `scaleY(${0.3 + audioLevel * 0.2})` }} />
                <span style={{ transform: `scaleY(${0.3 + audioLevel * 0.15})` }} />
                <span style={{ transform: `scaleY(${0.3 + audioLevel * 0.1})` }} />
              </div>
              <span className="status-text">{currentTranscript ? 'Capturando espectro' : 'Escuta ativa'}</span>
            </div>
          )}

          {processingStatus && (
            <div className="status-pill status-pill--processing">
              <span className="status-glow status-glow--pulse" />
              <span>{processingStatus}</span>
            </div>
          )}
        </section>

        <section className="control-panel neon-panel">
          <div className={`control-orbit ${listening ? 'control-orbit--active' : ''}`}>
            <button
              onClick={listening ? stop : start}
              className={`control-button ${listening ? 'control-button--listening' : 'control-button--idle'}`}
            >
              {listening ? (
                <svg className="control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                </svg>
              ) : (
                <svg className="control-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
            <span className="control-hint">{listening ? 'Parar escuta' : 'Iniciar escuta'}</span>
          </div>

          {currentTranscript && (
            <div className="teleprompter">
              <span className="teleprompter-label">Transcrição em tempo real</span>
              <p className="teleprompter-text">"{currentTranscript}"</p>
            </div>
          )}

          <div className="control-actions">
            <button onClick={() => setShowSettings(!showSettings)} className="command-button command-button--ghost">
              <svg className="command-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configurações
            </button>

            <button onClick={exportJson} className="command-button command-button--primary">
              <svg className="command-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Exportar
            </button>
          </div>
        </section>

        {showSettings && (
          <div className="settings-panel neon-panel">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}

        {debugInfo.length > 0 && (
          <div className="debug-panel neon-panel">
            <div className="panel-header">
              <h3 className="panel-title">🔍 Telemetria do Sistema</h3>
              <p className="panel-subtitle">Acompanhe cada etapa da captura e processamento</p>
            </div>
            <div className="debug-stream">
              {debugInfo.map((info, i) => (
                <p key={i} className="debug-line">
                  {info}
                </p>
              ))}
            </div>
            {transcriptFinal && (
              <div className="debug-highlight">
                <p className="debug-highlight__title">📝 Última transcrição processada</p>
                <p className="debug-highlight__text">"{transcriptFinal}"</p>
              </div>
            )}
          </div>
        )}

        <section className="feed-panel neon-panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Feed de Inteligência</h2>
              <p className="panel-subtitle">Novos pulsos de informação a cada {settings.cadence} segundos</p>
            </div>
            <span className="panel-badge">{feed.length} sessões</span>
          </div>
          <Feed feed={feed} />
        </section>
      </div>
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="settings-content">
      <h3 className="panel-title">Configurações</h3>
      <p className="panel-subtitle">Personalize o comportamento do agente e a cadência de análise</p>

      <div className="settings-grid">
        <label className="field-group">
          <span className="field-label">Cadência de Análise</span>
          <select
            value={settings.cadence}
            onChange={(e) => setSettings({ cadence: Number(e.target.value) })}
            className="neo-field"
          >
            <option value={10}>10 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </label>

        <label className="field-group">
          <span className="field-label">Idioma</span>
          <input
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
            className="neo-field"
            placeholder="pt-BR"
          />
        </label>

        <label className="field-group">
          <span className="field-label">OpenAI API Key</span>
          <input
            type="password"
            value={settings.openaiKey}
            onChange={(e) => setSettings({ openaiKey: e.target.value })}
            className="neo-field"
            placeholder="sk-..."
          />
        </label>
      </div>
    </div>
  )
}

function Feed({ feed }: { feed: FeedItem[] }) {
  if (feed.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <svg className="empty-icon__svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="empty-title">Nenhuma análise ainda.</p>
        <p className="empty-subtitle">Clique em "Iniciar escuta" para lançar a primeira órbita de insights.</p>
      </div>
    )
  }

  return (
    <div className="feed-stack">
      {feed
        .slice()
        .reverse()
        .map((item) => {
          const questionCount = item.questions?.length ?? 0
          return (
            <article key={item.id} className="holo-card">
              <header className="holo-card__header">
                <span className="holo-card__timestamp">📅 {new Date(item.timestamp).toLocaleString('pt-BR')}</span>
                {questionCount > 0 && <span className="chip chip--warning">{questionCount} questões</span>}
              </header>

              <div className="holo-card__summary">
                <p>
                  {typeof item.summary === 'string' && !item.summary.includes('{')
                    ? item.summary
                    : 'Análise em processamento...'}
                </p>
              </div>

              <div className="holo-card__body">
                <div className="info-column">
                  <h4 className="info-column__title">🏷️ Tópicos</h4>
                  <div className="info-column__content info-column__content--wrap">
                    {item.topics && item.topics.length > 0 ? (
                      item.topics.map((topic, i) => (
                        <span key={i} className="chip chip--topic">
                          {typeof topic === 'string' ? topic : 'Processando...'}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip--ghost">Identificando tópicos...</span>
                    )}
                  </div>
                </div>

                <div className="info-column">
                  <h4 className="info-column__title">📰 Informações</h4>
                  <div className="info-column__content info-column__content--stacked">
                    {item.news && item.news.length > 0 ? (
                      item.news.slice(0, 3).map((n, i) => (
                        <a
                          key={i}
                          href={n.url !== '#' ? n.url : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="glow-link"
                        >
                          <span className="glow-link__accent" />
                          <p>{n.title}</p>
                        </a>
                      ))
                    ) : (
                      <span className="chip chip--ghost">Gerando informações relevantes...</span>
                    )}
                  </div>
                </div>

                <div className="info-column">
                  <h4 className="info-column__title">💡 Insights</h4>
                  <div className="info-column__content info-column__content--stacked">
                    {item.insights && item.insights.length > 0 ? (
                      item.insights.map((insight, i) => (
                        <div key={i} className="insight-pill">
                          <span className="insight-pill__beam" />
                          <p>{insight}</p>
                        </div>
                      ))
                    ) : (
                      <span className="chip chip--ghost">Analisando contexto...</span>
                    )}
                  </div>
                </div>
              </div>

              {item.questions && item.questions.length > 0 && (
                <div className="question-grid">
                  {item.questions.map((q, i) => (
                    <div key={i} className="question-chip">
                      <span className="question-chip__icon">❓</span>
                      <p>{typeof q === 'string' ? q : 'Processando...'}</p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
    </div>
  )
}

export default App
