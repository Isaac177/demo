import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { advanceOutgoingStatus, MessageBubble, normalizeOutgoingStatus } from '@/entities/message'
import { mapTelegramOutgoingStatus, type TelegramApiClient, type TelegramReceivedNotification } from '@/shared/api'
import { i18n } from '@/shared/config'
import { Messenger } from '@/widgets/messenger'

describe('outgoing message statuses', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it.each(['pending', 'sent', 'delivered', 'read', 'failed', 'noAccount'] as const)(
    'maps the %s status notification',
    (status) => {
      expect(mapTelegramOutgoingStatus({
        receiptId: 1,
        body: {
          idMessage: 'outgoing-1',
          status,
          typeWebhook: 'outgoingMessageStatus',
        },
      })).toEqual({ id: 'outgoing-1', status })
    },
  )

  it('ignores malformed and unrelated status notifications', () => {
    expect(mapTelegramOutgoingStatus({ receiptId: 1, body: { typeWebhook: 'futureType' } })).toBeNull()
    expect(mapTelegramOutgoingStatus({
      receiptId: 2,
      body: { idMessage: 'outgoing-1', status: 'futureStatus', typeWebhook: 'outgoingMessageStatus' },
    })).toBeNull()
  })

  it('normalizes rejection states and advances statuses idempotently', () => {
    expect(normalizeOutgoingStatus('pending')).toBe('queued')
    expect(normalizeOutgoingStatus('noAccount')).toBe('failed')
    expect(normalizeOutgoingStatus('notInGroup')).toBe('failed')
    expect(advanceOutgoingStatus('queued', 'delivered')).toBe('delivered')
    expect(advanceOutgoingStatus('delivered', 'sent')).toBe('delivered')
    expect(advanceOutgoingStatus('delivered', 'delivered')).toBe('delivered')
    expect(advanceOutgoingStatus('sent', 'failed')).toBe('failed')
    expect(advanceOutgoingStatus('failed', 'delivered')).toBe('failed')
  })

  it.each([
    ['queued', 'Queued'],
    ['sent', 'Sent'],
    ['delivered', 'Delivered'],
    ['read', 'Read'],
    ['failed', 'Failed'],
  ] as const)('renders %s with accessible text', (status, label) => {
    render(<MessageBubble message={{
      direction: 'outgoing',
      id: 'outgoing-1',
      status,
      text: 'Hello',
      timestamp: 1_700_000_000_000,
    }} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('updates only the matching outgoing message and shows rejection as failed', async () => {
    const pendingResolvers: Array<(notification: TelegramReceivedNotification) => void> = []
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(() => (
      new Promise((resolve) => pendingResolvers.push(resolve))
    ))
    const sendTextMessage = vi.fn()
      .mockResolvedValueOnce({ idMessage: 'outgoing-1' })
      .mockResolvedValueOnce({ idMessage: 'outgoing-2' })
    const client: TelegramApiClient = {
      checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
      deleteNotification: vi.fn().mockResolvedValue(undefined),
      getInstanceState: vi.fn().mockResolvedValue('authorized'),
      receiveNotification,
      sendTextMessage,
    }
    const user = userEvent.setup()
    render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)
    await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
    await user.click(screen.getByRole('button', { name: 'Start conversation' }))
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())

    const textbox = screen.getByLabelText('Message')
    await user.type(textbox, 'First message')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await user.type(textbox, 'Second message')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    act(() => pendingResolvers[0]({
      message: null,
      receiptId: 1,
      status: { id: 'outgoing-1', status: 'delivered' },
    }))
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
    act(() => pendingResolvers[1]({
      message: null,
      receiptId: 2,
      status: { id: 'outgoing-2', status: 'noAccount' },
    }))

    const outgoingMessages = await screen.findAllByRole('article', { name: 'Outgoing message' })
    await waitFor(() => expect(within(outgoingMessages[0]).getByText('Delivered')).toBeInTheDocument())
    await waitFor(() => expect(within(outgoingMessages[1]).getByText('Failed')).toBeInTheDocument())
    expect(within(outgoingMessages[0]).queryByText('Failed')).not.toBeInTheDocument()
  })
})
