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
  if (!text) return
  buffer = ''
  let result = {
    summary: '',
    topics: [] as string[],
    intents: [] as string[],
    questions: [] as string[],
  }
  if (offline) {
    result.summary = summarizeLocal(text)
    result.topics = Array.from(new Set(text.split(/\W+/).slice(0, 5)))
  } else {
    const prompt = `Resuma o texto a seguir e extraia topicos, intencoes e perguntas implicitas. Responda em JSON com as chaves summary, topics, intents e questions. Texto: """${text}"""`
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: `You are a helpful assistant summarizing in ${language}.` },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    })
    const data = await res.json()
    try {
      result = JSON.parse(data.choices[0].message.content)
    } catch {
      result.summary = data.choices?.[0]?.message?.content || ''
    }
  }
  ;(self as unknown as Worker).postMessage(result)
}
