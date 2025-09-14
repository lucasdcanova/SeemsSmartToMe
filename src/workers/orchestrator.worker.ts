import { summarizeLocal } from '../utils/summarize'

interface InitMessage {
  type: 'init'
  cadence: number
  language: string
  openaiKey: string
}

interface TranscriptMessage {
  type: 'transcript'
  text: string
  offline: boolean
}

type Message = InitMessage | TranscriptMessage

let buffer = ''
let timer: number | undefined
let cadence = 10000
let language = 'pt-BR'
let openaiKey = ''
let offline = false

self.onmessage = async (e: MessageEvent<Message>) => {
  const msg = e.data
  if (msg.type === 'init') {
    cadence = msg.cadence * 1000
    language = msg.language
    openaiKey = msg.openaiKey
    if (timer) clearInterval(timer)
    timer = setInterval(processBuffer, cadence) as unknown as number
  } else if (msg.type === 'transcript') {
    buffer += ' ' + msg.text
    offline = msg.offline
  }
}

async function processBuffer() {
  const text = buffer.trim()
  console.log('[Orchestrator] Processing buffer:', text.substring(0, 100) + '...')

  if (!text) {
    console.log('[Orchestrator] Buffer is empty, skipping')
    return
  }

  buffer = ''
  let result = {
    summary: '',
    topics: [] as string[],
    intents: [] as string[],
    questions: [] as string[],
  }

  if (offline || !openaiKey) {
    console.log('[Orchestrator] Processing offline or without API key')
    result.summary = summarizeLocal(text)
    result.topics = Array.from(new Set(text.split(/\W+/).filter(word => word.length > 3).slice(0, 5)))
    result.intents = ['Conversação geral', 'Compartilhamento de informações']
    result.questions = ['Qual o contexto?', 'Como isso se relaciona?']
  } else {
    console.log('[Orchestrator] Processing with OpenAI API')
    const prompt = `Resuma o texto a seguir e extraia topicos, intencoes e perguntas implicitas. Responda em JSON com as chaves summary, topics, intents e questions. Texto: """${text}"""`

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `You are a helpful assistant summarizing in ${language}.` },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      })

      if (!res.ok) {
        console.error('[Orchestrator] API Error:', res.status, res.statusText)
        const errorText = await res.text()
        console.error('[Orchestrator] API Error details:', errorText)
        result.summary = `Erro na API: ${res.status} - ${errorText.substring(0, 100)}`
        ;(self as unknown as Worker).postMessage(result)
        return
      }

      const data = await res.json()
      console.log('[Orchestrator] API Response:', data)

      try {
        let content = data.choices[0].message.content
        console.log('[Orchestrator] Raw content:', content)

        // Remove markdown code blocks if present
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

        console.log('[Orchestrator] Cleaned content:', content)
        const parsed = JSON.parse(content)

        // Ensure all fields are properly set
        result.summary = parsed.summary || text.substring(0, 100)
        result.topics = Array.isArray(parsed.topics) ? parsed.topics : []
        result.intents = Array.isArray(parsed.intents) ? parsed.intents : []
        result.questions = Array.isArray(parsed.questions) ? parsed.questions : []

        console.log('[Orchestrator] Parsed result:', result)
      } catch (parseError) {
        console.error('[Orchestrator] JSON Parse Error:', parseError)
        // Fallback: extract what we can from the response
        const content = data.choices?.[0]?.message?.content || ''
        result.summary = content.substring(0, 200) || 'Análise do conteúdo'
        result.topics = text.split(/\W+/).filter(word => word.length > 4).slice(0, 5)
        result.intents = ['Discussão geral']
        result.questions = ['O que mais você gostaria de saber?']
      }
    } catch (fetchError: any) {
      console.error('[Orchestrator] Fetch Error:', fetchError)
      result.summary = `Erro de conexão: ${fetchError.message || 'Erro desconhecido'}`
    }
  }

  console.log('[Orchestrator] Final result:', result)
  ;(self as unknown as Worker).postMessage(result)
}
