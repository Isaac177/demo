import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { i18n } from '@/shared/config'

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}

async function enterValidCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('ID инстанса'), '410000000000')
  await user.type(screen.getByLabelText('API-токен'), 'test-token')
}

describe('instance connection', () => {
  beforeEach(async () => {
    localStorage.clear()
    await i18n.changeLanguage('ru')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not request with invalid credentials', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText('Введите ID инстанса.')).toBeInTheDocument()
    expect(screen.getByText('Введите токен инстанса.')).toBeInTheDocument()
  })

  it('prevents duplicate connection requests while connecting', async () => {
    let resolveRequest: (response: Response) => void = () => undefined
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRequest = resolve
    })
    const fetchMock = vi.fn(() => pendingResponse)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)
    await enterValidCredentials(user)

    const button = screen.getByRole('button', { name: 'Подключить инстанс' })
    await user.click(button)
    fireEvent.submit(button.closest('form')!)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Подключение' })).toBeDisabled()

    resolveRequest(new Response(JSON.stringify({ stateInstance: 'authorized' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(await screen.findByRole('heading', { name: 'Новое сообщение' })).toBeInTheDocument()
  })

  it('shows an actionable message for a rejected instance state', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ stateInstance: 'blocked' })))
    const user = userEvent.setup()
    render(<App />)
    await enterValidCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))

    expect(await screen.findByText(/Инстанс имеет статус «заблокирован»/)).toBeInTheDocument()
    expect(screen.getByText(/Авторизуйте его в личном кабинете GREEN-API/)).toBeInTheDocument()
  })

  it('shows a specific invalid-access error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ message: 'Unauthorized' }, 401)))
    const user = userEvent.setup()
    render(<App />)
    await enterValidCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))

    expect(await screen.findByText('GREEN-API отклонил данные доступа. Проверьте ID инстанса и API-токен.')).toBeInTheDocument()
  })

  it('shows a specific network error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Network unavailable'))))
    const user = userEvent.setup()
    render(<App />)
    await enterValidCredentials(user)

    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))

    expect(await screen.findByText('Не удалось связаться с GREEN-API. Проверьте подключение к интернету и повторите попытку.')).toBeInTheDocument()
  })

  it('clears credentials after disconnecting', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ stateInstance: 'authorized' })))
    const user = userEvent.setup()
    render(<App />)
    await enterValidCredentials(user)
    await user.click(screen.getByRole('button', { name: 'Подключить инстанс' }))
    expect(await screen.findByRole('heading', { name: 'Новое сообщение' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отключить инстанс' }))

    await waitFor(() => expect(screen.getByLabelText('ID инстанса')).toHaveValue(''))
    expect(screen.getByLabelText('API-токен')).toHaveValue('')
    expect(screen.getByLabelText('API-хост')).toHaveValue('https://4100.api.green-api.com')
  })
})
