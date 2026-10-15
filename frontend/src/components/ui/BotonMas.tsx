import { Plus } from 'lucide-react'
import { cn } from './cn'

export interface BotonMasProps {
  /** Que se va a crear: se usa para el texto de accesibilidad y el tooltip. */
  label: string
  onClick: () => void
  className?: string
}

/**
 * Boton redondo de "+" junto a la etiqueta de un campo.
 *
 * Sirve para crear ahi mismo lo que falta en un desplegable: si al dar de alta
 * un producto no existe la categoria, se crea sin salir del formulario y sin
 * perder lo escrito.
 *
 * Va en el hueco `hint` de Input y Select, que es el espacio a la derecha de la
 * etiqueta.
 */
export function BotonMas({ label, onClick, className }: BotonMasProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-full',
        'bg-[rgb(var(--sys-rgb)/0.12)] text-[rgb(var(--sys-ink-rgb))]',
        'transition-transform duration-150 hover:scale-110',
        className,
      )}
    >
      <Plus size={13} strokeWidth={2.5} />
    </button>
  )
}
