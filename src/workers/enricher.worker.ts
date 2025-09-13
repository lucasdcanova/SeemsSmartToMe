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
  if (offline) {
    ;(self as unknown as Worker).postMessage({ id, news: [], insights: [] })
    return
  }
  const news: { title: string; url: string }[] = []
  for (const topic of topics) {
    try {
      const res = await fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&pageSize=1`, {
        headers: { Authorization: newsApiKey },
      })
      const data = await res.json()
      if (data.articles?.[0]) {
        news.push({ title: data.articles[0].title, url: data.articles[0].url })
      }
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`https://api.bing.microsoft.com/v7.0/news/search?q=${encodeURIComponent(topic)}&count=1`, {
        headers: { 'Ocp-Apim-Subscription-Key': bingKey },
      })
      const data = await res.json()
      if (data.value?.[0]) {
        news.push({ title: data.value[0].name, url: data.value[0].url })
      }
    } catch {
      // ignore
    }
  }
  ;(self as unknown as Worker).postMessage({ id, news, insights: [] })
}
