import { MessageCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InstanceAuthForm } from '@/features/authenticate-instance'
import { LanguageSwitcher } from '@/features/change-language'
import {
  createTelegramApiClient,
  normalizeTelegramApiError,
  type TelegramApiClient,
  type TelegramApiErrorCode,
  type TelegramCredentials,
  type TelegramInstanceState,
} from '@/shared/api'
import { Messenger } from '@/widgets/messenger'

interface Session {
  client: TelegramApiClient
  instanceId: string
}

type RejectedInstanceState = Exclude<TelegramInstanceState, 'authorized'>
type AuthErrorKey =
  | 'auth.errors.invalidConfig'
  | 'auth.errors.authorization'
  | 'auth.errors.network'
  | 'auth.errors.offline'
  | 'auth.errors.timeout'
  | 'auth.errors.rateLimit'
  | 'auth.errors.validation'
  | 'auth.errors.server'
  | 'auth.errors.invalidResponse'
  | 'auth.errors.unknown'

interface AuthError {
  key: AuthErrorKey | 'auth.errors.instanceState'
  state?: RejectedInstanceState
}

const errorKeys: Record<Exclude<TelegramApiErrorCode, 'abort'>, AuthErrorKey> = {
  'invalid-config': 'auth.errors.invalidConfig',
  network: 'auth.errors.network',
  offline: 'auth.errors.offline',
  timeout: 'auth.errors.timeout',
  authorization: 'auth.errors.authorization',
  'rate-limit': 'auth.errors.rateLimit',
  validation: 'auth.errors.validation',
  server: 'auth.errors.server',
  'invalid-response': 'auth.errors.invalidResponse',
  unknown: 'auth.errors.unknown',
}

function getAuthError(error: unknown): AuthError | undefined {
  const normalizedError = normalizeTelegramApiError(error)
  return normalizedError.code === 'abort' ? undefined : { key: errorKeys[normalizedError.code] }
}

export function ChatPage() {
  const { t } = useTranslation()
  const [session, setSession] = useState<Session>()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<AuthError>()
  const connectionControllerRef = useRef<AbortController | undefined>(undefined)
  const connectionPendingRef = useRef(false)

  useEffect(() => () => connectionControllerRef.current?.abort(), [])

  async function connect(credentials: TelegramCredentials) {
    if (connectionPendingRef.current) {
      return
    }
    connectionPendingRef.current = true
    setIsConnecting(true)
    setError(undefined)
    const controller = new AbortController()
    connectionControllerRef.current = controller
    try {
      const client = createTelegramApiClient(credentials)
      const state = await client.getInstanceState(controller.signal)
      if (state !== 'authorized') {
        setError({ key: 'auth.errors.instanceState', state })
        return
      }
      setSession({ client, instanceId: credentials.idInstance })
    } catch (connectionError) {
      if (!controller.signal.aborted) {
        const authError = getAuthError(connectionError)
        if (authError) {
          setError(authError)
        }
      }
    } finally {
      connectionPendingRef.current = false
      if (connectionControllerRef.current === controller) {
        connectionControllerRef.current = undefined
      }
      if (!controller.signal.aborted) {
        setIsConnecting(false)
      }
    }
  }

  function disconnect() {
    setSession(undefined)
    setError(undefined)
  }

  const localizedError = error
    ? t(error.key, { state: error.state ? t(`auth.states.${error.state}`) : undefined })
    : undefined

  if (session) {
    return <Messenger client={session.client} instanceId={session.instanceId} onDisconnect={disconnect} />
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label={t('auth.visualLabel')}>
        <div className="auth-visual__brand"><span className="brand-mark brand-mark--light"><MessageCircle aria-hidden="true" size={20} /></span><span>{t('auth.brand')}</span></div>
        <div className="auth-visual__content">
          <p className="auth-visual__title">{t('auth.heroTitle')}</p>
          <p>{t('auth.heroDescription')}</p>
        </div>
        <div className="auth-visual__trust"><ShieldCheck aria-hidden="true" size={20} /><span><strong>{t('auth.trustTitle')}</strong>{t('auth.trustDescription')}</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel__toolbar"><LanguageSwitcher /></div>
        <InstanceAuthForm error={localizedError} isConnecting={isConnecting} onConnect={(credentials) => void connect(credentials)} />
      </section>
    </main>
  )
}
