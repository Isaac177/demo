import { LogOut, MessageCircle, Plus, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isSamePersonalChat, type PersonalChat } from '@/entities/chat'
import type { ChatMessage } from '@/entities/message'
import { advanceOutgoingStatus, MessageBubble, normalizeOutgoingStatus } from '@/entities/message'
import { LanguageSwitcher } from '@/features/change-language'
import { CreateChatForm } from '@/features/create-chat'
import { useNotificationPolling } from '@/features/receive-messages'
import { SendMessageForm } from '@/features/send-message'
import { normalizeTelegramApiError, type TelegramApiClient, type TelegramIncomingTextMessage, type TelegramOutgoingMessageStatus } from '@/shared/api'
import { traceTelegram } from '@/shared/lib'
import { Button, InlineAlert } from '@/shared/ui'

interface MessengerProps {
  client: TelegramApiClient
  instanceId: string
  onDisconnect: () => void
}

type MessengerErrorKey =
  | 'messenger.errors.send'
  | 'messenger.errors.receive'
  | 'messenger.errors.offline'
  | 'messenger.errors.timeout'
  | 'messenger.errors.authorization'
  | 'messenger.errors.rateLimit'
  | 'messenger.errors.validation'
  | 'messenger.errors.server'
  | 'messenger.errors.invalidResponse'
  | 'messenger.errors.unknown'

interface MessengerError {
  action: 'send' | 'receive'
  key: MessengerErrorKey
}

function getMessengerError(error: unknown, action: MessengerError['action']): MessengerError | undefined {
  const code = normalizeTelegramApiError(error).code
  if (code === 'abort') {
    return undefined
  }
  const keys: Record<Exclude<typeof code, 'abort'>, MessengerErrorKey> = {
    'invalid-config': 'messenger.errors.unknown',
    network: action === 'send' ? 'messenger.errors.send' : 'messenger.errors.receive',
    offline: 'messenger.errors.offline',
    timeout: 'messenger.errors.timeout',
    authorization: 'messenger.errors.authorization',
    'rate-limit': 'messenger.errors.rateLimit',
    validation: 'messenger.errors.validation',
    server: 'messenger.errors.server',
    'invalid-response': 'messenger.errors.invalidResponse',
    unknown: 'messenger.errors.unknown',
  }
  return { action, key: keys[code] }
}

export function Messenger({ client, instanceId, onDisconnect }: MessengerProps) {
  const { t } = useTranslation()
  const [activeChat, setActiveChat] = useState<PersonalChat>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<MessengerError>()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [hasDraft, setHasDraft] = useState(false)
  const messageListRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottomRef = useRef(true)
  const sendPendingRef = useRef(false)

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    const list = messageListRef.current
    if (list && shouldStickToBottomRef.current) {
      list.scrollTop = list.scrollHeight
    }
  }, [messages])

  function addIncomingMessage(message: TelegramIncomingTextMessage) {
    const matchesActiveChat = Boolean(activeChat && isSamePersonalChat(message.chatId, activeChat))
    traceTelegram('incoming-message-filtered', {
      hasActiveChat: Boolean(activeChat),
      matchesActiveChat,
    })
    if (!activeChat || !matchesActiveChat) {
      return
    }
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) {
        return current
      }
      return [...current, {
        id: message.id,
        text: message.text,
        timestamp: message.timestamp,
        direction: 'incoming',
        status: 'received',
        senderName: message.senderName,
      }]
    })
    setError((current) => current?.action === 'receive' ? undefined : current)
  }

  function updateOutgoingStatus(update: TelegramOutgoingMessageStatus) {
    const status = normalizeOutgoingStatus(update.status)
    if (!status) {
      return
    }
    setMessages((current) => current.map((message) => (
      message.direction === 'outgoing' && message.id === update.id
        ? { ...message, status: advanceOutgoingStatus(message.status, status) }
        : message
    )))
  }

  useNotificationPolling({
    client,
    enabled: isOnline,
    onError: (pollingError) => {
      const nextError = getMessengerError(pollingError, 'receive')
      if (nextError) {
        setError(nextError)
      }
    },
    onMessage: addIncomingMessage,
    onStatus: updateOutgoingStatus,
    onSuccess: () => setError((current) => current?.action === 'receive' ? undefined : current),
    scope: activeChat?.chatId,
  })

  async function createChat(chat: PersonalChat) {
    try {
      traceTelegram('chat-resolution-started')
      const account = await client.checkAccount(chat.phone)
      if (!account.exists) {
        traceTelegram('chat-resolution-failed', { reason: 'account-not-found' })
        return t('createChat.errors.notFound')
      }
      traceTelegram('chat-resolution-succeeded')
      setActiveChat({ ...chat, chatId: account.chatId })
      setMessages([])
      setError(undefined)
      setHasDraft(false)
      shouldStickToBottomRef.current = true
      return undefined
    } catch (createError) {
      const code = normalizeTelegramApiError(createError).code
      traceTelegram('chat-resolution-failed', { reason: code })
      if (code === 'rate-limit') {
        return t('createChat.errors.rateLimit')
      }
      if (code === 'authorization') {
        return t('createChat.errors.authorization')
      }
      return t('createChat.errors.request')
    }
  }

  function startNewConversation() {
    if (hasDraft && !window.confirm(t('messenger.discardDraftConfirm'))) {
      return
    }
    setHasDraft(false)
    setActiveChat(undefined)
    setMessages([])
    setError(undefined)
    shouldStickToBottomRef.current = true
  }

  async function sendMessage(text: string) {
    if (!activeChat || sendPendingRef.current) {
      return false
    }
    sendPendingRef.current = true
    setIsSending(true)
    setError(undefined)
    try {
      const response = await client.sendTextMessage(activeChat.chatId, text)
      setMessages((current) => [...current, {
        id: response.idMessage,
        text,
        timestamp: Date.now(),
        direction: 'outgoing',
        status: 'queued',
      }])
      return true
    } catch (sendError) {
      const nextError = getMessengerError(sendError, 'send')
      if (nextError) {
        setError(nextError)
      }
      return false
    } finally {
      sendPendingRef.current = false
      setIsSending(false)
    }
  }

  function handleMessageListScroll() {
    const list = messageListRef.current
    if (list) {
      shouldStickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80
    }
  }

  return (
    <main className="messenger">
      <aside aria-label={t('messenger.sidebarLabel')} className="sidebar">
        <div className="sidebar__brand"><span className="brand-mark"><MessageCircle aria-hidden="true" size={19} /></span><span>{t('messenger.brand')}</span></div>
        <Button className="sidebar__new" onClick={startNewConversation} variant="secondary"><Plus aria-hidden="true" size={18} />{t('messenger.newConversation')}</Button>
        <nav aria-label={t('messenger.conversationsLabel')} className="conversation-list">
          {activeChat ? (
            <button aria-current="page" className="conversation-card" type="button">
              <span className="avatar">{activeChat.phone.slice(-2)}</span>
              <span className="conversation-card__copy"><strong>+{activeChat.phone}</strong><small>{messages.at(-1)?.text || t('messenger.conversationReady')}</small></span>
            </button>
          ) : (
            <p className="conversation-list__empty">{t('messenger.emptyConversations')}</p>
          )}
        </nav>
        <div className="sidebar__account">
          <span aria-hidden="true" className="status-dot" />
          <span><strong>{t('messenger.instanceConnected')}</strong><small>{t('messenger.instanceId', { id: instanceId })}</small></span>
          <Button aria-label={t('messenger.disconnect')} onClick={onDisconnect} variant="ghost"><LogOut aria-hidden="true" size={18} /></Button>
        </div>
      </aside>
      <section aria-labelledby="chat-title" className="chat-panel">
        <header className="chat-header">
          <h1 id="chat-title">{activeChat ? `+${activeChat.phone}` : t('messenger.newMessage')}</h1>
          <div className="chat-header__actions">
            <LanguageSwitcher />
            <div aria-live="polite" className={`network-status ${isOnline ? '' : 'network-status--offline'}`}>
              {isOnline ? <Wifi aria-hidden="true" size={16} /> : <WifiOff aria-hidden="true" size={16} />}
              {isOnline ? t('messenger.online') : t('messenger.offline')}
            </div>
            <div className="chat-header__mobile-actions">
              <Button aria-label={t('messenger.newConversationMobile')} onClick={startNewConversation} variant="ghost"><Plus aria-hidden="true" size={18} /></Button>
              <Button aria-label={t('messenger.disconnectMobile')} onClick={onDisconnect} variant="ghost"><LogOut aria-hidden="true" size={18} /></Button>
            </div>
          </div>
        </header>
        {!activeChat ? (
          <div className="chat-empty"><CreateChatForm onCreate={createChat} /></div>
        ) : (
          <>
            <div aria-label={t('messenger.messagesLabel')} aria-live="polite" aria-relevant="additions text" className="message-list" onScroll={handleMessageListScroll} ref={messageListRef} role="log">
              <div className="message-list__date"><span>{t('messenger.today')}</span></div>
              {messages.length === 0 && (
                <div className="conversation-start">
                  <span><ShieldCheck aria-hidden="true" size={22} /></span>
                  <h2>{t('messenger.readyTitle')}</h2>
                  <p>{t('messenger.readyDescription')}</p>
                </div>
              )}
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
            </div>
            <div className="composer-area">
              {error && <InlineAlert>{t(error.key)}</InlineAlert>}
              {isSending && <InlineAlert tone="info">{t('messenger.sendingNotice')}</InlineAlert>}
              {!isOnline && <InlineAlert tone="info">{t('messenger.offlineNotice')}</InlineAlert>}
              <SendMessageForm isAvailable={isOnline} isSending={isSending} onDraftChange={setHasDraft} onSend={sendMessage} />
              <p className="composer-area__hint">{t('messenger.composerHint')}</p>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
