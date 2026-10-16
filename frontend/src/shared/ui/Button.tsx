import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClasses } from './button-classes'
import type { ButtonSize, ButtonVariant } from './button-classes'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  iconRight?: ReactNode
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
      className={buttonClasses({ variant, size, block, className })}
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
