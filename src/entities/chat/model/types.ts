export interface PersonalChat {
  chatId: string
  phone: string
}

export type PersonalChatError = 'required' | 'invalidCharacters' | 'invalidLength'

export type PersonalChatResult =
  | { chat: PersonalChat; ok: true }
  | { error: PersonalChatError; ok: false }
