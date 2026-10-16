export interface CifraPago {
  label: string
  monto: number
  /** exito: lo ya cobrado o pagado (verde). pendiente: lo que falta (ámbar). */
  tono?: 'normal' | 'exito' | 'pendiente'
}

const COLOR: Record<NonNullable<CifraPago['tono']>, string> = {
  normal: 'text-ink',
  exito: 'text-emerald-700',
  pendiente: 'text-amber-700',
}

/**
 * Las cifras de un cobro o un pago en recuadros chicos, lado a lado: a cobrar,
 * cobrado, lo que queda. El mismo formato en convertir un pedido en venta y en
 * los pagos de cuentas por cobrar y por pagar.
 */
export function CifrasPago({ cifras }: { cifras: CifraPago[] }) {
  return (
    <div
      className="grid gap-2 text-center sm:gap-3"
      style={{ gridTemplateColumns: `repeat(${cifras.length}, minmax(0, 1fr))` }}
    >
      {cifras.map((c) => (
        <div key={c.label} className="rounded-field border border-line px-2 py-2">
          <p className="text-[11px] font-semibold tracking-wide text-ink-soft uppercase">{c.label}</p>
          <p className={`text-base font-semibold ${COLOR[c.tono ?? 'normal']}`}>S/ {c.monto.toFixed(2)}</p>
        </div>
      ))}
    </div>
  )
}
