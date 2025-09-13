import { describe, it, expect } from 'vitest'
import { summarizeLocal } from './summarize'

describe('summarizeLocal', () => {
  it('returns first two sentences', () => {
    const text = 'Primeira frase. Segunda frase. Terceira frase.'
    expect(summarizeLocal(text)).toBe('Primeira frase. Segunda frase.')
  })
})
