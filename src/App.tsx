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
  const [showHistory, setShowHistory] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')
  const hasContent = useMemo(() => feed.length > 0, [feed])

  useEffect(() => {
    loadCachedFeed()
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadCachedFeed, setOffline])

  useEffect(() => {
    orchestrator.postMessage({ type: 'init', cadence: settings.cadence, language: settings.language, openaiKey: settings.openaiKey })
  }, [settings.cadence, settings.language, settings.openaiKey])

  useEffect(() => {
    orchestrator.onmessage = (e) => {
      setProcessingStatus('Mapeando assuntos...')
      const { topics } = e.data

      const id = Date.now()
      addFeedItem({ id, topics, news: [], insights: [], timestamp: Date.now() })

      setProcessingStatus('Buscando notícias...')
      enricher.postMessage({ type: 'enrich', id, topics, openaiKey: settings.openaiKey, offline })
    }

    enricher.onmessage = (e) => {
      setProcessingStatus('Atualizações prontas.')
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
      setTimeout(() => setProcessingStatus(''), 2000)
    }
  }, [settings.openaiKey, offline, addFeedItem, updateFeedItem])

  const start = () => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setProcessingStatus('Este navegador não suporta reconhecimento de voz.')
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = settings.language
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onstart = () => {
      setProcessingStatus('Escutando...')
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

    recognition.onerror = (event) => {
      const errorMessage = (event as SpeechRecognitionErrorEvent)?.error
      setProcessingStatus(errorMessage ? `Falha: ${errorMessage}` : 'Falha no reconhecimento de voz.')
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
          <div className="hero-copy">
            <h1 className="app-title">Radar Insider</h1>
            <p className="app-lead">Capta o que é dito e entrega apenas notícias e pontos úteis.</p>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              onClick={listening ? stop : start}
              className={`hero-cta ${listening ? 'hero-cta--listening' : ''}`}
              aria-pressed={listening}
            >
              <span className="hero-cta__icon" aria-hidden="true">
                {listening ? (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                ) : (
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </span>
              <span className="hero-cta__label">{listening ? 'Parar captura' : 'Ouvir agora'}</span>
            </button>

            <div className="hero-status-board" role="status" aria-live="polite">
              <span className={`status-chip ${offline ? 'status-chip--offline' : 'status-chip--online'}`}>
                <span className="status-chip__dot" aria-hidden="true" />
                <span className="status-chip__label">{offline ? 'Offline' : 'Ao vivo'}</span>
              </span>
              <span className={`status-chip ${listening ? 'status-chip--recording' : ''}`}>
                <span className={`status-chip__dot ${listening ? 'status-chip__dot--amber' : ''}`} aria-hidden="true" />
                <span className="status-chip__label">{listening ? 'Gravando' : 'Pronto'}</span>
              </span>
            </div>
          </div>
        </header>

        <section className="control-panel surface">

          {processingStatus && <p className="status-inline">{processingStatus}</p>}

          {currentTranscript && (
            <div className="teleprompter">
              <span className="teleprompter-label">Transcrição ao vivo</span>
              <p className="teleprompter-text">"{currentTranscript}"</p>
            </div>
          )}

          <div className="control-actions">
            <button onClick={() => setShowSettings(!showSettings)} className="link-button">
              {showSettings ? 'Ocultar ajustes' : 'Ajustes'}
            </button>
            <div className="control-actions__group">
              {hasContent && (
                <button onClick={exportJson} className="link-button link-button--primary">
                  Exportar histórico
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className={`history-toggle ${showHistory ? 'history-toggle--active' : ''}`}
                aria-pressed={showHistory}
                aria-label={`${showHistory ? 'Ocultar' : 'Mostrar'} histórico`}
                title={showHistory ? 'Ocultar histórico' : 'Mostrar histórico'}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6l3 3" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9 9 0 110-18 9 9 0 010 18z" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {showSettings && (
          <div className="settings-panel surface">
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        )}
        {showHistory && (
          <section className="feed-panel surface">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">Atualizações capturadas</h2>
                <p className="panel-subtitle">Veja os temas detectados e as notícias sugeridas.</p>
              </div>
              {hasContent && <span className="panel-note">{feed.length} registros</span>}
            </div>
            <Feed feed={feed} />
          </section>
        )}
      </div>
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="settings-content">
      <h3 className="panel-title">Ajustes</h3>
      <p className="panel-subtitle">Defina cadência, idioma e chave de API.</p>

      <div className="settings-grid">
        <label className="field-group">
          <span className="field-label">Cadência da análise</span>
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
          <span className="field-label">Idioma da captura</span>
          <input
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
            className="neo-field"
            placeholder="pt-BR"
          />
        </label>

        <label className="field-group">
          <span className="field-label">Chave OpenAI</span>
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
        </div>
        <p className="empty-title">Nenhuma notícia ainda.</p>
        <p className="empty-subtitle">Ative "Ouvir agora" para gerar a primeira captura.</p>
      </div>
    )
  }

  return (
    <div className="feed-stack">
      {feed
        .slice()
        .reverse()
        .map((item) => {
          return (
            <article key={item.id} className="holo-card">
              <header className="holo-card__header">
                <span className="holo-card__timestamp">{new Date(item.timestamp).toLocaleString('pt-BR')}</span>
              </header>
              <div className="card-grid">
                <div className="card-block">
                  <h4 className="card-block__title">Assuntos detectados</h4>
                  <div className="chip-row">
                    {item.topics && item.topics.length > 0 ? (
                      item.topics.map((topic, i) => (
                        <span key={i} className="chip chip--topic">
                          {typeof topic === 'string' ? topic : 'Gerando...'}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip--ghost">Capturando temas...</span>
                    )}
                  </div>
                </div>

                <div className="card-block">
                  <h4 className="card-block__title">Informações rápidas</h4>
                  <div className="list-stack">
                    {item.insights && item.insights.length > 0 ? (
                      item.insights.map((insight, i) => (
                        <p key={i} className="list-item">{insight}</p>
                      ))
                    ) : (
                      <p className="list-item list-item--muted">Gerando apontamentos...</p>
                    )}
                  </div>
                </div>

                <div className="card-block">
                  <h4 className="card-block__title">Notícias sugeridas</h4>
                  <div className="list-stack">
                    {item.news && item.news.length > 0 ? (
                      item.news.slice(0, 3).map((n, i) => (
                        <a
                          key={i}
                          href={n.url !== '#' ? n.url : undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="list-link"
                        >
                          {n.title}
                        </a>
                      ))
                    ) : (
                      <p className="list-item list-item--muted">Buscando fontes confiáveis...</p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        })}
    </div>
  )
}

export default App
