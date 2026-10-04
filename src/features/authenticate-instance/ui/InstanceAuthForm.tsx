import { ArrowRight, KeyRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TelegramCredentials } from '@/shared/api'
import { Button, Field, InlineAlert, Spinner } from '@/shared/ui'
import { validateCredentials, type CredentialErrors } from '../model/validate-credentials'

interface InstanceAuthFormProps {
  error?: string
  isConnecting: boolean
  onConnect: (credentials: TelegramCredentials) => void
}

const initialCredentials: TelegramCredentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '',
  apiTokenInstance: '',
}

export function InstanceAuthForm({ error, isConnecting, onConnect }: InstanceAuthFormProps) {
  const { t } = useTranslation()
  const [credentials, setCredentials] = useState(initialCredentials)
  const [errors, setErrors] = useState<CredentialErrors>({})

  function updateCredential(key: keyof TelegramCredentials, value: string) {
    setCredentials((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isConnecting) {
      return
    }
    const nextCredentials = {
      apiUrl: credentials.apiUrl.trim(),
      idInstance: credentials.idInstance.trim(),
      apiTokenInstance: credentials.apiTokenInstance.trim(),
    }
    const nextErrors = validateCredentials(nextCredentials)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) {
      onConnect(nextCredentials)
    }
  }

  return (
    <form className="auth-form" noValidate onSubmit={handleSubmit}>
      <div className="auth-form__heading">
        <h1>{t('auth.title')}</h1>
        <p>{t('auth.description')}</p>
      </div>
      {error && <InlineAlert>{error}</InlineAlert>}
      <div className="auth-form__fields">
        <Field
          autoComplete="username"
          error={errors.idInstance ? t(errors.idInstance) : undefined}
          id="idInstance"
          inputMode="numeric"
          label={t('auth.instanceId.label')}
          onChange={(event) => updateCredential('idInstance', event.target.value)}
          placeholder={t('auth.instanceId.placeholder')}
          value={credentials.idInstance}
        />
        <Field
          autoComplete="current-password"
          error={errors.apiTokenInstance ? t(errors.apiTokenInstance) : undefined}
          id="apiTokenInstance"
          label={t('auth.token.label')}
          onChange={(event) => updateCredential('apiTokenInstance', event.target.value)}
          placeholder={t('auth.token.placeholder')}
          type="password"
          value={credentials.apiTokenInstance}
        />
        <Field
          autoComplete="url"
          error={errors.apiUrl ? t(errors.apiUrl) : undefined}
          hint={t('auth.apiHost.hint')}
          id="apiUrl"
          label={t('auth.apiHost.label')}
          onChange={(event) => updateCredential('apiUrl', event.target.value)}
          type="url"
          value={credentials.apiUrl}
        />
      </div>
      <Button className="auth-form__submit" disabled={isConnecting} type="submit">
        {isConnecting ? <><Spinner />{t('auth.connecting')}</> : <><KeyRound aria-hidden="true" size={18} />{t('auth.connect')}<ArrowRight aria-hidden="true" size={18} /></>}
      </Button>
      <p className="auth-form__privacy">{t('auth.privacy')}</p>
    </form>
  )
}
