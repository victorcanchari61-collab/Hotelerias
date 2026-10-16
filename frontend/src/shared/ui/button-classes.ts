import { cn } from './cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  // Color del modulo activo (--accent, ver styles/themes.css): el boton
  // principal toma el color del modulo abierto. Fuera de un modulo cae al azul
  // de marca, que es el tema por defecto en :root.
  primary:
    '[background-image:var(--grad-tile)] text-[var(--accent-on)] shadow-sm hover:not-disabled:brightness-95 active:not-disabled:brightness-90',
  secondary: 'bg-surface text-ink border border-line hover:not-disabled:bg-surface-alt',
  ghost: 'bg-transparent text-[var(--accent-ink)] hover:not-disabled:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]',
}

// Mismas alturas que los campos, para que un boton junto a un input calce.
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-[var(--height-field-sm)] px-3 text-sm',
  md: 'h-[var(--height-field-md)] px-5 text-sm',
  lg: 'h-[var(--height-field-lg)] px-7 text-base',
}

type ClassOptions = {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
}

/**
 * Las clases de un boton, para pintar con el mismo aspecto algo que no es un
 * <button> (por ejemplo un <Link> de react-router).
 */
export function buttonClasses({ variant = 'primary', size = 'md', block = false, className }: ClassOptions = {}) {
  return cn(
    'inline-flex cursor-pointer items-center justify-center gap-2 rounded-field font-semibold',
    'transition-colors duration-150',
    'focus-visible:ring-4 focus-visible:ring-[color-mix(in_oklab,var(--accent)_25%,transparent)] focus-visible:outline-none',
    'disabled:cursor-not-allowed disabled:opacity-60',
    variant === 'ghost' ? 'px-2 py-1 text-sm' : SIZES[size],
    VARIANTS[variant],
    block && 'w-full',
    className,
  )
}
