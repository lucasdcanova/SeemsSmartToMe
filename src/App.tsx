import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useAppStore, type Settings, type FeedItem } from './store'
import './index.css'
import './speech-recognition.d.ts'

const orchestrator = new Worker(new URL('./workers/orchestrator.worker.ts', import.meta.url), { type: 'module' })
const enricher = new Worker(new URL('./workers/enricher.worker.ts', import.meta.url), { type: 'module' })

type AccentStyle = CSSProperties & { '--accent-hue'?: number }

function App() {
  const { feed, settings, setSettings, addFeedItem, updateFeedItem, loadCachedFeed, offline, setOffline } = useAppStore()
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [listening, setListening] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [processingStatus, setProcessingStatus] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)

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

  useEffect(() => {
    void loadCachedFeed()
  }, [loadCachedFeed])

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setOffline])

  useEffect(() => {
    orchestrator.postMessage({ type: 'init', cadence: settings.cadence, language: settings.language, openaiKey: settings.openaiKey })
  }, [settings.cadence, settings.language, settings.openaiKey])

  useEffect(() => {
    orchestrator.onmessage = (e) => {
      setProcessingStatus('Sintetizando descobertas')
      const { summary, topics, intents, questions } = e.data
      const id = Date.now()
      addFeedItem({ id, summary, topics, intents, questions, news: [], insights: [], timestamp: Date.now() })
      enricher.postMessage({ type: 'enrich', id, topics, openaiKey: settings.openaiKey, offline })
    }

    enricher.onmessage = (e) => {
      setProcessingStatus('Finalizando insights visuais')
      const { id, news, insights } = e.data
      updateFeedItem(id, { news, insights })
      setTimeout(() => setProcessingStatus(''), 1600)
    }
  }, [settings.openaiKey, offline, addFeedItem, updateFeedItem])

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
      setProcessingStatus('Escutando agora')
    }

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setCurrentTranscript(transcript)
      setAudioLevel(Math.min(transcript.length / 10, 10))

      if (e.results[e.results.length - 1].isFinal) {
        setProcessingStatus('Processando análise')
        orchestrator.postMessage({ type: 'transcript', text: transcript, offline })

        setTimeout(() => {
          setCurrentTranscript('')
          setAudioLevel(0)
        }, 600)
      }
    }

    recognition.onerror = () => {
      setProcessingStatus('Erro no reconhecimento de voz')
    }

    recognition.onend = () => {
      if (listening) {
        setTimeout(() => recognition.start(), 120)
      } else {
        setProcessingStatus('')
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
    setAudioLevel(0)
    setProcessingStatus('Captura pausada')
    setTimeout(() => setProcessingStatus(''), 1200)
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

  const statusNarrative = processingStatus || (listening ? 'Captando agora' : 'Pronto para iniciar')
  const transcriptPreview = currentTranscript
    ? `“${currentTranscript.slice(0, 140)}${currentTranscript.length > 140 ? '…' : ''}”`
    : 'Nenhum trecho em captura'

  return (
    <div className="studio-shell">
      <div className="studio-backdrop" />
      <main className="studio-frame">
        <header className="studio-header">
          <section className={`hero-card ${listening ? 'hero-card--active' : ''}`}>
            <div className="hero-media">
              <div className="hero-image" aria-hidden />
              <div className="hero-glow" />
            </div>
            <div className="hero-copy">
              <span className="hero-eyebrow">Observatório visual de conversas</span>
              <h1 className="hero-title">Insider Agent</h1>
              <p className="hero-text">
                Transforme diálogos em uma biblioteca curada de insights visuais. Capture apenas o essencial e reveja tudo em um
                ambiente leve, inspirado pelo minimalismo do mymind.
              </p>
            </div>
          </section>

          <aside className="hero-side">
            <div className={`status-chip ${offline ? 'status-chip--offline' : 'status-chip--online'}`}>
              <span className="status-dot" />
              <span>{offline ? 'Offline' : 'Sincronizado'}</span>
            </div>
            <p className="status-message">{statusNarrative}</p>
            <div className="metric-tiles">
              <div className="metric-tile">
                <span className="metric-number">{feed.length}</span>
                <span className="metric-label">Sessões</span>
              </div>
              <div className="metric-tile">
                <span className="metric-number">{totalInsights}</span>
                <span className="metric-label">Insights</span>
              </div>
              <div className="metric-tile">
                <span className="metric-number">{totalTopics}</span>
                <span className="metric-label">Tópicos</span>
                {openQuestions > 0 && <span className="metric-footnote">{openQuestions} perguntas em aberto</span>}
              </div>
            </div>
          </aside>
        </header>

        <section className="capture-row">
          <div className="capture-card">
            <div className="capture-header">
              <h2>Captura de áudio</h2>
              {processingStatus && <span className="capture-status">{processingStatus}</span>}
            </div>
            <div className="capture-body">
              <button
                onClick={listening ? stop : start}
                className={`capture-button ${listening ? 'capture-button--active' : ''}`}
              >
                {listening ? 'Parar captura' : 'Iniciar captura'}
              </button>
              <div className="audio-visual">
                <div className="audio-bars">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const height = 8 + audioLevel * (index + 1)
                    return <span key={index} className="audio-bar" style={{ height: `${height}px` }} />
                  })}
                </div>
                <p className="audio-caption">{transcriptPreview}</p>
              </div>
            </div>
            <div className="capture-actions">
              <button onClick={() => setShowSettings(true)} className="ghost-button" type="button">
                Preferências
              </button>
              <button onClick={exportJson} className="ghost-button ghost-button--primary" type="button">
                Exportar biblioteca
              </button>
            </div>
          </div>
        </section>

        <section className="feed-section">
          <div className="section-heading">
            <div>
              <h2>Biblioteca de insights</h2>
              <p>Resumos visuais e referências essenciais das suas sessões.</p>
            </div>
            <span className="section-count">{feed.length} sessões</span>
          </div>
          <Feed feed={feed} />
        </section>
      </main>

      {showSettings && (
        <div className="settings-layer" role="dialog" aria-modal="true">
          <div className="settings-sheet">
            <button className="settings-close" type="button" onClick={() => setShowSettings(false)} aria-label="Fechar">
              ×
            </button>
            <Settings settings={settings} setSettings={setSettings} />
          </div>
        </div>
      )}
    </div>
  )
}

function Settings({ settings, setSettings }: { settings: Settings; setSettings: (s: Partial<Settings>) => void }) {
  return (
    <div className="settings-content">
      <h2 className="settings-heading">Preferências</h2>
      <p className="settings-description">Ajuste a frequência de coleta e idioma utilizados pelo agente.</p>

      <div className="settings-grid">
        <label className="settings-field">
          <span className="settings-label">Cadência de análise</span>
          <select
            value={settings.cadence}
            onChange={(e) => setSettings({ cadence: Number(e.target.value) })}
            className="settings-input"
          >
            <option value={10}>10 segundos</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-label">Idioma</span>
          <input
            value={settings.language}
            onChange={(e) => setSettings({ language: e.target.value })}
            className="settings-input"
            placeholder="pt-BR"
          />
        </label>

        <label className="settings-field">
          <span className="settings-label">OpenAI API Key</span>
          <input
            type="password"
            value={settings.openaiKey}
            onChange={(e) => setSettings({ openaiKey: e.target.value })}
            className="settings-input"
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
      <div className="empty-board">
        <div className="empty-illustration" aria-hidden>
          <div className="empty-gradient" />
        </div>
        <div className="empty-copy">
          <h3>Nenhum insight ainda</h3>
          <p>Inicie uma captura para construir sua galeria pessoal de referências.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="story-grid">
      {feed
        .slice()
        .reverse()
        .map((item) => {
          const questionCount = item.questions?.length ?? 0
          const accentStyle: AccentStyle = { '--accent-hue': item.id % 360 }

          return (
            <article key={item.id} className="story-card" style={accentStyle}>
              <div className="story-image" aria-hidden />
              <div className="story-content">
                <header className="story-header">
                  <time className="story-time">{new Date(item.timestamp).toLocaleString('pt-BR')}</time>
                  {questionCount > 0 && <span className="story-badge">{questionCount} perguntas</span>}
                </header>

                <p className="story-summary">
                  {typeof item.summary === 'string' && !item.summary.includes('{')
                    ? item.summary
                    : 'Análise em processamento...'}
                </p>

                <div className="story-details">
                  <div className="story-group">
                    <span className="story-label">Tópicos</span>
                    <div className="story-chips">
                      {item.topics && item.topics.length > 0 ? (
                        item.topics.map((topic, i) => (
                          <span key={i} className="story-chip">
                            {typeof topic === 'string' ? topic : 'Processando...'}
                          </span>
                        ))
                      ) : (
                        <span className="story-chip story-chip--ghost">Identificando tópicos</span>
                      )}
                    </div>
                  </div>

                  <div className="story-group">
                    <span className="story-label">Insights</span>
                    <ul className="story-list">
                      {item.insights && item.insights.length > 0 ? (
                        item.insights.map((insight, i) => <li key={i}>{insight}</li>)
                      ) : (
                        <li className="story-empty">Aguardando insights</li>
                      )}
                    </ul>
                  </div>

                  <div className="story-group">
                    <span className="story-label">Referências</span>
                    <div className="story-links">
                      {item.news && item.news.length > 0 ? (
                        item.news.slice(0, 2).map((n, i) => (
                          <a
                            key={i}
                            href={n.url !== '#' ? n.url : undefined}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {n.title}
                          </a>
                        ))
                      ) : (
                        <span className="story-empty">Sem fontes externas ainda</span>
                      )}
                    </div>
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
