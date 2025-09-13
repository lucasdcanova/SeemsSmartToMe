# Agente Insider

Aplicativo web-first em React + TypeScript + TailwindCSS que atua como um agente-insider. Ele ouve a conversa do usuário via Web Speech API, resume periodicamente, enriquece os tópicos com notícias confiáveis e mantém um feed em tempo real.

## Recursos
- Reconhecimento de voz em tempo real (Web Speech API).
- Sumarização a cada 10s ou 30s usando ChatGPT-5 (OpenAI) ou algoritmo local offline.
- Extração de tópicos, intenções e perguntas implícitas.
- Enriquecimento de tópicos com NewsAPI e Bing Web Search em *workers*.
- Feed dinâmico com Tópicos, Notícias confiáveis e Insights.
- Configurações persistidas em `localStorage` (cadência, idioma e chaves de API).
- Cache de histórico em IndexedDB e modo offline (apenas transcrição + sumarização local).
- Exportação do histórico em JSON.

## Configuração
1. Copie `.env.example` para `.env` e preencha suas chaves:
   ```bash
   cp .env.example .env
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Execute em modo desenvolvimento:
   ```bash
   npm run dev
   ```
4. Testes básicos:
   ```bash
   npm test
   ```

## Estrutura de Workers
- `src/workers/orchestrator.worker.ts`: realiza sumarização e extração de tópicos.
- `src/workers/enricher.worker.ts`: busca notícias e insights externos.

## Exportação de Histórico
No aplicativo, clique em **Exportar JSON** para baixar o histórico completo do feed.

## Licença
Distribuído sob a licença MIT.
