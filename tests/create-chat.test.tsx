import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateChatForm } from '@/features/create-chat'
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

describe('personal chat creation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru')
  })

  it('blocks unsafe phone input', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<CreateChatForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Номер телефона получателя'), 'user79991234567')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByText('Используйте только цифры, пробелы, скобки, дефисы и один плюс в начале.')).toBeInTheDocument()
  })

  it('creates the same normalized chat from a formatted number', async () => {
    const onCreate = vi.fn()
    const user = userEvent.setup()
    render(<CreateChatForm onCreate={onCreate} />)

    await user.type(screen.getByLabelText('Номер телефона получателя'), '+7 (999) 123-45-67')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))

    expect(onCreate).toHaveBeenCalledWith({
      phone: '79991234567',
      chatId: '79991234567@c.us',
    })
  })

  it('replaces the active chat without leaking its message state', async () => {
    const client = createClient()
    const user = userEvent.setup()
    render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)

    await user.type(screen.getByLabelText('Номер телефона получателя'), '+7 (999) 123-45-67')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))
    expect(screen.getByRole('heading', { name: '+79991234567' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Сообщение'), 'Первый диалог')
    await user.click(screen.getByRole('button', { name: 'Отправить сообщение' }))
    const outgoingMessage = await screen.findByRole('article', { name: 'Исходящее сообщение' })
    expect(within(outgoingMessage).getByText('Первый диалог')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Новый диалог' }))
    await user.type(screen.getByLabelText('Номер телефона получателя'), '+994 50 123 45 67')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))

    expect(screen.getByRole('heading', { name: '+994501234567' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryAllByText('Первый диалог')).toHaveLength(0))
    expect(screen.getByRole('heading', { name: 'Диалог готов' })).toBeInTheDocument()
  })

  it('keeps the form open when Telegram cannot resolve the phone number', async () => {
    const client = createClient()
    vi.mocked(client.checkAccount).mockResolvedValue({ exists: false })
    const user = userEvent.setup()
    render(<Messenger client={client} instanceId="410000000000" onDisconnect={vi.fn()} />)

    await user.type(screen.getByLabelText('Номер телефона получателя'), '79991234567')
    await user.click(screen.getByRole('button', { name: 'Начать диалог' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Аккаунт Telegram с таким номером не найден')
    expect(screen.getByLabelText('Номер телефона получателя')).toHaveValue('79991234567')
  })
})
