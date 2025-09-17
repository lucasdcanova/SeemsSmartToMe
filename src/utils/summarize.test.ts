import { describe, it, expect } from 'vitest'
import { extractKeywordsLocal } from './summarize'

describe('extractKeywordsLocal', () => {
  it('returns a list of unique keywords', () => {
    const text = 'Mercado financeiro em alta com ações de tecnologia em destaque e investidores atentos.'
    expect(extractKeywordsLocal(text)).toEqual([
      'mercado',
      'financeiro',
      'alta',
      'ações',
      'tecnologia',
      'destaque',
    ])
  })
})
