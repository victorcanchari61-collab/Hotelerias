import { useEffect, useState } from 'react'
import { Filter, RotateCcw } from 'lucide-react'
import { cn } from './cn'
import { Modal } from './Modal'
import { Button } from './Button'
import { FilterField } from './FilterField'
import type { DataTableFilter, FilterType } from './dataTableFilters'
import type { DataTableColumn } from './SysDataTable'

/**
 * Boton de "Filtros" de `SysDataTable`, con sus dos flujos, ambos dentro del
 * mismo `Modal` (con su fondo oscuro y su cierre con Escape/clic afuera —
 * reimplementar eso a mano fue lo que causaba que un clic dentro de un
 * `Desplegable` o el calendario del rango de fechas cerrara el panel entero):
 *
 * El panel es el MISMO en cualquier tamano: todos los filtros a la vista, uno
 * por columna, con Restablecer y Aplicar. En movil se veia otro distinto —se
 * agregaban de a uno eligiendo columna, operador y valor— y el mismo boton
 * abria dos formularios que no se parecian en nada, asi que lo aprendido en el
 * escritorio no servia en el telefono.
 *
 * El operador no se elige: lo decide el tipo de la columna —rango para fechas,
 * igualdad para listas, contiene para texto—, que es lo que se quiere el 99%
 * de las veces y una decision menos que tomar.
 *
 * Que control pintar segun `filterType` lo resuelve `FilterField`.
 */

export function FiltersButton<T>({
  columns,
  filters,
  setFilters,
  iniciales = [],
  open,
  onToggle,
  onClose,
}: {
  columns: DataTableColumn<T>[]
  filters: DataTableFilter[]
  setFilters: React.Dispatch<React.SetStateAction<DataTableFilter[]>>
  /** Con los que arranca la tabla: Restablecer vuelve a estos. */
  iniciales?: DataTableFilter[]
  open: boolean
  onToggle: () => void
  onClose: () => void
}) {
  const filterable = columns.filter((c) => c.filterable !== false)

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Filtros"
        title="Filtros"
        className={cn(
          'relative flex h-[38px] w-[38px] items-center justify-center rounded-lg transition-colors',
          'text-[rgb(var(--sys-ink-rgb))] hover:bg-[rgb(var(--sys-rgb)/0.12)]',
          open && 'bg-[rgb(var(--sys-rgb)/0.12)]',
        )}
      >
        <Filter size={17} />
        {filters.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--sys-rgb))] px-1 text-[10px] leading-none font-semibold text-[var(--sys-on)] ring-2 ring-white">
            {filters.length}
          </span>
        )}
      </button>

      {/* centrado en movil (hoja inferior), pegado a la derecha y centrado
          verticalmente en escritorio — nunca colgando de donde haya quedado
          el boton en la pantalla. */}
      <Modal open={open} title="Filtros" onClose={onClose} size="sm" className="sm:justify-end sm:pr-10">
        <div className="flex flex-col gap-4">
          <PanelFiltros
            filterable={filterable}
            filters={filters}
            setFilters={setFilters}
            iniciales={iniciales}
            open={open}
            onClose={onClose}
          />
        </div>
      </Modal>
    </>
  )
}

/* ------------------------------ panel de escritorio ------------------------------ */

function PanelFiltros<T>({
  filterable,
  filters,
  setFilters,
  iniciales,
  open,
  onClose,
}: {
  filterable: DataTableColumn<T>[]
  filters: DataTableFilter[]
  setFilters: React.Dispatch<React.SetStateAction<DataTableFilter[]>>
  iniciales: DataTableFilter[]
  open: boolean
  onClose: () => void
}) {
  // Se arma de nuevo cada vez que se abre, a partir de lo ya aplicado.
  const [draft, setDraft] = useState<Record<string, { value: string; valueTo: string }>>({})

  useEffect(() => {
    if (!open) return
    const inicial: Record<string, { value: string; valueTo: string }> = {}
    for (const f of filters) inicial[f.column] = { value: f.value, valueTo: f.valueTo ?? '' }
    setDraft(inicial)
  }, [open, filters])

  const setValue = (key: string, campo: 'value' | 'valueTo', valor: string) =>
    setDraft((prev) => ({
      ...prev,
      [key]: { value: prev[key]?.value ?? '', valueTo: prev[key]?.valueTo ?? '', [campo]: valor },
    }))

  const aplicar = () => {
    const nuevos: DataTableFilter[] = []
    for (const col of filterable) {
      const d = draft[col.key]
      if (!d) continue
      const tipo: FilterType = col.filterType ?? 'text'
      if (tipo === 'date') {
        if (d.value || d.valueTo) {
          nuevos.push({ id: col.key, column: col.key, operator: 'between', value: d.value, valueTo: d.valueTo })
        }
      } else if (d.value?.trim()) {
        nuevos.push({
          id: col.key,
          column: col.key,
          operator: tipo === 'select' ? 'equals' : 'contains',
          value: d.value,
        })
      }
    }
    // Un filtro de inicio que se dejó vacío vuelve a su valor: la vista lo
    // aplica igual, y así se sigue viendo cuál es.
    for (const inicial of iniciales) {
      if (!nuevos.some((f) => f.column === inicial.column)) nuevos.push(inicial)
    }
    setFilters(nuevos)
    onClose()
  }

  const restablecer = () => {
    const inicial: Record<string, { value: string; valueTo: string }> = {}
    for (const f of iniciales) inicial[f.column] = { value: f.value, valueTo: f.valueTo ?? '' }
    setDraft(inicial)
    setFilters(iniciales)
  }

  return (
    <>
      <div className="flex flex-col gap-3.5">
        {filterable.map((col) => {
          const tipo: FilterType = col.filterType ?? 'text'
          const d = draft[col.key] ?? { value: '', valueTo: '' }
          return (
            <div key={col.key} className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">{col.label}</p>
              <FilterField
                type={tipo}
                options={col.filterOptions}
                value={d.value}
                valueTo={d.valueTo}
                onChange={(v) => setValue(col.key, 'value', v)}
                onChangeTo={(v) => setValue(col.key, 'valueTo', v)}
                onEnter={aplicar}
                textPlaceholder={`Buscar ${col.label.toLowerCase()}...`}
              />
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button type="button" size="sm" variant="secondary" onClick={restablecer}>
          <RotateCcw size={13} />
          Restablecer
        </Button>
        <Button type="button" size="sm" onClick={aplicar} className="flex-1">
          Aplicar filtros
        </Button>
      </div>
    </>
  )
}
