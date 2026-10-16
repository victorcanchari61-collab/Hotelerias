import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  size?: number
  className?: string
}

/**
 * Icono de lucide en UN solo color: el del texto que lo rodea (currentColor).
 *
 * En Ecommerce este componente pintaba el trazo con un degradado de dos
 * colores del tema. Aqui no hay degradado: el icono toma el color de la fila
 * del menu (--nav-ink), igual que la letra, asi que ambos cambian juntos.
 */
export function ThemedIcon({ icon: Icon, size = 18, className }: Props) {
  return <Icon size={size} className={className} stroke="currentColor" aria-hidden />
}
