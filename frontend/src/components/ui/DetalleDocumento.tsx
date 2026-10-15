import type { ReactNode } from 'react'

export interface ColumnaDetalleProducto<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
}

export interface TablaProductosDetalleProps<T> {
  filas: T[]
  rowKey: (row: T) => string | number
  titulo: (row: T) => string
  subtitulo: (row: T) => string
  /** Un grupo por fila de la tarjeta móvil; en escritorio se ven todas como columnas. */
  grupos: ColumnaDetalleProducto<T>[][]
}

/**
 * La lista de productos de un documento: tabla en escritorio (como una
 * factura de verdad), tarjetas en móvil (una por producto, con sus datos en
 * columnas) — la misma información, acomodada distinto según el ancho.
 */
export function TablaProductosDetalle<T>({
  filas,
  rowKey,
  titulo,
  subtitulo,
  grupos,
}: TablaProductosDetalleProps<T>) {
  const columnas = grupos.flat()

  return (
    <>
      <div className="hidden overflow-x-auto rounded-field border border-line sm:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-surface-alt text-left text-[10.5px] font-semibold tracking-wide text-ink-muted uppercase">
              <th className="px-3 py-1.5">Producto</th>
              {columnas.map((c) => (
                <th key={c.key} className="px-3 py-1.5 text-right">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <p className="font-semibold text-ink">{titulo(row)}</p>
                  <p className="text-[11px] text-ink-soft">{subtitulo(row)}</p>
                </td>
                {columnas.map((c) => (
                  <td key={c.key} className="px-3 py-2 text-right">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:hidden">
        {filas.map((row) => (
          <div key={rowKey(row)} className="rounded-field border border-line p-2.5">
            <p className="text-[13px] font-bold text-ink">{titulo(row)}</p>
            <p className="mt-0.5 text-[11px] text-ink-soft">{subtitulo(row)}</p>
            {grupos.map((grupo, i) => (
              <div key={i} className="mt-1.5 flex gap-3">
                {grupo.map((c) => (
                  <div key={c.key} className="flex-1">
                    <p className="text-[10px] text-ink-muted">{c.label}</p>
                    <p className="text-[12.5px] font-bold text-ink">{c.render(row)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

export interface PagoResumen {
  id: string | number
  label: string
  monto: number
}

/** Los pagos (si los hay) y el total, como el pie plano de una factura — sin caja. */
export function ResumenDocumento({
  pagos,
  subtotal,
  desglose,
  total,
}: {
  pagos?: PagoResumen[]
  subtotal?: number
  /** Líneas informativas entre el subtotal y el total: Op. Gravada, IGV, Op. Exonerada, etc. */
  desglose?: { label: string; monto: number }[]
  total: number
}) {
  return (
    <div className="border-t border-line pt-2.5">
      {pagos && pagos.length > 0 && (
        <div className="mb-1.5 flex flex-col gap-1">
          {pagos.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-[13px]">
              <span className="text-ink-soft">{p.label}</span>
              <span className="font-medium text-ink">S/ {p.monto.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {subtotal != null && (
        <div className="flex items-center justify-between text-[13px] text-ink-soft">
          <span>Subtotal</span>
          <span>S/ {subtotal.toFixed(2)}</span>
        </div>
      )}
      {desglose && desglose.length > 0 && (
        <div className="mb-1 flex flex-col gap-0.5">
          {desglose.map((d) => (
            <div key={d.label} className="flex items-center justify-between text-[12.5px] text-ink-soft">
              <span>{d.label}</span>
              <span>S/ {d.monto.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-soft">Total</span>
        <span className="text-base font-bold text-[rgb(var(--sys-rgb))]">S/ {total.toFixed(2)}</span>
      </div>
    </div>
  )
}
