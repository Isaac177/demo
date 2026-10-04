import { SendHorizontal } from 'lucide-react'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui'
import { countMessageCharacters, TELEGRAM_MESSAGE_LIMIT, validateMessageDraft } from '../model/message-draft'

interface SendMessageFormProps {
  isAvailable: boolean
  isSending: boolean
  onDraftChange?: (hasDraft: boolean) => void
  onSend: (message: string) => Promise<boolean>
}

type ComposerErrorKey = 'composer.emptyError' | 'composer.lengthError'

export function SendMessageForm({ isAvailable, isSending, onDraftChange, onSend }: SendMessageFormProps) {
  const { t } = useTranslation()
  const [message, setMessage] = useState('')
  const [errorKey, setErrorKey] = useState<ComposerErrorKey>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submissionPendingRef = useRef(false)
  const validation = validateMessageDraft(message)
  const characterCount = countMessageCharacters(message)
  const isDisabled = !isAvailable || isSending || isSubmitting || !validation.valid

  async function submitMessage() {
    if (!isAvailable || isSending || submissionPendingRef.current) {
      return
    }

    const result = validateMessageDraft(message)
    if (!result.valid) {
      setErrorKey(result.error === 'empty' ? 'composer.emptyError' : 'composer.lengthError')
      return
    }

    submissionPendingRef.current = true
    setIsSubmitting(true)
    setErrorKey(undefined)
    try {
      const sent = await onSend(result.message)
      if (sent) {
        setMessage('')
        onDraftChange?.(false)
      }
    } finally {
      submissionPendingRef.current = false
      setIsSubmitting(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitMessage()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitMessage()
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <div className="composer__input-wrap">
        <label className="sr-only" htmlFor="message">{t('composer.messageLabel')}</label>
        <textarea
          aria-describedby={errorKey ? 'message-error message-count' : 'message-count'}
          aria-invalid={Boolean(errorKey)}
          autoComplete="off"
          id="message"
          onChange={(event) => {
            const value = event.target.value
            setMessage(value)
            onDraftChange?.(value.trim().length > 0)
            setErrorKey(countMessageCharacters(value.trim()) > TELEGRAM_MESSAGE_LIMIT ? 'composer.lengthError' : undefined)
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('composer.placeholder')}
          rows={1}
          value={message}
        />
        <div className="composer__feedback">
          {errorKey && <span className="composer__error" id="message-error" role="alert">{t(errorKey)}</span>}
          <span className="composer__count" id="message-count">{characterCount}/{TELEGRAM_MESSAGE_LIMIT}</span>
        </div>
      </div>
      <Button aria-label={t('composer.send')} className="composer__send" disabled={isDisabled} type="submit">
        <SendHorizontal aria-hidden="true" size={20} />
      </Button>
    </form>
  )
}
