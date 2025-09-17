interface EnrichMessage {
  type: 'enrich'
  id: number
  topics: string[]
  openaiKey: string
  offline: boolean
}

// Timeout promise helper
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), timeoutMs)
    )
  ])
}

self.onmessage = async (e: MessageEvent<EnrichMessage>) => {
  const { topics, openaiKey, offline, id } = e.data
  console.log('[Enricher] Starting enrichment for topics:', topics)

  const news: { title: string; url: string }[] = []
  const insights: string[] = []

  // Quick return for empty topics
  if (!topics || topics.length === 0) {
    console.log('[Enricher] No topics provided, using default content')
    insights.push('Aguardando tópicos para enriquecer')
    news.push({
      title: 'Nenhum tópico para pesquisar',
      url: '#'
    })
    ;(self as unknown as Worker).postMessage({ id, news, insights })
    return
  }

  // Offline or no API key - generate meaningful fallback content
  if (offline || !openaiKey) {
    console.log('[Enricher] Operating in offline/no-key mode')

    // Generate contextual insights even without API
    topics.forEach(topic => {
      insights.push(`📊 ${topic}: insight gerado offline`)
    })

    // Generate search links for each topic
    topics.slice(0, 3).forEach(topic => {
      news.push({
        title: `🔍 Pesquisar ${topic}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(topic + ' notícias Brasil')}`
      })
    })

    ;(self as unknown as Worker).postMessage({ id, news, insights })
    return
  }

  try {
    console.log('[Enricher] Calling OpenAI API for enrichment')

    const prompt = `Como especialista em análise e pesquisa, analise os seguintes tópicos e forneça informações valiosas:

Tópicos: ${topics.join(', ')}

Gere conteúdo REAL e RELEVANTE:

1. **3 Insights Profundos**: Análises perspicazes e observações importantes sobre estes tópicos. Seja específico e informativo.

2. **3 Informações Atuais**: Títulos de notícias ou informações recentes e relevantes sobre estes tópicos (invente títulos realistas baseados em tendências atuais).

IMPORTANTE: Responda APENAS em JSON válido, sem markdown:
{
  "insights": [
    "Insight profundo e específico 1",
    "Insight profundo e específico 2",
    "Insight profundo e específico 3"
  ],
  "news": [
    {"title": "Título realista de notícia/informação 1", "url": "https://google.com/search?q=termo1"},
    {"title": "Título realista de notícia/informação 2", "url": "https://google.com/search?q=termo2"},
    {"title": "Título realista de notícia/informação 3", "url": "https://google.com/search?q=termo3"}
  ]
}`

    // Call API with timeout
    const apiCall = fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você é um analista especializado que fornece insights profundos e informações relevantes. Sempre responda em JSON puro, sem markdown.'
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 800,
      }),
    })

    const res = await withTimeout(apiCall, 10000) // 10 second timeout

    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`)
    }

    const data = await res.json()
    console.log('[Enricher] OpenAI response received')

    try {
      let content = data.choices[0].message.content

      // Clean markdown if present
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

      const parsed = JSON.parse(content)
      console.log('[Enricher] Successfully parsed response')

      // Add insights
      if (parsed.insights && Array.isArray(parsed.insights)) {
        parsed.insights.forEach((entry: unknown) => {
          if (typeof entry === 'string' && entry.length > 0) {
            insights.push(entry)
          }
        })
      }

      // Add news with proper URLs
      if (parsed.news && Array.isArray(parsed.news)) {
        parsed.news.forEach((item: { title?: string; url?: string } | string) => {
          if (typeof item === 'object' && item && 'title' in item && item.title) {
            // Ensure URL is valid
            let url = item.url || '#'
            if (!url.startsWith('http')) {
              // Create Google search URL from title
              url = `https://www.google.com/search?q=${encodeURIComponent(item.title)}`
            }
            news.push({ title: item.title, url })
          }
        })
      }
    } catch (parseError) {
      console.error('[Enricher] Parse error, using fallback:', parseError)
      // Use raw content as insight if parsing fails
      const rawContent = data.choices?.[0]?.message?.content || ''
      if (rawContent) {
        insights.push(`💡 ${rawContent.substring(0, 300)}`)
      }
    }
  } catch (error) {
    console.error('[Enricher] API call failed:', error)
    // Generate fallback content on error
    insights.push(`⚠️ Não foi possível enriquecer: ${topics.slice(0, 2).join(', ')}`)
  }

  // Ensure we always have meaningful content
  if (insights.length === 0) {
    console.log('[Enricher] No insights generated, adding defaults')
    topics.forEach((topic) => {
      insights.push(`💭 ${topic}: mantenha no radar`)
    })
  }

  if (news.length === 0) {
    console.log('[Enricher] No news generated, adding search links')
    topics.slice(0, 3).forEach(topic => {
      news.push({
        title: `📰 Pesquisar notícias: ${topic}`,
        url: `https://news.google.com/search?q=${encodeURIComponent(topic)}&hl=pt-BR`
      })
    })
  }

  console.log('[Enricher] Final enrichment complete - Insights:', insights.length, 'News:', news.length)
  ;(self as unknown as Worker).postMessage({ id, news, insights })
}
