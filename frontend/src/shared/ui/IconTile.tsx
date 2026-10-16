import type { LucideIcon } from 'lucide-react'
import { cn } from './cn'

type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { box: string; icon: number }> = {
  sm: { box: 'size-7 rounded-lg', icon: 15 },
  md: { box: 'size-9 rounded-xl', icon: 18 },
  lg: { box: 'size-11 rounded-xl', icon: 22 },
}

interface Props {
  icon: LucideIcon
  size?: Size
  className?: string
}

/**
 * Icono blanco sobre un cuadro con degradado en diagonal entre los DOS colores
 * del tema (--grad-start -> --grad-end), p. ej. naranja rojizo -> ambar, con un
 * brillo suave del color principal. Toma el tema del data-sys mas cercano.
 */
export function IconTile({ icon: Icon, size = 'md', className }: Props) {
  const { box, icon } = SIZES[size]

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-accent-on',
        '[background-image:var(--grad-tile)]',
        'shadow-[0_6px_14px_-6px_color-mix(in_oklab,var(--grad-start)_60%,transparent)]',
        box,
        className,
      )}
    >
      <Icon size={icon} strokeWidth={2} />
    </span>
  )
}
