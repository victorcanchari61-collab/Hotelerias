import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  /** Con la forma "modulo.vista", p. ej. "inv.stock". */
  id: string
  label: string
  icon: LucideIcon
  badge?: string
  /** Vista que todavia no existe: se pinta con un punto tenue. */
  pending?: boolean
  /** No se pinta en el menu (queda reservada para mas adelante). */
  hidden?: boolean
}

export interface NavGroup {
  id: string
  label: string
  /** Color del modulo: coincide con un `data-sys` de styles/themes.css. */
  sys: string
  icon: LucideIcon
  items: NavItem[]
}

/** Encabezado del menu: icono en cuadro con degradado, titulo y subtitulo. */
export interface Brand {
  icon: LucideIcon
  name: string
  subtitle?: string
}
