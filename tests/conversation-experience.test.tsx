import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/shared/config'
import type { TelegramApiClient, TelegramReceivedNotification } from '@/shared/api'
import { Messenger } from '@/widgets/messenger'

function pendingNotification(signal?: AbortSignal) {
  return new Promise<null>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function createClient(overrides: Partial<TelegramApiClient> = {}): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    receiveNotification: vi.fn(pendingNotification),
    sendTextMessage: vi.fn().mockResolvedValue({ idMessage: 'outgoing-1' }),
    ...overrides,
  }
}

async function openChat(client: TelegramApiClient) {
  const user = userEvent.setup()
  const view = render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)
  await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
  await user.click(screen.getByRole('button', { name: 'Start conversation' }))
  return { ...view, user }
}

describe('conversation experience', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })

  it('shows meaningful empty, ready, active, and sending states', async () => {
    let finishSend: (response: { idMessage: string }) => void = () => undefined
    const sendTextMessage = vi.fn(() => new Promise<{ idMessage: string }>((resolve) => {
      finishSend = resolve
    }))
    const client = createClient({ sendTextMessage })
    const user = userEvent.setup()
    render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)

    expect(screen.getByText('Your first conversation will appear here.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
    await user.click(screen.getByRole('button', { name: 'Start conversation' }))
    expect(screen.getByRole('heading', { name: 'Conversation ready' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Message'), 'Active message')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(screen.getByRole('status')).toHaveTextContent('Sending message...')

    finishSend({ idMessage: 'outgoing-1' })
    const message = await screen.findByRole('article', { name: 'Outgoing message' })
    expect(within(message).getByText('Active message')).toBeInTheDocument()
  })

  it('shows offline and recoverable receive-error states', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockImplementation(pendingNotification)
    await openChat(createClient({ receiveNotification }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not receive new messages. Retrying automatically.')

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    await act(() => Promise.resolve(window.dispatchEvent(new Event('offline'))))
    expect(screen.getByRole('status')).toHaveTextContent('You are offline. Reconnect to send or receive messages.')
  })

  it('requires confirmation before discarding a non-empty draft', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = await openChat(createClient())
    await user.type(screen.getByLabelText('Message'), 'Unsent draft')

    await user.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(confirm).toHaveBeenCalledWith('Discard the unsent message and start a new conversation?')
    expect(screen.getByRole('heading', { name: '+79991234567' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('Unsent draft')

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(screen.getByRole('heading', { name: 'New message' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
  })

  it('does not confirm after a draft has been sent successfully', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { user } = await openChat(createClient())
    await user.type(screen.getByLabelText('Message'), 'Sent draft')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByRole('article', { name: 'Outgoing message' })

    await user.click(screen.getByRole('button', { name: 'New conversation' }))

    expect(confirm).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'New message' })).toBeInTheDocument()
  })

  it('preserves the reading position when a new message arrives away from the bottom', async () => {
    let deliverNotification: (notification: TelegramReceivedNotification) => void = () => undefined
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(() => (
      new Promise((resolve) => {
        deliverNotification = resolve
      })
    ))
    const { container } = await openChat(createClient({ receiveNotification }))
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
    const messageList = container.querySelector<HTMLElement>('.message-list')
    expect(messageList).not.toBeNull()
    Object.defineProperties(messageList!, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, value: 100, writable: true },
    })
    fireEvent.scroll(messageList!)

    act(() => deliverNotification({
      message: {
        chatId: '79991234567@c.us',
        id: 'incoming-1',
        senderName: 'Alex',
        text: 'New message below',
        timestamp: 1_700_000_000_000,
      },
      receiptId: 1,
      status: null,
    }))

    const incomingMessage = await screen.findByRole('article', { name: 'Incoming message' })
    expect(within(incomingMessage).getByText('New message below')).toBeInTheDocument()
    expect(messageList!.scrollTop).toBe(100)
  })
})
