import type { InputHTMLAttributes } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

export function Field({ error, hint, id, label, ...props }: FieldProps) {
  const descriptionId = error || hint ? `${id}-description` : undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        className="field__input"
        id={id}
        {...props}
      />
      {(error || hint) && <span className={`field__message ${error ? 'field__message--error' : ''}`} id={descriptionId} role={error ? 'alert' : undefined}>{error || hint}</span>}
    </div>
  )
}
