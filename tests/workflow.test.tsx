import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }))
}

describe('primary messaging workflow', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('connects, resolves a Telegram chat, sends a message, and receives its reply', async () => {
    let notificationDelivered = false
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
    fetchMock.mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('getStateInstance')) {
        return jsonResponse({ stateInstance: 'authorized' })
      }
      if (url.includes('checkAccount') && init?.method === 'POST') {
        return jsonResponse({ exist: true, chatId: '10000000' })
      }
      if (url.includes('sendMessage') && init?.method === 'POST') {
        return jsonResponse({ idMessage: 'message-1' })
      }
      if (url.includes('receiveNotification') && !notificationDelivered) {
        notificationDelivered = true
        return jsonResponse({
          receiptId: 71,
          body: {
            typeWebhook: 'incomingMessageReceived',
            timestamp: 1_700_000_000,
            idMessage: 'incoming-1',
            senderData: {
              chatId: '10000000',
              senderName: 'Reply sender',
            },
            messageData: {
              typeMessage: 'textMessage',
              textMessageData: { textMessage: 'Reply from Telegram' },
            },
          },
        })
      }
      if (url.includes('deleteNotification') && init?.method === 'DELETE') {
        return jsonResponse({ result: true })
      }
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Английский' }))
    await user.type(screen.getByLabelText('Instance ID'), '3100000000')
    await user.type(screen.getByLabelText('API token'), 'test-token')
    await user.click(screen.getByRole('button', { name: /connect instance/i }))

    expect(await screen.findByRole('heading', { name: 'New message' })).toBeInTheDocument()
    expect(screen.queryByText('Telegram conversation')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Russian' }))
    expect(screen.getByRole('heading', { name: 'Новое сообщение' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Английский' }))
    await user.type(screen.getByLabelText('Recipient phone number'), '79991234567')
    await user.click(screen.getByRole('button', { name: /start conversation/i }))
    await user.type(screen.getByLabelText('Message'), 'Hello from Telegram Relay')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const outgoingMessage = await screen.findByRole('article', { name: 'Outgoing message' })
    expect(within(outgoingMessage).getByText('Hello from Telegram Relay')).toBeInTheDocument()
    expect(within(outgoingMessage).getByText('Queued')).toBeInTheDocument()
    const incomingMessage = await screen.findByRole('article', { name: 'Incoming message' })
    expect(within(incomingMessage).getByText('Reply from Telegram')).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage/'),
      expect.objectContaining({
        body: JSON.stringify({ chatId: '10000000', message: 'Hello from Telegram Relay' }),
        method: 'POST',
      }),
    ))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/checkAccount/'),
      expect.objectContaining({
        body: JSON.stringify({ phoneNumber: 79991234567 }),
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/deleteNotification\/[^/]+\/71$/),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
