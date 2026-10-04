import { describe, expect, it } from 'vitest'
import { countMessageCharacters, validateMessageDraft } from '@/features/send-message'

describe('message draft validation', () => {
  it('counts Unicode code points instead of UTF-16 units', () => {
    expect(countMessageCharacters('A😀Б')).toBe(3)
  })

  it('rejects empty and whitespace-only drafts', () => {
    expect(validateMessageDraft('')).toMatchObject({ error: 'empty', valid: false })
    expect(validateMessageDraft(' \n ')).toMatchObject({ error: 'empty', valid: false })
  })

  it('trims outer whitespace while preserving internal formatting', () => {
    expect(validateMessageDraft('  first\n\nsecond  ')).toEqual({
      length: 13,
      message: 'first\n\nsecond',
      valid: true,
    })
  })

  it('accepts 4096 characters and rejects 4097 characters', () => {
    expect(validateMessageDraft('a'.repeat(4096))).toMatchObject({ length: 4096, valid: true })
    expect(validateMessageDraft('a'.repeat(4097))).toEqual({ error: 'tooLong', length: 4097, valid: false })
  })
})
