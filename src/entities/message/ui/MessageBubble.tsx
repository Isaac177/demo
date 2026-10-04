import { Check, CheckCheck, CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatMessageTime } from '@/shared/lib'
import type { ChatMessage } from '../model/types'

interface MessageBubbleProps {
  message: ChatMessage
}

function MessageStatusIcon({ status }: { status: ChatMessage['status'] }) {
  if (status === 'failed') {
    return <CircleAlert aria-hidden="true" size={14} />
  }
  if (status === 'delivered' || status === 'read') {
    return <CheckCheck aria-hidden="true" size={14} />
  }
  return <Check aria-hidden="true" size={14} />
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'ru'

  return (
    <article className={`message message--${message.direction}`} aria-label={t(message.direction === 'incoming' ? 'message.incomingLabel' : 'message.outgoingLabel')}>
      {message.direction === 'incoming' && <span className="message__sender">{message.senderName || t('message.unknownSender')}</span>}
      <p className="message__text">{message.text}</p>
      <div className="message__meta">
        <time dateTime={new Date(message.timestamp).toISOString()}>{formatMessageTime(message.timestamp, locale)}</time>
        {message.direction === 'outgoing' && (
          <span className={`message__status message__status--${message.status}`}>
            <MessageStatusIcon status={message.status} />
            {t(`message.${message.status}`)}
          </span>
        )}
      </div>
    </article>
  )
}
