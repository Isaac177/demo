export interface TelegramCredentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export type TelegramInstanceState =
  | 'notAuthorized'
  | 'authorized'
  | 'blocked'
  | 'suspended'
  | 'starting'
  | 'pendingPassword'

export interface TelegramSendResponse {
  idMessage: string
}

export type TelegramAccountCheck =
  | { chatId: string; exists: true }
  | { exists: false }

export interface TelegramNotificationEnvelope {
  receiptId: number
  body?: unknown
  [key: string]: unknown
}

export interface TelegramIncomingTextMessage {
  id: string
  chatId: string
  senderName: string
  text: string
  timestamp: number
}

export interface TelegramReceivedNotification {
  message: TelegramIncomingTextMessage | null
  receiptId: number
  status: TelegramOutgoingMessageStatus | null
}

export interface TelegramOutgoingMessageStatus {
  id: string
  status: TelegramOutgoingStatus
}

export type TelegramOutgoingStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'notInGroup'
  | 'noAccount'

export type TelegramApiErrorCode =
  | 'invalid-config'
  | 'network'
  | 'offline'
  | 'timeout'
  | 'abort'
  | 'authorization'
  | 'rate-limit'
  | 'validation'
  | 'server'
  | 'invalid-response'
  | 'unknown'

export interface TelegramApiClient {
  checkAccount: (phoneNumber: string, signal?: AbortSignal) => Promise<TelegramAccountCheck>
  deleteNotification: (receiptId: number, signal?: AbortSignal) => Promise<void>
  getInstanceState: (signal?: AbortSignal) => Promise<TelegramInstanceState>
  sendTextMessage: (chatId: string, message: string, signal?: AbortSignal) => Promise<TelegramSendResponse>
  receiveNotification: (signal?: AbortSignal) => Promise<TelegramReceivedNotification | null>
}
