export function summarizeLocal(text: string): string {
  const sentences = text.split(/\.\s+/).filter(Boolean)
  return sentences.slice(0, 2).join('. ') + (sentences.length > 0 ? '.' : '')
}
