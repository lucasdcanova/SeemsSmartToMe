interface EnrichMessage {
  type: 'enrich'
  id: number
  topics: string[]
  openaiKey: string
  offline: boolean
}

self.onmessage = async (e: MessageEvent<EnrichMessage>) => {
  const { topics, openaiKey, offline, id } = e.data
  console.log('[Enricher] Processing topics:', topics, 'offline:', offline)

  if (offline || !openaiKey) {
    console.log('[Enricher] Offline mode or no API key, generating mock data')
    const mockNews = topics.slice(0, 3).map(topic => ({
      title: `Informação relevante sobre ${topic}`,
      url: `https://example.com/${topic.toLowerCase().replace(/\s+/g, '-')}`
    }))
    const mockInsights = topics.map(topic => `Análise: ${topic} é um tópico relevante no contexto atual`)
    ;(self as unknown as Worker).postMessage({ id, news: mockNews, insights: mockInsights })
    return
  }

  if (!topics || topics.length === 0) {
    console.log('[Enricher] No topics provided, returning empty results')
    ;(self as unknown as Worker).postMessage({ id, news: [], insights: [] })
    return
  }

  const news: { title: string; url: string }[] = []
  const insights: string[] = []

  try {
    console.log('[Enricher] Using OpenAI to generate insights and news')

    const prompt = `
Você é um assistente especializado em análise de contexto e informações atualizadas.

Tópicos identificados: ${topics.join(', ')}

Por favor, forneça:
1. 3 insights relevantes sobre estes tópicos
2. 3 informações ou notícias recentes relacionadas (com títulos descritivos)

Responda em JSON no formato:
{
  "insights": ["insight1", "insight2", "insight3"],
  "news": [
    {"title": "título da informação 1", "url": "https://example.com/1"},
    {"title": "título da informação 2", "url": "https://example.com/2"},
    {"title": "título da informação 3", "url": "https://example.com/3"}
  ]
}

Seja conciso e relevante. Use português brasileiro.`

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: 'Você é um assistente que fornece insights e informações atualizadas sobre tópicos. Sempre responda em JSON válido.'
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      console.error('[Enricher] OpenAI API Error:', res.status, res.statusText)
      const errorText = await res.text()
      console.error('[Enricher] Error details:', errorText)

      // Fallback to basic insights
      insights.push(...topics.map(topic => `Análise: ${topic} requer atenção especial`))
      news.push({
        title: 'Erro ao buscar informações atualizadas',
        url: 'https://status.openai.com'
      })
    } else {
      const data = await res.json()
      console.log('[Enricher] OpenAI response:', data)

      try {
        const content = JSON.parse(data.choices[0].message.content)
        console.log('[Enricher] Parsed content:', content)

        if (content.insights) {
          insights.push(...content.insights)
        }

        if (content.news) {
          news.push(...content.news)
        }
      } catch (parseError) {
        console.error('[Enricher] Parse error:', parseError)
        // Fallback: use the raw content as an insight
        const rawContent = data.choices?.[0]?.message?.content || ''
        if (rawContent) {
          insights.push(rawContent.substring(0, 200))
        }
      }
    }
  } catch (error) {
    console.error('[Enricher] General error:', error)
    insights.push('Erro ao processar informações. Verifique a configuração.')
  }

  // Ensure we always have some content
  if (insights.length === 0) {
    insights.push(...topics.map(topic => `Tópico identificado: ${topic}`))
  }

  if (news.length === 0) {
    news.push({
      title: 'Busque mais informações sobre: ' + topics.join(', '),
      url: `https://www.google.com/search?q=${encodeURIComponent(topics.join(' '))}`
    })
  }

  console.log('[Enricher] Final results - News:', news.length, 'Insights:', insights.length)
  ;(self as unknown as Worker).postMessage({ id, news, insights })
}