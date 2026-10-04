import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildTelegramApiUrl,
  createTelegramApiClient,
  mapTelegramIncomingText,
  parseTelegramAccountCheck,
  parseTelegramInstanceState,
  parseTelegramNotificationEnvelope,
  parseTelegramSendResponse,
  type TelegramCredentials,
} from '@/shared/api'

const credentials: TelegramCredentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '410000000000',
  apiTokenInstance: 'test/token',
}

function response(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('Telegram API contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('constructs instance URLs with encoded credentials and correctly placed query parameters', () => {
    expect(buildTelegramApiUrl(credentials, 'sendMessage')).toBe(
      'https://4100.api.green-api.com/waInstance410000000000/sendMessage/test%2Ftoken',
    )
    expect(buildTelegramApiUrl(credentials, 'receiveNotification?receiveTimeout=5')).toBe(
      'https://4100.api.green-api.com/waInstance410000000000/receiveNotification/test%2Ftoken?receiveTimeout=5',
    )
  })

  it('maps typed responses while ignoring unknown server fields', () => {
    expect(parseTelegramInstanceState({ stateInstance: 'authorized', futureField: true })).toBe('authorized')
    expect(parseTelegramSendResponse({ idMessage: 'message-1', futureField: true })).toEqual({ idMessage: 'message-1' })
  })

  it('maps Telegram account checks to the stable chat identifier', () => {
    expect(parseTelegramAccountCheck({ exist: true, chatId: '10000000', futureField: true })).toEqual({
      chatId: '10000000',
      exists: true,
    })
    expect(parseTelegramAccountCheck({ exist: false, chatId: '' })).toEqual({ exists: false })
    expect(() => parseTelegramAccountCheck({ exist: true, chatId: '' })).toThrowError(
      expect.objectContaining({ code: 'invalid-response' }),
    )
  })

  it('maps incoming Telegram text while ignoring unknown notification fields', () => {
    const envelope = parseTelegramNotificationEnvelope({
      receiptId: 17,
      futureEnvelopeField: 'supported',
      body: {
        typeWebhook: 'incomingMessageReceived',
        timestamp: 1_700_000_000,
        idMessage: 'incoming-1',
        futureBodyField: true,
        senderData: {
          chatId: '79991234567@c.us',
          senderName: 'Sender',
          futureSenderField: true,
        },
        messageData: {
          typeMessage: 'textMessage',
          textMessageData: {
            textMessage: 'Hello',
            futureTextField: true,
          },
        },
      },
    })

    expect(envelope).not.toBeNull()
    expect(mapTelegramIncomingText(envelope!)).toEqual({
      id: 'incoming-1',
      chatId: '79991234567@c.us',
      senderName: 'Sender',
      text: 'Hello',
      timestamp: 1_700_000_000_000,
    })
  })

  it('ignores supported non-text notifications and rejects malformed required payloads', () => {
    expect(mapTelegramIncomingText({
      receiptId: 18,
      body: {
        typeWebhook: 'incomingMessageReceived',
        messageData: { typeMessage: 'imageMessage' },
      },
    })).toBeNull()

    expect(mapTelegramIncomingText({
      receiptId: 19,
      body: {
        typeWebhook: 'futureNotificationType',
        futureField: true,
      },
    })).toBeNull()

    expect(() => parseTelegramInstanceState({ stateInstance: 'futureState' })).toThrowError(
      expect.objectContaining({ code: 'invalid-response' }),
    )
    expect(() => parseTelegramSendResponse({})).toThrowError(
      expect.objectContaining({ code: 'invalid-response' }),
    )
    expect(() => parseTelegramNotificationEnvelope({ receiptId: '17' })).toThrowError(
      expect.objectContaining({ code: 'invalid-response' }),
    )
  })

  it.each([
    [401, 'authorization'],
    [429, 'rate-limit'],
    [408, 'timeout'],
    [504, 'timeout'],
    [503, 'server'],
  ] as const)('normalizes HTTP %s responses as %s errors', async (status, code) => {
    vi.stubGlobal('fetch', vi.fn(() => response({ message: 'Request failed' }, status)))
    const client = createTelegramApiClient(credentials)

    await expect(client.getInstanceState()).rejects.toMatchObject({ code, status })
  })

  it('normalizes transport failures as network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Network unavailable'))))
    const client = createTelegramApiClient(credentials)

    await expect(client.getInstanceState()).rejects.toMatchObject({ code: 'network' })
  })

  it('sends the exact Telegram SendMessage payload and returns the message ID', async () => {
    const fetchMock = vi.fn(() => response({ idMessage: 'outgoing-1' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createTelegramApiClient(credentials)

    await expect(client.sendTextMessage('79991234567@c.us', 'Hello Telegram')).resolves.toEqual({
      idMessage: 'outgoing-1',
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance410000000000/sendMessage/test%2Ftoken',
      expect.objectContaining({
        body: JSON.stringify({ chatId: '79991234567@c.us', message: 'Hello Telegram' }),
        method: 'POST',
      }),
    )
  })

  it('resolves a phone number to its Telegram chat ID', async () => {
    const fetchMock = vi.fn(() => response({ exist: true, chatId: '10000000' }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createTelegramApiClient(credentials)

    await expect(client.checkAccount('79991234567')).resolves.toEqual({ chatId: '10000000', exists: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance410000000000/checkAccount/test%2Ftoken',
      expect.objectContaining({
        body: JSON.stringify({ phoneNumber: 79991234567 }),
        method: 'POST',
      }),
    )
  })

  it('keeps notification receipt and deletion as separate API operations', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => response({
        receiptId: 27,
        body: {
          typeWebhook: 'futureNotificationType',
        },
      }))
      .mockImplementationOnce(() => response({ result: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createTelegramApiClient(credentials)

    await expect(client.receiveNotification()).resolves.toEqual({ message: null, receiptId: 27, status: null })
    expect(fetchMock).toHaveBeenCalledOnce()

    await client.deleteNotification(27)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://4100.api.green-api.com/waInstance410000000000/deleteNotification/test%2Ftoken/27',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
