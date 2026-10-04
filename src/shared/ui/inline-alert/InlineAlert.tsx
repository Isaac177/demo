import { AlertCircle, Info } from 'lucide-react'
import type { ReactNode } from 'react'

interface InlineAlertProps {
  children: ReactNode
  tone?: 'error' | 'info'
}

export function InlineAlert({ children, tone = 'error' }: InlineAlertProps) {
  const Icon = tone === 'error' ? AlertCircle : Info
  return (
    <div className={`inline-alert inline-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" size={18} />
      <span>{children}</span>
    </div>
  )
}
