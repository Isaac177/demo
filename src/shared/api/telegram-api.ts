import type {
  TelegramApiClient,
  TelegramAccountCheck,
  TelegramApiErrorCode,
  TelegramCredentials,
  TelegramIncomingTextMessage,
  TelegramInstanceState,
  TelegramNotificationEnvelope,
  TelegramOutgoingMessageStatus,
  TelegramOutgoingStatus,
  TelegramSendResponse,
} from './types'
import { traceTelegram } from '@/shared/lib'

const instanceStates: TelegramInstanceState[] = [
  'notAuthorized',
  'authorized',
  'blocked',
  'suspended',
  'starting',
  'pendingPassword',
]

const outgoingStatuses: TelegramOutgoingStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
  'notInGroup',
  'noAccount',
]

export class TelegramApiError extends Error {
  readonly code: TelegramApiErrorCode
  readonly status?: number

  constructor(code: TelegramApiErrorCode, message: string, status?: number, options?: ErrorOptions) {
    super(message, options)
    this.name = 'TelegramApiError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function invalidResponse(message: string): never {
  throw new TelegramApiError('invalid-response', message)
}

function isInstanceState(value: string): value is TelegramInstanceState {
  return instanceStates.some((state) => state === value)
}

function isOutgoingStatus(value: string): value is TelegramOutgoingStatus {
  return outgoingStatuses.some((status) => status === value)
}

function normalizeApiUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') {
      throw new TelegramApiError('invalid-config', 'The API host must use HTTPS.')
    }
    return url.origin
  } catch (error) {
    if (error instanceof TelegramApiError) {
      throw error
    }
    throw new TelegramApiError('invalid-config', 'The API host is invalid.', undefined, { cause: error })
  }
}

function errorCodeForStatus(status: number): TelegramApiErrorCode {
  if (status === 401 || status === 403) {
    return 'authorization'
  }
  if (status === 429) {
    return 'rate-limit'
  }
  if (status === 408 || status === 504) {
    return 'timeout'
  }
  if (status === 400 || status === 404 || status === 422) {
    return 'validation'
  }
  if (status >= 500) {
    return 'server'
  }
  return 'unknown'
}

export function normalizeTelegramApiError(error: unknown, isOnline = typeof navigator === 'undefined' || navigator.onLine) {
  if (error instanceof TelegramApiError) {
    return error
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new TelegramApiError('abort', 'The GREEN-API request was cancelled.', undefined, { cause: error })
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new TelegramApiError('timeout', 'The GREEN-API request timed out.', undefined, { cause: error })
  }
  if (!isOnline) {
    return new TelegramApiError('offline', 'The browser is offline.', undefined, { cause: error })
  }
  if (error instanceof TypeError) {
    return new TelegramApiError('network', 'The GREEN-API request could not be completed.', undefined, { cause: error })
  }
  return new TelegramApiError('unknown', 'An unknown GREEN-API error occurred.', undefined, { cause: error })
}

function errorMessage(payload: unknown, status: number) {
  if (isRecord(payload)) {
    return readString(payload, 'message') ?? readString(payload, 'description') ?? `GREEN-API request failed with status ${status}.`
  }
  return `GREEN-API request failed with status ${status}.`
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    if (!response.ok) {
      throw new TelegramApiError(errorCodeForStatus(response.status), errorMessage(null, response.status), response.status)
    }
    return null
  }
  let payload: unknown
  try {
    payload = JSON.parse(text) as unknown
  } catch (error) {
    if (!response.ok) {
      throw new TelegramApiError(errorCodeForStatus(response.status), errorMessage(null, response.status), response.status, { cause: error })
    }
    throw new TelegramApiError('invalid-response', 'GREEN-API returned invalid JSON.', response.status, { cause: error })
  }
  if (!response.ok) {
    throw new TelegramApiError(errorCodeForStatus(response.status), errorMessage(payload, response.status), response.status)
  }
  return payload
}

export function buildTelegramApiUrl(credentials: TelegramCredentials, method: string) {
  const apiUrl = normalizeApiUrl(credentials.apiUrl)
  const instance = encodeURIComponent(credentials.idInstance.trim())
  const token = encodeURIComponent(credentials.apiTokenInstance.trim())
  const queryIndex = method.indexOf('?')
  const methodPath = queryIndex === -1 ? method : method.slice(0, queryIndex)
  const query = queryIndex === -1 ? '' : method.slice(queryIndex)
  return `${apiUrl}/waInstance${instance}/${methodPath}/${token}${query}`
}

export function parseTelegramInstanceState(payload: unknown): TelegramInstanceState {
  if (!isRecord(payload)) {
    return invalidResponse('The instance-state response must be an object.')
  }
  const state = readString(payload, 'stateInstance')
  if (!state || !isInstanceState(state)) {
    return invalidResponse('The instance-state response is missing a supported stateInstance value.')
  }
  return state
}

export function parseTelegramSendResponse(payload: unknown): TelegramSendResponse {
  if (!isRecord(payload)) {
    return invalidResponse('The send-message response must be an object.')
  }
  const idMessage = readString(payload, 'idMessage')
  if (!idMessage) {
    return invalidResponse('The send-message response is missing idMessage.')
  }
  return { idMessage }
}

export function parseTelegramAccountCheck(payload: unknown): TelegramAccountCheck {
  if (!isRecord(payload) || typeof payload.exist !== 'boolean') {
    return invalidResponse('The account-check response is missing the exist flag.')
  }
  if (!payload.exist) {
    return { exists: false }
  }
  const chatId = readString(payload, 'chatId')
  if (!chatId) {
    return invalidResponse('The account-check response is missing chatId.')
  }
  return { chatId, exists: true }
}

export function parseTelegramNotificationEnvelope(payload: unknown): TelegramNotificationEnvelope | null {
  if (payload === null) {
    return null
  }
  if (!isRecord(payload) || typeof payload.receiptId !== 'number' || !Number.isFinite(payload.receiptId)) {
    return invalidResponse('The notification response is missing a valid receiptId.')
  }
  return { ...payload, receiptId: payload.receiptId }
}

export function mapTelegramIncomingText(envelope: TelegramNotificationEnvelope, now = Date.now()): TelegramIncomingTextMessage | null {
  if (!isRecord(envelope.body)) {
    return null
  }
  const body = envelope.body
  if (readString(body, 'typeWebhook') !== 'incomingMessageReceived') {
    return null
  }
  const messageData = body.messageData
  if (!isRecord(messageData) || readString(messageData, 'typeMessage') !== 'textMessage') {
    return null
  }
  const textData = messageData.textMessageData
  const senderData = body.senderData
  if (!isRecord(textData) || !isRecord(senderData)) {
    return invalidResponse('The incoming text notification is missing message or sender data.')
  }
  const text = readString(textData, 'textMessage')
  const chatId = readString(senderData, 'chatId')
  const id = readString(body, 'idMessage')
  if (!text || !chatId || !id) {
    return invalidResponse('The incoming text notification is missing a required field.')
  }
  const timestampSeconds = typeof body.timestamp === 'number' && Number.isFinite(body.timestamp) ? body.timestamp : Math.floor(now / 1000)
  return {
    id,
    chatId,
    senderName: readString(senderData, 'senderContactName') ?? readString(senderData, 'senderName') ?? '',
    text,
    timestamp: timestampSeconds * 1000,
  }
}

export function mapTelegramOutgoingStatus(envelope: TelegramNotificationEnvelope): TelegramOutgoingMessageStatus | null {
  if (!isRecord(envelope.body)) {
    return null
  }
  const body = envelope.body
  if (readString(body, 'typeWebhook') !== 'outgoingMessageStatus') {
    return null
  }
  const id = readString(body, 'idMessage')
  const status = readString(body, 'status')
  if (!id || !status || !isOutgoingStatus(status)) {
    return null
  }
  return { id, status }
}

export function createTelegramApiClient(credentials: TelegramCredentials): TelegramApiClient {
  async function request(method: string, options: RequestInit = {}, pathSuffix?: string) {
    try {
      const baseUrl = buildTelegramApiUrl(credentials, method)
      const url = pathSuffix === undefined ? baseUrl : `${baseUrl}/${encodeURIComponent(pathSuffix)}`
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })
      return await parseResponse(response)
    } catch (error) {
      throw normalizeTelegramApiError(error)
    }
  }

  return {
    async checkAccount(phoneNumber, signal) {
      traceTelegram('account-check-started')
      const account = parseTelegramAccountCheck(await request('checkAccount', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: Number(phoneNumber) }),
        signal,
      }))
      traceTelegram('account-check-completed', { exists: account.exists })
      return account
    },
    async getInstanceState(signal) {
      return parseTelegramInstanceState(await request('getStateInstance', { signal }))
    },
    async sendTextMessage(chatId, message, signal) {
      return parseTelegramSendResponse(await request('sendMessage', {
        method: 'POST',
        body: JSON.stringify({ chatId, message }),
        signal,
      }))
    },
    async receiveNotification(signal) {
      const envelope = parseTelegramNotificationEnvelope(await request('receiveNotification?receiveTimeout=5', { signal }))
      if (!envelope) {
        return null
      }
      const message = mapTelegramIncomingText(envelope)
      const status = mapTelegramOutgoingStatus(envelope)
      traceTelegram('notification-mapped', {
        hasMessage: Boolean(message),
        hasStatus: Boolean(status),
        receiptId: envelope.receiptId,
      })
      return {
        message,
        receiptId: envelope.receiptId,
        status,
      }
    },
    async deleteNotification(receiptId, signal) {
      await request('deleteNotification', {
        method: 'DELETE',
        signal,
      }, String(receiptId))
      traceTelegram('notification-acknowledged', { receiptId })
    },
  }
}
