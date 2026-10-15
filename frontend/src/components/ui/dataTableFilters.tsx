import type { ReactNode } from 'react'

/**
 * Tipos y utilidades puras del sistema de filtros de `SysDataTable`.
 *
 * Vive separado de `SysDataTable.tsx` y de `FiltersButton.tsx` porque no le
 * pertenece a ninguno de los dos: la tabla lo usa para filtrar `rows`
 * (`DataTableFilter`, `describeFilter` para el chip) y el panel de filtros lo
 * usa para armar el formulario (`FilterType`, `OPERATORS`). Sin este archivo,
 * cualquiera de los dos tendria que importar del otro.
 */

const OPERATORS = [
  { id: 'contains', label: 'contiene' },
  { id: 'equals', label: 'es igual a' },
  { id: 'between', label: 'entre' },
] as const

export { OPERATORS }

export type OperatorId = (typeof OPERATORS)[number]['id']

/**
 * Cómo se arma el filtro de una columna en el panel de "Filtros":
 *
 *   'text' (por defecto): los operadores de siempre + un input libre.
 *   'select': un unico operador ("es igual a") con una lista de
 *      `filterOptions`, para columnas de estado/categoria/tipo — no tiene
 *      sentido "contiene" ni "mayor que" sobre un enum.
 *   'date': un rango Desde/Hasta — para que filtrar por fecha no dependa de
 *      escribir un timestamp a mano en "mayor que".
 *
 * En los tres casos `column.value(row)` sigue siendo la fuente del dato: para
 * 'date' debe devolver un epoch (`new Date(row.fecha).getTime()`).
 */
export type FilterType = 'text' | 'select' | 'date'

export interface DataTableFilter {
  id: string
  column: string
  operator: OperatorId
  value: string
  /** Solo para operator: 'between' — el extremo superior del rango. */
  valueTo?: string
}

/** Texto legible de lo que compara un filtro, para el chip y la lista del panel. */
export function describeFilter(f: DataTableFilter): ReactNode {
  if (f.operator === 'between') {
    // yyyy-mm-dd del calendario, mostrado como se lee aquí: 27/09/2026.
    const dia = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso)
    if (f.value && f.valueTo && f.value === f.valueTo) return <b>{dia(f.value)}</b>
    if (f.value && f.valueTo) return <><b>{dia(f.value)}</b> — <b>{dia(f.valueTo)}</b></>
    return <b>{f.value ? `desde ${dia(f.value)}` : `hasta ${dia(f.valueTo ?? '')}`}</b>
  }
  return (
    <>
      <span className="opacity-70">{OPERATORS.find((o) => o.id === f.operator)?.label}</span>{' '}
      <b>{f.value}</b>
    </>
  )
}
