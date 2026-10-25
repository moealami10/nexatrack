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
  form,
  children,
}: {
  variant?: ButtonVariant
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  className?: string
  /** Optional hover tooltip, e.g. why the action is disabled. */
  title?: string
  /** Submit a form by id when the button lives outside it (sticky footer). */
  form?: string
  children: React.ReactNode
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      form={form}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
