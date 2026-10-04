import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { i18n } from '@/shared/config'
import type { TelegramApiClient } from '@/shared/api'
import { Messenger } from '@/widgets/messenger'

function createClient(): TelegramApiClient {
  return {
    checkAccount: vi.fn((phoneNumber: string) => Promise.resolve({ chatId: `${phoneNumber}@c.us`, exists: true as const })),
    deleteNotification: vi.fn().mockResolvedValue(undefined),
    getInstanceState: vi.fn().mockResolvedValue('authorized'),
    sendTextMessage: vi.fn().mockResolvedValue({ idMessage: 'message-1' }),
    receiveNotification: vi.fn((signal?: AbortSignal) => new Promise<null>((_, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })),
  }
}

async function getCriticalViolations(container: HTMLElement) {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
  })
  return result.violations.filter((violation) => violation.impact === 'critical')
}

describe('accessible interface', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru')
  })

  it('has no critical automated accessibility violations on the connection page', async () => {
    const { container } = render(<App />)

    expect(await getCriticalViolations(container)).toEqual([])
  })

  it('follows the visual keyboard order and activates the language selector', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Русский' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Английский' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Connect your Telegram account' })).toBeInTheDocument()
    await user.tab()
    expect(screen.getByLabelText('Instance ID')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('API token')).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('API host')).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Connect instance' })).toHaveFocus()
  })

  it('exposes messenger landmarks, live regions, and mobile actions without critical violations', async () => {
    const { container } = render(<Messenger client={createClient()} instanceId="410000000000" onDisconnect={vi.fn()} />)

    expect(screen.getByRole('complementary', { name: 'Навигация по диалогам' })).toBeInTheDocument()
    expect(screen.getByText('В сети')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Начать новый диалог' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отключить инстанс и вернуться ко входу' })).toBeInTheDocument()
    expect(await getCriticalViolations(container)).toEqual([])
  })

  it('announces newly added conversation messages through a log region', async () => {
    const user = userEvent.setup()
    render(<Messenger client={createClient()} instanceId="410000000000" onDisconnect={vi.fn()} />)

    await user.type(screen.getByLabelText('Номер телефона получателя'), '79991234567')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))

    const messageLog = screen.getByRole('log', { name: 'Сообщения в диалоге' })
    expect(messageLog).toHaveAttribute('aria-live', 'polite')
    expect(messageLog).toHaveAttribute('aria-relevant', 'additions text')
  })
})
