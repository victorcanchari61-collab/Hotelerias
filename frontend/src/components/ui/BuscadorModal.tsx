import { Modal } from './Modal'
import { SysDataTable } from './SysDataTable'
import type { SysDataTableProps } from './SysDataTable'

export interface BuscadorModalProps<T> extends Omit<SysDataTableProps<T>, 'actions' | 'onRowClick'> {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  /** Se llama con la fila elegida; el modal se cierra solo después. */
  onSeleccionar: (row: T) => void
}

/**
 * Búsqueda avanzada: elegir uno de una lista larga con los filtros por
 * columna, orden y buscador general de [SysDataTable], dentro de un modal.
 *
 * Complementa a [BuscadorCampo] — ese es para el caso rápido (escribir dos
 * letras y elegir); este es para cuando esa búsqueda simple no alcanza y
 * hace falta filtrar por varias columnas a la vez. Se elige haciendo clic en
 * la fila entera.
 */
export function BuscadorModal<T>({
  open,
  onClose,
  title,
  description,
  onSeleccionar,
  ...table
}: BuscadorModalProps<T>) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose} size="lg">
      <SysDataTable
        {...table}
        onRowClick={(row) => {
          onSeleccionar(row)
          onClose()
        }}
      />
    </Modal>
  )
}
