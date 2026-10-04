import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/shared/config'
import { TelegramApiError, type TelegramApiClient } from '@/shared/api'
import { Messenger } from '@/widgets/messenger'

function createClient(sendTextMessage: TelegramApiClient['sendTextMessage']): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    sendTextMessage,
    receiveNotification: vi.fn((signal?: AbortSignal) => new Promise<null>((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })),
  }
}

async function openChat(client: TelegramApiClient) {
  const user = userEvent.setup()
  render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)
  await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
  await user.click(screen.getByRole('button', { name: 'Start conversation' }))
  return { textbox: screen.getByLabelText('Message'), user }
}

describe('send text message', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('adds exactly one queued outgoing message after a valid response', async () => {
    const sendTextMessage = vi.fn().mockResolvedValue({ idMessage: 'outgoing-42' })
    const { textbox, user } = await openChat(createClient(sendTextMessage))

    await user.type(textbox, 'Hello Telegram')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendTextMessage).toHaveBeenCalledOnce()
    expect(sendTextMessage).toHaveBeenCalledWith('79991234567@c.us', 'Hello Telegram')
    const messages = await screen.findAllByRole('article', { name: 'Outgoing message' })
    expect(messages).toHaveLength(1)
    expect(within(messages[0]).getByText('Hello Telegram')).toBeInTheDocument()
    expect(within(messages[0]).getByText('Queued')).toBeInTheDocument()
  })

  it('prevents overlapping requests from repeated send actions', async () => {
    let finishSend: (value: { idMessage: string }) => void = () => undefined
    const sendTextMessage = vi.fn(() => new Promise<{ idMessage: string }>((resolve) => {
      finishSend = resolve
    }))
    const { textbox, user } = await openChat(createClient(sendTextMessage))

    await user.type(textbox, 'Send once')
    fireEvent.keyDown(textbox, { key: 'Enter' })
    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(sendTextMessage).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    finishSend({ idMessage: 'outgoing-1' })
    await waitFor(() => expect(screen.getAllByRole('article', { name: 'Outgoing message' })).toHaveLength(1))
  })

  it.each([
    ['server rejection', new TelegramApiError('server', 'Server rejected the request'), 'GREEN-API is temporarily unavailable. Try again later.'],
    ['network failure', new TypeError('Network unavailable'), 'Could not send the message. Try again.'],
  ])('preserves a retryable draft after %s', async (_caseName, failure, expectedError) => {
    const sendTextMessage = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ idMessage: 'outgoing-retry' })
    const { textbox, user } = await openChat(createClient(sendTextMessage))

    await user.type(textbox, 'Retry this message')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedError)
    expect(textbox).toHaveValue('Retry this message')
    expect(screen.queryByRole('article', { name: 'Outgoing message' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(sendTextMessage).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('article', { name: 'Outgoing message' })).toHaveTextContent('Retry this message')
    expect(textbox).toHaveValue('')
  })
})
