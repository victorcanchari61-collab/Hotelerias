import type { ReactNode } from 'react'
import { cn } from './cn'

/**
 * Significado de la accion. Cada uno tiene SU color, igual en todos los
 * modulos: eliminar es rojo en Usuarios, en TMS y en Inventario.
 */
export type RowActionTone = 'view' | 'edit' | 'danger' | 'success' | 'warning' | 'neutral'

const TONES: Record<RowActionTone, string> = {
  /** Ver detalle: azul. */
  view: 'text-sky-600 hover:bg-sky-50 hover:text-sky-700',
  /** Editar: violeta. */
  edit: 'text-violet-600 hover:bg-violet-50 hover:text-violet-700',
  /** Anular / eliminar: rojo. */
  danger: 'text-red-600 hover:bg-red-50 hover:text-red-700',
  /** Confirmar / recibir: verde. */
  success: 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700',
  /** Devolver y otras acciones intermedias: ámbar. */
  warning: 'text-amber-600 hover:bg-amber-50 hover:text-amber-700',
  neutral: 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
}

export interface RowActionProps {
  /** Texto del tooltip y de la etiqueta accesible. */
  label: string
  onClick?: () => void
  tone?: RowActionTone
  disabled?: boolean
  /**
   * Motivo por el que la accion no esta disponible. Se muestra al pasar el
   * mouse: un boton que desaparece no explica nada, uno apagado con su razon
   * si.
   */
  disabledReason?: string
  children: ReactNode
  className?: string
}

/**
 * Boton de icono de la columna Acciones.
 *
 * Los colores son FIJOS por significado y no siguen el acento del modulo: asi
 * el usuario reconoce "eliminar" por su rojo en cualquier pantalla del sistema.
 */
export function RowAction({
  label,
  onClick,
  tone = 'edit',
  disabled = false,
  disabledReason,
  children,
  className,
}: RowActionProps) {
  return (
    <button
      type="button"
      title={disabled ? (disabledReason ?? label) : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-md p-1.5 transition-colors',
        disabled ? 'cursor-not-allowed text-slate-300' : cn('cursor-pointer', TONES[tone]),
        className,
      )}
    >
      {children}
    </button>
  )
}
