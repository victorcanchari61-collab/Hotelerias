import type { ReactNode } from 'react'
import { cn } from './cn'
import { FilaStats } from './FilaStats'
import { PageHeader } from './PageHeader'
import { SysDataTable } from './SysDataTable'
import type { SysDataTableProps } from './SysDataTable'

export interface ListPageProps<T> extends Omit<SysDataTableProps<T>, 'actions'> {
  /** Icono de la cabecera, en pastilla con el color del sistema activo. */
  icon?: ReactNode
  title: string
  description?: string
  /** Botones de la cabecera, normalmente el de crear. */
  actions?: ReactNode
  /** Tarjetas de indicadores sobre la tabla. */
  stats?: ReactNode
  /** Aviso o error, arriba de todo. */
  alert?: ReactNode
  /** Bloque destacado entre los indicadores y la tabla. */
  banner?: ReactNode
  /** Botones de cada fila (columna Acciones de la tabla). */
  rowActions?: (row: T) => ReactNode
  /** Nota al pie, bajo la tabla. */
  note?: ReactNode
  /** Modales y demas piezas sueltas de la vista. */
  children?: ReactNode
}

/**
 * Vista de listado: cabecera, indicadores y tabla, con el mismo armado en
 * todas las pantallas.
 *
 * Es el UNICO lugar donde se decide como se compone un listado: que lleva
 * tarjeta y que no, cuanto espacio hay entre bloques, donde van los botones.
 * Un cambio de diseno se hace aqui y lo toman todas las vistas.
 *
 * Lo que no sea de la cabecera se pasa tal cual a SysDataTable.
 */
export function ListPage<T>({
  icon,
  title,
  description,
  actions,
  stats,
  alert,
  banner,
  rowActions,
  note,
  children,
  className,
  ...table
}: ListPageProps<T>) {
  return (
    <div className={cn('space-y-5', className)}>
      <PageHeader icon={icon} title={title} description={description} actions={actions} />

      {alert}

      {/* En movil, una fila que se desliza; desde sm, una grilla. Ver FilaStats. */}
      {stats && <FilaStats>{stats}</FilaStats>}

      {banner}

      {/* La tabla trae su propio borde: no se envuelve en tarjeta. */}
      <div>
        <SysDataTable {...table} actions={rowActions} />
        {note && <div className="mt-3 text-xs text-ink-soft">{note}</div>}
      </div>

      {children}
    </div>
  )
}
