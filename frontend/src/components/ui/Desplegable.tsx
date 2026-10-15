import type { ReactNode } from 'react'
import { ListaDesplegable } from './ListaDesplegable'
import { cn } from './cn'
import type { FieldSize } from './Input'

export interface OpcionDesplegable {
  value: number | string
  label: string
  /** Dato de la derecha, en gris: una equivalencia, un codigo. */
  detalle?: ReactNode
  /** Aclaracion bajo el nombre. */
  nota?: string
  /** Se ve pero no se puede elegir: un empleado que ya tiene usuario, por ejemplo. */
  deshabilitada?: boolean
}

export interface DesplegableProps {
  label?: string
  value: number | string
  options: OpcionDesplegable[]
  onChange: (value: number | string) => void
  /** Texto cuando no hay nada elegido. */
  placeholder?: string
  optional?: boolean
  /** Widget a la derecha de la etiqueta, normalmente un BotonMas. */
  hint?: ReactNode
  error?: string
  disabled?: boolean
  /** Alto del campo, igual que en un Input. En una celda de tabla, 'sm'. */
  size?: FieldSize
  className?: string
}

/**
 * Campo para elegir de una lista.
 *
 * Reemplaza al `select` nativo, cuyo menu lo dibuja el sistema operativo: se
 * veia distinto en cada maquina y no se parecia al resto del panel. Este abre
 * la misma lista de [ListaDesplegable], con el ancho del campo, el elegido
 * marcado con un check y el mismo borde y altura que un Input.
 */
export function Desplegable({
  label,
  value,
  options,
  onChange,
  placeholder = 'Elegir',
  optional,
  hint,
  error,
  disabled,
  size = 'md',
  className,
}: DesplegableProps) {
  const elegida = options.find((o) => o.value === value)

  return (
    <div className={cn('w-full', className)}>
      {(label || hint) && (
        // items-center y no baseline: si la etiqueta parte en dos lineas, el
        // boton de la derecha se quedaba arriba y descuadraba la fila.
        <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
          {label && (
            <span className="ui-label truncate">
              {label}
              {optional && <span className="ml-1.5 font-normal text-ink-soft">(opcional)</span>}
            </span>
          )}
          {hint}
        </div>
      )}

      <ListaDesplegable
        variante="campo"
        size={size}
        resumen={elegida?.label ?? placeholder}
        seleccionado={value}
        deshabilitado={disabled}
        error={Boolean(error)}
        vacio="No hay opciones"
        items={options.map((o) => ({
          id: o.value,
          label: o.label,
          detalle: o.detalle,
          nota: o.nota,
          deshabilitado: o.deshabilitada,
          onClick: o.deshabilitada ? undefined : () => onChange(o.value),
        }))}
        className={cn(!elegida && 'text-ink-soft')}
      />

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
