import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/shared/config'
import { formatMessageTime } from '@/shared/lib'
import type { TelegramApiClient, TelegramIncomingTextMessage } from '@/shared/api'
import { Messenger } from '@/widgets/messenger'

function waitForAbort(signal?: AbortSignal) {
  return new Promise<null>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function createClient(messages: TelegramIncomingTextMessage[]) {
  const queue = [...messages]
  const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>((signal?: AbortSignal) => {
    const message = queue.shift()
    return message ? Promise.resolve({ message, receiptId: messages.length - queue.length, status: null }) : waitForAbort(signal)
  })
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    sendTextMessage: vi.fn().mockResolvedValue({ idMessage: 'outgoing-1' }),
    receiveNotification,
  }
}

async function openChat(client: TelegramApiClient) {
  const user = userEvent.setup()
  render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)
  await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
  await user.click(screen.getByRole('button', { name: 'Start conversation' }))
}

describe('receive text messages', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('renders a matching incoming message with sender, text, and localized time', async () => {
    const timestamp = new Date(2026, 9, 4, 14, 5).getTime()
    const client = createClient([{
      chatId: '79991234567@c.us',
      id: 'incoming-1',
      senderName: 'Alex',
      text: 'Hello from Telegram',
      timestamp,
    }])

    await openChat(client)

    const message = await screen.findByRole('article', { name: 'Incoming message' })
    expect(within(message).getByText('Alex')).toBeInTheDocument()
    expect(within(message).getByText('Hello from Telegram')).toBeInTheDocument()
    expect(within(message).getByText(formatMessageTime(timestamp, 'en'))).toBeInTheDocument()
  })

  it('deduplicates repeated message IDs', async () => {
    const incomingMessage: TelegramIncomingTextMessage = {
      chatId: '79991234567@c.us',
      id: 'incoming-duplicate',
      senderName: 'Alex',
      text: 'Only once',
      timestamp: 1_700_000_000_000,
    }

    const client = createClient([incomingMessage, incomingMessage])
    await openChat(client)

    await waitFor(() => expect(client.receiveNotification).toHaveBeenCalledTimes(3))
    const messages = screen.getAllByRole('article', { name: 'Incoming message' })
    expect(messages).toHaveLength(1)
    expect(within(messages[0]).getByText('Only once')).toBeInTheDocument()
  })

  it('ignores messages for another chat', async () => {
    const client = createClient([{
      chatId: '994501234567@c.us',
      id: 'incoming-other-chat',
      senderName: 'Other sender',
      text: 'Not for this conversation',
      timestamp: 1_700_000_000_000,
    }])
    await openChat(client)

    await waitFor(() => expect(client.receiveNotification).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Not for this conversation')).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Incoming message' })).not.toBeInTheDocument()
  })

  it('uses a localized fallback when the sender name is absent', async () => {
    await openChat(createClient([{
      chatId: '79991234567@c.us',
      id: 'incoming-unknown-sender',
      senderName: '',
      text: 'Anonymous message',
      timestamp: 1_700_000_000_000,
    }]))

    const message = await screen.findByRole('article', { name: 'Incoming message' })
    expect(within(message).getByText('Contact')).toBeInTheDocument()
  })
})
