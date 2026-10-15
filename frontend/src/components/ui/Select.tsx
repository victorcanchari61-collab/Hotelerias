import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { FIELD_HEIGHT } from './Input'
import type { FieldSize } from './Input'
import { cn } from './cn'

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string
  /** sm 36px (tablas) · md 40px (formularios) · lg 48px. */
  size?: FieldSize
  error?: string
  /** Marca "(opcional)" junto a la etiqueta. */
  optional?: boolean
  hint?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Desplegable del sistema, hermano de Input.
 *
 * Misma altura, mismo borde y el mismo foco sobrio: sin esto cada vista
 * terminaba copiando una cadena larga de clases para su select, y bastaba con
 * que una se quedara vieja para que el formulario dejara de verse parejo.
 */
export function Select({
  label,
  size = 'md',
  error,
  optional,
  hint,
  className,
  children,
  ...rest
}: SelectProps) {
  const id = useId()

  return (
    <div className={cn('w-full', className)}>
      {(label || hint) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && (
            <label className="ui-label" htmlFor={id}>
              {label}
              {optional && <span className="ml-1.5 font-normal text-ink-soft">(opcional)</span>}
            </label>
          )}
          {hint}
        </div>
      )}

      <select
        id={id}
        aria-invalid={Boolean(error)}
        className={cn(
          'w-full cursor-pointer rounded-field border bg-surface px-3 text-ink outline-none',
          'focus:border-ink-soft',
          FIELD_HEIGHT[size],
          size === 'sm' ? 'text-[13px]' : 'text-sm',
          error ? 'border-red-600' : 'border-line',
        )}
        {...rest}
      >
        {children}
      </select>

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
