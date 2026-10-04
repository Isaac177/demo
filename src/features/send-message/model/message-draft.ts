export const TELEGRAM_MESSAGE_LIMIT = 4096

export type MessageDraftError = 'empty' | 'tooLong'

export type MessageDraftResult =
  | { error: MessageDraftError; length: number; valid: false }
  | { length: number; message: string; valid: true }

export function countMessageCharacters(value: string) {
  return Array.from(value).length
}

export function validateMessageDraft(value: string): MessageDraftResult {
  const message = value.trim()
  const length = countMessageCharacters(message)

  if (length === 0) {
    return { error: 'empty', length, valid: false }
  }

  if (length > TELEGRAM_MESSAGE_LIMIT) {
    return { error: 'tooLong', length, valid: false }
  }

  return { length, message, valid: true }
}
