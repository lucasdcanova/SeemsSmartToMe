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
  const hasContent = useMemo(() => feed.length > 0, [feed])

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

      setProcessingStatus('Gerando insights...')
      enricher.postMessage({ type: 'enrich', id, topics, openaiKey: settings.openaiKey, offline })
    }

    enricher.onmessage = (e) => {
      setProcessingStatus('Finalizando...')
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
      setTimeout(() => setProcessingStatus(''), 2000)
    }
  }, [settings.openaiKey, offline])

  const start = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setProcessingStatus('Reconhecimento de voz não suportado neste navegador')
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = settings.language
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setProcessingStatus('Ouvindo...')
    }

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setCurrentTranscript(transcript)

      if (e.results[e.results.length - 1].isFinal) {
        setProcessingStatus('Enviando para análise...')

        orchestrator.postMessage({ type: 'transcript', text: transcript, offline })

        setTimeout(() => {
          setCurrentTranscript('')
        }, 1000)
      }
    }

    recognition.onerror = (e: any) => {
      setProcessingStatus(e.error ? `Erro: ${e.error}` : 'Erro no reconhecimento de voz')
    }

    recognition.onend = () => {
      if (listening) {
        setTimeout(() => recognition.start(), 100)
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
    <div className="app-shell">
      <div className="app-container">
        <header className="app-header surface app-header--minimal">
          <span className="app-eyebrow">Remember everything. Organize nothing.</span>
          <h1 className="app-title">Seems Smart to Me</h1>
          <p className="app-lead">
            Captura discreta de conversas e ideias, com insights organizados automaticamente. Nenhum feed social, nenhuma distração —
            apenas o seu conteúdo.
          </p>
        </header>

        <section className="control-panel surface">
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

          {processingStatus && <p className="status-inline">{processingStatus}</p>}

          {currentTranscript && (
            <div className="teleprompter">
              <span className="teleprompter-label">Transcrição em tempo real</span>
              <p className="teleprompter-text">"{currentTranscript}"</p>
            </div>
          )}

          <div className="control-actions">
            <button onClick={() => setShowSettings(!showSettings)} className="link-button">
              {showSettings ? 'Ocultar configurações' : 'Configurações'}
            </button>
            {hasContent && (
              <button onClick={exportJson} className="link-button link-button--primary">
                Exportar JSON
              </button>
            )}
          </div>
        </section>

        {showSettings && (
          <div className="settings-panel surface">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}
        <section className="feed-panel surface">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Blocos recentes</h2>
              <p className="panel-subtitle">Insights e referências agrupados automaticamente a partir das conversas.</p>
            </div>
            {hasContent && <span className="panel-note">{feed.length} sessões</span>}
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
