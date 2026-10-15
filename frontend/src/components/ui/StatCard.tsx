import type { ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from './cn'

/**
 * Tarjeta de indicador.
 *
 * El icono es obligatorio a proposito: en una fila de tres o cuatro tarjetas
 * el ojo se guia por la forma antes que por el texto, y una sin icono rompe el
 * ritmo de la fila.
 */

export type StatTono = 'sys' | 'neutral' | 'success' | 'warning' | 'danger'

const TONOS: Record<StatTono, { chip: string; barra: string }> = {
  sys: {
    chip: 'bg-[rgb(var(--sys-rgb)/0.12)] text-[rgb(var(--sys-ink-rgb))]',
    barra: 'bg-[rgb(var(--sys-rgb))]',
  },
  neutral: { chip: 'bg-slate-100 text-slate-600', barra: 'bg-slate-300' },
  success: { chip: 'bg-emerald-50 text-emerald-600', barra: 'bg-emerald-500' },
  warning: { chip: 'bg-amber-50 text-amber-600', barra: 'bg-amber-500' },
  danger: { chip: 'bg-red-50 text-red-600', barra: 'bg-red-500' },
}

export interface StatCardProps {
  label: string
  value: string
  /** Obligatorio: toda tarjeta lleva icono. */
  icon: ReactNode
  tono?: StatTono
  /** Variacion respecto al periodo anterior, ej. 12.4 o -3.1. */
  trend?: number
  /** Aclaracion corta bajo el numero. */
  hint?: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  tono = 'sys',
  trend,
  hint,
  className,
}: StatCardProps) {
  const estilo = TONOS[tono]
  const sube = (trend ?? 0) >= 0

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 overflow-hidden rounded-panel border border-line bg-white p-4',
        'transition-shadow duration-200 hover:shadow-md',
        // En la fila desplazable de movil cada tarjeta conserva un ancho
        // legible; en la grilla de escritorio se reparte el espacio.
        'w-[62%] shrink-0 snap-start sm:w-auto sm:shrink',
        className,
      )}
    >
      {/* Franja de color: da identidad sin llenar la tarjeta de fondo */}
      <span
        aria-hidden="true"
        className={cn('absolute inset-y-0 left-0 w-1', estilo.barra)}
      />

      <span
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-field',
          'transition-transform duration-200 group-hover:scale-105',
          estilo.chip,
        )}
      >
        {icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink-muted">{label}</p>

        <p className="mt-0.5 text-2xl leading-none font-extrabold tracking-tight text-ink tabular-nums">
          {value}
        </p>

        {(trend !== undefined || hint) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {trend !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold',
                  sube ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
                )}
              >
                {sube ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {sube ? '+' : ''}
                {trend}%
              </span>
            )}
            {hint && <span className="truncate text-ink-soft">{hint}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
