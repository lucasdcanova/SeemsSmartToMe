export function extractKeywordsLocal(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 3)
    )
  ).slice(0, 6)
}
