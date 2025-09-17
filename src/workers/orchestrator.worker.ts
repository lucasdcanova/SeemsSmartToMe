import { extractKeywordsLocal } from '../utils/summarize'

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
  const result: { topics: string[] } = {
    topics: [],
  }

  if (offline || !openaiKey) {
    console.log('[Orchestrator] Processing offline or without API key')
    result.topics = extractKeywordsLocal(text)
  } else {
    console.log('[Orchestrator] Processing with OpenAI API')
    const prompt = `Identifique os principais temas presentes no texto a seguir para apoiar uma busca de notícias e informações relacionadas. Responda apenas em JSON válido com a chave "topics" (lista de strings curtas). Texto: """${text}"""`

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
            { role: 'system', content: `Você extrai temas curtos e objetivos em ${language}.` },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 400,
        }),
      })

      if (!res.ok) {
        console.error('[Orchestrator] API Error:', res.status, res.statusText)
        const fallback = extractKeywordsLocal(text)
        ;(self as unknown as Worker).postMessage({ topics: fallback })
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
        result.topics = Array.isArray(parsed.topics) ? parsed.topics : []

        console.log('[Orchestrator] Parsed result:', result)
      } catch (parseError) {
        console.error('[Orchestrator] JSON Parse Error:', parseError)
        // Fallback: extract what we can from the response
        const content = data.choices?.[0]?.message?.content || ''
        const fallback = Array.from(
          new Set(
            content
              .split(/[^\p{L}\p{N}]+/u)
              .filter((word: string) => word.length > 4)
          )
        )
        result.topics = fallback.length > 0 ? fallback.slice(0, 5) : extractKeywordsLocal(text)
      }
    } catch (fetchError) {
      console.error('[Orchestrator] Fetch Error:', fetchError)
      result.topics = extractKeywordsLocal(text)
    }
  }

  if (result.topics.length === 0) {
    result.topics = extractKeywordsLocal(text)
  }

  console.log('[Orchestrator] Final result:', result)
  ;(self as unknown as Worker).postMessage(result)
}
