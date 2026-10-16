import { Percent, Tag } from 'lucide-react'
import type { Promocion, Sede } from '@/domain/entities/Portal'
import { Card } from '@/shared/ui'
import { beneficioTexto, condicionesTexto } from '../format'

/** Una oferta vigente, con lo que da y sus condiciones. */
export function PromoCard({ promocion, sedes }: { promocion: Promocion; sedes: readonly Sede[] }) {
  const Icono = promocion.tipo === 'porcentaje' ? Percent : Tag

  return (
    <Card className="flex h-full flex-col gap-3 p-5 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="sys-gradient inline-flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Icono size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold leading-tight text-ink">{promocion.nombre}</h3>
          <p className="text-sm font-semibold text-accent-ink">{beneficioTexto(promocion)}</p>
        </div>
      </div>

      {promocion.descripcion && <p className="text-sm text-ink-muted">{promocion.descripcion}</p>}

      <ul className="mt-auto space-y-1 text-xs text-ink-muted">
        {condicionesTexto(promocion, sedes).map((c) => (
          <li key={c}>· {c}</li>
        ))}
      </ul>
    </Card>
  )
}
