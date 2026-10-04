import { describe, expect, it } from 'vitest'
import { createPersonalChat, isSamePersonalChat } from '@/entities/chat'
import { validateCredentials } from '@/features/authenticate-instance'

describe('credential validation', () => {
  it('accepts a complete HTTPS configuration', () => {
    expect(validateCredentials({
      apiUrl: 'https://3100.api.green-api.com',
      idInstance: '3100000000',
      apiTokenInstance: 'secret-token',
    })).toEqual({})
  })

  it('rejects malformed credentials', () => {
    expect(validateCredentials({
      apiUrl: 'http://api.green-api.com',
      idInstance: '31A',
      apiTokenInstance: '',
    })).toEqual({
      apiUrl: 'auth.validation.httpsRequired',
      idInstance: 'auth.validation.idDigits',
      apiTokenInstance: 'auth.validation.tokenRequired',
    })
  })
})

describe('phone normalization', () => {
  it('normalizes formatted and unformatted numbers identically', () => {
    const formatted = createPersonalChat('+7 (999) 123-45-67')
    const unformatted = createPersonalChat('79991234567')

    expect(formatted).toEqual(unformatted)
    expect(formatted).toEqual({
      ok: true,
      chat: {
        phone: '79991234567',
        chatId: '79991234567@c.us',
      },
    })
    if (formatted.ok) {
      expect(isSamePersonalChat('79991234567@c.us', formatted.chat)).toBe(true)
    }
  })

  it('rejects unsafe characters and invalid digit counts', () => {
    expect(createPersonalChat('user79991234567')).toEqual({ ok: false, error: 'invalidCharacters' })
    expect(createPersonalChat('+123')).toEqual({ ok: false, error: 'invalidLength' })
    expect(createPersonalChat('')).toEqual({ ok: false, error: 'required' })
  })
})
