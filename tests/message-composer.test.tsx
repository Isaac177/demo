import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SendMessageForm } from '@/features/send-message'
import { i18n } from '@/shared/config'

function renderComposer(onSend = vi.fn().mockResolvedValue(true), isAvailable = true, isSending = false) {
  render(<SendMessageForm isAvailable={isAvailable} isSending={isSending} onSend={onSend} />)
  return { onSend, textbox: screen.getByLabelText('Message') }
}

describe('Telegram message composer', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('sends a message containing exactly 4096 characters', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)
    await user.click(textbox)
    await user.paste('a'.repeat(4096))
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(onSend).toHaveBeenCalledOnce()
    expect(onSend).toHaveBeenCalledWith('a'.repeat(4096))
  })

  it('rejects a message containing 4097 characters', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)
    await user.click(textbox)
    await user.paste('a'.repeat(4097))

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(screen.getByText('Telegram text messages can contain up to 4,096 characters.')).toBeInTheDocument()
    expect(screen.getByText('4097/4096')).toBeInTheDocument()
  })

  it('counts emoji as one character', async () => {
    const user = userEvent.setup()
    const { textbox } = renderComposer()

    await user.type(textbox, '😀')

    expect(screen.getByText('1/4096')).toBeInTheDocument()
  })

  it('rejects a whitespace-only message', () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const { textbox } = renderComposer(onSend)

    fireEvent.change(textbox, { target: { value: '   ' } })
    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Write a message before sending.')
  })

  it('trims outer whitespace and preserves internal line breaks', () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const { textbox } = renderComposer(onSend)

    fireEvent.change(textbox, { target: { value: '  first\n\nsecond  ' } })
    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledWith('first\n\nsecond')
  })

  it('inserts a line break with Shift and Enter without sending', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)

    await user.type(textbox, 'first{Shift>}{Enter}{/Shift}second')

    expect(textbox).toHaveValue('first\nsecond')
    expect(onSend).not.toHaveBeenCalled()
  })

  it('sends with Enter and prevents a duplicate pending submission', async () => {
    let finishSend: (sent: boolean) => void = () => undefined
    const onSend = vi.fn(() => new Promise<boolean>((resolve) => {
      finishSend = resolve
    }))
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)

    await user.type(textbox, 'Hello')
    fireEvent.keyDown(textbox, { key: 'Enter' })
    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(onSend).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    finishSend(true)
  })

  it('does not send while offline', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend, false)

    await user.type(textbox, 'Hello')
    fireEvent.keyDown(textbox, { key: 'Enter' })

    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('preserves the draft after a failed send', async () => {
    const onSend = vi.fn().mockResolvedValue(false)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)

    await user.type(textbox, 'Keep this draft')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(textbox).toHaveValue('Keep this draft')
  })

  it('clears the draft only after a successful send', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    const { textbox } = renderComposer(onSend)

    await user.type(textbox, 'Sent draft')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(textbox).toHaveValue('')
  })
})
