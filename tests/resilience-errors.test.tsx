import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeTelegramApiError,
  TelegramApiError,
  type TelegramApiClient,
  type TelegramApiErrorCode,
} from '@/shared/api'
import { i18n } from '@/shared/config'
import { Messenger } from '@/widgets/messenger'

function pendingNotification(signal?: AbortSignal) {
  return new Promise<null>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function createClient(sendTextMessage: TelegramApiClient['sendTextMessage']): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    receiveNotification: vi.fn(pendingNotification),
    sendTextMessage,
  }
}

async function openChat(client: TelegramApiClient) {
  const user = userEvent.setup()
  render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)
  await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
  await user.click(screen.getByRole('button', { name: 'Start conversation' }))
  return user
}

describe('resilience error model', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each([
    [new DOMException('Cancelled', 'AbortError'), true, 'abort'],
    [new DOMException('Timed out', 'TimeoutError'), true, 'timeout'],
    [new TypeError('Fetch failed'), false, 'offline'],
    [new TypeError('Fetch failed'), true, 'network'],
    [new Error('Unexpected'), true, 'unknown'],
  ] as const)('normalizes %s with online=%s as %s', (error, online, code) => {
    expect(normalizeTelegramApiError(error, online)).toMatchObject({ code })
  })

  it.each([
    ['network', 'Could not send the message. Try again.'],
    ['offline', 'You are offline. Reconnect before trying again.'],
    ['timeout', 'GREEN-API took too long to respond. Try again.'],
    ['authorization', 'GREEN-API no longer accepts this session. Reconnect the instance.'],
    ['rate-limit', 'Too many requests were sent. Wait a moment before trying again.'],
    ['validation', 'GREEN-API rejected the request. Check the message and recipient.'],
    ['server', 'GREEN-API is temporarily unavailable. Try again later.'],
    ['invalid-response', 'GREEN-API returned an unexpected response. Try again later.'],
    ['unknown', 'Something went wrong. Try again.'],
  ] as const)('shows stable localized feedback for %s send failures', async (code, copy) => {
    const sendTextMessage = vi.fn().mockRejectedValue(new TelegramApiError(code, 'Safe error'))
    const user = await openChat(createClient(sendTextMessage))

    await user.type(screen.getByLabelText('Message'), 'Private draft')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(copy)
    expect(screen.getByLabelText('Message')).toHaveValue('Private draft')
    expect(screen.queryByRole('article', { name: 'Outgoing message' })).not.toBeInTheDocument()
  })

  it('keeps abort failures silent', async () => {
    const sendTextMessage = vi.fn().mockRejectedValue(new TelegramApiError('abort', 'Cancelled'))
    const user = await openChat(createClient(sendTextMessage))

    await user.type(screen.getByLabelText('Message'), 'Keep after cancellation')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(sendTextMessage).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('Keep after cancellation')
  })

  it('clears stale feedback after a safe successful retry without duplicating a message', async () => {
    const sendTextMessage = vi.fn()
      .mockRejectedValueOnce(new TelegramApiError('rate-limit', 'Wait'))
      .mockResolvedValueOnce({ idMessage: 'outgoing-retry' })
    const user = await openChat(createClient(sendTextMessage))
    const textbox = screen.getByLabelText('Message')
    await user.type(textbox, 'Retry once')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(sendTextMessage).toHaveBeenCalledTimes(2)
    expect(screen.getAllByRole('article', { name: 'Outgoing message' })).toHaveLength(1)
    expect(textbox).toHaveValue('')
  })

  it('preserves an existing normalized error without exposing its cause', () => {
    const original = new TelegramApiError('validation', 'Safe public message', 422, {
      cause: new Error('private request details'),
    })

    expect(normalizeTelegramApiError(original)).toBe(original)
    expect(original.code satisfies TelegramApiErrorCode).toBe('validation')
  })
})
