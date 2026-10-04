import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { i18n, languageStorageKey } from '@/shared/config'
import { formatMessageTime } from '@/shared/lib'

describe('connection page localization', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ru')
    localStorage.clear()
  })

  it('opens in Russian and localizes validation', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Подключите аккаунт Telegram' })).toBeInTheDocument()
    expect(screen.getByLabelText('ID инстанса')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))
    expect(screen.getByText('Введите ID инстанса.')).toBeInTheDocument()
    expect(screen.getByText('Введите токен инстанса.')).toBeInTheDocument()
  })

  it('switches to English and persists only the language choice', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Английский' }))

    expect(screen.getByRole('heading', { name: 'Connect your Telegram account' })).toBeInTheDocument()
    expect(screen.getByLabelText('Instance ID')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(localStorage).toHaveLength(1)
    expect(localStorage.getItem(languageStorageKey)).toBe('en')
  })

  it('restores a saved English choice and switches back to Russian', async () => {
    localStorage.setItem(languageStorageKey, 'en')
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Connect your Telegram account' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Russian' }))
    expect(screen.getByRole('heading', { name: 'Подключите аккаунт Telegram' })).toBeInTheDocument()
    expect(localStorage.getItem(languageStorageKey)).toBe('ru')
  })

  it('formats message times with the selected locale', () => {
    const timestamp = new Date(2026, 0, 1, 16, 5).getTime()

    expect(formatMessageTime(timestamp, 'ru')).not.toBe(formatMessageTime(timestamp, 'en'))
  })
})
