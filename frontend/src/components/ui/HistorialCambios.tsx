import { Badge } from './Badge'
import { fechaHora } from '../../lib/fechas'
import { SysDataTable } from './SysDataTable'
import type { DataTableColumn } from './SysDataTable'
import type { AuditoriaResponse } from '../../features/config'

/** Un número de la bitácora. Devuelve null si el campo no cambió en ese registro. */
function numero(valores: Record<string, unknown> | null | undefined, campo: string): number | null {
  const valor = valores?.[campo]
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

/** Cantidad legible: sin decimales cuando es entero, para no leer "5.0000". */
const cifra = (n: number | null) =>
  n === null ? '—' : Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))

const fueAnulada = (r: AuditoriaResponse) => r.valoresNuevos?.Anulado === true

export interface HistorialCambiosProps {
  registros: AuditoriaResponse[]
  cargando?: boolean
}

/**
 * Qué se le cambió a los productos del documento después de crearlo: una fila
 * por corrección, con la cantidad anterior, la nueva y la diferencia.
 *
 * No muestra el alta: lo que se pidió de entrada ya se ve en el detalle. La
 * columna de diferencia es la que de verdad se usa en almacén — dice cuánto
 * falta pesar de un aumento, o cuánto se dejó de despachar.
 */
export function HistorialCambios({ registros, cargando }: HistorialCambiosProps) {
  const columns: DataTableColumn<AuditoriaResponse>[] = [
    {
      key: 'producto',
      label: 'Producto',
      value: (r) => r.descripcion ?? '',
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate font-medium text-ink">{r.descripcion ?? '—'}</span>
          {fueAnulada(r) && <Badge tone="danger">Anulado</Badge>}
        </span>
      ),
    },
    {
      key: 'cantidadAnterior',
      label: 'Cantidad anterior',
      align: 'right',
      value: (r) => numero(r.valoresAnteriores, 'CantidadPresentacion') ?? 0,
      render: (r) => (
        <span className="text-ink-soft">{cifra(numero(r.valoresAnteriores, 'CantidadPresentacion'))}</span>
      ),
    },
    {
      key: 'cantidadActual',
      label: 'Cantidad actual',
      align: 'right',
      value: (r) => numero(r.valoresNuevos, 'CantidadPresentacion') ?? 0,
      render: (r) => (
        <span className="font-semibold text-ink">{cifra(numero(r.valoresNuevos, 'CantidadPresentacion'))}</span>
      ),
    },
    {
      key: 'diferencia',
      label: 'Diferencia',
      align: 'right',
      value: (r) =>
        (numero(r.valoresNuevos, 'CantidadPresentacion') ?? 0) -
        (numero(r.valoresAnteriores, 'CantidadPresentacion') ?? 0),
      render: (r) => {
        const antes = numero(r.valoresAnteriores, 'CantidadPresentacion')
        const ahora = numero(r.valoresNuevos, 'CantidadPresentacion')
        if (antes === null || ahora === null) return <span className="text-ink-soft">—</span>

        const delta = ahora - antes
        if (delta === 0) return <span className="text-ink-soft">—</span>

        return (
          <span className={delta > 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
            {delta > 0 ? '+' : ''}
            {cifra(delta)}
          </span>
        )
      },
    },
    {
      key: 'precio',
      label: 'Precio',
      align: 'right',
      value: (r) => numero(r.valoresNuevos, 'PrecioUnitario') ?? 0,
      render: (r) => {
        const antes = numero(r.valoresAnteriores, 'PrecioUnitario')
        const ahora = numero(r.valoresNuevos, 'PrecioUnitario')
        if (ahora === null || antes === null || antes === ahora) {
          return <span className="text-ink-soft">—</span>
        }

        return (
          <span>
            <span className="text-ink-soft line-through">{antes.toFixed(2)}</span>
            <span className="mx-1 text-ink-soft">→</span>
            <span className="font-semibold text-ink">{ahora.toFixed(2)}</span>
          </span>
        )
      },
    },
    {
      key: 'fecha',
      label: 'Cuándo y quién',
      value: (r) => new Date(r.fecha).getTime(),
      render: (r) => (
        <span className="text-ink-soft">
          {fechaHora(r.fecha)} · {r.usuario}
        </span>
      ),
    },
  ]

  return (
    <SysDataTable
      columns={columns}
      rows={registros}
      toolbar={false}
      empty={
        cargando ? 'Cargando historial...' : 'No se editó ningún producto: está tal cual se registró.'
      }
    />
  )
}
