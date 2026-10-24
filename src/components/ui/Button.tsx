export type ButtonVariant = 'primary' | 'secondary' | 'danger'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-700',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-300 hover:bg-red-50',
}

export function Button({
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  className = '',
  title,
  children,
}: {
  variant?: ButtonVariant
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  className?: string
  /** Optional hover tooltip, e.g. why the action is disabled. */
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
