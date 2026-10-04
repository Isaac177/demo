import { ArrowRight, MessageSquarePlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createPersonalChat, type PersonalChat, type PersonalChatError } from '@/entities/chat'
import { Button, Field, InlineAlert, Spinner } from '@/shared/ui'

interface CreateChatFormProps {
  onCreate: (chat: PersonalChat) => Promise<string | undefined> | string | undefined
}

export function CreateChatForm({ onCreate }: CreateChatFormProps) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<PersonalChatError>()
  const [requestError, setRequestError] = useState<string>()
  const [isCreating, setIsCreating] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreating) {
      return
    }
    const result = createPersonalChat(phone)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setIsCreating(true)
    setRequestError(undefined)
    try {
      setRequestError(await onCreate(result.chat))
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <form className="new-chat" noValidate onSubmit={(event) => void handleSubmit(event)}>
      <div className="new-chat__icon"><MessageSquarePlus aria-hidden="true" size={24} /></div>
      <div>
        <h2>{t('createChat.title')}</h2>
        <p className="new-chat__copy">{t('createChat.description')}</p>
      </div>
      <Field
        autoComplete="tel"
        error={error ? t(`createChat.errors.${error}`) : undefined}
        id="recipientPhone"
        inputMode="tel"
        label={t('createChat.phoneLabel')}
        onChange={(event) => {
          setPhone(event.target.value)
          setError(undefined)
          setRequestError(undefined)
        }}
        placeholder={t('createChat.phonePlaceholder')}
        value={phone}
      />
      {requestError && <InlineAlert>{requestError}</InlineAlert>}
      <Button disabled={isCreating} type="submit">{isCreating ? <><Spinner />{t('createChat.checking')}</> : <>{t('createChat.submit')}<ArrowRight aria-hidden="true" size={18} /></>}</Button>
    </form>
  )
}
