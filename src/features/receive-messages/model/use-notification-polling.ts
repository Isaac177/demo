import { useEffect, useRef } from 'react'
import type { TelegramApiClient, TelegramIncomingTextMessage, TelegramOutgoingMessageStatus } from '@/shared/api'
import { traceTelegram } from '@/shared/lib'

interface NotificationPollingOptions {
  client: TelegramApiClient
  enabled: boolean
  onError: (error: unknown) => void
  onMessage: (message: TelegramIncomingTextMessage) => void
  onStatus: (status: TelegramOutgoingMessageStatus) => void
  onSuccess?: () => void
  scope?: string
}

function wait(duration: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, duration)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout)
      resolve()
    }, { once: true })
  })
}

export function useNotificationPolling({ client, enabled, onError, onMessage, onStatus, onSuccess, scope }: NotificationPollingOptions) {
  const onErrorRef = useRef(onError)
  const onMessageRef = useRef(onMessage)
  const onStatusRef = useRef(onStatus)
  const onSuccessRef = useRef(onSuccess)
  onErrorRef.current = onError
  onMessageRef.current = onMessage
  onStatusRef.current = onStatus
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!enabled || !scope) {
      return
    }
    const controller = new AbortController()
    traceTelegram('polling-started')

    async function poll() {
      while (!controller.signal.aborted) {
        try {
          const notification = await client.receiveNotification(controller.signal)
          if (controller.signal.aborted) {
            return
          }
          if (notification) {
            traceTelegram('notification-received', {
              hasMessage: Boolean(notification.message),
              hasStatus: Boolean(notification.status),
              receiptId: notification.receiptId,
            })
            if (notification.message) {
              onMessageRef.current(notification.message)
            }
            if (notification.status) {
              onStatusRef.current(notification.status)
            }
            await client.deleteNotification(notification.receiptId, controller.signal)
          }
          onSuccessRef.current?.()
        } catch (error) {
          if (!controller.signal.aborted) {
            traceTelegram('polling-error')
            onErrorRef.current(error)
            await wait(3000, controller.signal)
          }
        }
      }
    }

    void poll()
    return () => {
      traceTelegram('polling-stopped')
      controller.abort()
    }
  }, [client, enabled, scope])
}
