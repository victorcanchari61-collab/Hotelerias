import type { Promocion, Sede } from '@/domain/entities/Portal'
import { beneficioTexto, condicionesTexto, formatSoles } from '../format'

/** Lo que va grande en el talón del boleto: «15 %» o «S/ 80». */
function talon(p: Promocion): { grande: string; chico: string } {
  if (p.tipo === 'porcentaje' && p.porcentaje !== null) return { grande: `${p.porcentaje}%`, chico: 'menos' }
  if (p.tipo === 'monto_noche' && p.montoNocheCent !== null) {
    return { grande: formatSoles(p.montoNocheCent), chico: 'menos por noche' }
  }
  return { grande: '—', chico: 'descuento' }
}

/**
 * Una oferta vigente, como un BOLETO: un talón con lo que da, una línea de
 * perforación y, a la derecha, sus condiciones.
 */
export function PromoCard({ promocion, sedes, indice = 0 }: { promocion: Promocion; sedes: readonly Sede[]; indice?: number }) {
  const { grande, chico } = talon(promocion)

  return (
    <article
      className="v-papel v-aparecer flex h-full overflow-hidden"
      style={{ ['--i' as string]: indice }}
      aria-label={`${promocion.nombre}: ${beneficioTexto(promocion)}`}
    >
      <div className="flex w-[7.5rem] shrink-0 flex-col items-center justify-center gap-1 border-r-2 border-dashed border-[var(--color-line-strong)] p-3 text-center">
        <span className="v-etq v-num text-[2rem] leading-none">{grande}</span>
        <span className="v-etq text-xs text-[var(--color-ink-muted)]">{chico}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <h3 className="v-etq text-xl leading-tight">{promocion.nombre}</h3>
        {promocion.descripcion && <p className="text-sm text-[var(--color-ink-muted)]">{promocion.descripcion}</p>}
        <ul className="mt-auto space-y-0.5 pt-1 text-xs text-[var(--color-ink-muted)]">
          {condicionesTexto(promocion, sedes).map((c) => (
            <li key={c}>· {c}</li>
          ))}
        </ul>
      </div>
    </article>
  )
}
