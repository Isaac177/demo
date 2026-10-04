import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotificationPolling } from '@/features/receive-messages'
import type { TelegramApiClient, TelegramIncomingTextMessage } from '@/shared/api'

function pendingNotification(signal?: AbortSignal) {
  return new Promise<null>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
}

function createClient(receiveNotification: TelegramApiClient['receiveNotification']): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    sendTextMessage: vi.fn().mockResolvedValue({ idMessage: 'outgoing-1' }),
    receiveNotification,
  }
}

interface HookProps {
  client: TelegramApiClient
  enabled: boolean
  scope?: string
}

const onError = vi.fn()
const onMessage = vi.fn<(message: TelegramIncomingTextMessage) => void>()
const onStatus = vi.fn()

function usePolling(props: HookProps) {
  useNotificationPolling({ ...props, onError, onMessage, onStatus })
}

describe('notification polling lifecycle', () => {
  beforeEach(() => {
    onError.mockClear()
    onMessage.mockClear()
    onStatus.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts only when online and scoped to an active chat', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(pendingNotification)
    const client = createClient(receiveNotification)
    const initialProps: HookProps = { client, enabled: false }
    const { rerender } = renderHook(usePolling, {
      initialProps,
    })

    expect(receiveNotification).not.toHaveBeenCalled()
    rerender({ client, enabled: true, scope: undefined })
    expect(receiveNotification).not.toHaveBeenCalled()
    rerender({ client, enabled: true, scope: '79991234567@c.us' })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
  })

  it('keeps only one notification request in flight', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(pendingNotification)
    const client = createClient(receiveNotification)
    renderHook(usePolling, {
      initialProps: { client, enabled: true, scope: '79991234567@c.us' },
    })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(receiveNotification).toHaveBeenCalledOnce()
  })

  it('aborts the previous request when the chat changes and ignores stale results', async () => {
    let resolveFirst: (notification: { message: TelegramIncomingTextMessage; receiptId: number; status: null }) => void = () => undefined
    const firstRequest = new Promise<{ message: TelegramIncomingTextMessage; receiptId: number; status: null }>((resolve) => {
      resolveFirst = resolve
    })
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockReturnValueOnce(firstRequest)
      .mockImplementation(pendingNotification)
    const client = createClient(receiveNotification)
    const { rerender } = renderHook(usePolling, {
      initialProps: { client, enabled: true, scope: '79991234567@c.us' },
    })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
    const firstSignal = receiveNotification.mock.calls[0][0]
    rerender({ client, enabled: true, scope: '994501234567@c.us' })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)
    resolveFirst({
      message: {
        chatId: '79991234567@c.us',
        id: 'stale-1',
        senderName: 'Sender',
        text: 'Stale message',
        timestamp: 1,
      },
      receiptId: 1,
      status: null,
    })
    await Promise.resolve()
    expect(onMessage).not.toHaveBeenCalled()
  })

  it('aborts polling on unmount', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(pendingNotification)
    const client = createClient(receiveNotification)
    const { unmount } = renderHook(usePolling, {
      initialProps: { client, enabled: true, scope: '79991234567@c.us' },
    })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
    const signal = receiveNotification.mock.calls[0][0]
    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it('pauses while offline and starts a fresh request after reconnecting', async () => {
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>(pendingNotification)
    const client = createClient(receiveNotification)
    const { rerender } = renderHook(usePolling, {
      initialProps: { client, enabled: true, scope: '79991234567@c.us' },
    })

    await waitFor(() => expect(receiveNotification).toHaveBeenCalledOnce())
    const onlineSignal = receiveNotification.mock.calls[0][0]
    rerender({ client, enabled: false, scope: '79991234567@c.us' })
    expect(onlineSignal?.aborted).toBe(true)
    expect(receiveNotification).toHaveBeenCalledOnce()

    rerender({ client, enabled: true, scope: '79991234567@c.us' })
    await waitFor(() => expect(receiveNotification).toHaveBeenCalledTimes(2))
  })

  it('backs off after a recoverable failure and retries', async () => {
    vi.useFakeTimers()
    const receiveNotification = vi.fn<TelegramApiClient['receiveNotification']>()
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockImplementation(pendingNotification)
    const client = createClient(receiveNotification)
    renderHook(usePolling, {
      initialProps: { client, enabled: true, scope: '79991234567@c.us' },
    })

    await act(async () => {
      await Promise.resolve()
    })
    expect(onError).toHaveBeenCalledOnce()
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
