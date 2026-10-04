import type { TelegramCredentials } from '@/shared/api'

export type CredentialErrorKey =
  | 'auth.validation.idRequired'
  | 'auth.validation.idDigits'
  | 'auth.validation.tokenRequired'
  | 'auth.validation.httpsRequired'
  | 'auth.validation.hostInvalid'

export type CredentialErrors = Partial<Record<keyof TelegramCredentials, CredentialErrorKey>>

export function validateCredentials(credentials: TelegramCredentials): CredentialErrors {
  const errors: CredentialErrors = {}
  if (!credentials.idInstance.trim()) {
    errors.idInstance = 'auth.validation.idRequired'
  } else if (!/^\d+$/.test(credentials.idInstance.trim())) {
    errors.idInstance = 'auth.validation.idDigits'
  }
  if (!credentials.apiTokenInstance.trim()) {
    errors.apiTokenInstance = 'auth.validation.tokenRequired'
  }
  try {
    const url = new URL(credentials.apiUrl.trim())
    if (url.protocol !== 'https:') {
      errors.apiUrl = 'auth.validation.httpsRequired'
    }
  } catch {
    errors.apiUrl = 'auth.validation.hostInvalid'
  }
  return errors
}
