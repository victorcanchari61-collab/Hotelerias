import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  block?: boolean
  loading?: boolean
  iconRight?: ReactNode
}

const VARIANTS: Record<Variant, string> = {
  // Color del modulo abierto (--sys-rgb, definido por DashboardLayout): el
  // boton principal de Clientes sale navy, el de Ajustes verde, etc. Fuera de
  // un modulo (login) cae al azul de marca, que es el valor por defecto de
  // --sys-rgb en :root.
  primary:
    'bg-[rgb(var(--sys-rgb))] text-[var(--sys-on)] shadow-sm hover:not-disabled:bg-[rgb(var(--sys-dark-rgb))] active:not-disabled:bg-[rgb(var(--sys-dark-rgb))]',
  secondary: 'bg-surface text-ink border border-line hover:not-disabled:bg-surface-alt',
  ghost: 'bg-transparent text-[rgb(var(--sys-ink-rgb))] hover:not-disabled:bg-[rgb(var(--sys-rgb)/0.08)]',
}

// Mismas alturas que los campos, para que un boton junto a un input calce.
const SIZES: Record<Size, string> = {
  sm: 'h-[var(--height-field-sm)] px-3 text-sm',
  md: 'h-[var(--height-field-md)] px-5 text-sm',
  lg: 'h-[var(--height-field-lg)] px-7 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  iconRight,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-field font-semibold',
        'transition-colors duration-150',
        'focus-visible:ring-4 focus-visible:ring-[rgb(var(--sys-rgb)/0.25)] focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'ghost' ? 'px-2 py-1 text-sm' : SIZES[size],
        VARIANTS[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      )}
      {children}
      {!loading && iconRight}
    </button>
  )
}
