import type { ReactNode } from 'react'
import { ButtonBase } from '@/shared/ui'

/**
 * La botonera de la columna Acciones de un listado: los mismos botones, del
 * mismo tamaño y con los mismos colores en todas las pantallas (el de editar
 * es siempre el cian, el de desactivar el ámbar, el de eliminar el rojo...).
 * Cada pantalla solo dice qué botones lleva.
 */
export function FilaAcciones({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center gap-2">{children}</div>
}

interface BotonFilaProps {
  color: 'info' | 'success' | 'warning' | 'danger' | 'default'
  /** Tooltip y nombre accesible: "Editar Ana Pérez". */
  titulo: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: ReactNode
}

export function BotonFila({ color, titulo, onClick, disabled, loading, children }: BotonFilaProps) {
  return (
    <ButtonBase
      color={color}
      size="md"
      className="flex items-center !px-3"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </ButtonBase>
  )
}
