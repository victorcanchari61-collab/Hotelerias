import type { Cotizacion } from '@/domain/entities/Portal'
import { tasaATexto } from '@/domain/moneda'
import { formatMonto, formatSoles, pluralNoches } from '../format'

/**
 * El desglose de un precio. Muestra EXACTAMENTE lo que el servidor calculó:
 * no recalcula nada. Un total que se calculara dos veces (aquí y allá) tarde o
 * temprano diría dos cosas distintas.
 */
export function ResumenPrecio({ cotizacion: c }: { cotizacion: Cotizacion }) {
  const conDescuento = c.descuento.totalCent > 0
  const m = (cent: number) => formatMonto(cent, c.moneda)

  return (
    <dl className="space-y-1.5 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-ink-muted">
          {m(c.precioNocheCent)} × {pluralNoches(c.noches)}
        </dt>
        <dd className="font-medium">{m(c.subtotalCent)}</dd>
      </div>

      {conDescuento && (
        <div className="flex justify-between gap-4 text-accent-ink">
          <dt>{c.descuento.nombre}</dt>
          <dd className="font-semibold">− {m(c.descuento.totalCent)}</dd>
        </div>
      )}

      <div className="flex justify-between gap-4 border-t border-line pt-2 text-base">
        <dt className="font-bold">Total</dt>
        <dd className="font-bold">{m(c.totalCent)}</dd>
      </div>

      {c.tipoCambioMicro !== null && (
        <p className="pt-1 text-xs text-ink-muted">
          Tipo de cambio de hoy: S/ {tasaATexto(c.tipoCambioMicro)} por {m(100).replace('.00', '')}. Equivale a{' '}
          {formatSoles(c.totalPenCent)}.
        </p>
      )}
    </dl>
  )
}
