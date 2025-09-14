interface EnrichMessage {
  type: 'enrich'
  id: number
  topics: string[]
  newsApiKey: string
  bingKey: string
  offline: boolean
}

self.onmessage = async (e: MessageEvent<EnrichMessage>) => {
  const { topics, newsApiKey, bingKey, offline, id } = e.data
  console.log('[Enricher] Processing topics:', topics, 'offline:', offline)

  if (offline || (!newsApiKey && !bingKey)) {
    console.log('[Enricher] Offline mode or no API keys, generating mock data')
    const mockNews = topics.slice(0, 2).map(topic => ({
      title: `Notícia sobre ${topic}`,
      url: `https://example.com/news/${topic.toLowerCase().replace(/\s+/g, '-')}`
    }))
    const mockInsights = topics.map(topic => `Insight gerado para: ${topic}`)
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

  for (const topic of topics) {
    console.log('[Enricher] Processing topic:', topic)

    // Try NewsAPI
    if (newsApiKey) {
      try {
        console.log('[Enricher] Fetching from NewsAPI for:', topic)
        const res = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=1&language=pt`, {
          headers: { 'X-API-Key': newsApiKey },
        })
        const data = await res.json()
        console.log('[Enricher] NewsAPI response for', topic, ':', data)
        if (data.articles?.[0]) {
          news.push({ title: data.articles[0].title, url: data.articles[0].url })
          console.log('[Enricher] Added news from NewsAPI:', data.articles[0].title)
        }
      } catch (error) {
        console.error('[Enricher] NewsAPI error for', topic, ':', error)
      }
    } else {
      console.log('[Enricher] NewsAPI key not provided')
    }

    // Try Bing API
    if (bingKey) {
      try {
        console.log('[Enricher] Fetching from Bing for:', topic)
        const res = await fetch(`https://api.bing.microsoft.com/v7.0/news/search?q=${encodeURIComponent(topic)}&count=1&mkt=pt-BR`, {
          headers: { 'Ocp-Apim-Subscription-Key': bingKey },
        })
        const data = await res.json()
        console.log('[Enricher] Bing response for', topic, ':', data)
        if (data.value?.[0]) {
          news.push({ title: data.value[0].name, url: data.value[0].url })
          console.log('[Enricher] Added news from Bing:', data.value[0].name)
        }
      } catch (error) {
        console.error('[Enricher] Bing error for', topic, ':', error)
      }
    } else {
      console.log('[Enricher] Bing key not provided')
    }

    // Generate simple insights
    insights.push(`Tópico identificado: ${topic}`)
  }

  console.log('[Enricher] Final results - News:', news.length, 'Insights:', insights.length)
  ;(self as unknown as Worker).postMessage({ id, news, insights })
}
