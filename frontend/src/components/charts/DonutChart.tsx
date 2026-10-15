import { useState } from 'react'
import { cn } from '../ui/cn'
import { PALETA, compacto, pct } from './util'

export interface PorcionDona {
  nombre: string
  valor: number
  color?: string
}

export interface DonutChartProps {
  porciones: PorcionDona[]
  /** Cómo se escribe el valor en la leyenda. */
  formato?: (n: number) => string
  /** Lo que va en el centro: el total, o el nombre de la porción sobre la que está el cursor. */
  centro?: { titulo: string; valor: string }
  tamano?: number
  className?: string
}

/**
 * Dona con leyenda a un lado. Las porciones muy chicas (menos de 1.5 %) se dibujan igual pero sin
 * separación, para que sigan siendo visibles; la leyenda dice el valor exacto.
 */
export function DonutChart({ porciones, formato = compacto, centro, tamano = 168, className }: DonutChartProps) {
  const [activa, setActiva] = useState<number | null>(null)
  const total = porciones.reduce((a, p) => a + p.valor, 0)

  const r = tamano / 2 - 14
  const c = 2 * Math.PI * r

  // Dónde arranca cada porción: la suma de lo que ocupan las anteriores.
  const inicios = porciones.map((_, i) =>
    porciones.slice(0, i).reduce((suma, p) => suma + (total > 0 ? (p.valor / total) * c : 0), 0),
  )

  const seleccion = activa !== null ? porciones[activa] : null

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-x-6 gap-y-3', className)}>
      <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
        <svg width={tamano} height={tamano} role="img" aria-label={`Reparto de ${porciones.map((p) => p.nombre).join(', ')}`}>
          <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={20} />
          <g transform={`rotate(-90 ${tamano / 2} ${tamano / 2})`}>
            {porciones.map((p, i) => {
              const largo = total > 0 ? (p.valor / total) * c : 0
              const separacion = total > 0 && p.valor / total > 0.015 && porciones.length > 1 ? 2 : 0
              const inicio = inicios[i]

              return (
                <circle
                  key={p.nombre}
                  cx={tamano / 2}
                  cy={tamano / 2}
                  r={r}
                  fill="none"
                  stroke={p.color ?? PALETA[i % PALETA.length]}
                  strokeWidth={activa === i ? 24 : 20}
                  strokeDasharray={`${Math.max(0, largo - separacion)} ${c - Math.max(0, largo - separacion)}`}
                  strokeDashoffset={-inicio}
                  opacity={activa !== null && activa !== i ? 0.4 : 1}
                  style={{ transition: 'stroke-width 120ms, opacity 120ms' }}
                  onPointerEnter={() => setActiva(i)}
                  onPointerLeave={() => setActiva(null)}
                />
              )
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="line-clamp-1 text-[10.5px] font-semibold tracking-wide text-ink-muted uppercase">
            {seleccion ? seleccion.nombre : (centro?.titulo ?? 'Total')}
          </span>
          <span className="text-lg leading-tight font-extrabold text-ink tabular-nums">
            {seleccion ? formato(seleccion.valor) : (centro?.valor ?? formato(total))}
          </span>
          {seleccion && total > 0 && <span className="text-[11px] text-ink-muted">{pct((seleccion.valor / total) * 100)}</span>}
        </div>
      </div>

      <ul className="flex min-w-36 flex-1 flex-col gap-1.5 text-xs">
        {porciones.map((p, i) => (
          <li
            key={p.nombre}
            className={cn('flex items-center justify-between gap-3 rounded px-1.5 py-0.5', activa === i && 'bg-surface-alt')}
            onPointerEnter={() => setActiva(i)}
            onPointerLeave={() => setActiva(null)}
          >
            <span className="flex min-w-0 items-center gap-2 text-ink-muted">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? PALETA[i % PALETA.length] }} />
              <span className="truncate">{p.nombre}</span>
            </span>
            <span className="shrink-0 font-semibold text-ink tabular-nums">
              {formato(p.valor)}
              <span className="ml-1.5 font-normal text-ink-soft">{total > 0 ? pct((p.valor / total) * 100, 0) : '—'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
