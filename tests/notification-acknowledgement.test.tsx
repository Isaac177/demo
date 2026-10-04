import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNotificationPolling } from '@/features/receive-messages'
import type { TelegramApiClient, TelegramIncomingTextMessage, TelegramReceivedNotification } from '@/shared/api'

const message: TelegramIncomingTextMessage = {
  chatId: '79991234567@c.us',
  id: 'incoming-1',
  senderName: 'Alex',
  text: 'Hello',
  timestamp: 1_700_000_000_000,
}

function pendingReceive(signal?: AbortSignal) {
  return new Promise<null>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function createClient(
  receiveNotification: TelegramApiClient['receiveNotification'],
  deleteNotification: TelegramApiClient['deleteNotification'],
): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification,
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    receiveNotification,
    sendTextMessage: vi.fn().mockResolvedValue({ idMessage: 'outgoing-1' }),
  }
}

function renderPolling(client: TelegramApiClient, onMessage = vi.fn()) {
  const onError = vi.fn()
  const result = renderHook(() => useNotificationPolling({
    client,
    enabled: true,
    onError,
    onMessage,
    onStatus: vi.fn(),
    scope: '79991234567@c.us',
  }))
  return { ...result, onError, onMessage }
}

describe('notification acknowledgement', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('processes a supported message before deleting its receipt exactly once', async () => {
    const order: string[] = []
    const notification: TelegramReceivedNotification = { message, receiptId: 41, status: null }
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockImplementationOnce(() => {
        order.push('receive')
        return Promise.resolve(notification)
      })
      .mockImplementation(pendingReceive)
    const deleteNotification = vi.fn<TelegramApiClient['deleteNotification']>(() => {
      order.push('delete')
      return Promise.resolve()
    })
    const onMessage = vi.fn(() => order.push('process'))

    renderPolling(createClient(receiveNotification, deleteNotification), onMessage)

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
    expect(order).toEqual(['receive', 'process', 'delete'])
    expect(onMessage).toHaveBeenCalledOnce()
    expect(deleteNotification).toHaveBeenCalledOnce()
    expect(deleteNotification).toHaveBeenCalledWith(41, expect.any(AbortSignal))
  })

  it('acknowledges a safely ignored notification without processing a message', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockResolvedValueOnce({ message: null, receiptId: 42, status: null })
      .mockImplementation(pendingReceive)
    const deleteNotification = vi.fn<TelegramApiClient['deleteNotification']>().mockResolvedValue(undefined)
    const { onMessage } = renderPolling(createClient(receiveNotification, deleteNotification))

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
    expect(onMessage).not.toHaveBeenCalled()
    expect(deleteNotification).toHaveBeenCalledOnce()
    expect(deleteNotification).toHaveBeenCalledWith(42, expect.any(AbortSignal))
  })

  it('does not acknowledge when local processing fails', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockResolvedValueOnce({ message, receiptId: 43, status: null })
      .mockImplementation(pendingReceive)
    const deleteNotification = vi.fn<TelegramApiClient['deleteNotification']>().mockResolvedValue(undefined)
    const onMessage = vi.fn(() => {
      throw new Error('Local processing failed')
    })
    const { onError } = renderPolling(createClient(receiveNotification, deleteNotification), onMessage)

    await act(async () => {
      await Promise.resolve()
    })
    expect(onError).toHaveBeenCalledOnce()
    expect(deleteNotification).not.toHaveBeenCalled()
    expect(receiveNotification).toHaveBeenCalledOnce()
  })

  it('backs off after deletion fails and does not start the next receive early', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockResolvedValueOnce({ message: null, receiptId: 44, status: null })
      .mockImplementation(pendingReceive)
    const deleteNotification = vi.fn<TelegramApiClient['deleteNotification']>()
      .mockRejectedValueOnce(new TypeError('Delete failed'))
    const { onError } = renderPolling(createClient(receiveNotification, deleteNotification))

    await act(async () => {
      await Promise.resolve()
    })
    expect(onError).toHaveBeenCalledOnce()
    expect(deleteNotification).toHaveBeenCalledOnce()
    expect(receiveNotification).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999)
    })
    expect(receiveNotification).toHaveBeenCalledOnce()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(receiveNotification).toHaveBeenCalledTimes(2)
  })
})
