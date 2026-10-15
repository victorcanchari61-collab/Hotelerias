import type { ReactNode } from 'react'
import { ListaDesplegable } from './ListaDesplegable'
import { cn } from './cn'
import type { FieldSize } from './Input'
import type { OpcionDesplegable } from './Desplegable'

export interface DesplegableMultipleProps {
  label?: string
  /** Los valores marcados, en el orden en que se marcaron. */
  value: Array<number | string>
  options: OpcionDesplegable[]
  onChange: (value: Array<number | string>) => void
  /** Texto cuando no hay nada marcado. */
  placeholder?: string
  optional?: boolean
  /** Widget a la derecha de la etiqueta. */
  hint?: ReactNode
  error?: string
  disabled?: boolean
  size?: FieldSize
  className?: string
}

/**
 * Campo para elegir VARIOS de una lista.
 *
 * Hermano de [Desplegable]: mismo borde, misma altura y la misma lista con buscador, pero cada opción se marca
 * y se desmarca sin cerrar el panel, para poder elegir de corrido. El botón cerrado dice qué hay marcado:
 * los nombres si caben ("Vendedor, Almacenero") o cuántos son.
 *
 * El orden importa cuando quien lo usa lo necesita (el primer rol es el principal): se conserva el orden en que
 * se fueron marcando.
 */
export function DesplegableMultiple({
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
}: DesplegableMultipleProps) {
  const marcadas = value
    .map((v) => options.find((o) => o.value === v))
    .filter((o): o is OpcionDesplegable => o !== undefined)

  const resumen =
    marcadas.length === 0
      ? placeholder
      : marcadas.length <= 2
        ? marcadas.map((o) => o.label).join(', ')
        : `${marcadas.length} elegidos`

  const alternar = (v: number | string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <div className={cn('w-full', className)}>
      {(label || hint) && (
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
        resumen={resumen}
        seleccionados={value}
        deshabilitado={disabled}
        error={Boolean(error)}
        vacio="No hay opciones"
        items={options.map((o) => ({
          id: o.value,
          label: o.label,
          detalle: o.detalle,
          nota: o.nota,
          deshabilitado: o.deshabilitada,
          onClick: o.deshabilitada ? undefined : () => alternar(o.value),
        }))}
        className={cn(marcadas.length === 0 && 'text-ink-soft')}
      />

      {/* Lo marcado, legible aunque el botón solo diga "3 elegidos". */}
      {marcadas.length > 2 && (
        <p className="mt-1.5 text-xs text-ink-soft">{marcadas.map((o) => o.label).join(', ')}</p>
      )}

      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  )
}
