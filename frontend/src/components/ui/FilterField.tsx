import { Desplegable } from './Desplegable'
import { DateRangePicker } from './DateRangePicker'
import type { FilterType } from './dataTableFilters'

/**
 * El control de un filtro, segun el tipo de columna. Es la pieza que se
 * repetia casi igual entre el panel de escritorio y el flujo de movil de
 * `FiltersButton`: mover el "que control corresponde a cada `filterType`"
 * aca hace que agregar un tipo nuevo (o cambiarlo) se haga en un solo lugar.
 */
export interface FilterFieldProps {
  type: FilterType
  /** Opciones del control cuando `type: 'select'`. */
  options?: { value: string; label: string }[]
  value: string
  /** Solo para `type: 'date'` — el extremo superior del rango. */
  valueTo?: string
  onChange: (value: string) => void
  onChangeTo?: (value: string) => void
  /** Solo para `type: 'text'` — Enter confirma, igual que un buscador. */
  onEnter?: () => void
  textPlaceholder?: string
}

export function FilterField({
  type,
  options = [],
  value,
  valueTo = '',
  onChange,
  onChangeTo,
  onEnter,
  textPlaceholder = 'Valor',
}: FilterFieldProps) {
  if (type === 'select') {
    return (
      <Desplegable
        value={value}
        onChange={(v) => onChange(String(v))}
        placeholder="Todos"
        options={[{ value: '', label: 'Todos' }, ...options]}
      />
    )
  }

  if (type === 'date') {
    return (
      <DateRangePicker
        from={value}
        to={valueTo}
        onChange={(from, to) => {
          onChange(from)
          onChangeTo?.(to)
        }}
      />
    )
  }

  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      placeholder={textPlaceholder}
      className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-400"
    />
  )
}
