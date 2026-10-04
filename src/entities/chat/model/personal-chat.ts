import type { PersonalChat, PersonalChatResult } from './types'

const phonePattern = /^\+?[\d\s()-]+$/

export function createPersonalChat(value: string): PersonalChatResult {
  const trimmed = value.trim()
  if (!trimmed) {
    return { ok: false, error: 'required' }
  }
  if (!phonePattern.test(trimmed)) {
    return { ok: false, error: 'invalidCharacters' }
  }
  const phone = trimmed.replace(/\D/g, '')
  if (phone.length < 10 || phone.length > 15) {
    return { ok: false, error: 'invalidLength' }
  }
  return {
    ok: true,
    chat: {
      phone,
      chatId: `${phone}@c.us`,
    },
  }
}

export function isSamePersonalChat(chatId: string, chat: PersonalChat) {
  return chatId === chat.chatId
}
